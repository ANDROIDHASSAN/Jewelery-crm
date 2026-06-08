// Admin-side storefront content editor.
// PUT replaces the full content blob; tenant scope comes from auth ALS context.

import { Router } from 'express';
import { StorefrontContentSchema } from '@goldos/shared/schemas';
import { rawPrisma } from '../../lib/prisma.js';
import { getTenantId } from '../../lib/async-context.js';
import { UnauthorizedError } from '../../lib/errors.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { renderReceiptPdf } from '../../lib/receipt-pdf.js';

export const storefrontRouter: Router = Router();

storefrontRouter.get('/', async (_req, res, next) => {
  try {
    const tenantId = getTenantId();
    if (!tenantId) throw new UnauthorizedError();
    const row = await rawPrisma.storefrontContent.findUnique({ where: { tenantId } });
    if (!row) {
      res.status(404).json({ error: { code: 'STOREFRONT_NOT_FOUND', message: 'No storefront content yet' } });
      return;
    }
    res.json({ data: { content: row.content, version: row.version, updatedAt: row.updatedAt } });
  } catch (err) {
    next(err);
  }
});

// Invoice preview — renders a sample invoice using the current CMS layout so
// admins can see exactly how a real invoice will look without needing a live bill.
storefrontRouter.get('/invoice-preview.pdf', async (_req, res, next) => {
  try {
    const tenantId = getTenantId();
    if (!tenantId) throw new UnauthorizedError();

    const row = await rawPrisma.storefrontContent.findUnique({ where: { tenantId } });
    type BrandBlob = { logo?: string; name?: string };
    const blob = row?.content as { invoiceLayout?: Record<string, unknown>; brand?: BrandBlob } | null | undefined;
    const invoiceLayout = blob?.invoiceLayout ?? null;
    const brand = blob?.brand ?? null;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="invoice-preview.pdf"');
    res.setHeader('Cache-Control', 'private, no-store');

    await renderReceiptPdf(
      {
        business: {
          name: brand?.name ?? 'Your Store',
          address: (invoiceLayout?.['businessAddress'] as string | undefined) ?? 'City, State — India',
          gstin: '27AAAPL1234C1Z5',
          phone: (invoiceLayout?.['contactPhone'] as string | undefined) ?? '+91 99999 88888',
          logoUrl: brand?.logo ?? null,
          email: (invoiceLayout?.['businessEmail'] as string | undefined) ?? 'hello@yourbrand.in',
        },
        invoice: {
          number: 'PREVIEW-001',
          dateIso: new Date().toISOString(),
          placeOfSupply: 'Maharashtra',
        },
        customer: {
          name: 'Sample Customer',
          phone: '+91 98765 43210',
          address: 'Nashik, Maharashtra, 422013',
        },
        lines: [
          {
            description: 'Gold Necklace 22K',
            details: '22K Gold · BIS Hallmarked',
            qty: 1,
            unitPaise: 6_50_000_00,
            amountPaise: 6_50_000_00,
            weightG: 10.45,
            ratePerGPaise: 5_47_500,
            makingPct: 12.0,
          },
          {
            description: 'Diamond Earrings',
            qty: 1,
            unitPaise: 3_50_000_00,
            amountPaise: 3_50_000_00,
            weightG: 4.2,
            ratePerGPaise: undefined,
            makingPct: 0,
          },
        ],
        subtotalPaise: 10_00_000_00,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 30_000_00,
        discountPaise: 0,
        totalPaise: 10_30_000_00,
        payments: [],
        layout: invoiceLayout as never,
      },
      res,
    );
  } catch (err) {
    next(err);
  }
});

storefrontRouter.put('/', requirePermission('website.write'), async (req, res, next) => {
  try {
    const tenantId = getTenantId();
    if (!tenantId) throw new UnauthorizedError();
    const userId = req.user?.userId ?? null;
    const content = StorefrontContentSchema.parse(req.body);
    const row = await rawPrisma.storefrontContent.upsert({
      where: { tenantId },
      create: { tenantId, content, updatedBy: userId, version: 1 },
      update: { content, updatedBy: userId, version: { increment: 1 } },
    });
    res.json({ data: { content: row.content, version: row.version, updatedAt: row.updatedAt } });
  } catch (err) {
    next(err);
  }
});
