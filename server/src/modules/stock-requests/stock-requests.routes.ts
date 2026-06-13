import { Router } from 'express';
import { z } from 'zod';
import { StockRequestCreateSchema, StockRequestReviewSchema } from '@goldos/shared/schemas';
import { requirePermission } from '../../middleware/require-permission.js';
import * as svc from './stock-requests.service.js';

export const stockRequestsRouter: Router = Router();

// A "reviewer" (admin / accountant-equivalent) holds inventory.transfer and may
// see every shop's requests. Everyone else (POS cashiers) is scoped to their
// own assigned shop.
function isReviewer(perms: readonly string[] | undefined): boolean {
  return Boolean(perms?.includes('inventory.transfer'));
}

const ListQuery = z.object({
  status: z.enum(['PENDING', 'FULFILLED', 'REJECTED', 'CANCELLED']).optional(),
  shopId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

stockRequestsRouter.get('/', async (req, res, next) => {
  try {
    const q = ListQuery.parse(req.query);
    // Non-reviewers only ever see their own shop's requests.
    const shopId = isReviewer(req.user?.perms) ? q.shopId : req.user?.shopId;
    res.json(await svc.listStockRequests({ ...q, shopId }));
  } catch (err) {
    next(err);
  }
});

// Pending count for the admin sidebar badge.
stockRequestsRouter.get('/pending-count', requirePermission('inventory.transfer'), async (_req, res, next) => {
  try {
    res.json({ data: { count: await svc.countPendingStockRequests() } });
  } catch (err) {
    next(err);
  }
});

stockRequestsRouter.get('/:id', async (req, res, next) => {
  try {
    const request = await svc.getStockRequest(req.params['id']!);
    if (!isReviewer(req.user?.perms) && request.shopId !== req.user?.shopId) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not your shop’s request.' } });
      return;
    }
    res.json({ data: request });
  } catch (err) {
    next(err);
  }
});

stockRequestsRouter.post('/', requirePermission('inventory.stock_request'), async (req, res, next) => {
  try {
    const body = StockRequestCreateSchema.parse(req.body);
    const request = await svc.createStockRequest(body, {
      userId: req.user?.userId,
      userShopId: req.user?.shopId,
    });
    res.status(201).json({ data: request });
  } catch (err) {
    next(err);
  }
});

stockRequestsRouter.post('/:id/reject', requirePermission('inventory.transfer'), async (req, res, next) => {
  try {
    const body = StockRequestReviewSchema.parse(req.body ?? {});
    const request = await svc.rejectStockRequest(req.params['id']!, body.reviewNote, req.user?.userId);
    res.json({ data: request });
  } catch (err) {
    next(err);
  }
});

stockRequestsRouter.post('/:id/cancel', requirePermission('inventory.stock_request'), async (req, res, next) => {
  try {
    const request = await svc.cancelStockRequest(req.params['id']!, {
      userId: req.user?.userId,
      // Reviewers can cancel any request; cashiers only their own shop's.
      userShopId: isReviewer(req.user?.perms) ? undefined : req.user?.shopId,
    });
    res.json({ data: request });
  } catch (err) {
    next(err);
  }
});
