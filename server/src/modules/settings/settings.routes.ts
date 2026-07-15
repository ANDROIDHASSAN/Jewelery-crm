// Settings — workspace / tenant info CRUD + integration-connection status.
//
// The admin "Settings" page reads from /settings/tenant (business name,
// GST, phone, brand) and /settings/integrations (which env-driven
// integrations are wired up). Edits via PATCH /settings/tenant go straight
// into the Tenant row so invoices and the public storefront pick the new
// values up on next render.

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { getTenantId } from '../../lib/async-context.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { env } from '../../env.js';

export const settingsRouter: Router = Router();

const TenantPatchSchema = z.object({
  businessName: z.string().min(2).max(120).optional(),
  // Indian GSTIN is exactly 15 chars — keep validation loose enough to allow
  // owners to wipe it (empty string means "remove") but reject malformed.
  gstNumber: z
    .string()
    .trim()
    .max(15)
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v.toUpperCase())),
  phone: z.string().trim().min(8).max(20).optional(),
  ownerEmail: z.string().trim().email().optional(),
  brandPrimary: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/u, 'Must be a #RRGGBB hex color')
    .optional(),
  logoUrl: z
    .string()
    .url()
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),
});

settingsRouter.get('/tenant', async (_req, res, next) => {
  try {
    const tenantId = getTenantId();
    if (!tenantId) {
      res.status(401).json({ error: { code: 'NO_TENANT', message: 'Tenant context missing' } });
      return;
    }
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        businessName: true,
        gstNumber: true,
        phone: true,
        ownerEmail: true,
        plan: true,
        brandPrimary: true,
        logoUrl: true,
        createdAt: true,
      },
    });
    if (!tenant) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tenant not found' } });
      return;
    }
    res.json({ data: tenant });
  } catch (err) {
    next(err);
  }
});

settingsRouter.patch('/tenant', requirePermission('settings.write'), async (req, res, next) => {
  try {
    const tenantId = getTenantId();
    if (!tenantId) {
      res.status(401).json({ error: { code: 'NO_TENANT', message: 'Tenant context missing' } });
      return;
    }
    const body = TenantPatchSchema.parse(req.body);
    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: body,
      select: {
        id: true,
        businessName: true,
        gstNumber: true,
        phone: true,
        ownerEmail: true,
        plan: true,
        brandPrimary: true,
        logoUrl: true,
        createdAt: true,
      },
    });
    res.json({ data: tenant });
  } catch (err) {
    next(err);
  }
});

// GET /settings/loyalty — read current loyalty programme config
settingsRouter.get('/loyalty', requirePermission('settings.read'), async (_req, res, next) => {
  try {
    const tenantId = getTenantId();
    if (!tenantId) { res.status(401).json({ error: { code: 'NO_TENANT', message: 'Tenant context missing' } }); return; }
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        loyaltyEarnRatePaise: true,
        loyaltyPointValuePaise: true,
        loyaltyMinRedeemPoints: true,
        loyaltyMaxRedeemPct: true,
        loyaltyExpiryDays: true,
      },
    });
    if (!tenant) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tenant not found' } }); return; }
    res.json({ data: tenant });
  } catch (err) { next(err); }
});

const LoyaltyConfigPatchSchema = z.object({
  loyaltyEarnRatePaise: z.number().int().min(1).max(1_000_000).optional(),
  loyaltyPointValuePaise: z.number().int().min(1).max(1000).optional(),
  loyaltyMinRedeemPoints: z.number().int().min(1).max(100_000).optional(),
  loyaltyMaxRedeemPct: z.number().int().min(1).max(100).optional(),
  loyaltyExpiryDays: z.number().int().min(1).max(3650).optional(),
});

// PATCH /settings/loyalty — update loyalty programme config
settingsRouter.patch('/loyalty', requirePermission('settings.write'), async (req, res, next) => {
  try {
    const tenantId = getTenantId();
    if (!tenantId) { res.status(401).json({ error: { code: 'NO_TENANT', message: 'Tenant context missing' } }); return; }
    const body = LoyaltyConfigPatchSchema.parse(req.body);
    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: body,
      select: {
        loyaltyEarnRatePaise: true,
        loyaltyPointValuePaise: true,
        loyaltyMinRedeemPoints: true,
        loyaltyMaxRedeemPct: true,
        loyaltyExpiryDays: true,
      },
    });
    res.json({ data: tenant });
  } catch (err) { next(err); }
});

// One-shot, idempotent backfill: any tenant-scoped Bill that has no Payment
// rows gets one synthesized from its total. Used to repair demo data seeded
// before the seed script was patched to emit Payment rows — without this,
// Daily Sales' "Mode-wise collection" and the Offline-shops cash/digital
// tiles are forever empty even though revenue is non-zero. Safe to re-run:
// bills that already have any Payment are skipped.
settingsRouter.post(
  '/_backfill-payments',
  requirePermission('settings.write'),
  async (_req, res, next) => {
    try {
      const tenantId = getTenantId();
      if (!tenantId) {
        res.status(401).json({ error: { code: 'NO_TENANT', message: 'Tenant context missing' } });
        return;
      }
      // Bills with zero Payment rows. Restrict to tenant via the extension's
      // automatic scope (already applied to `prisma`), and only consider
      // non-voided bills with a positive total.
      const orphanBills = await prisma.bill.findMany({
        where: {
          voidedAt: null,
          totalPaise: { gt: 0 },
          payments: { none: {} },
        },
        select: { id: true, totalPaise: true, paymentStatus: true, createdAt: true },
      });
      const modes: Array<'CASH' | 'UPI' | 'CARD'> = ['UPI', 'CARD', 'CASH'];
      const inserts = orphanBills.flatMap((b, i) => {
        const primary = modes[i % modes.length]!;
        if (b.paymentStatus === 'PARTIAL') {
          return [
            {
              billId: b.id,
              mode: 'UPI' as const,
              amountPaise: Math.round(b.totalPaise * 0.6),
              referenceId: `BACKFILL/UPI/${i}`,
              createdAt: b.createdAt,
            },
          ];
        }
        if (i % 3 === 0) {
          return [
            {
              billId: b.id,
              mode: primary,
              amountPaise: b.totalPaise,
              referenceId: primary === 'CASH' ? null : `BACKFILL/${primary}/${i}`,
              createdAt: b.createdAt,
            },
          ];
        }
        const secondary: 'CASH' | 'UPI' | 'CARD' =
          primary === 'CASH' ? 'UPI' : primary === 'UPI' ? 'CARD' : 'CASH';
        const main = Math.round(b.totalPaise * 0.7);
        return [
          {
            billId: b.id,
            mode: primary,
            amountPaise: main,
            referenceId: primary === 'CASH' ? null : `BACKFILL/${primary}/${i}`,
            createdAt: b.createdAt,
          },
          {
            billId: b.id,
            mode: secondary,
            amountPaise: b.totalPaise - main,
            referenceId: secondary === 'CASH' ? null : `BACKFILL/${secondary}/${i}`,
            createdAt: b.createdAt,
          },
        ];
      });
      if (inserts.length > 0) {
        await prisma.payment.createMany({ data: inserts });
      }
      res.json({
        data: {
          billsBackfilled: orphanBills.length,
          paymentsCreated: inserts.length,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// Read-only view of which integrations are wired up via env vars. Lets the
// Settings UI flip "Not connected" → "Connected" without anyone hand-coding
// the state on the client.
settingsRouter.get('/integrations', async (_req, res, next) => {
  try {
    const integrations = [
      {
        key: 'whatsapp',
        name: 'WhatsApp Business (Meta Cloud API)',
        description:
          'Send order confirmations, OTPs, and abandoned-cart nudges from your business number.',
        connected: Boolean(env.WHATSAPP_API_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
        link: 'https://business.facebook.com/wa/manage',
        envKeys: ['WHATSAPP_API_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
      },
      {
        key: 'razorpay',
        name: 'Razorpay',
        description:
          'Accept card / UPI / net-banking payments online. Required for cart checkout with prepayment.',
        connected: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
        link: 'https://dashboard.razorpay.com',
        envKeys: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'],
      },
      {
        key: 'shiprocket',
        name: 'Shiprocket',
        description:
          'Auto-assign couriers, print labels, and pull live AWB tracking on every order.',
        connected: Boolean(env.SHIPROCKET_EMAIL && env.SHIPROCKET_PASSWORD),
        link: 'https://app.shiprocket.in',
        envKeys: ['SHIPROCKET_EMAIL', 'SHIPROCKET_PASSWORD'],
      },
      {
        // Key is `mcx_gold` for backwards compatibility with saved settings —
        // the provider is GoldAPI.io, and has been for a while. The old copy
        // here claimed a real-time 5-minute MCX feed, which was never true.
        key: 'mcx_gold',
        name: 'Live gold & silver rate',
        description:
          'Attach a GoldAPI.io key to price gold and silver off the live market once a day. Without it, the rates you enter in Website → Gold rates are used instead. Platinum always comes from Website → Gold rates.',
        connected: Boolean(env.GOLDAPI_KEY),
        link: 'https://www.goldapi.io',
        envKeys: ['GOLDAPI_KEY'],
      },
    ];
    res.json({ data: integrations });
  } catch (err) {
    next(err);
  }
});
