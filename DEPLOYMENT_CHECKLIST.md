# Email System Deployment Checklist

## Pre-Deployment (Development)

### Environment Setup
- [ ] Verify Hostinger email account exists: `Support@zehlora.com`
- [ ] Verify Hostinger password is correct: `Zehlora@2026`
- [ ] Verify SMTP credentials in local `.env`:
  - [ ] SMTP_HOST = smtp.hostinger.com
  - [ ] SMTP_PORT = 465
  - [ ] SMTP_USER = Support@zehlora.com
  - [ ] SMTP_PASSWORD = Zehlora@2026
  - [ ] SMTP_FROM_EMAIL = Support@zehlora.com
  - [ ] SMTP_FROM_NAME = Zehlora Support

### Code Changes
- [ ] All files modified/created (see SMTP_IMPLEMENTATION_SUMMARY.md)
- [ ] TypeScript compilation passes: `npm run typecheck` ✅
- [ ] No new dependencies missing: `nodemailer` installed ✅
- [ ] Server starts without errors: `npm run dev`
- [ ] Look for log message: `✓ Email transporter initialized`

### Testing
- [ ] Test invitation creation sends email
- [ ] Test user creation sends email with credentials
- [ ] Test invitation acceptance sends welcome email
- [ ] Check all emails arrive at test email address
- [ ] Verify email formatting looks good
- [ ] Click links in emails and verify they work
- [ ] Test in spam folder (add to whitelist if needed)

---

## Pre-Deployment (Staging/Production)

### Configuration
- [ ] Copy SMTP credentials to staging `.env`
- [ ] Copy SMTP credentials to production `.env`
- [ ] Verify credentials are exact (no typos)
- [ ] DO NOT commit `.env` files (should be gitignored)
- [ ] Credentials stored securely (vault, secrets manager, etc.)

### Network/Infrastructure
- [ ] Verify outbound port 465 is open to `smtp.hostinger.com`
- [ ] Check firewall rules allow SMTP connection
- [ ] Test connectivity: `telnet smtp.hostinger.com 465` (should succeed)
- [ ] Verify DNS doesn't block SMTP

### Hostinger Account
- [ ] Email account `Support@zehlora.com` is active
- [ ] Password is set and hasn't changed
- [ ] Account has enough quota for emails
- [ ] Account isn't suspended or locked
- [ ] SMTP access is enabled in Hostinger control panel

---

## Deployment Steps

### 1. Pre-Deployment Review
- [ ] Code review completed
- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] No security concerns
- [ ] Documentation complete

### 2. Deploy Code
```bash
# Build server
cd server && npm run build

# Deploy built files to production
# (Your deployment process here)
```

### 3. Update Environment
- [ ] Add/update SMTP variables in production `.env`
- [ ] Verify all 6 SMTP variables are present
- [ ] No extra/incorrect variables

### 4. Start/Restart Server
```bash
# Start the server
npm run start
# or
node dist/index.js
```

### 5. Verify Boot Logs
- [ ] Server starts without errors
- [ ] Look for: `✓ Email transporter initialized: Support@zehlora.com`
- [ ] No SMTP errors in logs
- [ ] No database/auth errors

---

## Post-Deployment Testing

### Email System Tests

#### Test 1: Server Initialization
- [ ] Server logs show email transporter initialized
- [ ] No warning about SMTP not configured
- [ ] No connection errors to Hostinger

#### Test 2: Send Invitation
1. Log in as SUPER_ADMIN
2. Go to Settings > Team Management
3. Create test invitation to real email address
4. Check email arrives within 30 seconds
5. Verify email formatting is correct
6. Click link and verify it works
7. Check invitation status in admin panel

#### Test 3: Create User
1. Log in as SUPER_ADMIN
2. Go to Settings > Team Management
3. Click "Add Staff Member"
4. Fill in test details with real email
5. Click create
6. Check email arrives with temporary password
7. Verify email formatting
8. Try login with temp password
9. Verify password must be changed

#### Test 4: Accept Invitation
1. Click invitation link from email
2. Set password
3. Check welcome email arrives
4. Verify welcome email content
5. Login with new credentials
6. Verify all works

#### Test 5: Error Handling
1. Temporarily change SMTP password to invalid in `.env`
2. Create an invitation
3. Check logs for error message
4. Verify app doesn't crash
5. Fix password in `.env`
6. Try again (should work)

---

## Monitoring & Maintenance

### Daily Monitoring
- [ ] Check server logs for email errors
- [ ] Monitor for failed sends: `✗ Failed to send email`
- [ ] Monitor connection issues
- [ ] Check for SMTP auth failures

### Weekly Checks
- [ ] Verify no accumulated email errors
- [ ] Check Hostinger account status
- [ ] Verify SMTP credentials still valid
- [ ] Test by creating sample invitation

### Monthly Maintenance
- [ ] Review email delivery patterns
- [ ] Check for any bounces/failures
- [ ] Verify no quota issues with Hostinger
- [ ] Update documentation if anything changes

---

## Troubleshooting Guide

### Issue: Server won't start after deployment

**Symptoms:**
- Server crashes on startup
- Error in logs about SMTP

**Solutions:**
1. Check `.env` has all 6 SMTP variables
2. Verify no typos in variable names
3. Check that env.ts validation passes
4. Run: `npm run typecheck`
5. Check database and Redis are running

### Issue: Emails not sending

**Symptoms:**
- Invitations created but no email arrives
- Logs show: `✗ Failed to send email`
- Or: `Email (SMTP) not configured`

**Solutions:**
1. Check SMTP variables in `.env`
2. Verify credentials are correct with Hostinger
3. Check port 465 is accessible
4. Verify firewall allows outbound SMTP
5. Check Hostinger account isn't suspended
6. Try manual SMTP connection: `telnet smtp.hostinger.com 465`

### Issue: Emails arrive but look broken

**Symptoms:**
- Email formatting is messed up
- Images don't show
- Links don't work
- Email looks like code

**Solutions:**
1. Check email client is HTML-enabled
2. Try different email client
3. Check if it's a spam filter issue
4. Whitelist sender: `Support@zehlora.com`

### Issue: High email latency

**Symptoms:**
- Emails arrive but take 5+ minutes
- Users complaining about delays

**Solutions:**
1. Check Hostinger SMTP load
2. Check network latency
3. Monitor server logs for timing
4. Contact Hostinger support if their service is slow

---

## Rollback Plan

If email system has critical issues:

### Immediate Actions
1. Disable SMTP by removing variables from `.env`
2. Restart server
3. Server will log warning and continue working
4. App remains fully functional, just no emails

### Recovery
1. Fix the issue
2. Update `.env` with correct config
3. Restart server
4. Manually send any missed emails
5. Verify with test invitations

---

## Performance Considerations

### Email Sending
- Emails sent asynchronously (non-blocking)
- Typically takes <1 second to queue
- SMTP delivery takes 2-30 seconds
- User request completes before email sent

### Database Impact
- Email doesn't require extra DB calls
- No email delivery tracking in DB
- Only invitation/user creation stored

### Network Impact
- SMTP connection uses ~1 KB per email
- Low bandwidth requirement
- Port 465 (SSL) is secure and encrypted

---

## Security Checklist

### Credentials Security
- [ ] SMTP password NOT in git/logs
- [ ] `.env` is in `.gitignore`
- [ ] Production `.env` is secure
- [ ] Credentials not shared in plaintext
- [ ] Use secrets manager/vault in production

### Email Content Security
- [ ] No user input in HTML
- [ ] No sensitive data in logs
- [ ] Invitation tokens are one-time-use
- [ ] Tokens expire after 7 days
- [ ] Tokens are SHA-256 hashed

### Access Control
- [ ] Only SUPER_ADMIN can invite/create users
- [ ] Email sending doesn't bypass auth
- [ ] SMTP credentials properly scoped

---

## Communication Plan

### Before Deployment
- [ ] Notify team email is being deployed
- [ ] Explain what will change (invitations now send emails)
- [ ] Provide documentation to admins
- [ ] Set expectations for testing

### After Deployment
- [ ] Announce email system is live
- [ ] Share user guide: EMAIL_TEMPLATES_REFERENCE.md
- [ ] Share admin guide: EMAIL_SETUP.md
- [ ] Ask for feedback on emails

### If Issues Occur
- [ ] Notify users of the issue
- [ ] Give ETA for fix
- [ ] Provide workaround (manual sharing)
- [ ] Update stakeholders regularly

---

## Success Criteria

Email system is successfully deployed when:

✅ Server starts with `✓ Email transporter initialized` message
✅ Invitations automatically send emails
✅ User creation automatically sends credentials
✅ Acceptance emails send automatically
✅ All emails arrive within 30 seconds
✅ All emails have correct formatting
✅ Links in emails work correctly
✅ No email errors in server logs
✅ SUPER_ADMIN can create invitations/users
✅ Email content is professional and branded

---

## Documentation Reference

**Quick Links:**
- `SMTP_IMPLEMENTATION_SUMMARY.md` - Complete technical overview
- `EMAIL_SETUP.md` - Technical configuration & setup
- `EMAIL_TEMPLATES_REFERENCE.md` - Admin user guide
- `EMAIL_SETUP.md` - Developer integration guide

**For Questions:**
1. Check EMAIL_SETUP.md first
2. Review server/src/lib/mailer.ts
3. Check server logs for errors
4. Contact DevOps if infrastructure issue

---

## Approval & Sign-Off

Once deployment is complete and tested:

- [ ] DevOps Lead: _________________ Date: _______
- [ ] QA Team: _________________ Date: _______
- [ ] Product Manager: _________________ Date: _______

---

**Deployment Date:** _______________
**Deployed By:** _______________
**Notes:** 
```
_________________________________________________________________

_________________________________________________________________
```

---

**Remember:** Email system is non-critical but important for UX. If it fails, the app continues working but users won't get notifications. Monitor logs and test thoroughly.
