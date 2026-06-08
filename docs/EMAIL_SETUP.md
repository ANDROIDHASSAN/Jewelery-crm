# Email Setup & Configuration

This document explains how email notifications are configured and used in Zehlora.

## Quick Start

### Environment Variables
The following SMTP variables must be configured in `.env`:

```bash
# Email (SMTP)
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=Support@zehlora.com
SMTP_PASSWORD=your-smtp-password-here
SMTP_FROM_EMAIL=Support@zehlora.com
SMTP_FROM_NAME=Zehlora Support
```

**Current Setup:** Hostinger SMTP. Set `SMTP_PASSWORD` in your `.env` file — never commit the real value.

### How It Works

1. **Server Initialization**: The mailer is initialized when the server boots (`initializeMailer()` in `src/lib/mailer.ts`)
2. **Email Sending**: Emails are sent asynchronously in the background using Nodemailer
3. **Graceful Degradation**: If SMTP is not configured, the app logs a warning but continues to work. No emails are sent.

---

## Email Templates

### 1. **Admin Role Invitation** 
**Trigger:** When an admin creates an invitation for a new team member

**Used in:** `POST /users/invitations`

**Template Function:** `getInvitationEmailHTML()`

**What it includes:**
- Invitation link (expires in 7 days)
- Organization name
- Role being invited to
- Instructions to accept and set password
- Professional styling with brand colors

**Example:**
```typescript
const emailHTML = getInvitationEmailHTML({
  recipientName: 'John Doe',
  invitationLink: 'https://app.zehlora.com/accept-invitation?token=abc123...',
  tenantName: 'My Jewelry Store',
  roleName: 'Manager',
  expiresInDays: 7,
});
```

---

### 2. **Member Added (Temporary Credentials)**
**Trigger:** When an admin directly creates a user account with auto-generated password

**Used in:** `POST /users` (when no custom password provided)

**Template Function:** `getMemberAddedEmailHTML()`

**What it includes:**
- Email/username
- Temporary password
- Login URL
- Security instructions (change password, enable 2FA)
- Role information

**Example:**
```typescript
const emailHTML = getMemberAddedEmailHTML({
  recipientName: 'Jane Smith',
  tempUsername: 'jane@company.com',
  tempPassword: 'TempPass123!@#',
  loginUrl: 'https://app.zehlora.com/login',
  roleName: 'POS User',
});
```

---

### 3. **Welcome Email (After Signup)**
**Trigger:** When a user successfully accepts an invitation and sets their password

**Used in:** `POST /invitations/accept`

**Template Function:** `getWelcomeEmailHTML()`

**What it includes:**
- Personalized welcome message
- Feature highlights (Inventory, Finance, POS, E-Commerce)
- Dashboard link
- Getting started steps
- Next actions

**Example:**
```typescript
const emailHTML = getWelcomeEmailHTML({
  recipientName: 'John Doe',
  tenantName: 'My Jewelry Store',
  dashboardUrl: 'https://app.zehlora.com/dashboard',
});
```

---

### 4. **Password Changed Notification**
**Trigger:** When a user changes their password

**Used in:** Auth password change routes (not yet integrated, but function available)

**Template Function:** `getPasswordChangedEmailHTML()`

**What it includes:**
- Timestamp of password change
- Security verification ("if this wasn't you" message)
- Account security tips

**Example:**
```typescript
const emailHTML = getPasswordChangedEmailHTML({
  recipientName: 'John Doe',
  timestamp: 'June 6, 2026 at 2:30 PM IST',
});
```

---

### 5. **Generic Notification Template**
**Trigger:** For custom notifications

**Used in:** Any custom email notification

**Template Function:** `getNotificationEmailHTML()`

**What it includes:**
- Custom subject
- Custom message
- Optional action button with URL
- Professional styling

**Example:**
```typescript
const emailHTML = getNotificationEmailHTML({
  recipientName: 'John Doe',
  subject: 'Inventory Low Stock Alert',
  message: 'Your inventory for Gold Earrings (18K) is running low. You have 2 items left in stock.',
  actionUrl: 'https://app.zehlora.com/inventory',
  actionText: 'View Inventory',
});
```

---

## API Integration

### Creating Invitations with Email

**Endpoint:** `POST /api/users/invitations`

```bash
curl -X POST http://localhost:4000/api/users/invitations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newmember@company.com",
    "name": "New Member",
    "roleId": "role-uuid-here"
  }'
```

**Response:**
```json
{
  "data": {
    "invitationId": "inv-uuid",
    "token": "base64-url-safe-token",
    "expiresAt": "2026-06-13T12:00:00Z"
  }
}
```

The email is automatically sent to the provided email address.

### Creating Users with Auto-Generated Credentials

**Endpoint:** `POST /api/users`

```bash
curl -X POST http://localhost:4000/api/users \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Staff Member",
    "email": "staff@company.com",
    "roleId": "role-uuid-here",
    "shopId": "shop-uuid-here"
  }'
```

**Response:**
```json
{
  "data": {
    "user": {
      "id": "user-uuid",
      "name": "Staff Member",
      "email": "staff@company.com",
      ...
    },
    "initialPassword": "AutoGen123!@#"
  }
}
```

The welcome email with credentials is automatically sent.

---

## Email Sending Logic

### File: `server/src/lib/mailer.ts`

**Key Functions:**

1. **`initializeMailer()`**
   - Called at server startup
   - Validates SMTP configuration
   - Logs whether email is enabled/disabled

2. **`sendEmail(options)`**
   - Sends an email via SMTP
   - Returns `true` if successful, `false` if SMTP not configured or error occurred
   - Automatically adds sender information
   - Logs errors for debugging

3. **Template Functions**
   - All return HTML strings ready to send
   - Support customization via parameters
   - Include fallback plain-text versions
   - Responsive design for mobile/desktop

---

## Testing Email Setup

### 1. Check Server Logs
Start the server and look for this message:
```
✓ Email transporter initialized: Support@zehlora.com
```

If you see this warning instead:
```
Email (SMTP) not configured. Email functionality disabled.
```
Then your SMTP environment variables are missing or incomplete.

### 2. Test with a Real Invitation
1. Log in as a SUPER_ADMIN
2. Go to Settings > Team Management
3. Create a new invitation
4. Check the provided email for the invitation

### 3. Check Server Logs
Successful email sends log:
```
✓ Email sent: newuser@company.com - You're invited to join...
```

Errors log:
```
✗ Failed to send email to newuser@company.com: Error message details
```

---

## Hostinger SMTP Details

**Provider:** Hostinger Webmail

**Connection Details:**
- **Host:** `smtp.hostinger.com`
- **Port:** `465` (SSL/TLS)
- **Username:** `Support@zehlora.com`
- **Password:** stored in `.env` as `SMTP_PASSWORD` — never commit
- **From Address:** `Support@zehlora.com`
- **From Display Name:** `Zehlora Support`

**Security:**
- Port 465 uses SSL encryption
- Credentials are stored in environment variables (never committed)
- Passwords not logged or stored anywhere else

---

## Customization

### Changing Sender Information

Edit `.env`:
```bash
SMTP_FROM_EMAIL=your-email@domain.com
SMTP_FROM_NAME=Your Business Name
```

### Customizing Email Templates

All templates are in `server/src/lib/mailer.ts`. To customize:

1. Edit the HTML in the template function
2. Change colors, text, styling
3. Restart the server
4. Test with a new invitation

**Color Scheme (Current):**
- Primary: `#d97706` (Amber)
- Success: `#059669` (Green)
- Neutral: `#1f2937` (Dark Gray)

### Adding New Email Types

1. Create a new template function in `mailer.ts`:
```typescript
export function getMyCustomEmailHTML(params: {
  recipientName: string;
  // other params
}): string {
  return `<!DOCTYPE html>...`; // your HTML
}
```

2. Call `sendEmail()` in your service:
```typescript
const html = getMyCustomEmailHTML(params);
await sendEmail({
  to: email,
  subject: 'Your Subject',
  html,
});
```

---

## Troubleshooting

### "Email (SMTP) not configured"
**Problem:** SMTP variables missing in `.env`

**Solution:**
1. Check `.env` has all SMTP variables
2. Restart the server
3. Check logs for the "✓ Email transporter initialized" message

### "Failed to send email"
**Problem:** SMTP credentials incorrect or server unreachable

**Solution:**
1. Verify credentials with Hostinger account
2. Check firewall/network allows port 465
3. Confirm `.env` has exact credentials
4. Check server logs for specific error message

### "Email sent but recipient didn't receive"
**Problem:** Email filtered as spam or delayed

**Solution:**
1. Check spam/junk folder
2. Verify sender address is whitelisted
3. Wait a few minutes (SMTP may queue)
4. Check Hostinger Webmail for send logs

### Emails not auto-sending during user creation
**Problem:** `sendEmail` parameter not set

**Solution:**
1. Make sure `sendEmail` is not explicitly set to `false`
2. Check SMTP is configured and initialized
3. Check server logs for email send errors

---

## Best Practices

1. **Test in Development:** Always test invitations in dev before production
2. **Verify Credentials:** Keep SMTP credentials secure in `.env`, never in code
3. **Monitor Logs:** Check server logs regularly for email errors
4. **Graceful Degradation:** App works without email, but users get logged warnings
5. **Error Handling:** Errors sending email don't crash the app
6. **Branding:** Update `SMTP_FROM_NAME` to match your business name

---

## Security Notes

- SMTP password is stored only in `.env` (gitignored)
- Password is never logged or exposed in error messages (unless you check raw logs)
- All email content is generated server-side, not user-input
- Email addresses are validated and sanitized
- Invitation tokens use SHA-256 hashing (plaintext shown once to admin)

---

## References

- **Mailer Library:** [Nodemailer](https://nodemailer.com/)
- **Server Boot:** `server/src/index.ts`
- **Mailer Implementation:** `server/src/lib/mailer.ts`
- **Invitation Flow:** `server/src/modules/users/invitations.service.ts`
- **User Creation:** `server/src/modules/users/users.service.ts`
