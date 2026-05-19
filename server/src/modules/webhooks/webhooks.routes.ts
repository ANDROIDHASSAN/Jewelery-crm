// server/src/modules/webhooks/webhooks.routes.ts — external service callbacks.
//
// Mounted at /api/v1/webhooks. NO tenant scope (the webhook payload carries
// the order id, which we resolve to a tenant).
//
// IMPORTANT: webhook routes MUST use the raw body parser (the parent index.ts
// mounts express.raw({type:'application/json'}) on this path) so signature
// verification has the exact bytes Razorpay/Shiprocket signed. JSON.parse is
// done manually after the signature check passes.

import { Router } from 'express';
import { logger } from '../../lib/logger.js';
import { rawPrisma } from '../../lib/prisma.js';
import { env } from '../../env.js';
import { runWithTenant } from '../../lib/async-context.js';
import { verifyWebhookSignature, fetchRazorpayPayment } from '../../lib/razorpay.js';
import { bustKey } from '../../lib/cache.js';
import { handleShiprocketWebhook } from '../../lib/shiprocket.js';

export const webhooksRouter: Router = Router();

// Razorpay → POST /api/v1/webhooks/razorpay
// Configure this URL in the Razorpay dashboard under Settings → Webhooks, set
// the webhook secret to RAZORPAY_WEBHOOK_SECRET, and subscribe to at least:
//   • payment.captured
//   • payment.failed
//   • order.paid
//
// Razorpay retries on non-2xx for ~24h, so handlers must be idempotent —
// re-processing the same event must be safe.
webhooksRouter.post('/razorpay', async (req, res) => {
  // req.body is a Buffer because index.ts mounted express.raw for this path.
  const rawBody = (req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body ?? {}))).toString('utf-8');
  const signature = req.headers['x-razorpay-signature'];

  if (typeof signature !== 'string' || !signature) {
    res.status(400).json({ error: { code: 'MISSING_SIGNATURE', message: 'x-razorpay-signature header required' } });
    return;
  }
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    // Don't fail open. If the secret isn't configured, we cannot validate
    // anything; reject loudly so the operator knows to set it.
    res.status(503).json({ error: { code: 'WEBHOOK_NOT_CONFIGURED', message: 'RAZORPAY_WEBHOOK_SECRET not set' } });
    return;
  }
  const valid = verifyWebhookSignature({
    rawBody,
    signature,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
  });
  if (!valid) {
    logger.warn({ signature: signature.slice(0, 12) + '…' }, '[webhook.razorpay] invalid signature');
    res.status(401).json({ error: { code: 'INVALID_SIGNATURE', message: 'Signature does not match' } });
    return;
  }

  let event: {
    event: string;
    payload?: {
      payment?: { entity?: { id: string; order_id: string; status: string; amount: number } };
      order?: { entity?: { id: string; status: string } };
    };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    res.status(400).json({ error: { code: 'BAD_JSON', message: 'Body is not valid JSON' } });
    return;
  }

  try {
    switch (event.event) {
      case 'payment.captured':
      case 'order.paid': {
        const payment = event.payload?.payment?.entity;
        const rzpOrderId = payment?.order_id ?? event.payload?.order?.entity?.id;
        if (!rzpOrderId) break;
        // Resolve the order. Razorpay's order_id is stored on our Order row.
        const order = await rawPrisma.order.findFirst({
          where: { razorpayOrderId: rzpOrderId },
          select: { id: true, tenantId: true, paymentStatus: true },
        });
        if (!order) {
          logger.warn({ rzpOrderId }, '[webhook.razorpay] no local order for razorpayOrderId');
          break;
        }
        if (order.paymentStatus === 'PAID') break; // idempotent
        await runWithTenant({ tenantId: order.tenantId }, async () => {
          await rawPrisma.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: 'PAID',
              paidAt: new Date(),
              razorpayPaymentId: payment?.id ?? null,
              status: 'CONFIRMED',
              events: {
                create: [{
                  tenantId: order.tenantId,
                  status: 'CONFIRMED',
                  note: `Razorpay webhook: ${event.event} (${payment?.id ?? 'n/a'})`,
                  actorName: 'System',
                }],
              },
            },
          });
        });
        void bustKey(order.tenantId, 'orders:live-count');
        void bustKey(order.tenantId, 'orders:list:ALL');
        void bustKey(order.tenantId, 'orders:list:PENDING');
        break;
      }
      case 'payment.failed': {
        const payment = event.payload?.payment?.entity;
        if (!payment?.order_id) break;
        // Optional: double-check status via API in case the webhook lies.
        await fetchRazorpayPayment(payment.id).catch(() => null);
        const order = await rawPrisma.order.findFirst({
          where: { razorpayOrderId: payment.order_id },
          select: { id: true, tenantId: true },
        });
        if (!order) break;
        await runWithTenant({ tenantId: order.tenantId }, async () => {
          await rawPrisma.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: 'FAILED',
              events: {
                create: [{
                  tenantId: order.tenantId,
                  status: 'PENDING',
                  note: `Razorpay payment failed (${payment.id})`,
                  actorName: 'System',
                }],
              },
            },
          });
        });
        break;
      }
      default:
        // Unhandled events are not an error — Razorpay sends many we don't subscribe to.
        logger.debug({ event: event.event }, '[webhook.razorpay] ignored event');
    }
  } catch (err) {
    logger.error({ err, event: event.event }, '[webhook.razorpay] handler threw');
    // Return 200 anyway so Razorpay doesn't retry on a code bug — we'd rather
    // investigate via logs than have storms of retries.
  }

  res.json({ received: true });
});

// Shiprocket → POST /api/v1/webhooks/shiprocket
// Subscribe in Shiprocket dashboard → Settings → Webhooks. Fires on every
// status change (Pickup Scheduled, In Transit, Out for Delivery, Delivered,
// RTO, etc.). We persist these as OrderEvent rows so the customer track page
// updates live.
webhooksRouter.post('/shiprocket', async (req, res) => {
  const rawBody = (req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body ?? {}))).toString('utf-8');
  try {
    const result = await handleShiprocketWebhook({
      rawBody,
      signature: typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'] : '',
    });
    res.json({ received: true, applied: result.applied });
  } catch (err) {
    logger.error({ err }, '[webhook.shiprocket] handler threw');
    res.status(200).json({ received: true, error: 'handler-failed' }); // never retry-storm
  }
});
