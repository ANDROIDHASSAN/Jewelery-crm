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
    const take = 20;
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

ecommerceRouter.get('/orders', async (req, res, next) => {
  try {
    const q = z
      .object({
        status: z.enum(ORDER_STATUSES).optional(),
        cursor: z.string().optional(),
      })
      .parse(req.query);
    const take = 20;
    const orders = await prisma.order.findMany({
      where: q.status ? { status: q.status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = orders.length > take;
    res.json({ data: orders.slice(0, take), page: { nextCursor: hasMore ? orders.at(-2)?.id : undefined, hasMore } });
  } catch (err) {
    next(err);
  }
});
