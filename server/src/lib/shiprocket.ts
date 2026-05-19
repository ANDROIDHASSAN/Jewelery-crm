// server/src/lib/shiprocket.ts — Shiprocket courier integration.
//
// Two flows:
//   • createShiprocketAwb — called fire-and-forget when a paid order needs
//     dispatch. Authenticates, creates a Shiprocket Order, requests an AWB,
//     persists the AWB + tracking URL back onto our Order row, and seeds an
//     OrderEvent so the customer track page reflects "courier booked".
//   • handleShiprocketWebhook — receives delivery-status updates and writes
//     OrderEvent rows so the live track page picks them up.
//
// Auth: Shiprocket's REST API uses an email/password → token exchange. The
// token has a 10-day lifetime; we cache it in Redis with a 9-day TTL so a
// single server can serve many requests without re-authenticating.
//
// Simulated mode: when SHIPROCKET_EMAIL/PASSWORD are empty, the AWB creation
// is a no-op that logs and returns. This keeps local dev quiet without keys.

import { env } from '../env.js';
import { logger } from './logger.js';
import { redis } from './redis.js';
import { rawPrisma } from './prisma.js';
import { runWithTenant } from './async-context.js';

const SHIPROCKET_API_BASE = 'https://apiv2.shiprocket.in/v1/external';
const TOKEN_REDIS_KEY = 'shiprocket:token:v1';
const TOKEN_TTL_SECONDS = 9 * 24 * 60 * 60; // 9 days, tokens expire at 10

export function isShiprocketConfigured(): boolean {
  return Boolean(env.SHIPROCKET_EMAIL) && Boolean(env.SHIPROCKET_PASSWORD);
}

async function getShiprocketToken(): Promise<string | null> {
  if (!isShiprocketConfigured()) return null;
  const cached = await redis.get(TOKEN_REDIS_KEY);
  if (cached) return cached;

  const res = await fetch(`${SHIPROCKET_API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.SHIPROCKET_EMAIL, password: env.SHIPROCKET_PASSWORD }),
  });
  if (!res.ok) {
    logger.error({ status: res.status }, '[shiprocket] auth failed');
    return null;
  }
  const json = (await res.json()) as { token?: string };
  if (!json.token) return null;
  await redis.set(TOKEN_REDIS_KEY, json.token, 'EX', TOKEN_TTL_SECONDS);
  return json.token;
}

export interface CreateAwbArgs {
  orderId: string;
  tenantId: string;
  customerName: string;
  customerPhone: string;
  shipping: {
    name: string;
    phone: string;
    line1: string;
    line2: string;
    city: string;
    state: string;
    pincode: string;
  };
  items: Array<{ name: string; sku: string; qty: number; pricePaise: number }>;
  subtotalPaise: number;
  shippingPaise: number;
  taxPaise: number;
  totalPaise: number;
}

/**
 * Books a Shiprocket shipment for the given order. Persists the AWB number
 * and tracking URL back to our Order row, and writes an OrderEvent describing
 * the booking. Safe to call when not configured (no-op).
 */
export async function createShiprocketAwb(args: CreateAwbArgs): Promise<{
  ok: boolean;
  awb?: string;
  trackingUrl?: string;
  reason?: string;
}> {
  if (!isShiprocketConfigured()) {
    logger.warn({ orderId: args.orderId }, '[shiprocket] not configured — skipping AWB');
    return { ok: false, reason: 'not-configured' };
  }
  const token = await getShiprocketToken();
  if (!token) return { ok: false, reason: 'auth-failed' };

  // 1) Create adhoc order in Shiprocket.
  const createBody = {
    order_id: args.orderId,
    order_date: new Date().toISOString().slice(0, 10),
    pickup_location: env.SHIPROCKET_PICKUP_LOCATION,
    billing_customer_name: args.shipping.name.split(' ')[0] || args.shipping.name,
    billing_last_name: args.shipping.name.split(' ').slice(1).join(' ') || '.',
    billing_address: args.shipping.line1,
    billing_address_2: args.shipping.line2,
    billing_city: args.shipping.city,
    billing_pincode: args.shipping.pincode,
    billing_state: args.shipping.state,
    billing_country: 'India',
    billing_email: `${args.customerPhone.replace(/\D/g, '')}@noreply.zelora.in`,
    billing_phone: args.shipping.phone.replace(/^\+91/, ''),
    shipping_is_billing: true,
    order_items: args.items.map((i) => ({
      name: i.name.slice(0, 60),
      sku: i.sku.slice(0, 60),
      units: i.qty,
      selling_price: Math.round(i.pricePaise / 100),
    })),
    payment_method: 'Prepaid',
    sub_total: Math.round(args.subtotalPaise / 100),
    length: 10,
    breadth: 10,
    height: 4,
    weight: Math.max(0.05, Math.min(2, args.items.reduce((s, i) => s + i.qty * 0.05, 0))),
  };

  const createRes = await fetch(`${SHIPROCKET_API_BASE}/orders/create/adhoc`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(createBody),
  });
  if (!createRes.ok) {
    const body = await createRes.text();
    logger.error({ status: createRes.status, body: body.slice(0, 300) }, '[shiprocket] create order failed');
    return { ok: false, reason: `create-failed-${createRes.status}` };
  }
  const created = (await createRes.json()) as { shipment_id?: number; order_id?: number };
  if (!created.shipment_id) return { ok: false, reason: 'no-shipment-id' };

  // 2) Generate AWB.
  const awbRes = await fetch(`${SHIPROCKET_API_BASE}/courier/assign/awb`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ shipment_id: created.shipment_id }),
  });
  if (!awbRes.ok) {
    const body = await awbRes.text();
    logger.error({ status: awbRes.status, body: body.slice(0, 300) }, '[shiprocket] AWB assign failed');
    return { ok: false, reason: `awb-failed-${awbRes.status}` };
  }
  const awbJson = (await awbRes.json()) as { awb_assign_status?: number; response?: { data?: { awb_code?: string; courier_name?: string } } };
  const awb = awbJson.response?.data?.awb_code;
  if (!awb) return { ok: false, reason: 'no-awb' };

  // 3) Request pickup so the courier actually shows up.
  await fetch(`${SHIPROCKET_API_BASE}/courier/generate/pickup`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ shipment_id: [created.shipment_id] }),
  }).catch((e) => logger.warn({ err: e }, '[shiprocket] pickup request failed (AWB still valid)'));

  const trackingUrl = `https://shiprocket.co/tracking/${awb}`;

  // 4) Persist back to our Order + emit an event.
  await runWithTenant({ tenantId: args.tenantId }, async () => {
    await rawPrisma.order.update({
      where: { id: args.orderId },
      data: {
        shiprocketAwb: awb,
        shiprocketTrackingUrl: trackingUrl,
        status: 'PACKED',
        events: {
          create: [{
            tenantId: args.tenantId,
            status: 'PACKED',
            note: `Shiprocket AWB ${awb} via ${awbJson.response?.data?.courier_name ?? 'courier'}`,
            actorName: 'System',
          }],
        },
      },
    });
  });

  return { ok: true, awb, trackingUrl };
}

interface ShiprocketWebhookPayload {
  awb?: string;
  current_status?: string;
  current_status_id?: number;
  current_timestamp?: string;
  order_id?: string;
  shipment_status?: string;
  scans?: Array<{ activity?: string; date?: string; location?: string; status?: string }>;
}

/**
 * Handles a Shiprocket status-update webhook by mapping the courier's status
 * string to our OrderStatus enum and inserting an OrderEvent. Returns whether
 * a change was applied (no-op if status hasn't moved).
 */
export async function handleShiprocketWebhook(args: {
  rawBody: string;
  signature: string;
}): Promise<{ applied: boolean }> {
  if (env.SHIPROCKET_WEBHOOK_SECRET && args.signature !== env.SHIPROCKET_WEBHOOK_SECRET) {
    throw new Error('shiprocket webhook signature mismatch');
  }
  let payload: ShiprocketWebhookPayload;
  try {
    payload = JSON.parse(args.rawBody);
  } catch {
    return { applied: false };
  }
  if (!payload.awb) return { applied: false };

  const order = await rawPrisma.order.findFirst({
    where: { shiprocketAwb: payload.awb },
    select: { id: true, tenantId: true, status: true },
  });
  if (!order) return { applied: false };

  const mappedStatus = mapShiprocketStatus(payload.current_status ?? payload.shipment_status ?? '');
  const note = `Courier: ${payload.current_status ?? payload.shipment_status ?? 'update'}${payload.scans?.[0]?.location ? ` at ${payload.scans[0].location}` : ''}`;

  await runWithTenant({ tenantId: order.tenantId }, async () => {
    await rawPrisma.order.update({
      where: { id: order.id },
      data: {
        ...(mappedStatus && mappedStatus !== order.status ? { status: mappedStatus } : {}),
        events: {
          create: [{
            tenantId: order.tenantId,
            status: mappedStatus ?? order.status,
            note,
            actorName: 'Shiprocket',
            location: payload.scans?.[0]?.location ?? null,
          }],
        },
      },
    });
  });
  return { applied: true };
}

// Shiprocket's status strings → our OrderStatus. Anything we don't recognise
// is left null so the existing status sticks but the event row is still
// recorded (the customer sees the courier note verbatim).
function mapShiprocketStatus(s: string): 'PACKED' | 'SHIPPED' | 'DELIVERED' | 'RETURNED' | 'CANCELLED' | null {
  const v = s.toLowerCase();
  if (v.includes('delivered')) return 'DELIVERED';
  if (v.includes('rto') || v.includes('return')) return 'RETURNED';
  if (v.includes('cancel')) return 'CANCELLED';
  if (v.includes('out for delivery') || v.includes('in transit') || v.includes('picked up') || v.includes('shipped')) return 'SHIPPED';
  if (v.includes('pickup') || v.includes('manifest') || v.includes('label')) return 'PACKED';
  return null;
}
