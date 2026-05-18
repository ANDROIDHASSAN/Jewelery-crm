import { Router } from 'express';
import { z } from 'zod';
import { ProductInputSchema } from '@goldos/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { ORDER_STATUSES } from '@goldos/shared/constants';
import { readGoldRatePaise } from '../../lib/redis.js';
import { applyBps, computeGoldValuePaise } from '../../lib/money.js';
import { getTenantId } from '../../lib/async-context.js';

export const ecommerceRouter: Router = Router();

/**
 * Live price = metal value at today's spot rate + making charge on metal + stone charge.
 * Re-uses the same arithmetic as POS so a product's listed price matches the
 * billed amount when a customer buys it. Routing by category metal type:
 *   GOLD     → 24K spot scaled by purityCaratX100/2400
 *   SILVER   → silver spot × weight (purityCaratX100 is the millesimal fineness,
 *              e.g. 925 sterling; the silver rate is per gram of 99.9% silver
 *              so we apply the fineness as a fraction of 1000)
 *   DIAMOND/PLATINUM/OTHER → no live metal recompute, fall back to basePricePaise
 *                            so we don't quote nonsense for non-rate-tracked metals.
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
        include: { category: { select: { metalType: true } } },
      }),
      readGoldRatePaise(2400),
      readGoldRatePaise(0),
    ]);
    const hasMore = products.length > take;
    const rate24KPaise = rate24?.paise ?? 0;
    const rateSilverPaise = rateSilver?.paise ?? 0;
    const stale = (rate24?.stale ?? true) || (rateSilver?.stale ?? true);
    const enriched = products.slice(0, take).map((p) => ({
      ...p,
      livePricePaise: computeLivePricePaise(p, rate24KPaise, rateSilverPaise),
      livePriceStale: stale,
    }));
    res.json({ data: enriched, page: { nextCursor: hasMore ? products.at(-2)?.id : undefined, hasMore } });
  } catch (err) {
    next(err);
  }
});

ecommerceRouter.post('/products', async (req, res, next) => {
  try {
    const body = ProductInputSchema.parse(req.body);
    const tenantId = getTenantId();
    if (!tenantId) throw new Error('tenantId missing');
    const product = await prisma.product.create({ data: { ...body, tenantId } });
    res.status(201).json({ data: product });
  } catch (err) {
    next(err);
  }
});

const ProductPatchSchema = ProductInputSchema.partial();

ecommerceRouter.patch('/products/:id', async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = ProductPatchSchema.parse(req.body);
    const product = await prisma.product.update({ where: { id }, data: body });
    res.json({ data: product });
  } catch (err) {
    next(err);
  }
});

ecommerceRouter.delete('/products/:id', async (req, res, next) => {
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
    const q = z
      .object({
        status: z.enum(ORDER_STATUSES).optional(),
        cursor: z.string().optional(),
      })
      .parse(req.query);
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
    res.json({ data: orders.slice(0, take), page: { nextCursor: hasMore ? orders.at(-2)?.id : undefined, hasMore } });
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
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const [
      grouped,
      revenueAgg,
      reservationsTotal,
      reservationsOpen,
      productsTotal,
      productsPublished,
      needsAction,
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
      // "needs action" = anything sitting in PENDING > 30 min, surfaced as a
      // separate count so the cashier can see SLA breaches without scanning.
      prisma.order.count({ where: { status: 'PENDING', createdAt: { lt: cutoff } } }),
    ]);

    // Seed every status with 0 so the response is never missing a key — keeps
    // the UI grid stable. Strict noUncheckedIndexedAccess: read via `?? 0`.
    const byStatus: Record<string, number> = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]));
    for (const row of grouped) byStatus[row.status] = row._count._all;
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const open =
      (byStatus.PENDING ?? 0) +
      (byStatus.CONFIRMED ?? 0) +
      (byStatus.PACKED ?? 0) +
      (byStatus.SHIPPED ?? 0);
    const inTransit = byStatus.SHIPPED ?? 0;

    res.json({
      data: {
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
        asOf: new Date().toISOString(),
      },
    });
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

ecommerceRouter.patch('/orders/:id', async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = OrderPatchSchema.parse(req.body);

    // Pull current state so we can tell whether this PATCH actually changed
    // the status (we only want to write an event on real transitions).
    const before = await prisma.order.findUnique({
      where: { id },
      select: { status: true, tenantId: true },
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
      return updated;
    });
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
