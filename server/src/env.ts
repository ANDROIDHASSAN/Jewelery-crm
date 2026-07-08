// server/src/env.ts — Zod-validated environment loader. Crashes loud at boot if anything's missing.

import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),

  // Sentinel bearer token accepted by the auth middleware as the admin user.
  // Must match VITE_ADMIN_API_TOKEN on the client. Empty disables the bypass.
  ADMIN_API_TOKEN: z.string().optional().default(''),
  // Optional: pin the admin session to a specific tenant. If empty, the
  // first tenant in the DB is used (single-tenant deployments).
  ADMIN_TENANT_ID: z.string().optional().default(''),

  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  WHATSAPP_API_TOKEN: z.string().optional().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  WHATSAPP_TEMPLATE_RECEIPT: z.string().optional().default('receipt_v1'),
  WHATSAPP_TEMPLATE_OTP: z.string().optional().default('otp_v1'),
  WHATSAPP_TEMPLATE_ABANDONED_CART: z.string().optional().default('abandoned_cart_v1'),

  TWILIO_ACCOUNT_SID: z.string().optional().default(''),
  TWILIO_AUTH_TOKEN: z.string().optional().default(''),

  // GoldAPI.io key — sole source of gold/silver rates when set. Optional in
  // env so deploys without a key (preview envs, demo Render services) can
  // boot. When empty the daily worker skips the external API call and the
  // storefront falls back to the last known DB row marked `stale`. Set
  // GOLDAPI_KEY in production (free 100-req/month tier at goldapi.io) to
  // keep the daily refresh running.
  GOLDAPI_KEY: z.string().optional().default(''),

  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  // Configured separately in the Razorpay dashboard at Settings > Webhooks.
  // Different from the key secret. Empty disables webhook ingestion (the
  // route returns 503 with a clear message so misconfigs surface fast).
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),

  SHIPROCKET_EMAIL: z.string().optional().default(''),
  SHIPROCKET_PASSWORD: z.string().optional().default(''),
  // Shiprocket pickup location nickname registered in the Shiprocket dashboard
  // (Settings > Pickup Addresses). Required when creating real shipments.
  SHIPROCKET_PICKUP_LOCATION: z.string().optional().default('Primary'),
  // Optional webhook signature secret if you enabled signed Shiprocket
  // webhooks. If empty the webhook route trusts the source (acceptable for
  // small merchants behind a firewall; tighten before public exposure).
  SHIPROCKET_WEBHOOK_SECRET: z.string().optional().default(''),

  S3_BUCKET: z.string().optional().default('goldos-dev'),
  S3_ACCESS_KEY: z.string().optional().default(''),
  S3_SECRET_KEY: z.string().optional().default(''),
  S3_ENDPOINT: z.string().optional().default('http://localhost:9000'),

  // Cloudinary connection URL — single env that bundles the cloud name, API
  // key, and API secret. Format: cloudinary://<api_key>:<api_secret>@<cloud_name>.
  // When set, the server signs each upload (no unsigned-preset setup
  // required); when empty, the client falls back to the unsigned-preset flow
  // (VITE_CLOUDINARY_*) and finally to base64 dev fallback. Set this in
  // production so images go to your Cloudinary instead of bloating the DB.
  CLOUDINARY_URL: z.string().optional().default(''),

  // Email (SMTP)
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().optional().default(465),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  SMTP_FROM_EMAIL: z.string().optional().default(''),
  SMTP_FROM_NAME: z.string().optional().default('Zehlora'),
  // Base URL for email links (invitations, password reset, etc.)
  // Dev: http://localhost:3000, Prod: https://app.yourdomain.com
  APP_BASE_URL: z.string().url().optional().default('http://localhost:3000'),

  // Public canonical origin of the customer-facing STOREFRONT (not the admin
  // app). Used to build absolute <loc> URLs in sitemap.xml + the Sitemap: line
  // in robots.txt. Must be the exact host Google should index (pick www OR
  // apex, https, no trailing slash) — e.g. https://zelora.com. When empty we
  // fall back to the request's X-Forwarded-Host (the host Vercel forwards when
  // it proxies /sitemap.xml to the API), so a first deploy still emits a
  // working sitemap; set this in production to lock the canonical host.
  // Empty = derive from the request host (see sitemap.ts). Not `.url()` — that
  // would reject the empty default; when set it should be a full https origin.
  STOREFRONT_BASE_URL: z.string().optional().default(''),

  SENTRY_DSN: z.string().optional().default(''),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`\n[boot] Invalid environment:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
