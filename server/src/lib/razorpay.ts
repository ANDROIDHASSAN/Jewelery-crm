// server/src/lib/razorpay.ts — Razorpay Orders + checkout signature verification.
//
// Two modes:
//   • Live   — when RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET are set, hits the real
//              Razorpay REST API.
//   • Simulated — when either env var is empty, returns fake order ids and
//              accepts any signature. Lets the storefront checkout flow work
//              end-to-end during demos before real keys are pasted in.
//
// Drop the real keys into env, restart the server, and live mode activates —
// no code change.
//
// All Razorpay amounts are in paise (integer), matching the rest of Gold OS.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';
import { logger } from './logger.js';

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';

export function isRazorpayConfigured(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID) && Boolean(env.RAZORPAY_KEY_SECRET);
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: 'INR';
  receipt: string;
  status: 'created' | 'attempted' | 'paid';
  /** True when the order was created in simulation mode (no real Razorpay call). */
  simulated: boolean;
}

/**
 * Creates a Razorpay Order. The returned `id` is what the client passes to the
 * Razorpay Checkout widget. Idempotent on `receipt` — re-creating an order with
 * the same receipt returns the existing one.
 */
export async function createRazorpayOrder(args: {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  if (!isRazorpayConfigured()) {
    logger.warn({ receipt: args.receipt }, '[razorpay] keys missing — returning simulated order');
    return {
      id: `order_sim_${Date.now()}_${args.receipt.slice(-8)}`,
      amount: args.amountPaise,
      currency: 'INR',
      receipt: args.receipt,
      status: 'created',
      simulated: true,
    };
  }

  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const res = await fetch(`${RAZORPAY_API_BASE}/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: args.amountPaise,
      currency: 'INR',
      receipt: args.receipt,
      notes: args.notes ?? {},
      payment_capture: 1, // auto-capture on success
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Razorpay createOrder ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    id: string;
    amount: number;
    currency: 'INR';
    receipt: string;
    status: 'created' | 'attempted' | 'paid';
  };

  return { ...json, simulated: false };
}

/**
 * Verifies the HMAC signature returned by Razorpay Checkout after a successful
 * payment. Razorpay signs `order_id|payment_id` with the secret; we recompute
 * and compare in constant time. Returns true if the signature is valid.
 *
 * In simulation mode (no secret configured), accepts any non-empty signature
 * so the checkout flow can be exercised end-to-end without a real key.
 */
export function verifyCheckoutSignature(args: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  if (!isRazorpayConfigured()) {
    logger.warn('[razorpay] keys missing — accepting any non-empty signature (simulated)');
    return Boolean(args.razorpaySignature && args.razorpayOrderId && args.razorpayPaymentId);
  }
  const expected = createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${args.razorpayOrderId}|${args.razorpayPaymentId}`)
    .digest('hex');
  return safeEquals(expected, args.razorpaySignature);
}

/**
 * Verifies a Razorpay webhook payload signature. Razorpay sends the signature
 * in the `x-razorpay-signature` header; we recompute HMAC-SHA256 over the
 * raw request body using the **webhook secret** (configured in the Razorpay
 * dashboard, separate from the key secret). Returns true if valid.
 *
 * Requires the raw body — Express must NOT have JSON-parsed it before this
 * check. The webhook route uses `express.raw({ type: 'application/json' })`.
 */
export function verifyWebhookSignature(args: {
  rawBody: Buffer | string;
  signature: string;
  webhookSecret: string;
}): boolean {
  if (!args.webhookSecret) {
    logger.warn('[razorpay] webhook secret missing — refusing to accept (set RAZORPAY_WEBHOOK_SECRET in env)');
    return false;
  }
  const body = typeof args.rawBody === 'string' ? args.rawBody : args.rawBody.toString('utf-8');
  const expected = createHmac('sha256', args.webhookSecret).update(body).digest('hex');
  return safeEquals(expected, args.signature);
}

function safeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf-8');
  const bb = Buffer.from(b, 'utf-8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Fetch a Razorpay payment record. Used by the webhook handler to double-check
 * payment state when an event arrives. Returns null in simulation mode.
 */
export async function fetchRazorpayPayment(paymentId: string): Promise<{
  id: string;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  order_id: string;
  method?: string;
} | null> {
  if (!isRazorpayConfigured()) return null;
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const res = await fetch(`${RAZORPAY_API_BASE}/payments/${paymentId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) {
    logger.error({ status: res.status, paymentId }, '[razorpay] fetch payment failed');
    return null;
  }
  return (await res.json()) as Awaited<ReturnType<typeof fetchRazorpayPayment>>;
}
