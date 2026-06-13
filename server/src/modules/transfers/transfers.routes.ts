import { Router } from 'express';
import { z } from 'zod';
import { TransferCreateSchema, TransferRejectSchema } from '@goldos/shared/schemas';
import { requirePermission } from '../../middleware/require-permission.js';
import * as svc from './transfers.service.js';

export const transfersRouter: Router = Router();

const ListQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'COMPLETED', 'REJECTED']).optional(),
  fromShopId: z.string().optional(),
  toShopId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

transfersRouter.get('/', async (req, res, next) => {
  try {
    const q = ListQuery.parse(req.query);
    res.json(await svc.listTransfers(q));
  } catch (err) {
    next(err);
  }
});

transfersRouter.get('/transferable-items', async (req, res, next) => {
  try {
    const q = z
      .object({
        shopId: z.string().min(1),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().positive().max(100).optional(),
        // Composer mode — return the full eligible set (bulk add + scan).
        all: z
          .enum(['true', 'false'])
          .optional()
          .transform((v) => v === 'true'),
      })
      .parse(req.query);
    res.json(await svc.listTransferableItems(q));
  } catch (err) {
    next(err);
  }
});

transfersRouter.get('/:id', async (req, res, next) => {
  try {
    res.json({ data: await svc.getTransfer(req.params['id']!) });
  } catch (err) {
    next(err);
  }
});

transfersRouter.post('/', requirePermission('inventory.transfer'), async (req, res, next) => {
  try {
    const body = TransferCreateSchema.parse(req.body);
    const transfer = await svc.createTransfer(body, req.user?.userId);
    res.status(201).json({ data: transfer });
  } catch (err) {
    next(err);
  }
});

transfersRouter.post('/:id/approve', requirePermission('inventory.transfer'), async (req, res, next) => {
  try {
    const transfer = await svc.approveTransfer(req.params['id']!, req.user?.userId);
    res.json({ data: transfer });
  } catch (err) {
    next(err);
  }
});

transfersRouter.post('/:id/complete', requirePermission('inventory.transfer'), async (req, res, next) => {
  try {
    const transfer = await svc.completeTransfer(req.params['id']!, req.user?.userId);
    res.json({ data: transfer });
  } catch (err) {
    next(err);
  }
});

transfersRouter.post('/:id/reject', requirePermission('inventory.transfer'), async (req, res, next) => {
  try {
    const body = TransferRejectSchema.parse(req.body);
    const transfer = await svc.rejectTransfer(req.params['id']!, body.rejectionReason, req.user?.userId);
    res.json({ data: transfer });
  } catch (err) {
    next(err);
  }
});
