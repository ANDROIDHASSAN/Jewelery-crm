// POS shop-owner routes: register sessions, cash movements, parked bills,
// estimates, repairs, advances, refunds, voids. Each route is gated by a
// pos.* permission.

import { Router } from 'express';
import { z } from 'zod';
import {
  OpenRegisterSchema,
  CloseRegisterSchema,
  CashMovementInputSchema,
  ParkedBillInputSchema,
  EstimateInputSchema,
  RepairIntakeSchema,
  RepairUpdateSchema,
  AdvanceInputSchema,
  RefundInputSchema,
  VoidBillSchema,
  CuidSchema,
} from '@goldos/shared/schemas';
import { requirePermission, requireAnyPermission } from '../../middleware/require-permission.js';
import * as svc from './pos-features.service.js';
import { UnauthorizedError } from '../../lib/errors.js';

export const posFeaturesRouter: Router = Router();

// Read-only views accept either the cashier perm or the admin monitor perm.
// Writes (open/close till, park, estimate, repair intake, advance, refund,
// void) keep their stricter cashier-only gates below.
const readAccess = requireAnyPermission('pos.access', 'pos.monitor');

// ---- Register sessions ----------------------------------------------------

posFeaturesRouter.post('/register/open', requirePermission('pos.day_open'), async (req, res, next) => {
  try {
    const body = OpenRegisterSchema.parse(req.body);
    if (!req.user) throw new UnauthorizedError();
    res.status(201).json({ data: await svc.openRegister(body, req.user.userId) });
  } catch (err) {
    next(err);
  }
});

posFeaturesRouter.get('/register/open', readAccess, async (req, res, next) => {
  try {
    const { shopId } = z.object({ shopId: CuidSchema }).parse(req.query);
    res.json({ data: await svc.getOpenSession(shopId) });
  } catch (err) {
    next(err);
  }
});

posFeaturesRouter.post('/register/:id/close', requirePermission('pos.day_close'), async (req, res, next) => {
  try {
    const body = CloseRegisterSchema.parse(req.body);
    if (!req.user) throw new UnauthorizedError();
    res.json({ data: await svc.closeRegister(req.params.id!, body, req.user.userId) });
  } catch (err) {
    next(err);
  }
});

posFeaturesRouter.get('/register/:id/expected-cash', requirePermission('pos.day_close'), async (req, res, next) => {
  try {
    const expected = await svc.computeExpectedCash(req.params.id!);
    res.json({ data: { expectedCashPaise: expected } });
  } catch (err) {
    next(err);
  }
});

// ---- Cash drawer ----------------------------------------------------------

posFeaturesRouter.post('/cash-movements', requirePermission('pos.cash_drawer'), async (req, res, next) => {
  try {
    const body = CashMovementInputSchema.parse(req.body);
    if (!req.user) throw new UnauthorizedError();
    res.status(201).json({ data: await svc.recordCashMovement(body, req.user.userId) });
  } catch (err) {
    next(err);
  }
});

// ---- Parked bills ---------------------------------------------------------

posFeaturesRouter.post('/parked', requirePermission('pos.parked_bill'), async (req, res, next) => {
  try {
    const body = ParkedBillInputSchema.parse(req.body);
    if (!req.user) throw new UnauthorizedError();
    res.status(201).json({ data: await svc.parkBill(body, req.user.userId) });
  } catch (err) {
    next(err);
  }
});

posFeaturesRouter.get('/parked', readAccess, async (req, res, next) => {
  try {
    const { shopId } = z.object({ shopId: CuidSchema }).parse(req.query);
    res.json({ data: await svc.listParkedBills(shopId) });
  } catch (err) {
    next(err);
  }
});

posFeaturesRouter.post('/parked/:id/resume', requirePermission('pos.parked_bill'), async (req, res, next) => {
  try {
    res.json({ data: await svc.resumeParkedBill(req.params.id!) });
  } catch (err) {
    next(err);
  }
});

posFeaturesRouter.post('/parked/:id/abandon', requirePermission('pos.parked_bill'), async (req, res, next) => {
  try {
    await svc.abandonParkedBill(req.params.id!);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---- Estimates ------------------------------------------------------------

posFeaturesRouter.post('/estimates', requirePermission('pos.estimate'), async (req, res, next) => {
  try {
    const body = EstimateInputSchema.parse(req.body);
    if (!req.user) throw new UnauthorizedError();
    res.status(201).json({ data: await svc.createEstimate(body, req.user.userId) });
  } catch (err) {
    next(err);
  }
});

posFeaturesRouter.get('/estimates', readAccess, async (req, res, next) => {
  try {
    const { shopId, status } = z.object({
      shopId: CuidSchema,
      status: z.enum(['DRAFT', 'SENT', 'CONVERTED', 'EXPIRED']).optional(),
    }).parse(req.query);
    res.json({ data: await svc.listEstimates(shopId, status) });
  } catch (err) {
    next(err);
  }
});

// ---- Repairs --------------------------------------------------------------

posFeaturesRouter.post('/repairs', requirePermission('pos.repair'), async (req, res, next) => {
  try {
    const body = RepairIntakeSchema.parse(req.body);
    if (!req.user) throw new UnauthorizedError();
    res.status(201).json({ data: await svc.createRepair(body, req.user.userId) });
  } catch (err) {
    next(err);
  }
});

posFeaturesRouter.get('/repairs', readAccess, async (req, res, next) => {
  try {
    const { shopId, status } = z.object({
      shopId: CuidSchema,
      status: z.enum(['INTAKE', 'IN_WORKSHOP', 'READY', 'DELIVERED', 'CANCELLED']).optional(),
    }).parse(req.query);
    res.json({ data: await svc.listRepairs(shopId, status) });
  } catch (err) {
    next(err);
  }
});

posFeaturesRouter.patch('/repairs/:id', requirePermission('pos.repair'), async (req, res, next) => {
  try {
    const body = RepairUpdateSchema.parse(req.body);
    res.json({ data: await svc.updateRepair(req.params.id!, body) });
  } catch (err) {
    next(err);
  }
});

// ---- Advances -------------------------------------------------------------

posFeaturesRouter.post('/advances', requirePermission('pos.advance'), async (req, res, next) => {
  try {
    const body = AdvanceInputSchema.parse(req.body);
    if (!req.user) throw new UnauthorizedError();
    res.status(201).json({ data: await svc.createAdvance(body, req.user.userId) });
  } catch (err) {
    next(err);
  }
});

posFeaturesRouter.get('/advances', readAccess, async (req, res, next) => {
  try {
    const q = z.object({
      shopId: CuidSchema.optional(),
      customerId: CuidSchema.optional(),
      status: z.enum(['ACTIVE', 'CONSUMED', 'REFUNDED']).optional(),
    }).parse(req.query);
    res.json({ data: await svc.listAdvances(q) });
  } catch (err) {
    next(err);
  }
});

posFeaturesRouter.post('/advances/:id/refund', requirePermission('pos.advance'), async (req, res, next) => {
  try {
    await svc.refundAdvance(req.params.id!);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---- Bill voids + refunds -------------------------------------------------

posFeaturesRouter.post('/bills/:id/void', requirePermission('pos.bill_void'), async (req, res, next) => {
  try {
    const { reason } = VoidBillSchema.parse(req.body);
    if (!req.user) throw new UnauthorizedError();
    res.json({ data: await svc.voidBill(req.params.id!, reason, req.user.userId) });
  } catch (err) {
    next(err);
  }
});

posFeaturesRouter.post('/refunds', requirePermission('pos.refund'), async (req, res, next) => {
  try {
    const body = RefundInputSchema.parse(req.body);
    if (!req.user) throw new UnauthorizedError();
    res.status(201).json({ data: await svc.refundBill(body, req.user.userId) });
  } catch (err) {
    next(err);
  }
});
