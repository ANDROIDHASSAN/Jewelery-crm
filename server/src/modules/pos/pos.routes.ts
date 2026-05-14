import { Router } from 'express';
import { z } from 'zod';
import { BillCreateSchema, IndianPhoneSchema } from '@goldos/shared/schemas';
import * as svc from './pos.service.js';
import { readGoldRatePaise } from '../../lib/redis.js';

export const posRouter: Router = Router();

posRouter.post('/bills', async (req, res, next) => {
  try {
    const body = BillCreateSchema.parse(req.body);
    const idempotencyHeader = req.headers['idempotency-key'];
    if (typeof idempotencyHeader === 'string' && idempotencyHeader !== body.idempotencyKey) {
      // Per api-design.md: prefer header; reject mismatch.
      body.idempotencyKey = idempotencyHeader;
    }
    const bill = await svc.createBill(body, req.user?.userId);
    res.status(201).json({ data: bill });
  } catch (err) {
    next(err);
  }
});

posRouter.get('/bills', async (req, res, next) => {
  try {
    const q = z
      .object({
        shopId: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().positive().max(100).optional(),
      })
      .parse(req.query);
    res.json(await svc.listBills(q));
  } catch (err) {
    next(err);
  }
});

posRouter.get('/customers/lookup', async (req, res, next) => {
  try {
    const { phone } = z.object({ phone: IndianPhoneSchema }).parse(req.query);
    const customer = await svc.findCustomerByPhone(phone);
    res.json({ data: customer });
  } catch (err) {
    next(err);
  }
});

posRouter.get('/gold-rate', async (_req, res, next) => {
  try {
    const purities = [2400, 2200, 1800, 1400, 0];
    const data = await Promise.all(
      purities.map(async (p) => {
        const cached = await readGoldRatePaise(p);
        return {
          purity: p,
          ratePerGramPaise: cached?.paise ?? 0,
          stale: cached?.stale ?? true,
          asOf: new Date().toISOString(),
        };
      }),
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
});
