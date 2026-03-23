# OTP Security - Quick Reference

## Lock Mechanisms

| Lock Type | Trigger | Duration | Purpose |
|-----------|---------|----------|---------|
| **Narrow Window** | 5 failed attempts on single OTP | 30 minutes | Immediate protection against rapid brute force |
| **Wide Window** | 10 cumulative failures in 1 hour | 24 hours | Protection against sustained attacks |

## Database Fields

```typescript
// Added to users table
{
  otpFailedAttempts: number;        // Cumulative failures in current window
  otpAttemptsWindowStart: Date;     // Start of 1-hour tracking window
  lockUntil: Date;                  // Existing field, now used for both locks
}
```

## Key Functions

### `verifyOTP(userId: string, otp: string)`

Returns:
```typescript
{
  success: boolean;
  message: string;
  locked?: boolean;
  shouldSendAlert?: boolean;
  lockDuration?: "30 minutes" | "24 hours";
  remainingAttempts?: number;
}
```

## Audit Events

```typescript
enum AuditEventType {
  OTP_GENERATED
  OTP_VERIFIED_SUCCESS
  OTP_VERIFIED_FAILED
  ACCOUNT_LOCKED_5_ATTEMPTS    // 30-min lock
  ACCOUNT_LOCKED_10_ATTEMPTS   // 24-hour lock
  GIFT_OTP_FAILED
  GIFT_OTP_LOCKED
}
```

## Migration Required

```bash
# Apply database migration
psql -d your_database -f migrations/add_otp_wide_window_tracking.sql

# Or with Drizzle
npm run db:generate
npm run db:migrate
```

## User Experience

### Scenario: Legitimate User
- Enters wrong OTP 2-3 times
- Gets new OTP, succeeds
- ✅ No lock, smooth experience

### Scenario: Persistent Attacker
- Fails 5 attempts → 30-min lock
- Returns after lock, fails 5 more within hour
- 🔒 24-hour lock triggered

## Monitoring Checklist

- [ ] Set up alerts for `ACCOUNT_LOCKED_10_ATTEMPTS`
- [ ] Monitor failed OTP rate per hour
- [ ] Track number of 24-hour locks per day
- [ ] Review audit logs weekly for patterns

## Production TODO

1. Configure audit log destination (CloudWatch/Datadog)
2. Set up monitoring dashboards
3. Create runbook for handling locked accounts
4. Test alert notifications
5. Document support procedures

## Support Procedures

### User Reports Account Locked

1. Check audit logs for user ID
2. Verify lock reason (5 or 10 attempts)
3. Confirm user identity
4. Manual unlock if legitimate:
   ```sql
   UPDATE users 
   SET lock_until = NULL, 
       otp_failed_attempts = 0,
       otp_attempts_window_start = NULL
   WHERE id = 'user_id';
   ```

### Suspected Attack

1. Review audit logs for patterns
2. Check if multiple accounts affected
3. Consider IP-based blocking
4. Escalate to security team if needed

## Contact

Questions? Reach out on Discord: emry_ss
