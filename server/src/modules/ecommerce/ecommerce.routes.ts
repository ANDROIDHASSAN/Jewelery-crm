import { Router } from 'express';
import { z } from 'zod';
import { ProductInputSchema } from '@goldos/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { ORDER_STATUSES } from '@goldos/shared/constants';
import { readGoldRatePaise } from '../../lib/redis.js';
import { applyBps, computeGoldValuePaise } from '../../lib/money.js';
import { getTenantId } from '../../lib/async-context.js';
import { withCache, bustKey } from '../../lib/cache.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { renderReceiptPdf } from '../../lib/receipt-pdf.js';

export const ecommerceRouter: Router = Router();

// Per-route RBAC gates. Mount-level only checks ecommerce.read; mutating
// catalogue/order routes need their action-specific permission.

/**
 * Live price = metal value at today's spot rate + making charge on metal + stone charge.
 * Re-uses the same arithmetic as POS so a product's listed price matches the
 * billed amount when a customer buys it. Routing by category metal type:
 *   GOLD     → 24K spot scaled by purityCaratX100/2400
 *   SILVER   → silver spot × weight (purityCaratX100 is the millesimal fineness,
 *              e.g. 925 sterling; the silver rate is per gram of 99.9% silver
 *              so we apply the fineness as a fraction of 1000)
 *   DIAMOND/PLATINUM/STAINLESS_STEEL/OTHER → no live metal recompute, fall back to
 *                            basePricePaise so we don't quote nonsense for
 *                            non-rate-tracked / non-precious metals.
 */
function computeLivePricePaise(
  product: {
    weightMg: number;
    purityCaratX100: number;
    makingChargeBps: number;
    stoneChargePaise: number;
    basePricePaise: number;
    category: { metalType: string };
  },
  rate24KPaise: number,
  rateSilverPaise: number,
): number {
  let metalValue: number;
  if (product.category.metalType === 'GOLD') {
    metalValue = computeGoldValuePaise(product.weightMg, product.purityCaratX100, rate24KPaise);
  } else if (product.category.metalType === 'SILVER') {
    // weightMg/1000 → grams. purityCaratX100/1000 → fineness fraction (925 → 0.925).
    metalValue = Math.round((product.weightMg * rateSilverPaise * product.purityCaratX100) / (1000 * 1000));
  } else {
    // DIAMOND / PLATINUM / OTHER — no live rate to apply. Keep the stored base
    // price as the metal-equivalent value so the live total still reflects
    // making + stone deltas if those ever change.
    metalValue = product.basePricePaise;
  }
  const making = applyBps(metalValue, product.makingChargeBps);
  return metalValue + making + product.stoneChargePaise;
}

ecommerceRouter.get('/products', async (req, res, next) => {
  try {
    const q = z
      .object({ cursor: z.string().optional(), search: z.string().optional() })
      .parse(req.query);
    const take = 50;
    const [products, rate24, rateSilver] = await Promise.all([
      prisma.product.findMany({
        where: q.search ? { name: { contains: q.search, mode: 'insensitive' } } : undefined,
        orderBy: { createdAt: 'desc' },
        take: take + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        include: {
          category: { select: { metalType: true } },
          // Surface the linked inventory item's SKU so the admin product
          // table can show it as a real identifier (slug is for URLs, SKU
          // is for stock). Null for products created without a linked
          // inventory row.
          linkedItem: { select: { sku: true } },
          sections: { select: { section: true } },
        },
      }),
      readGoldRatePaise(2400),
      readGoldRatePaise(0),
    ]);
    const hasMore = products.length > take;
    const rate24KPaise = rate24?.paise ?? 0;
    const rateSilverPaise = rateSilver?.paise ?? 0;
    const stale = (rate24?.stale ?? true) || (rateSilver?.stale ?? true);
    const enriched = products.slice(0, take).map((p) => {
      const { sections, ...rest } = p;
      return {
        ...rest,
        // Flatten the join to a plain string[] the admin form round-trips.
        sections: sections.map((s) => s.section),
        livePricePaise: computeLivePricePaise(rest, rate24KPaise, rateSilverPaise),
        livePriceStale: stale,
      };
    });
    res.json({ data: enriched, page: { nextCursor: hasMore ? products.at(-2)?.id : undefined, hasMore } });
  } catch (err) {
    next(err);
  }
});

// Replace a product's storefront-section memberships. `sections` is the full
// desired set; we diff against existing rows so a product placed in 6 sections
// gets 6 ProductSection rows and NEVER a duplicate Product/Item (M3 FR#1).
async function syncProductSections(tenantId: string, productId: string, sections: string[]) {
  const desired = new Set(sections);
  const existing = await prisma.productSection.findMany({
    where: { productId },
    select: { section: true },
  });
  const have = new Set(existing.map((e) => e.section));
  const toAdd = [...desired].filter((s) => !have.has(s as never));
  const toRemove = [...have].filter((s) => !desired.has(s));
  await prisma.$transaction([
    ...(toRemove.length
      ? [prisma.productSection.deleteMany({ where: { productId, section: { in: toRemove as never[] } } })]
      : []),
    ...toAdd.map((s) =>
      prisma.productSection.create({ data: { tenantId, productId, section: s as never } }),
    ),
  ]);
}

ecommerceRouter.post('/products', requirePermission('ecommerce.product_write'), async (req, res, next) => {
  try {
    const { sections, ...body } = ProductInputSchema.parse(req.body);
    const tenantId = getTenantId();
    if (!tenantId) throw new Error('tenantId missing');
    const product = await prisma.product.create({ data: { ...body, tenantId } });
    if (sections && sections.length) await syncProductSections(tenantId, product.id, sections);
    res.status(201).json({ data: product });
  } catch (err) {
    next(err);
  }
});

const ProductPatchSchema = ProductInputSchema.partial();

ecommerceRouter.patch('/products/:id', requirePermission('ecommerce.product_write'), async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const { sections, ...body } = ProductPatchSchema.parse(req.body);
    const tenantId = getTenantId();
    if (!tenantId) throw new Error('tenantId missing');
    const product = await prisma.product.update({ where: { id }, data: body });
    // Only touch section rows when the caller included `sections` (full-set).
    if (sections !== undefined) await syncProductSections(tenantId, id, sections);
    res.json({ data: product });
  } catch (err) {
    next(err);
  }
});

ecommerceRouter.delete('/products/:id', requirePermission('ecommerce.product_write'), async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    await prisma.product.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

ecommerceRouter.get('/orders', async (req, res, next) => {
  try {
    const tenantId = getTenantId();
    if (!tenantId) throw new Error('tenantId missing');
    const q = z
      .object({
        status: z.enum(ORDER_STATUSES).optional(),
        cursor: z.string().optional(),
      })
      .parse(req.query);

    // Cache the first page (no cursor) keyed by status filter. Cursor-paginated
    // pages skip the cache — they're rarer and would balloon the keyspace.
    // 8s TTL fits the 10s admin polling cadence with comfortable headroom.
    const cacheable = !q.cursor;
    const cacheKey = `orders:list:${q.status ?? 'ALL'}`;
    const compute = async (): Promise<{
      data: unknown[];
      page: { nextCursor: string | undefined; hasMore: boolean };
    }> => {
      const take = 50;
      const orders = await prisma.order.findMany({
        where: q.status ? { status: q.status } : undefined,
        orderBy: { createdAt: 'desc' },
        take: take + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          items: {
            select: {
              id: true,
              productId: true,
              qty: true,
              pricePaise: true,
              product: { select: { id: true, name: true, slug: true, images: true } },
            },
          },
        },
      });
      const hasMore = orders.length > take;
      return {
        data: orders.slice(0, take),
        page: { nextCursor: hasMore ? orders.at(-2)?.id : undefined, hasMore },
      };
    };
    const result = cacheable
      ? await withCache(tenantId, cacheKey, 8, compute)
      : await compute();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Live tenant-wide aggregates — single source of truth for every count
// shown on EcommerceAdminPage. Runs every poll (10s default). All numbers
// here are DB-authoritative across the WHOLE tenant, not derived from the
// 50-row page-array the list endpoint returns. The admin page used to
// compute counts client-side from that array and silently disagreed with
// the live banner once a tenant had more than one page of orders.
ecommerceRouter.get('/orders/live-count', async (_req, res, next) => {
  try {
    const tenantId = getTenantId();
    if (!tenantId) throw new Error('tenantId missing');

    // Cache for 4 seconds. The bell + admin page poll at 5s, so this
    // virtually guarantees a cache hit on the second-and-subsequent pollers
    // while still keeping data fresh enough that a new order shows within
    // 5-9s. Single cached blob = single Redis round-trip = ~10ms vs ~150ms
    // for 7 parallel Prisma aggregates against Neon.
    const data = await withCache(tenantId, 'orders:live-count', 4, async () => {
      const cutoff = new Date(Date.now() - 30 * 60 * 1000);
      const [
        grouped,
        revenueAgg,
        reservationsTotal,
        reservationsOpen,
        productsTotal,
        productsPublished,
        needsAction,
        latestOrder,
      ] = await Promise.all([
        prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.order.aggregate({ _sum: { totalPaise: true } }),
        prisma.order.count({ where: { paymentMethod: 'reserve-at-store' } }),
        prisma.order.count({
          where: {
            paymentMethod: 'reserve-at-store',
            status: { notIn: ['DELIVERED', 'CANCELLED', 'RETURNED'] },
          },
        }),
        prisma.product.count(),
        prisma.product.count({ where: { isPublished: true } }),
        // "needs action" = PENDING > 30 min, surfaced separately so the
        // cashier sees SLA breaches without scanning.
        prisma.order.count({ where: { status: 'PENDING', createdAt: { lt: cutoff } } }),
        // Latest order's id + createdAt — exposed so NotificationBell can
        // deep-link the "Open" toast action straight to the order drawer
        // instead of dumping the user on the e-commerce list.
        prisma.order.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { id: true, createdAt: true },
        }),
      ]);

      // Seed every status with 0 so the response is never missing a key —
      // keeps the UI grid stable. Strict noUncheckedIndexedAccess: read via `?? 0`.
      const byStatus: Record<string, number> = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]));
      for (const row of grouped) byStatus[row.status] = row._count._all;
      const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
      const open =
        (byStatus.PENDING ?? 0) +
        (byStatus.CONFIRMED ?? 0) +
        (byStatus.PACKED ?? 0) +
        (byStatus.SHIPPED ?? 0);
      const inTransit = byStatus.SHIPPED ?? 0;

      return {
        byStatus,
        total,
        open,
        inTransit,
        needsAction,
        revenuePaise: revenueAgg._sum.totalPaise ?? 0,
        reservationsTotal,
        reservationsOpen,
        productsTotal,
        productsPublished,
        latestOrderId: latestOrder?.id ?? null,
        latestOrderCreatedAt: latestOrder?.createdAt.toISOString() ?? null,
        asOf: new Date().toISOString(),
      };
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

ecommerceRouter.get('/orders/:id', async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { include: { product: { select: { id: true, name: true, slug: true, images: true } } } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Order not found' } });
      return;
    }
    res.json({ data: order });
  } catch (err) {
    next(err);
  }
});

// Tax-invoice PDF for an e-commerce order. Mirrors the POS bill receipt
// surface so the same template ships from the same renderer — only the
// data source differs (Order vs Bill). Inline preview by default; pass
// ?download=1 for a forced save. Read-only — no permission gate beyond
// the parent ecommerce.read, since admins on the order detail page can
// already see the underlying numbers.
ecommerceRouter.get('/orders/:id/invoice.pdf', async (req, res, next) => {
  try {
    const id = z.string().min(1).parse(req.params.id);
    const download = req.query.download === '1';
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true, phone: true } },
        items: {
          include: {
            product: {
              select: {
                name: true,
                weightMg: true,
                purityCaratX100: true,
                makingChargeBps: true,
              },
            },
          },
        },
        tenant: { select: { businessName: true, gstNumber: true, id: true } },
      },
    });
    if (!order) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Order not found' } });
      return;
    }

    // Pull invoice layout + brand from the storefront CMS blob. Same
    // shape as the POS receipt route — both surfaces share one tenant
    // invoice layout. Failure is non-fatal; the renderer ships defaults.
    type BrandBlob = { logo?: string; name?: string };
    let invoiceLayout: Record<string, unknown> | null = null;
    let brand: BrandBlob | null = null;
    try {
      const sf = await prisma.storefrontContent.findUnique({
        where: { tenantId: order.tenant?.id ?? order.tenantId },
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
      `${download ? 'attachment' : 'inline'}; filename="invoice-${order.id}.pdf"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');

    // Customer shipping address — captured at checkout, survives a later
    // edit on the customer record.
    const shippingAddress = [
      order.shippingLine1,
      order.shippingLine2,
      order.shippingCity,
      order.shippingState,
      order.shippingPincode,
    ]
      .filter((s) => typeof s === 'string' && s.trim().length > 0)
      .join(', ');

    await renderReceiptPdf(
      {
        business: {
          name: brand?.name ?? order.tenant?.businessName ?? 'Jeweller',
          address: (invoiceLayout?.['businessAddress'] as string | undefined) || '',
          gstin: order.tenant?.gstNumber ?? null,
          phone: order.shippingPhone ?? '',
          logoUrl: brand?.logo ?? null,
          email: (invoiceLayout?.['businessEmail'] as string | undefined) ?? null,
        },
        invoice: {
          number: order.id,
          dateIso: order.createdAt.toISOString(),
          placeOfSupply: order.shippingState ?? '06',
        },
        customer: {
          name: order.customer?.name ?? order.shippingName ?? 'Customer',
          phone: order.customer?.phone ?? order.shippingPhone ?? '',
          address: shippingAddress || null,
        },
        lines: order.items.map((l) => {
          const purity = l.product?.purityCaratX100 ?? null;
          const weightMg = l.product?.weightMg ?? null;
          return {
            description: l.product?.name ?? 'Jewellery piece',
            details: purity ? `${(purity / 100).toFixed(0)}K · BIS Hallmarked` : undefined,
            qty: l.qty,
            unitPaise: l.pricePaise,
            amountPaise: l.pricePaise * l.qty,
            weightG: weightMg != null ? weightMg / 1000 : undefined,
            makingPct: l.product?.makingChargeBps != null ? l.product.makingChargeBps / 100 : undefined,
          };
        }),
        subtotalPaise: order.subtotalPaise,
        // E-commerce stores total tax as a single number rather than
        // CGST/SGST/IGST split — surface it as IGST (inter-state default).
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: order.taxPaise,
        discountPaise: 0,
        totalPaise: order.totalPaise,
        payments:
          order.paymentStatus === 'PAID'
            ? [
                {
                  mode: order.paymentMethod,
                  amountPaise: order.totalPaise,
                  referenceId: order.razorpayPaymentId ?? undefined,
                },
              ]
            : [],
        layout: invoiceLayout as never,
      },
      res,
    );
  } catch (err) {
    next(err);
  }
});

const OrderPatchSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  shiprocketAwb: z.string().max(80).optional().nullable(),
  // Free-form note attached to the event row when this PATCH happens.
  // Surfaced verbatim on the customer track page.
  note: z.string().max(280).optional(),
  // Where is the piece right now ("Mumbai sort hub"). Customer-visible.
  location: z.string().max(120).optional(),
  // Required when transitioning to CANCELLED / RETURNED (enforced below).
  cancelReason: z.string().max(280).optional(),
  // Who pushed the button — usually "Priya at HQ" or similar. Best-effort label.
  actorName: z.string().max(80).optional(),
});

ecommerceRouter.patch('/orders/:id', requirePermission('ecommerce.order_fulfil'), async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = OrderPatchSchema.parse(req.body);

    // Pull current state so we can tell whether this PATCH actually changed
    // the status (we only want to write an event on real transitions). Also
    // pull the order items + their linked inventory rows so the restock
    // branch (transition to CANCELLED / RETURNED) can flip stock back without
    // a second round-trip.
    const before = await prisma.order.findUnique({
      where: { id },
      select: {
        status: true,
        tenantId: true,
        items: {
          select: {
            qty: true,
            product: {
              select: {
                name: true,
                linkedItem: {
                  select: {
                    id: true,
                    status: true,
                    isSerialized: true,
                    quantityOnHand: true,
                    shopId: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!before) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Order not found' } });
      return;
    }
    const isCancelling = body.status === 'CANCELLED' || body.status === 'RETURNED';
    if (isCancelling && !body.cancelReason) {
      res.status(400).json({
        error: {
          code: 'CANCEL_REASON_REQUIRED',
          message: 'A reason is required when cancelling or returning an order',
        },
      });
      return;
    }

    // Detect the cancel/return transition exactly once, before the
    // transaction, so we can decide whether to restock. Idempotent: if the
    // order was already CANCELLED/RETURNED we skip the restock (otherwise
    // a re-PATCH to the same status would double-restock).
    const wasTerminal = before.status === 'CANCELLED' || before.status === 'RETURNED';
    const shouldRestock = isCancelling && !wasTerminal;

    const order = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: {
          status: body.status,
          shiprocketAwb: body.shiprocketAwb,
          cancelReason: isCancelling ? body.cancelReason : undefined,
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          items: { include: { product: { select: { id: true, name: true, slug: true, images: true } } } },
        },
      });
      // Write an event row whenever:
      //   - status actually changed (most common case)
      //   - a note or location was attached (admin wants to log a courier ping
      //     without changing status, e.g. "AWB updated, courier picked up")
      const statusChanged = body.status && body.status !== before.status;
      if (statusChanged || body.note || body.location) {
        await tx.orderEvent.create({
          data: {
            orderId: id,
            tenantId: before.tenantId,
            status: updated.status,
            note: body.note ?? (statusChanged ? defaultEventNote(updated.status) : null),
            location: body.location ?? null,
            actorName: body.actorName ?? null,
          },
        });
      }

      // Restock the linked inventory rows on cancel/return. Mirrors
      // pos-features.voidBill: serialized rows flip SOLD -> IN_STOCK; lot
      // rows increment quantityOnHand and restore IN_STOCK if they had
      // drained to SOLD. One RETURN ItemMovement per line so the audit
      // trail balances: PURCHASE -> SALE -> RETURN.
      if (shouldRestock) {
        for (const line of before.items) {
          const link = line.product.linkedItem;
          if (!link) continue;
          if (link.isSerialized) {
            await tx.item.update({
              where: { id: link.id },
              data: { status: 'IN_STOCK' },
            });
          } else {
            await tx.item.update({
              where: { id: link.id },
              data: {
                quantityOnHand: { increment: line.qty },
                // If the lot had drained to 0 (flipped to SOLD), bring it
                // back into stock now that units exist again.
                ...(link.status === 'SOLD' ? { status: 'IN_STOCK' } : {}),
              },
            });
          }
          await tx.itemMovement.create({
            data: {
              tenantId: before.tenantId,
              itemId: link.id,
              type: 'RETURN',
              toShopId: link.shopId,
              qty: line.qty,
              reason: `Order ${id.slice(-6).toUpperCase()} ${updated.status.toLowerCase()}`,
            },
          });
        }
      }
      return updated;
    });
    // Bust the cached aggregates + list page so the next poll sees the new
    // status immediately instead of waiting 8s for the TTL. Fire-and-forget
    // so the HTTP response isn't blocked on Redis round-trips.
    void bustKey(before.tenantId, 'orders:live-count');
    void bustKey(before.tenantId, 'orders:list:ALL');
    if (body.status) void bustKey(before.tenantId, `orders:list:${body.status}`);
    if (before.status !== body.status) void bustKey(before.tenantId, `orders:list:${before.status}`);
    res.json({ data: order });
  } catch (err) {
    next(err);
  }
});

// Sensible default notes per status — used when the admin advances an order
// without writing a custom message. Keeps the customer timeline readable
// without forcing the cashier to type something every time.
function defaultEventNote(status: string): string {
  switch (status) {
    case 'PENDING':   return 'Order placed';
    case 'CONFIRMED': return 'Confirmed by the workshop';
    case 'PACKED':    return 'Packed and ready for dispatch';
    case 'SHIPPED':   return 'Handed to the courier';
    case 'DELIVERED': return 'Delivered to the customer';
    case 'CANCELLED': return 'Order cancelled';
    case 'RETURNED':  return 'Order returned';
    default:          return 'Status updated';
  }
}
