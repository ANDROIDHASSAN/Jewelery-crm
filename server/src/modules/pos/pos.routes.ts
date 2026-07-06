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

// Offline-bill drain endpoint. The cashier's IndexedDB queue
// (`client/src/features/pos/offline.ts`) posts here when the network
// returns. Each bill carries its own `idempotencyKey`, so re-posting a
// successful bill is a no-op — the unique constraint on
// (tenantId, idempotencyKey) makes the second call return the original
// row. Per-bill `ok`/`error` lets the client mark items individually
// `synced` vs `rejected` without abandoning the whole batch.
const PosSyncSchema = z.object({
  bills: z.array(BillCreateSchema).min(1).max(50),
});
posRouter.post('/sync', requirePermission('pos.bill_create'), async (req, res, next) => {
  try {
    const { bills } = PosSyncSchema.parse(req.body);
    const results: Array<
      | { idempotencyKey: string; ok: true; billId: string; billNumber: string }
      | { idempotencyKey: string; ok: false; code: string; message: string }
    > = [];
    for (const body of bills) {
      try {
        const bill = await svc.createBill(body, req.user?.userId);
        results.push({
          idempotencyKey: body.idempotencyKey,
          ok: true,
          billId: bill.id,
          billNumber: bill.billNumber,
        });
      } catch (err) {
        const e = err as { code?: string; message?: string };
        results.push({
          idempotencyKey: body.idempotencyKey,
          ok: false,
          code: e.code ?? 'BILL_SYNC_FAILED',
          message: e.message ?? 'Sync failed',
        });
      }
    }
    res.status(200).json({ data: { results } });
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
        lines: {
          include: {
            item: {
              select: {
                name: true,
                purityCaratX100: true,
                weightMg: true,
                hallmarkRef: true,
                hallmarkStatus: true,
                category: {
                  select: { metalType: true },
                },
              },
            },
          },
        },
        payments: true,
        customer: { select: { name: true, phone: true } },
        shop: { select: { name: true, address: true, phone: true, gstStateCode: true } },
        tenant: { select: { businessName: true, gstNumber: true } },
      },
    });
    if (!bill) throw new NotFoundError('Bill not found');

    // CMS-controlled invoice layout — every visible string on the branded
    // invoice (brand band, hero block, bank details, terms, footer ribbon,
    // contact bar, accent colour) is editable in Website CMS → Invoice
    // Layout. Read failure is non-fatal — the renderer has baked defaults.
    type BrandBlob = { logo?: string; favicon?: string; name?: string };
    let invoiceLayout: Record<string, unknown> | null = null;
    let brand: BrandBlob | null = null;
    try {
      const sf = await prisma.storefrontContent.findUnique({
        where: { tenantId: bill.tenantId },
        select: { content: true },
      });
      const blob = sf?.content as { invoiceLayout?: Record<string, unknown>; brand?: BrandBlob } | null | undefined;
      if (blob?.invoiceLayout) invoiceLayout = blob.invoiceLayout;
      if (blob?.brand) brand = blob.brand;
    } catch {
      // ignore — fall back to defaults below
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="invoice-${bill.billNumber}.pdf"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');

    await renderReceiptPdf(
      {
        business: {
          name: brand?.name ?? bill.tenant?.businessName ?? 'Jeweller',
          address:
            (invoiceLayout?.['businessAddress'] as string | undefined) ||
            (bill.shop?.address ?? ''),
          gstin: bill.tenant?.gstNumber ?? null,
          phone: bill.shop?.phone ?? '',
          logoUrl: brand?.logo ?? null,
          email: (invoiceLayout?.['businessEmail'] as string | undefined) ?? null,
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
          const weightMg = l.weightMg;
          const huid = l.item?.hallmarkStatus === 'CERTIFIED' ? l.item?.hallmarkRef : null;

          // Fixed-price items (steel, gold-tone) display a per-piece rate
          // rather than weight × rate-per-gram breakdown.
          const metalType = l.item?.category?.metalType;
          const isQtyPriced = metalType === 'STAINLESS_STEEL' || metalType === 'OTHER';

          // For weight-based items (gold/silver), use the rate snapshotted at
          // sale time — avoids back-calculating through a combined linePaise.
          const ratePerGPaise = !isQtyPriced && weightMg > 0
            ? l.ratePerGramPaise
            : undefined;

          // Derive the making-charge breakdown from the stored snapshot.
          // PER_GRAM items are stored with makingChargeBps=0 (the rupee
          // making is baked into linePaise). We detect them by computing the
          // residual after subtracting the metal value and stone charge.
          let makingPct: number | undefined;
          let makingPerGramPaise: number | undefined;

          if (!isQtyPriced && weightMg > 0 && l.ratePerGramPaise > 0) {
            if ((l.makingChargeBps ?? 0) > 0) {
              makingPct = l.makingChargeBps / 100;
            } else {
              const metalValue = Math.round(l.ratePerGramPaise * weightMg / 1000);
              const residual = l.linePaise - (l.stoneChargePaise ?? 0) - metalValue;
              if (residual > 0) {
                makingPerGramPaise = Math.round(residual * 1000 / weightMg);
              }
            }
          }

          return {
            description: l.item?.name ?? 'Jewellery piece',
            details: isQtyPriced
              ? undefined
              : [
                  purity ? `${(purity / 100).toFixed(0)}K Gold` : null,
                  huid ? `HUID ${huid}` : null,
                ].filter(Boolean).join(' · ') || undefined,
            qty: 1,
            unitPaise: l.linePaise,
            amountPaise: l.linePaise,
            weightG: !isQtyPriced && weightMg > 0 ? weightMg / 1000 : undefined,
            ratePerGPaise,
            makingPct,
            makingPerGramPaise,
            isQtyPriced,
            perQtyPricePaise: isQtyPriced ? l.linePaise : undefined,
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
        layout: invoiceLayout as never,
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

// Create a customer from the POS counter. Gated by pos.bill_create (same write
// perm as ringing up a sale) so a pos.monitor reader can't create records.
// The service also mirrors the customer into the CRM as a walk-in lead.
const PosCustomerCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: IndianPhoneSchema,
  email: z.string().trim().email().max(200).optional().nullable(),
});
posRouter.post('/customers', requirePermission('pos.bill_create'), async (req, res, next) => {
  try {
    const body = PosCustomerCreateSchema.parse(req.body);
    const result = await svc.createPosCustomer(body, req.user?.userId);
    res.status(result.created ? 201 : 200).json({ data: result });
  } catch (err) {
    next(err);
  }
});

// Name / phone typeahead for POS pickers (advance receipts). Gated by the
// /pos router's pos.access — cashiers can use it; the finance search can't.
posRouter.get('/customers/search', async (req, res, next) => {
  try {
    const q = z
      .object({
        q: z.string().trim().min(1).max(64).optional(),
        limit: z.coerce.number().int().positive().max(50).default(20),
      })
      .parse(req.query);
    res.json({ data: await svc.searchCustomers(q) });
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
