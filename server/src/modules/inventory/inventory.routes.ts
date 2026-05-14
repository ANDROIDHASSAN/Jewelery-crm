import { Router } from 'express';
import { ItemInputSchema, TransferInitiateSchema } from '@goldos/shared/schemas';
import { z } from 'zod';
import * as svc from './inventory.service.js';

export const inventoryRouter: Router = Router();

const ListQuery = z.object({
  shopId: z.string().optional(),
  categoryId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

inventoryRouter.get('/items', async (req, res, next) => {
  try {
    const q = ListQuery.parse(req.query);
    res.json(await svc.listItems(q));
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/items/:id', async (req, res, next) => {
  try {
    res.json({ data: await svc.getItem(req.params['id']!) });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/items', async (req, res, next) => {
  try {
    const body = ItemInputSchema.parse(req.body);
    const item = await svc.createItem(body);
    res.status(201).json({ data: item });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/items/:id/transfer', async (req, res, next) => {
  try {
    const body = TransferInitiateSchema.parse({ itemId: req.params['id'], ...req.body });
    await svc.transferItem(body.itemId, body.toShopId, body.reason, req.user?.userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/categories', async (_req, res, next) => {
  try {
    const cats = await svc.listCategories();
    res.json({ data: cats, page: { hasMore: false } });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/valuation', async (req, res, next) => {
  try {
    const shopId = typeof req.query['shopId'] === 'string' ? req.query['shopId'] : undefined;
    res.json({ data: await svc.computeValuation({ shopId }) });
  } catch (err) {
    next(err);
  }
});
