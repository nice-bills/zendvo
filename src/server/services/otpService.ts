import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@/lib/db";
import { users, emailVerifications, gifts } from "@/lib/db/schema";
import { eq, and, desc, lt, or } from "drizzle-orm";
import {
  logOTPEvent,
  logGiftOTPEvent,
  AuditEventType,
} from "./auditService";

export function generateOTP(): string {
  // CSPRNG compliant
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Generates a SHA-256 hash of the OTP with a unique salt.
 */
export function hashOTP(otp: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.createHmac("sha256", salt).update(otp).digest("hex");
  return { salt, hash };
}

/**
 * Verifies an OTP against a stored hash and salt using constant-time comparison.
 */
export function verifyOTPHash(
  otp: string,
  storedHash: string,
  salt: string,
): boolean {
  const hash = crypto.createHmac("sha256", salt).update(otp).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
}

export async function storeOTP(userId: string, otp: string) {
  const { salt, hash } = hashOTP(otp);
  const storedValue = `${salt}:${hash}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Invalidate previous unused OTPs
  await db
    .update(emailVerifications)
    .set({ isUsed: true })
    .where(
      and(
        eq(emailVerifications.userId, userId),
        eq(emailVerifications.isUsed, false),
      ),
    );

  logOTPEvent(AuditEventType.OTP_GENERATED, userId);

  const [newVerification] = await db
    .insert(emailVerifications)
    .values({
      userId,
      otpHash: storedValue,
      expiresAt,
      attempts: 0,
      isUsed: false,
    })
    .returning();

  return newVerification;
}

export async function verifyOTP(userId: string, otp: string) {
  const verification = await db.query.emailVerifications.findFirst({
    where: and(
      eq(emailVerifications.userId, userId),
      eq(emailVerifications.isUsed, false),
    ),
    orderBy: [desc(emailVerifications.createdAt)],
  });

  if (!verification) {
    return {
      success: false,
      message: "No verification code found. Please request a new one.",
    };
  }

  if (new Date() > verification.expiresAt) {
    return {
      success: false,
      message: "Verification code has expired. Please request a new one.",
    };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (user && user.lockUntil && new Date() < user.lockUntil) {
    return {
      success: false,
      message: "Account is temporarily locked. Please try again later.",
      locked: true,
    };
  }

  if (verification.attempts >= 5) {
    return {
      success: false,
      message: "Maximum attempts exceeded. Account is locked.",
      locked: true,
    };
  }

  let isValid = false;
  const storedHash = verification.otpHash;

  if (storedHash.includes(":")) {
    const [salt, hash] = storedHash.split(":");
    isValid = verifyOTPHash(otp, hash, salt);
  } else {
    isValid = await bcrypt.compare(otp, storedHash);
  }

  if (!isValid) {
    const newAttempts = verification.attempts + 1;

    await db
      .update(emailVerifications)
      .set({ attempts: newAttempts })
      .where(eq(emailVerifications.id, verification.id));

    // Track cumulative failures for wide window lock
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    let cumulativeFailures = (user?.otpFailedAttempts || 0) + 1;
    let windowStart = user?.otpAttemptsWindowStart;

    // Reset window if it's been more than 1 hour
    if (!windowStart || windowStart < oneHourAgo) {
      cumulativeFailures = 1;
      windowStart = now;
    }

    // Update cumulative failure tracking
    await db
      .update(users)
      .set({
        otpFailedAttempts: cumulativeFailures,
        otpAttemptsWindowStart: windowStart,
      })
      .where(eq(users.id, userId));

    logOTPEvent(AuditEventType.OTP_VERIFIED_FAILED, userId, {
      attemptNumber: newAttempts,
      cumulativeFailures,
      remainingAttempts: 5 - newAttempts,
    });

    // Check for 10 attempts in 1 hour (wide window lock)
    if (cumulativeFailures >= 10) {
      const lockUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
      await db
        .update(users)
        .set({
          lockUntil,
          otpFailedAttempts: 0,
          otpAttemptsWindowStart: null,
        })
        .where(eq(users.id, userId));

      logOTPEvent(AuditEventType.ACCOUNT_LOCKED_10_ATTEMPTS, userId, {
        lockDuration: "24 hours",
        cumulativeFailures,
        reason: "10 failed OTP attempts within 1 hour",
      });

      return {
        success: false,
        message:
          "Account locked for 24 hours due to repeated failed attempts. Please contact support if you need assistance.",
        locked: true,
        shouldSendAlert: true,
        lockDuration: "24 hours",
      };
    }

    // Check for 5 attempts on current OTP (narrow window lock)
    if (newAttempts >= 5) {
      const lockUntil = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes
      await db.update(users).set({ lockUntil }).where(eq(users.id, userId));

      logOTPEvent(AuditEventType.ACCOUNT_LOCKED_5_ATTEMPTS, userId, {
        lockDuration: "30 minutes",
        attemptNumber: newAttempts,
        reason: "5 failed attempts on current OTP",
      });

      return {
        success: false,
        message: "Maximum attempts exceeded. Account locked for 30 minutes.",
        locked: true,
        shouldSendAlert: true,
        lockDuration: "30 minutes",
      };
    }

    const remainingAttempts = 5 - newAttempts;
    return {
      success: false,
      message: `Invalid verification code. ${remainingAttempts} attempts remaining.`,
      remainingAttempts,
    };
  }

  // Success path
  await db
    .delete(emailVerifications)
    .where(eq(emailVerifications.id, verification.id));

  await db
    .update(users)
    .set({
      status: "active",
      lockUntil: null,
      loginAttempts: 0,
      otpFailedAttempts: 0,
      otpAttemptsWindowStart: null,
    })
    .where(eq(users.id, userId));

  logOTPEvent(AuditEventType.OTP_VERIFIED_SUCCESS, userId);

  return { success: true, message: "Email verified successfully!" };
}

export async function cleanupExpiredOTPs() {
  const result = await db
    .delete(emailVerifications)
    .where(
      or(
        lt(emailVerifications.expiresAt, new Date()),
        lt(
          emailVerifications.createdAt,
          new Date(Date.now() - 24 * 60 * 60 * 1000),
        ),
      ),
    )
    .returning();
  return result.length;
}

export async function storeGiftOTP(giftId: string, otp: string) {
  const saltRounds = 10;
  const otpHash = await bcrypt.hash(otp, saltRounds);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  return await db
    .update(gifts)
    .set({
      otpHash,
      otpExpiresAt: expiresAt,
      otpAttempts: 0,
    })
    .where(eq(gifts.id, giftId))
    .returning();
}

const MAX_GIFT_OTP_ATTEMPTS = 5;

export async function verifyGiftOTP(
  gift: {
    id: string;
    otpHash: string | null;
    otpExpiresAt: Date | null;
    otpAttempts: number;
  },
  otp: string,
) {
  if (!gift.otpHash || !gift.otpExpiresAt) {
    return {
      success: false,
      message: "No verification code found for this gift.",
    };
  }

  if (gift.otpAttempts >= MAX_GIFT_OTP_ATTEMPTS) {
    logGiftOTPEvent(AuditEventType.GIFT_OTP_LOCKED, gift.id, {
      attempts: gift.otpAttempts,
    });

    return {
      success: false,
      message: "Maximum attempts exceeded. This gift has been locked.",
      locked: true,
    };
  }

  if (new Date() > gift.otpExpiresAt) {
    return {
      success: false,
      message: "Verification code has expired. Please request a new one.",
    };
  }

  const isValid = await bcrypt.compare(otp, gift.otpHash);

  if (!isValid) {
    const newAttempts = gift.otpAttempts + 1;

    await db
      .update(gifts)
      .set({ otpAttempts: newAttempts })
      .where(eq(gifts.id, gift.id));

    logGiftOTPEvent(AuditEventType.GIFT_OTP_FAILED, gift.id, {
      attemptNumber: newAttempts,
      remainingAttempts: MAX_GIFT_OTP_ATTEMPTS - newAttempts,
    });

    const remainingAttempts = MAX_GIFT_OTP_ATTEMPTS - newAttempts;

    if (remainingAttempts <= 0) {
      logGiftOTPEvent(AuditEventType.GIFT_OTP_LOCKED, gift.id, {
        attempts: newAttempts,
        reason: "Maximum attempts exceeded",
      });
    }

    return {
      success: false,
      message: `Invalid verification code. ${remainingAttempts} attempt${remainingAttempts !== 1 ? "s" : ""} remaining.`,
      remainingAttempts,
      locked: remainingAttempts <= 0,
    };
  }

  await db
    .update(gifts)
    .set({
      status: "otp_verified",
      otpHash: null,
      otpExpiresAt: null,
      otpAttempts: 0,
    })
    .where(eq(gifts.id, gift.id));

  return { success: true, message: "Gift OTP verified successfully!" };
}
