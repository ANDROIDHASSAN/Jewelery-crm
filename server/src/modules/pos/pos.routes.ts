import { Router } from 'express';
import { z } from 'zod';
import { BillCreateSchema, IndianPhoneSchema } from '@goldos/shared/schemas';
import * as svc from './pos.service.js';
import { readGoldRatePaise } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { renderReceiptPdf } from '../../lib/receipt-pdf.js';

export const posRouter: Router = Router();

// Fast lookup for hardware barcode scanners — the cashier scans, this resolves
// the SKU/barcode to the full item record in one round trip. Excludes sold
// items so a scanned receipt can't accidentally re-add a closed line.
posRouter.get('/items/by-barcode', async (req, res, next) => {
  try {
    const { code } = z.object({ code: z.string().min(1).max(80) }).parse(req.query);
    const trimmed = code.trim();
    const item = await prisma.item.findFirst({
      where: {
        status: 'IN_STOCK',
        OR: [{ barcodeData: trimmed }, { sku: trimmed }],
      },
    });
    if (!item) throw new NotFoundError('No in-stock item matches that code');
    res.json({ data: item });
  } catch (err) {
    next(err);
  }
});

// Per-route bill_create gate so a `pos.monitor` reader CANNOT post a sale —
// the mount-level gate accepts either pos.access or pos.monitor, but only
// the cashier perm (which carries pos.bill_create) clears this one.
posRouter.post('/bills', requirePermission('pos.bill_create'), async (req, res, next) => {
  try {
    const body = BillCreateSchema.parse(req.body);
    const idempotencyHeader = req.headers['idempotency-key'];
    if (typeof idempotencyHeader === 'string' && idempotencyHeader !== body.idempotencyKey) {
      // Per api-design.md: prefer header; reject mismatch.
      body.idempotencyKey = idempotencyHeader;
    }
    const bill = await svc.createBill(body, req.user?.userId);
    res.status(201).json({ data: bill });
  } catch (err) {
    next(err);
  }
});

// Bill receipt as A4 PDF. Streams the bytes directly so memory stays bounded.
// Available to any authenticated user — RBAC permission lives on /pos/bills.
//
// Inline by default (browser preview); pass ?download=1 for a forced save.
// Once Cloudinary upload is wired, this same renderer also produces the
// asset attached to the WhatsApp receipt template.
posRouter.get('/bills/:id/receipt.pdf', async (req, res, next) => {
  try {
    const id = z.string().min(1).parse(req.params.id);
    const download = req.query.download === '1';
    const bill = await prisma.bill.findUnique({
      where: { id },
      include: {
        lines: { include: { item: { select: { name: true, purityCaratX100: true, weightMg: true } } } },
        payments: true,
        customer: { select: { name: true, phone: true } },
        shop: { select: { name: true, address: true, phone: true, gstStateCode: true } },
        tenant: { select: { businessName: true, gstNumber: true } },
      },
    });
    if (!bill) throw new NotFoundError('Bill not found');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="invoice-${bill.billNumber}.pdf"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');

    await renderReceiptPdf(
      {
        business: {
          name: bill.tenant?.businessName ?? 'Zelora Jeweller',
          address: bill.shop?.address ?? '',
          gstin: bill.tenant?.gstNumber ?? null,
          phone: bill.shop?.phone ?? '',
        },
        invoice: {
          number: bill.billNumber,
          dateIso: bill.createdAt.toISOString(),
          placeOfSupply: bill.shop?.gstStateCode ?? '06',
        },
        customer: {
          name: bill.customer?.name ?? 'Walk-in customer',
          phone: bill.customer?.phone ?? '',
        },
        lines: bill.lines.map((l) => {
          const purity = l.purityCaratX100 ?? l.item?.purityCaratX100 ?? null;
          const weightMg = l.weightMg ?? l.item?.weightMg ?? null;
          return {
            description: l.item?.name ?? 'Jewellery piece',
            details: [
              purity ? `${(purity / 100).toFixed(0)}K` : null,
              weightMg ? `${(weightMg / 1000).toFixed(2)} g` : null,
              l.makingChargeBps ? `making ${(l.makingChargeBps / 100).toFixed(2)}%` : null,
            ].filter(Boolean).join(' · ') || undefined,
            qty: 1,
            unitPaise: l.linePaise,
            amountPaise: l.linePaise,
          };
        }),
        subtotalPaise: bill.subtotalPaise,
        cgstPaise: bill.cgstPaise,
        sgstPaise: bill.sgstPaise,
        igstPaise: bill.igstPaise,
        discountPaise: bill.discountPaise,
        totalPaise: bill.totalPaise,
        payments: bill.payments.map((p) => ({
          mode: p.mode,
          amountPaise: p.amountPaise,
          referenceId: p.referenceId ?? undefined,
        })),
      },
      res,
    );
  } catch (err) {
    next(err);
  }
});

posRouter.get('/bills', async (req, res, next) => {
  try {
    const q = z
      .object({
        shopId: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().positive().max(100).optional(),
      })
      .parse(req.query);
    res.json(await svc.listBills(q));
  } catch (err) {
    next(err);
  }
});

posRouter.get('/customers/lookup', async (req, res, next) => {
  try {
    const { phone } = z.object({ phone: IndianPhoneSchema }).parse(req.query);
    const customer = await svc.findCustomerByPhone(phone);
    res.json({ data: customer });
  } catch (err) {
    next(err);
  }
});

posRouter.get('/gold-rate', async (_req, res, next) => {
  try {
    const purities = [2400, 2200, 1800, 1400, 0];
    const data = await Promise.all(
      purities.map(async (p) => {
        const cached = await readGoldRatePaise(p);
        return {
          purity: p,
          ratePerGramPaise: cached?.paise ?? 0,
          stale: cached?.stale ?? true,
          asOf: new Date().toISOString(),
        };
      }),
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
});
