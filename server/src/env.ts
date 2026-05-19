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

  // GoldAPI.io key — sole source of gold/silver rates. Required.
  // Sign up at https://www.goldapi.io for a free 100-req/month key.
  GOLDAPI_KEY: z.string().min(10, 'GOLDAPI_KEY missing — sign up at goldapi.io for a free key'),

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
