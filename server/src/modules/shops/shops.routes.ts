// server/src/modules/shops/shops.routes.ts — minimal tenant-scoped endpoints for D1 smoke + D2 isolation test.

import { Router } from 'express';
import { z } from 'zod';
import { ShopInputSchema } from '@goldos/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { BusinessRuleError, NotFoundError } from '../../lib/errors.js';
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

// Edit an existing shop. Same RBAC + write gate as create. `type` /
// `isWarehouse` are kept in lockstep so legacy boolean readers keep working
// after an edit flips warehouse/retail.
shopsRouter.patch('/:id', requirePermission('shops.write'), async (req, res, next) => {
  try {
    const body = ShopInputSchema.partial().parse(req.body);
    const id = req.params['id']!;
    const existing = await prisma.shop.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Shop not found');
    const nextType = body.type ?? (body.isWarehouse === undefined ? existing.type : body.isWarehouse ? 'WAREHOUSE' : 'RETAIL');
    const shop = await prisma.shop.update({
      where: { id },
      data: {
        ...body,
        type: nextType,
        isWarehouse: nextType === 'WAREHOUSE',
      },
    });
    res.json({ data: shop });
  } catch (err) {
    next(err);
  }
});

// Soft-delete a shop. We never actually drop the row because bills,
// transfers, register sessions, and item-movements all FK to shopId — a
// hard delete would orphan years of finance + audit history. Instead we
// flip isActive=false. The list query keeps returning everything so the UI
// can show a "deactivated" badge; once you add a dedicated active filter
// you can leave deactivated shops out of cashier-facing pickers.
shopsRouter.delete('/:id', requirePermission('shops.write'), async (req, res, next) => {
  try {
    const id = req.params['id']!;
    const existing = await prisma.shop.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Shop not found');
    // Block hard data conflicts: in-stock items still living at this shop
    // would silently disappear from low-stock + analytics. Force the admin
    // to relocate them first via Transfers.
    const inStockCount = await prisma.item.count({
      where: { shopId: id, status: 'IN_STOCK' },
    });
    if (inStockCount > 0) {
      throw new BusinessRuleError(
        'SHOP_HAS_STOCK',
        `Cannot deactivate — ${inStockCount} item${inStockCount === 1 ? '' : 's'} are still in stock at this shop. Transfer them first.`,
      );
    }
    await prisma.shop.update({
      where: { id },
      data: { isActive: false },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
