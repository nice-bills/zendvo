# OTP Security Enhancement - Deployment Checklist

## Pre-Deployment

- [ ] Review all code changes
  - [ ] `src/lib/db/schema.ts` - New fields added
  - [ ] `src/server/services/otpService.ts` - Enhanced logic
  - [ ] `src/server/services/auditService.ts` - New service created
- [ ] Review documentation
  - [ ] `docs/OTP_SECURITY_IMPLEMENTATION.md`
  - [ ] `docs/OTP_SECURITY_QUICK_REFERENCE.md`
- [ ] Code review completed
- [ ] Security review completed

## Database Migration

- [ ] Backup production database
- [ ] Test migration on staging environment
- [ ] Run migration on production:
  ```bash
  psql -d your_database -f migrations/add_otp_wide_window_tracking.sql
  ```
- [ ] Verify new columns exist:
  ```sql
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'users' 
  AND column_name IN ('otp_failed_attempts', 'otp_attempts_window_start');
  ```
- [ ] Verify indexes created:
  ```sql
  SELECT indexname FROM pg_indexes 
  WHERE tablename = 'users' 
  AND indexname IN ('idx_users_lock_until', 'idx_users_otp_window');
  ```

## Code Deployment

- [ ] Deploy to staging environment
- [ ] Run smoke tests on staging
- [ ] Deploy to production
- [ ] Verify no errors in application logs

## Testing

### Functional Testing
- [ ] Test OTP generation
- [ ] Test successful OTP verification
- [ ] Test narrow window lock (5 attempts)
- [ ] Test wide window lock (10 attempts in 1 hour)
- [ ] Test window reset after 1 hour
- [ ] Test account unlock after lock expires

### Audit Logging
- [ ] Verify `OTP_GENERATED` events logged
- [ ] Verify `OTP_VERIFIED_FAILED` events logged
- [ ] Verify `ACCOUNT_LOCKED_5_ATTEMPTS` events logged
- [ ] Verify `ACCOUNT_LOCKED_10_ATTEMPTS` events logged
- [ ] Verify `OTP_VERIFIED_SUCCESS` events logged

### Edge Cases
- [ ] Test expired OTP handling
- [ ] Test concurrent attempts
- [ ] Test gift OTP locking
- [ ] Test user with existing lock

## Monitoring Setup

- [ ] Configure audit log destination
  - [ ] CloudWatch Logs (if AWS)
  - [ ] Datadog (if using)
  - [ ] Splunk (if using)
  - [ ] Custom logging solution
- [ ] Set up alerts
  - [ ] Alert on `ACCOUNT_LOCKED_10_ATTEMPTS`
  - [ ] Alert on 5+ accounts locked in 10 minutes
  - [ ] Alert on repeated 24-hour locks for same user
- [ ] Create monitoring dashboard
  - [ ] Failed OTP attempts per hour
  - [ ] Number of locks per day
  - [ ] Lock type distribution (30-min vs 24-hour)
  - [ ] Average OTP verification time

## Documentation

- [ ] Update API documentation with new response fields
- [ ] Update support runbook
- [ ] Train support team on new lock mechanisms
- [ ] Document manual unlock procedure
- [ ] Share quick reference guide with team

## Post-Deployment

- [ ] Monitor error rates for 24 hours
- [ ] Review audit logs for anomalies
- [ ] Check for any user complaints
- [ ] Verify monitoring alerts working
- [ ] Document any issues encountered

## Rollback Plan

If issues occur:
- [ ] Revert code deployment
- [ ] Database rollback (if needed):
  ```sql
  ALTER TABLE users 
  DROP COLUMN IF EXISTS otp_failed_attempts,
  DROP COLUMN IF EXISTS otp_attempts_window_start;
  
  DROP INDEX IF EXISTS idx_users_lock_until;
  DROP INDEX IF EXISTS idx_users_otp_window;
  ```
- [ ] Notify team of rollback
- [ ] Document reason for rollback

## Success Criteria

- [ ] No increase in error rates
- [ ] Audit logs showing proper event tracking
- [ ] No legitimate users locked for 24 hours
- [ ] Monitoring alerts functioning
- [ ] Support team trained and ready

## Sign-Off

- [ ] Developer: _______________  Date: _______
- [ ] QA: _______________  Date: _______
- [ ] Security: _______________  Date: _______
- [ ] DevOps: _______________  Date: _______

## Notes

_Add any deployment notes or observations here_

---

**Contact:** emry_ss on Discord for questions or issues
