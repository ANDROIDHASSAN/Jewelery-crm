// server/src/modules/shops/shops.routes.ts — minimal tenant-scoped endpoints for D1 smoke + D2 isolation test.

import { Router } from 'express';
import { ShopInputSchema } from '@goldos/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';
import { getTenantId } from '../../lib/async-context.js';
import { requirePermission } from '../../middleware/require-permission.js';

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

shopsRouter.post('/', requirePermission('shops.write'), async (req, res, next) => {
  try {
    const body = ShopInputSchema.parse(req.body);
    const tenantId = getTenantId();
    if (!tenantId) throw new Error('tenantId missing');
    const shop = await prisma.shop.create({ data: { ...body, tenantId } });
    res.status(201).json({ data: shop });
  } catch (err) {
    next(err);
  }
});
