// server/src/modules/shops/shops.routes.ts — minimal tenant-scoped endpoints for D1 smoke + D2 isolation test.

import { Router } from 'express';
import { z } from 'zod';
import { ShopInputSchema } from '@goldos/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';
import { getTenantId } from '../../lib/async-context.js';
import { requirePermission } from '../../middleware/require-permission.js';

export const shopsRouter: Router = Router();

const ListQuery = z.object({
  // Optional filter — WAREHOUSE for transfer "From" pickers, RETAIL for
  // "To" pickers + POS. Backed by Shop.type (canonical) with a fallback
  // through the legacy isWarehouse boolean for rows pre-migration.
  type: z.enum(['WAREHOUSE', 'RETAIL']).optional(),
});

shopsRouter.get('/', async (req, res, next) => {
  try {
    const q = ListQuery.parse(req.query);
    const where = q.type
      ? q.type === 'WAREHOUSE'
        ? { OR: [{ type: 'WAREHOUSE' as const }, { isWarehouse: true }] }
        : { AND: [{ type: 'RETAIL' as const }, { isWarehouse: false }] }
      : undefined;
    const data = await prisma.shop.findMany({
      where,
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
    // Keep `type` and the legacy `isWarehouse` boolean in lockstep so older
    // code paths that still read `isWarehouse` keep working.
    const type = body.type ?? (body.isWarehouse ? 'WAREHOUSE' : 'RETAIL');
    const isWarehouse = type === 'WAREHOUSE';
    const shop = await prisma.shop.create({
      data: { ...body, tenantId, type, isWarehouse },
    });
    res.status(201).json({ data: shop });
  } catch (err) {
    next(err);
  }
});
