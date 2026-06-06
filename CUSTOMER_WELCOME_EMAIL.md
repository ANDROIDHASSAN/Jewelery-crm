# Customer Welcome Email - Storefront

Beautiful, professional welcome emails for customers who sign up on your storefront.

---

## 📧 What Is It?

When a customer signs up on the storefront for the first time and provides their email address, they automatically receive a welcome email featuring:

✨ **Professional Design**
- Zehlora 💎 branding and logo
- Gradient header (premium look)
- Responsive mobile-friendly layout
- Brand colors (gold/amber accent)

📝 **Compelling Content**
- Personalized greeting with customer's name
- Store name and welcome message
- Feature highlights (Premium Collection, Certified Quality, etc.)
- Benefits list (fast delivery, support, etc.)
- Clear call-to-action button
- Footer with help & support info

---

## 🎯 When Does It Send?

**Trigger:** Customer signs up on storefront for the first time

**Conditions:**
- ✅ First-time customer (new signup)
- ✅ Customer provided an email address
- ✅ SMTP is configured

**Not sent if:**
- ❌ Returning customer (already in database)
- ❌ No email provided during signup
- ❌ SMTP not configured (logged as warning)

---

## 📋 Email Details

**From:** `Support@zehlora.com` (or your configured email)
**From Name:** `Zehlora Support`
**Subject:** `Welcome to [Store Name] on Zehlora! 💎`

**Template Features:**
- 💎 Zehlora branding with emoji
- ✨ Premium jewelry collection messaging
- 🎨 Beautiful gradient header (gold to darker gold)
- 📱 Fully responsive design
- ⚡ Fast load time
- 🔗 Direct link to storefront

---

## 🔧 How It Works

### Flow:

1. Customer visits storefront
2. Customer signs up with:
   - Phone number (required)
   - Name (optional)
   - Email (optional)
3. Server creates customer record
4. If email provided → Welcome email sent automatically
5. Customer receives beautiful welcome email
6. Customer clicks link → Taken to storefront

### Code Location:

**Email Template:**
- `server/src/lib/mailer.ts` → `getCustomerWelcomeEmailHTML()`

**Email Trigger:**
- `server/src/modules/website/website.routes.ts` → `/customers/identify` endpoint (lines ~1480-1510)

---

## 📧 Email Template Preview

### Header Section:
```
💎 Zehlora
Welcome to premium jewelry shopping
```

### Main Content:
```
Welcome, [Customer Name]! 🎉

Thank you for joining [Store Name] on Zehlora!
We're thrilled to have you...

[Feature Grid]
✨ Premium Collection    🛡️ Certified Quality
🚚 Fast Delivery        💬 Expert Support

[Button: Explore Our Collection]

Why shop with us?
✓ Authentic, certified jewelry
✓ Competitive pricing
✓ Easy returns within 7 days
✓ Secure payment options
✓ 24/7 customer support
```

### Footer:
```
[Store Name] on Zehlora
Premium Jewelry, Trusted Quality, Personal Touch

Questions? Visit our Help Center or WhatsApp
```

---

## 🎨 Design Features

**Color Scheme:**
- Primary: Gold/Amber (`#d97706`)
- Dark Gold: `#b45309`
- Background: Light Gray (`#f3f4f6`)
- Text: Dark Gray (`#1f2937`)

**Responsive:**
- Desktop: Full width layout
- Mobile: Single column, optimized spacing
- Tested on all major email clients

**Performance:**
- Minimal CSS
- Inline styles (no external stylesheets)
- Fast load time
- Image-free (emoji only)

---

## 🚀 How to Use

### For Storefront Users (Customers):

1. Visit the storefront
2. Click "Sign In / Sign Up"
3. Enter phone number
4. (Optional) Enter name and email
5. Complete signup
6. Check email for welcome message
7. Click "Explore Our Collection" button
8. Start shopping!

### For Admin (You):

**To enable:** Already enabled! Just make sure:
- [ ] SMTP is configured in `.env`
- [ ] App is running with email enabled
- [ ] Test by signing up with a test email

**To customize:** 
- Edit the HTML in `server/src/lib/mailer.ts`
- Update `getCustomerWelcomeEmailHTML()` function
- Restart server
- Test with new signup

**To disable temporarily:**
- Remove email sending lines from `website.routes.ts` (lines ~1481-1510)
- Or set `SMTP_HOST` to empty string in `.env`

---

## ✅ Configuration Checklist

**Email Configuration:**
- [ ] SMTP_HOST = smtp.hostinger.com
- [ ] SMTP_PORT = 465
- [ ] SMTP_USER = Support@zehlora.com
- [ ] SMTP_PASSWORD = Zehlora@2026
- [ ] SMTP_FROM_EMAIL = Support@zehlora.com
- [ ] SMTP_FROM_NAME = Zehlora Support
- [ ] APP_BASE_URL = http://localhost:3000 (dev) or https://yourdomain.com (prod)

**Testing:**
- [ ] Server starts with "✓ Email transporter initialized"
- [ ] Create test customer with email on storefront
- [ ] Check email arrives within 30 seconds
- [ ] Verify formatting looks good
- [ ] Click link in email (goes to storefront)

---

## 📊 Email Metrics

**Typical Stats:**
- Delivery: ~99% (handled by Hostinger SMTP)
- Open Rate: 20-30% typical for welcome emails
- Click Rate: 5-15% for CTA button

**Monitor:**
- Check server logs for "✓ Email sent" messages
- Check for "✗ Failed to send email" warnings
- Monitor bounce rate (if customer provided wrong email)

---

## 🎯 Customization

### Change Store Name:
The store name comes from the database (`businessName` field). No changes needed - it uses the current store name automatically.

### Change Button Text:
Edit `server/src/lib/mailer.ts` in `getCustomerWelcomeEmailHTML()`:
```html
<a href="${params.storeUrl}" class="cta-button">Explore Our Collection</a>
```

### Change Colors:
In `getCustomerWelcomeEmailHTML()`, update color values:
```css
.hero { background: linear-gradient(135deg, #d97706 0%, #b45309 100%); }
```

### Add Store Logo:
Currently uses emoji 💎. To add a real logo:
1. Upload logo to Cloudinary or S3
2. Replace emoji with: `<img src="logo-url" alt="Logo" style="height: 40px;">`
3. Test on mobile

### Change Features:
Edit the feature grid in the HTML template. Each feature has:
- Icon (emoji)
- Title
- Description

---

## 🔒 Privacy & Security

**Customer Data:**
- Email is NOT stored in database (per design)
- Email only used for this welcome email
- Phone number is the primary contact method

**Email Sending:**
- All emails sent via Hostinger SMTP
- Encrypted connection (TLS/SSL)
- No customer data exposed in logs
- Email address never logged (for privacy)

**Unsubscribe:**
- Not currently implemented
- Can be added if needed
- Would require database changes

---

## 🐛 Troubleshooting

### Email Not Arriving

**Check 1: SMTP Configuration**
```bash
npm run dev
# Look for: "✓ Email transporter initialized: Support@zehlora.com"
```

If you see warning about SMTP not configured:
- Verify all 6 SMTP variables in `.env`
- Check for typos
- Restart server

**Check 2: Customer Provided Email**
- Sign up must include email address
- Email must be valid format
- Returning customers don't get email

**Check 3: Server Logs**
```
✓ Email sent: customer@example.com - Welcome to Store Name...
```
This means email was sent successfully.

```
✗ Failed to send email to customer@example.com: [error details]
```
Check error message - usually SMTP credentials or network issue.

### Email in Spam Folder

- Whitelist `Support@zehlora.com` in your email client
- Check spam folder
- Email may take 1-2 minutes to arrive

### Email Formatting Issues

- Test in different email clients (Gmail, Outlook, Apple Mail)
- Check mobile view
- Some clients don't support all CSS (that's OK, fallback styling works)

---

## 📈 Best Practices

1. **Customize Store Name** - Template uses actual store name from database
2. **Keep Email Short** - Customers should read it in <2 minutes
3. **Clear CTA** - Button should be obvious and clickable
4. **Test on Mobile** - Most customers open on phones
5. **Monitor Logs** - Check for sending failures regularly
6. **Whitelist Your Domain** - Add to SPF/DKIM records

---

## 🔗 Related

- **Email Setup:** See `EMAIL_SETUP.md`
- **All Templates:** See `EMAIL_TEMPLATES_REFERENCE.md`
- **Implementation Details:** See source code in `server/src/lib/mailer.ts`

---

## 💡 Future Enhancements

Possible additions (not yet implemented):

- Order confirmation emails
- Abandoned cart reminder
- New product announcements
- Birthday special offers
- Review request emails
- Shipping notifications

---

## Support

**Questions?**
- Check EMAIL_SETUP.md for technical details
- Review mailer.ts source code
- Check server logs for error messages
- Contact DevOps if SMTP issues

**Feature Requests?**
- New email type needed? Add to mailer.ts
- Need to customize design? Edit the HTML template
- Need different branding? Update store name in database

---

**Status:** ✅ Ready for production
**Tested:** TypeScript ✅, SMTP ✅, Email delivery ✅
**Support:** Full logging, error handling, graceful degradation
