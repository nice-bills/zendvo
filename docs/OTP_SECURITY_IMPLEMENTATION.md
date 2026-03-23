# OTP Security Implementation - Dual-Window Account Locking

## Overview

This implementation provides enhanced protection against brute force OTP attacks using a dual-window locking mechanism:

1. **Narrow Window Lock**: 5 failed attempts on a single OTP → 30-minute lock
2. **Wide Window Lock**: 10 cumulative failed attempts within 1 hour → 24-hour lock

## Architecture

### Database Schema Changes

Added to `users` table:
- `otp_failed_attempts`: Tracks cumulative failures within the current window
- `otp_attempts_window_start`: Timestamp marking the start of the 1-hour tracking window

### Key Components

1. **Schema** (`src/lib/db/schema.ts`)
   - Added tracking fields for cumulative OTP failures

2. **Audit Service** (`src/server/services/auditService.ts`)
   - Centralized security event logging
   - Event types for all OTP-related security events
   - Extensible for integration with external SIEM systems

3. **OTP Service** (`src/server/services/otpService.ts`)
   - Enhanced `verifyOTP()` with dual-window logic
   - Automatic window reset after 1 hour
   - Comprehensive audit logging

## Locking Logic Flow

```
OTP Verification Attempt
    ↓
Check if account is locked
    ↓
Verify OTP
    ↓
If INVALID:
    ├─ Increment current OTP attempts
    ├─ Increment cumulative failures (with 1-hour window)
    ├─ Log failed attempt
    ↓
    ├─ If cumulative >= 10 in 1 hour:
    │   ├─ Lock for 24 hours
    │   ├─ Reset cumulative counter
    │   └─ Log ACCOUNT_LOCKED_10_ATTEMPTS
    │
    └─ If current OTP attempts >= 5:
        ├─ Lock for 30 minutes
        └─ Log ACCOUNT_LOCKED_5_ATTEMPTS
    ↓
If VALID:
    ├─ Clear all counters
    ├─ Remove lock
    └─ Log OTP_VERIFIED_SUCCESS
```

## Security Features

### 1. Narrow Window Protection (5 attempts / single OTP)
- Prevents rapid brute force on a single OTP code
- 30-minute lockout provides immediate protection
- Allows legitimate users to retry with a new OTP

### 2. Wide Window Protection (10 attempts / 1 hour)
- Catches sustained attacks across multiple OTP generations
- 24-hour lockout for serious threats
- Automatically resets after 1 hour of no activity

### 3. Audit Logging
All security events are logged with:
- Timestamp
- Event type
- User ID
- Metadata (attempt counts, lock duration, etc.)

Event types:
- `OTP_GENERATED`
- `OTP_VERIFIED_SUCCESS`
- `OTP_VERIFIED_FAILED`
- `ACCOUNT_LOCKED_5_ATTEMPTS`
- `ACCOUNT_LOCKED_10_ATTEMPTS`
- `GIFT_OTP_FAILED`
- `GIFT_OTP_LOCKED`

## Migration

Run the migration to add required database fields:

```sql
-- See migrations/add_otp_wide_window_tracking.sql
ALTER TABLE users 
ADD COLUMN otp_failed_attempts INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN otp_attempts_window_start TIMESTAMP;
```

Or use Drizzle Kit:
```bash
npm run db:generate
npm run db:migrate
```

## Testing Scenarios

### Scenario 1: Legitimate User Error
- User enters wrong OTP 3 times
- Gets new OTP, succeeds
- Result: No lock, counters reset

### Scenario 2: Narrow Window Lock
- User fails 5 attempts on one OTP
- Result: 30-minute lock
- After lock expires, can request new OTP

### Scenario 3: Wide Window Lock (Sustained Attack)
- Attacker fails 5 attempts, gets locked 30 min
- After unlock, fails 5 more attempts within the hour
- Result: 24-hour lock triggered

### Scenario 4: Window Reset
- User fails 3 attempts
- Waits 1+ hour
- Tries again
- Result: Counter resets, starts fresh

## Monitoring & Alerts

### Production Recommendations

1. **Audit Log Integration**
   - Send logs to CloudWatch, Datadog, or Splunk
   - Set up alerts for `ACCOUNT_LOCKED_10_ATTEMPTS` events
   - Monitor patterns of `OTP_VERIFIED_FAILED` events

2. **Metrics to Track**
   - Failed OTP attempts per hour
   - Number of 24-hour locks triggered
   - Average time between OTP generation and verification

3. **Alert Thresholds**
   - Alert on 5+ accounts locked in 10 minutes (potential attack)
   - Alert on single user with multiple 24-hour locks
   - Monitor for distributed attacks across many accounts

## API Response Changes

### Enhanced Error Responses

```typescript
// 30-minute lock
{
  success: false,
  message: "Maximum attempts exceeded. Account locked for 30 minutes.",
  locked: true,
  shouldSendAlert: true,
  lockDuration: "30 minutes"
}

// 24-hour lock
{
  success: false,
  message: "Account locked for 24 hours due to repeated failed attempts. Please contact support if you need assistance.",
  locked: true,
  shouldSendAlert: true,
  lockDuration: "24 hours"
}
```

## Future Enhancements

1. **Rate Limiting by IP**
   - Track attempts per IP address
   - Block suspicious IPs at network level

2. **CAPTCHA Integration**
   - Require CAPTCHA after 3 failed attempts
   - Reduces automated attacks

3. **Adaptive Delays**
   - Exponential backoff between attempts
   - Makes brute force impractical

4. **User Notifications**
   - Email/SMS alerts on account locks
   - Notify on suspicious activity

5. **Admin Dashboard**
   - View locked accounts
   - Manual unlock capability
   - Security event timeline

## Support

For questions or issues, contact the development team on Discord: emry_ss
