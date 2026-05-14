// server/src/modules/shops/shops.routes.ts — minimal tenant-scoped endpoints for D1 smoke + D2 isolation test.

import { Router } from 'express';
import { ShopInputSchema } from '@goldos/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';

export const shopsRouter: Router = Router();

shopsRouter.get('/', async (_req, res, next) => {
  try {
    const data = await prisma.shop.findMany({
      orderBy: { name: 'asc' },
      take: 100,
    });
    res.json({ data, page: { hasMore: false } });
  } catch (err) {
    next(err);
  }
});

shopsRouter.get('/:id', async (req, res, next) => {
  try {
    const shop = await prisma.shop.findUnique({ where: { id: req.params['id']! } });
    if (!shop) throw new NotFoundError(); // tenant extension already scoped the where clause
    res.json({ data: shop });
  } catch (err) {
    next(err);
  }
});

shopsRouter.post('/', async (req, res, next) => {
  try {
    const body = ShopInputSchema.parse(req.body);
    const shop = await prisma.shop.create({ data: body });
    res.status(201).json({ data: shop });
  } catch (err) {
    next(err);
  }
});
