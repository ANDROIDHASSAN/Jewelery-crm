# Email Setup - Quick Start Guide

**TL;DR:** Copy credentials to `.env`, restart server, emails will work automatically.

---

## 1️⃣ Add Credentials to `.env`

Copy these 6 lines to your `.env` file:

```env
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=Support@zehlora.com
SMTP_PASSWORD=Zehlora@2026
SMTP_FROM_EMAIL=Support@zehlora.com
SMTP_FROM_NAME=Zehlora Support
```

**That's it!** No other configuration needed.

---

## 2️⃣ Restart Server

Stop and restart your server:

```bash
# If running with npm run dev, stop it (Ctrl+C)
# Then:
npm run dev

# Or if production:
npm run start
```

---

## 3️⃣ Check Logs

Look for this message in server logs:

```
✓ Email transporter initialized: Support@zehlora.com
```

**All set!** Emails will now send automatically.

---

## 4️⃣ Test It

1. Log in as SUPER_ADMIN
2. Go to Settings → Team Management
3. Click "Invite Team Member" or "Add Staff Member"
4. Use a real email address you can check
5. Check email arrives

---

## 📧 What Emails Will Send

| Event | Recipient | Subject |
|-------|-----------|---------|
| Invitation created | New member | You're invited to join [Org] on Zehlora |
| User created | New member | Your [Role] account is ready - Zehlora |
| Invitation accepted | New member | Welcome to Zehlora - [Org] |

---

## ⚠️ If Something Goes Wrong

### Email not arriving?
1. Check `.env` has all 6 variables
2. Verify no typos in credentials
3. Check server logs: `npm run dev`
4. Try different email address

### Server won't start?
1. Check `.env` syntax (no quotes around passwords)
2. Run: `npm run typecheck`
3. Check other `.env` variables are still correct

### SMTP not configured warning?
- At least one SMTP variable is missing
- Check you copied all 6 lines
- Check no typos in variable names

---

## 📚 Full Documentation

- **Detailed Setup:** `EMAIL_SETUP.md`
- **Admin Guide:** `EMAIL_TEMPLATES_REFERENCE.md`
- **Complete Summary:** `SMTP_IMPLEMENTATION_SUMMARY.md`
- **Deployment Guide:** `DEPLOYMENT_CHECKLIST.md`

---

## 🚀 That's All!

Emails are now enabled. Creating invitations and users will automatically send emails.

**Questions?** Check `EMAIL_SETUP.md` or the full documentation.
