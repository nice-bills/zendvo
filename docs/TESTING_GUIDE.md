# OTP Security Testing Guide

## Overview

This guide provides comprehensive testing procedures for the dual-window OTP account locking implementation.

## Test Environment Setup

### Prerequisites
- Database with updated schema (migration applied)
- Test user accounts
- Access to audit logs
- Ability to manipulate timestamps (for time-based tests)

### Database Setup
```sql
-- Verify schema changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('otp_failed_attempts', 'otp_attempts_window_start');

-- Create test user
INSERT INTO users (email, password_hash, status)
VALUES ('test@example.com', 'hashed_password', 'unverified');
```

---

## Manual Testing Procedures

### Test 1: Narrow Window Lock (5 attempts / single OTP)

**Objective:** Verify 30-minute lock after 5 failed attempts on one OTP

**Steps:**
1. Request OTP for test user
2. Enter incorrect OTP 5 times
3. Verify account is locked
4. Check audit logs

**Expected Results:**
- After 5th attempt:
  - Response: `locked: true`, `lockDuration: "30 minutes"`
  - Database: `lock_until` set to now + 30 minutes
  - Audit log: `ACCOUNT_LOCKED_5_ATTEMPTS` event
- Attempts 1-4 show remaining attempts (4, 3, 2, 1)

**SQL Verification:**
```sql
SELECT lock_until, otp_failed_attempts, otp_attempts_window_start
FROM users WHERE email = 'test@example.com';
```

**Pass Criteria:**
- ✅ Account locked after exactly 5 attempts
- ✅ Lock duration is 30 minutes
- ✅ Audit event logged with correct metadata
- ✅ User cannot verify OTP while locked

---

### Test 2: Wide Window Lock (10 attempts / 1 hour)

**Objective:** Verify 24-hour lock after 10 cumulative failures within 1 hour

**Steps:**
1. Request OTP for test user
2. Enter incorrect OTP 5 times (triggers 30-min lock)
3. Wait for 30-minute lock to expire OR manually clear lock
4. Request new OTP
5. Enter incorrect OTP 5 more times
6. Verify 24-hour lock is triggered

**Expected Results:**
- After 10th cumulative attempt:
  - Response: `locked: true`, `lockDuration: "24 hours"`
  - Database: `lock_until` set to now + 24 hours
  - Database: `otp_failed_attempts` reset to 0
  - Audit log: `ACCOUNT_LOCKED_10_ATTEMPTS` event

**SQL Verification:**
```sql
SELECT 
  lock_until,
  otp_failed_attempts,
  otp_attempts_window_start,
  EXTRACT(EPOCH FROM (lock_until - NOW())) / 3600 as hours_locked
FROM users WHERE email = 'test@example.com';
```

**Pass Criteria:**
- ✅ 24-hour lock triggered after 10 cumulative attempts
- ✅ Lock triggered even across multiple OTP generations
- ✅ Cumulative counter tracked correctly
- ✅ Audit event includes reason and metadata

---

### Test 3: Window Reset After 1 Hour

**Objective:** Verify cumulative counter resets after 1 hour of inactivity

**Steps:**
1. Request OTP for test user
2. Enter incorrect OTP 3 times
3. Wait 61+ minutes (or manually update `otp_attempts_window_start`)
4. Request new OTP
5. Enter incorrect OTP once
6. Check cumulative counter

**Expected Results:**
- After 1+ hour wait:
  - `otp_failed_attempts` should be 1 (not 4)
  - `otp_attempts_window_start` should be updated to current time
  - No lock triggered

**SQL Simulation:**
```sql
-- Simulate 61 minutes passing
UPDATE users 
SET otp_attempts_window_start = NOW() - INTERVAL '61 minutes',
    otp_failed_attempts = 3
WHERE email = 'test@example.com';

-- Then test one more failed attempt
-- Should reset counter to 1
```

**Pass Criteria:**
- ✅ Counter resets to 1 after 1+ hour
- ✅ Window start timestamp updated
- ✅ No lock triggered on first attempt after reset

---

### Test 4: Success Path - Counter Reset

**Objective:** Verify all counters clear on successful verification

**Steps:**
1. Set up user with some failed attempts:
   ```sql
   UPDATE users 
   SET otp_failed_attempts = 3,
       otp_attempts_window_start = NOW()
   WHERE email = 'test@example.com';
   ```
2. Request OTP
3. Enter correct OTP
4. Verify counters cleared

**Expected Results:**
- After successful verification:
  - `status` = 'active'
  - `lock_until` = NULL
  - `otp_failed_attempts` = 0
  - `otp_attempts_window_start` = NULL
  - Audit log: `OTP_VERIFIED_SUCCESS` event

**Pass Criteria:**
- ✅ All counters reset to 0/NULL
- ✅ Account status updated to active
- ✅ Success event logged

---

### Test 5: Lock Prevents Verification

**Objective:** Verify locked accounts cannot verify OTP

**Steps:**
1. Lock test account:
   ```sql
   UPDATE users 
   SET lock_until = NOW() + INTERVAL '30 minutes'
   WHERE email = 'test@example.com';
   ```
2. Request OTP
3. Try to verify with correct OTP
4. Verify rejection

**Expected Results:**
- Response: `locked: true`, message about temporary lock
- OTP not verified even if correct
- No counter increments

**Pass Criteria:**
- ✅ Locked account cannot verify OTP
- ✅ Clear error message returned
- ✅ Lock respected regardless of OTP correctness

---

### Test 6: Audit Logging

**Objective:** Verify all security events are logged

**Steps:**
1. Perform various OTP operations
2. Check audit logs for all events

**Expected Events:**
- `OTP_GENERATED` - When OTP is created
- `OTP_VERIFIED_FAILED` - Each failed attempt with metadata
- `ACCOUNT_LOCKED_5_ATTEMPTS` - 30-minute lock
- `ACCOUNT_LOCKED_10_ATTEMPTS` - 24-hour lock
- `OTP_VERIFIED_SUCCESS` - Successful verification

**Metadata to Verify:**
- `attemptNumber` - Current attempt count
- `cumulativeFailures` - Total failures in window
- `remainingAttempts` - Attempts left before lock
- `lockDuration` - Duration of lock
- `reason` - Why lock was triggered

**Pass Criteria:**
- ✅ All events logged
- ✅ Metadata complete and accurate
- ✅ Timestamps correct
- ✅ User IDs included

---

### Test 7: Gift OTP Security

**Objective:** Verify gift OTP locking works

**Steps:**
1. Create test gift with OTP
2. Enter incorrect OTP 5 times
3. Verify gift is locked

**Expected Results:**
- After 5 attempts: gift locked
- Audit logs: `GIFT_OTP_FAILED` and `GIFT_OTP_LOCKED` events

**Pass Criteria:**
- ✅ Gift locked after 5 attempts
- ✅ Events logged with gift ID

---

## Automated Testing

### Unit Tests

Run the test suite:
```bash
npm test __tests__/otpService.security.test.ts
```

**Test Coverage:**
- Narrow window locking
- Wide window locking
- Window reset logic
- Success path
- Audit logging
- Edge cases

### Integration Tests

Create integration tests that:
1. Use real database (test environment)
2. Test actual OTP generation and verification
3. Verify database state changes
4. Check audit log entries

---

## Performance Testing

### Load Test Scenarios

1. **Concurrent Attempts**
   - Multiple users attempting OTP simultaneously
   - Verify no race conditions
   - Check counter accuracy

2. **High Volume**
   - 1000+ OTP verifications per minute
   - Monitor database performance
   - Check audit log performance

---

## Security Testing

### Attack Simulations

1. **Brute Force Attack**
   - Automated script trying many OTPs
   - Should trigger 24-hour lock
   - Verify attack is stopped

2. **Distributed Attack**
   - Multiple IPs attacking same account
   - Verify cumulative tracking works
   - Check if additional IP blocking needed

3. **Timing Attack**
   - Attempts to bypass window reset
   - Verify window logic is sound

---

## Regression Testing

After deployment, verify:
- ✅ Existing OTP functionality still works
- ✅ Email verification flow unchanged
- ✅ Gift OTP flow unchanged
- ✅ No performance degradation
- ✅ Audit logs not overwhelming system

---

## Test Data Cleanup

After testing:
```sql
-- Reset test user
UPDATE users 
SET lock_until = NULL,
    otp_failed_attempts = 0,
    otp_attempts_window_start = NULL,
    status = 'unverified'
WHERE email = 'test@example.com';

-- Clear test OTPs
DELETE FROM email_verifications 
WHERE user_id IN (SELECT id FROM users WHERE email = 'test@example.com');
```

---

## Monitoring During Testing

Watch for:
- Database query performance
- Audit log volume
- Memory usage
- Response times
- Error rates

---

## Test Sign-Off Checklist

- [ ] All manual tests passed
- [ ] Automated tests passing
- [ ] Performance acceptable
- [ ] Security verified
- [ ] Audit logs working
- [ ] Documentation reviewed
- [ ] Edge cases tested
- [ ] Regression tests passed

---

## Troubleshooting

### Common Issues

**Issue:** Lock not triggering after 10 attempts
- Check: `otp_attempts_window_start` is within 1 hour
- Check: Cumulative counter incrementing correctly

**Issue:** Window not resetting
- Check: Time comparison logic
- Check: Timestamp timezone handling

**Issue:** Audit logs not appearing
- Check: Audit service imported correctly
- Check: Console output or log destination

---

## Contact

For testing questions: emry_ss on Discord
