import { Router } from 'express';
import { z } from 'zod';
import { ProductInputSchema } from '@goldos/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { ORDER_STATUSES } from '@goldos/shared/constants';
import { readGoldRatePaise } from '../../lib/redis.js';
import { applyBps, computeGoldValuePaise } from '../../lib/money.js';

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
    const product = await prisma.product.create({ data: body });
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
        items: { select: { id: true, productId: true, qty: true, pricePaise: true } },
      },
    });
    const hasMore = orders.length > take;
    res.json({ data: orders.slice(0, take), page: { nextCursor: hasMore ? orders.at(-2)?.id : undefined, hasMore } });
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
});

ecommerceRouter.patch('/orders/:id', async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = OrderPatchSchema.parse(req.body);
    const order = await prisma.order.update({
      where: { id },
      data: body,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        items: true,
      },
    });
    res.json({ data: order });
  } catch (err) {
    next(err);
  }
});
