import { Router } from 'express';
import { z } from 'zod';
import { ProductInputSchema } from '@goldos/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { ORDER_STATUSES } from '@goldos/shared/constants';

export const ecommerceRouter: Router = Router();

ecommerceRouter.get('/products', async (req, res, next) => {
  try {
    const q = z
      .object({ cursor: z.string().optional(), search: z.string().optional() })
      .parse(req.query);
    const take = 50;
    const products = await prisma.product.findMany({
      where: q.search ? { name: { contains: q.search, mode: 'insensitive' } } : undefined,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = products.length > take;
    res.json({ data: products.slice(0, take), page: { nextCursor: hasMore ? products.at(-2)?.id : undefined, hasMore } });
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
