// Admin "Offline Shops" counter — read-only monitor across all shops.
// Mount-level gate is `pos.monitor` (see app.ts). Every endpoint is GET.

import { Router } from 'express';
import { z } from 'zod';
import { getCounterSummary, listRecentBills, listRegisterSessions, getStaffPerformance } from './counter.service.js';

export const counterRouter: Router = Router();

counterRouter.get('/summary', async (_req, res, next) => {
  try {
    res.json({ data: await getCounterSummary() });
  } catch (err) {
    next(err);
  }
});

counterRouter.get('/bills', async (req, res, next) => {
  try {
    const q = z.object({
      shopId: z.string().optional(),
      limit: z.coerce.number().int().positive().max(100).optional(),
    }).parse(req.query);
    res.json({ data: await listRecentBills(q) });
  } catch (err) {
    next(err);
  }
});

counterRouter.get('/sessions', async (_req, res, next) => {
  try {
    res.json({ data: await listRegisterSessions() });
  } catch (err) {
    next(err);
  }
});

counterRouter.get('/staff', async (req, res, next) => {
  try {
    const q = z.object({
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    }).parse(req.query);
    res.json({ data: await getStaffPerformance(q) });
  } catch (err) {
    next(err);
  }
});
