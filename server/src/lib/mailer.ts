// Email service using Nodemailer with SMTP
// Handles all transactional emails for the application

import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env.js';
import { logger } from './logger.js';

let transporter: Transporter | null = null;

/**
 * Initialize the email transporter (Nodemailer)
 * Called once at server startup if SMTP is configured
 */
export function initializeMailer(): void {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) {
    logger.warn('Email (SMTP) not configured. Email functionality disabled.');
    return;
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465, // true for 465, false for other ports like 587
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
  });

  logger.info(`✓ Email transporter initialized: ${env.SMTP_FROM_EMAIL}`);
}

/**
 * Send an email. Returns true if successful, false if email is not configured.
 */
export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<boolean> {
  if (!transporter) {
    logger.warn(`Email not sent (SMTP not configured): ${options.to} - ${options.subject}`);
    return false;
  }

  try {
    await transporter.sendMail({
      from: `${env.SMTP_FROM_NAME} <${env.SMTP_FROM_EMAIL}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    logger.info(`✓ Email sent: ${options.to} - ${options.subject}`);
    return true;
  } catch (error) {
    logger.error(`✗ Failed to send email to ${options.to}:`, error);
    return false;
  }
}

/**
 * Email template: Admin role invitation
 */
export function getInvitationEmailHTML(params: {
  recipientName: string;
  invitationLink: string;
  tenantName: string;
  roleName: string;
  expiresInDays: number;
}): string {
  // Validate invitation link is properly formed
  if (!params.invitationLink || !params.invitationLink.startsWith('http')) {
    logger.error('Invalid invitation link in email template', { link: params.invitationLink });
    throw new Error('Invalid invitation link');
  }
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #1f2937; color: white; padding: 20px; text-align: center; border-radius: 4px 4px 0 0; }
    .content { background-color: #f9fafb; padding: 20px; border-left: 4px solid #d97706; }
    .footer { background-color: #e5e7eb; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 4px 4px; }
    .button { background-color: #d97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0; font-weight: bold; }
    .button:hover { background-color: #b45309; }
    .info-box { background-color: white; padding: 15px; margin: 15px 0; border-radius: 4px; border: 1px solid #e5e7eb; }
    .label { font-weight: bold; color: #1f2937; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to Zehlora!</h1>
      <p>You've been invited to join the team</p>
    </div>

    <div class="content">
      <p>Hello <strong>${params.recipientName}</strong>,</p>

      <p>You have been invited to join <strong>${params.tenantName}</strong> on Zehlora with the role of <strong>${params.roleName}</strong>.</p>

      <p style="text-align: center;">
        <a href="${params.invitationLink}" class="button">Accept Invitation & Set Password</a>
      </p>

      <div class="info-box">
        <p><span class="label">Organization:</span> ${params.tenantName}</p>
        <p><span class="label">Role:</span> ${params.roleName}</p>
        <p><span class="label">Expires in:</span> ${params.expiresInDays} days</p>
      </div>

      <p><strong>⏰ Note:</strong> This invitation link expires in ${params.expiresInDays} days. If you don't use it by then, the admin will need to send you a new one.</p>

      <p><strong>🔒 What you'll do:</strong></p>
      <ul>
        <li>Click the button above to accept the invitation</li>
        <li>Set your secure password</li>
        <li>Start managing your business on Zehlora</li>
      </ul>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">

      <p style="font-size: 13px; color: #6b7280;">
        <strong>Can't click the button?</strong> Copy and paste this link in your browser:<br>
        <code style="background-color: #f0f0f0; padding: 2px 6px; border-radius: 3px;">${params.invitationLink}</code>
      </p>
    </div>

    <div class="footer">
      <p>&copy; 2026 Zehlora. All rights reserved.</p>
      <p>This is an automated message. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Email template: Member added + credentials sent
 */
export function getMemberAddedEmailHTML(params: {
  recipientName: string;
  tempUsername: string;
  tempPassword: string;
  loginUrl: string;
  roleName: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #1f2937; color: white; padding: 20px; text-align: center; border-radius: 4px 4px 0 0; }
    .content { background-color: #f9fafb; padding: 20px; border-left: 4px solid #059669; }
    .footer { background-color: #e5e7eb; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 4px 4px; }
    .button { background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0; font-weight: bold; }
    .button:hover { background-color: #047857; }
    .credentials-box { background-color: #dcfce7; padding: 15px; margin: 15px 0; border-radius: 4px; border: 2px solid #059669; font-family: monospace; }
    .credential-item { margin: 10px 0; }
    .label { font-weight: bold; color: #1f2937; }
    .warning { background-color: #fef3c7; padding: 15px; margin: 15px 0; border-radius: 4px; border-left: 4px solid #f59e0b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to the Team!</h1>
      <p>Your account has been created</p>
    </div>

    <div class="content">
      <p>Hello <strong>${params.recipientName}</strong>,</p>

      <p>Your account has been created with the role of <strong>${params.roleName}</strong>. Here are your temporary login credentials:</p>

      <div class="credentials-box">
        <div class="credential-item">
          <strong>Email/Username:</strong><br>
          ${params.tempUsername}
        </div>
        <div class="credential-item">
          <strong>Temporary Password:</strong><br>
          ${params.tempPassword}
        </div>
      </div>

      <p style="text-align: center;">
        <a href="${params.loginUrl}" class="button">Login to Zehlora</a>
      </p>

      <div class="warning">
        <p><strong>⚠️ Important Security Steps:</strong></p>
        <ol>
          <li>Login with the credentials above</li>
          <li>Change your password immediately (go to Settings &gt; Profile)</li>
          <li>Set up two-factor authentication if available</li>
          <li>Never share your password with anyone</li>
        </ol>
      </div>

      <p><strong>📝 Next Steps:</strong></p>
      <ul>
        <li>Complete your profile information</li>
        <li>Familiarize yourself with your role and permissions</li>
        <li>Contact your admin if you need additional access</li>
      </ul>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">

      <p style="font-size: 13px; color: #6b7280;">
        <strong>Can't login?</strong> Contact your administrator for assistance. These temporary credentials are valid for 24 hours.
      </p>
    </div>

    <div class="footer">
      <p>&copy; 2026 Zehlora. All rights reserved.</p>
      <p>This is an automated message. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Email template: Welcome email after successful signup
 */
export function getWelcomeEmailHTML(params: {
  recipientName: string;
  tenantName: string;
  dashboardUrl: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #1f2937; color: white; padding: 20px; text-align: center; border-radius: 4px 4px 0 0; }
    .content { background-color: #f9fafb; padding: 20px; border-left: 4px solid #0891b2; }
    .footer { background-color: #e5e7eb; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 4px 4px; }
    .button { background-color: #0891b2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0; font-weight: bold; }
    .button:hover { background-color: #0e7490; }
    .feature-list { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
    .feature-item { background-color: white; padding: 15px; border-radius: 4px; border: 1px solid #e5e7eb; }
    .feature-icon { font-size: 24px; margin-bottom: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Welcome to Zehlora!</h1>
      <p>Your account is all set up and ready to go</p>
    </div>

    <div class="content">
      <p>Hello <strong>${params.recipientName}</strong>,</p>

      <p>Congratulations! Your account for <strong>${params.tenantName}</strong> is now active. You're ready to start managing your business with Zehlora.</p>

      <p style="text-align: center;">
        <a href="${params.dashboardUrl}" class="button">Go to Dashboard</a>
      </p>

      <p><strong>🚀 Quick Features You Can Use:</strong></p>
      <div class="feature-list">
        <div class="feature-item">
          <div class="feature-icon">📊</div>
          <strong>Inventory</strong><br>
          Track stock & items
        </div>
        <div class="feature-item">
          <div class="feature-icon">💰</div>
          <strong>Finance</strong><br>
          Manage accounts
        </div>
        <div class="feature-item">
          <div class="feature-icon">🏪</div>
          <strong>POS</strong><br>
          Process sales
        </div>
        <div class="feature-item">
          <div class="feature-icon">🌐</div>
          <strong>E-Commerce</strong><br>
          Online storefront
        </div>
      </div>

      <p><strong>📚 Getting Started:</strong></p>
      <ol>
        <li>Complete your profile in Settings</li>
        <li>Set up your shops and locations</li>
        <li>Import your inventory</li>
        <li>Explore the dashboard and all available features</li>
      </ol>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">

      <p style="font-size: 13px; color: #6b7280;">
        Questions? Check our help documentation or contact support. We're here to help you succeed!
      </p>
    </div>

    <div class="footer">
      <p>&copy; 2026 Zehlora. All rights reserved.</p>
      <p>This is an automated message. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Email template: Password changed notification
 */
export function getPasswordChangedEmailHTML(params: {
  recipientName: string;
  timestamp: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #1f2937; color: white; padding: 20px; text-align: center; border-radius: 4px 4px 0 0; }
    .content { background-color: #f9fafb; padding: 20px; border-left: 4px solid #7c3aed; }
    .footer { background-color: #e5e7eb; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 4px 4px; }
    .info-box { background-color: white; padding: 15px; margin: 15px 0; border-radius: 4px; border: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Password Changed</h1>
      <p>Security notification</p>
    </div>

    <div class="content">
      <p>Hello <strong>${params.recipientName}</strong>,</p>

      <p>Your password was successfully changed at ${params.timestamp}.</p>

      <div class="info-box">
        <p><strong>If this was you:</strong> You can safely ignore this email. Your account is secure.</p>
        <p><strong>If this wasn't you:</strong> Your account may have been compromised. Please reset your password immediately and contact support.</p>
      </div>

      <p><strong>🔒 Keep Your Account Secure:</strong></p>
      <ul>
        <li>Use a strong, unique password</li>
        <li>Never share your password with anyone</li>
        <li>Enable two-factor authentication if available</li>
        <li>Log out from unused devices</li>
      </ul>
    </div>

    <div class="footer">
      <p>&copy; 2026 Zehlora. All rights reserved.</p>
      <p>This is an automated message. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Email template: Customer Welcome (Storefront Signup)
 */
export function getCustomerWelcomeEmailHTML(params: {
  recipientName: string;
  businessName: string;
  storeUrl: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #1f2937; background-color: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07); }

    /* Hero Section */
    .hero { background: linear-gradient(135deg, #d97706 0%, #b45309 100%); color: white; padding: 40px 20px; text-align: center; }
    .logo-text { font-size: 32px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 8px; }
    .hero-subtitle { font-size: 14px; opacity: 0.95; }

    /* Main Content */
    .content { padding: 40px 30px; }
    .greeting { font-size: 24px; font-weight: 600; color: #1f2937; margin-bottom: 16px; }
    .intro-text { color: #4b5563; margin-bottom: 24px; line-height: 1.7; }

    /* Features Grid */
    .features { margin: 32px 0; }
    .feature-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .feature-item { background-color: #fef3c7; border-left: 4px solid #d97706; padding: 16px; border-radius: 6px; }
    .feature-icon { font-size: 28px; margin-bottom: 8px; }
    .feature-title { font-weight: 600; color: #1f2937; margin-bottom: 4px; font-size: 14px; }
    .feature-desc { font-size: 13px; color: #4b5563; }

    /* CTA Button */
    .cta-section { text-align: center; margin: 32px 0; }
    .cta-button { background: linear-gradient(135deg, #d97706 0%, #b45309 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block; transition: transform 0.2s; }
    .cta-button:hover { transform: translateY(-2px); box-shadow: 0 8px 12px rgba(217, 119, 6, 0.3); }

    /* Benefits */
    .benefits { background-color: #faf5f0; padding: 20px; border-radius: 8px; margin: 24px 0; }
    .benefits-title { font-weight: 600; color: #1f2937; margin-bottom: 12px; font-size: 15px; }
    .benefit-list { list-style: none; }
    .benefit-list li { padding: 8px 0; padding-left: 24px; position: relative; color: #4b5563; font-size: 14px; }
    .benefit-list li:before { content: "✓"; position: absolute; left: 0; color: #d97706; font-weight: bold; }

    /* Footer */
    .footer { background-color: #f9fafb; padding: 24px 30px; border-top: 1px solid #e5e7eb; text-align: center; }
    .footer-text { font-size: 12px; color: #6b7280; line-height: 1.6; }
    .footer-link { color: #d97706; text-decoration: none; }

    /* Responsive */
    @media (max-width: 480px) {
      .container { margin: 0; border-radius: 0; }
      .content { padding: 24px 16px; }
      .hero { padding: 32px 16px; }
      .feature-row { grid-template-columns: 1fr; }
      .greeting { font-size: 20px; }
      .logo-text { font-size: 28px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Hero Section with Branding -->
    <div class="hero">
      <div class="logo-text">💎 Zehlora</div>
      <div class="hero-subtitle">Welcome to premium jewelry shopping</div>
    </div>

    <!-- Main Content -->
    <div class="content">
      <p class="greeting">Welcome, ${params.recipientName}! 🎉</p>

      <p class="intro-text">
        Thank you for joining <strong>${params.businessName}</strong> on Zehlora! We're thrilled to have you as part of our community of jewelry enthusiasts. Get ready to explore our exquisite collection of timeless pieces.
      </p>

      <!-- Features Grid -->
      <div class="features">
        <div class="feature-row">
          <div class="feature-item">
            <div class="feature-icon">✨</div>
            <div class="feature-title">Premium Collection</div>
            <div class="feature-desc">Handpicked jewelry pieces</div>
          </div>
          <div class="feature-item">
            <div class="feature-icon">🛡️</div>
            <div class="feature-title">Certified Quality</div>
            <div class="feature-desc">Hallmark assured</div>
          </div>
        </div>
        <div class="feature-row">
          <div class="feature-item">
            <div class="feature-icon">🚚</div>
            <div class="feature-title">Fast Delivery</div>
            <div class="feature-desc">Quick & secure shipping</div>
          </div>
          <div class="feature-item">
            <div class="feature-icon">💬</div>
            <div class="feature-title">Expert Support</div>
            <div class="feature-desc">Personal assistance</div>
          </div>
        </div>
      </div>

      <!-- CTA -->
      <div class="cta-section">
        <a href="${params.storeUrl}" class="cta-button">Explore Our Collection</a>
      </div>

      <!-- Benefits -->
      <div class="benefits">
        <div class="benefits-title">Why shop with us?</div>
        <ul class="benefit-list">
          <li>Authentic, certified jewelry from trusted artisans</li>
          <li>Competitive pricing with no hidden charges</li>
          <li>Easy returns within 7 days</li>
          <li>Secure payment options (UPI, Cards, Net Banking)</li>
          <li>Personalized shopping experience</li>
          <li>24/7 customer support via WhatsApp & email</li>
        </ul>
      </div>

      <!-- Closing -->
      <p style="color: #4b5563; margin-top: 24px;">
        Your next favorite piece is waiting for you. Start exploring and discover the perfect jewelry to express your unique style.
      </p>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p class="footer-text">
        <strong>${params.businessName}</strong> on Zehlora<br>
        Premium Jewelry, Trusted Quality, Personal Touch<br>
        <br>
        Questions? We're here to help!<br>
        <a href="${params.storeUrl}/help" class="footer-link">Visit our Help Center</a> or contact our team via WhatsApp<br>
        <br>
        &copy; 2026 Zehlora. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Email template: Generic notification
 */
export function getNotificationEmailHTML(params: {
  recipientName: string;
  subject: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #1f2937; color: white; padding: 20px; text-align: center; border-radius: 4px 4px 0 0; }
    .content { background-color: #f9fafb; padding: 20px; border-left: 4px solid #1f2937; }
    .footer { background-color: #e5e7eb; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 4px 4px; }
    .button { background-color: #1f2937; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0; font-weight: bold; }
    .button:hover { background-color: #111827; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${params.subject}</h1>
    </div>

    <div class="content">
      <p>Hello <strong>${params.recipientName}</strong>,</p>

      <p>${params.message}</p>

      ${params.actionUrl ? `<p style="text-align: center;">
        <a href="${params.actionUrl}" class="button">${params.actionText || 'View Details'}</a>
      </p>` : ''}
    </div>

    <div class="footer">
      <p>&copy; 2026 Zehlora. All rights reserved.</p>
      <p>This is an automated message. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
}
