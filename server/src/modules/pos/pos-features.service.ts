// POS shop-owner features: register sessions (day-open / day-close), cash
// drawer movements, parked bills, estimates, repairs, advances, bill voids,
// refunds.
//
// All services are tenant-scoped through Prisma's tenant extension (prisma
// alias) — raw rawPrisma is used only for cross-tenant validation where
// needed.

import { prisma, rawPrisma } from '../../lib/prisma.js';
import { computeGoldValuePaise, applyBps, sumPaise } from '../../lib/money.js';
import { readGoldRatePaise } from '../../lib/redis.js';
import { BadRequestError, ConflictError, NotFoundError, BusinessRuleError } from '../../lib/errors.js';
import { getTenantId } from '../../lib/async-context.js';

function tenantIdOrThrow(): string {
  const id = getTenantId();
  if (!id) throw new BadRequestError('No tenant context');
  return id;
}

const DEFAULT_GOLD_RATE = 642_000;
const DEFAULT_MAKING_BPS = 1200;

// ------------------------------------------------------------------
// Register sessions: day-open, day-close, reconciliation.
// ------------------------------------------------------------------

export async function openRegister(input: { shopId: string; openingFloatPaise: number; notes?: string | null }, openedByUserId: string) {
  const tenantId = tenantIdOrThrow();
  // DB partial-unique guards "one OPEN per shop" — pre-check for a clean 409.
  const existing = await prisma.registerSession.findFirst({
    where: { shopId: input.shopId, status: 'OPEN' },
    select: { id: true, openedAt: true, openedByUserId: true },
  });
  if (existing) {
    throw new ConflictError(`Register already open for this shop since ${existing.openedAt.toISOString()}`);
  }

  return prisma.$transaction(async (tx) => {
    const session = await tx.registerSession.create({
      data: {
        tenantId,
        shopId: input.shopId,
        openedByUserId,
        openingFloatPaise: input.openingFloatPaise,
        notes: input.notes ?? null,
      },
    });
    // Mirror float as a cash movement so the audit trail is clean.
    await tx.cashMovement.create({
      data: {
        tenantId,
        shopId: input.shopId,
        registerSessionId: session.id,
        type: 'OPENING_FLOAT',
        amountPaise: input.openingFloatPaise,
        reason: 'Day-open float',
        performedByUserId: openedByUserId,
      },
    });
    return session;
  });
}

export async function getOpenSession(shopId: string) {
  return prisma.registerSession.findFirst({
    where: { shopId, status: 'OPEN' },
    include: {
      bills: {
        select: { id: true, billNumber: true, totalPaise: true, payments: { select: { mode: true, amountPaise: true } } },
      },
      cashMovements: { orderBy: { createdAt: 'asc' } },
    },
  });
}

export async function computeExpectedCash(sessionId: string): Promise<number> {
  // Sum: opening float + cash payments on bills attached to session - cash pay-outs + cash pay-ins - deposits.
  const session = await prisma.registerSession.findUnique({
    where: { id: sessionId },
    include: {
      cashMovements: true,
      bills: {
        select: {
          voidedAt: true,
          payments: { select: { mode: true, amountPaise: true } },
          refunds: { select: { amountPaise: true } },
        },
      },
    },
  });
  if (!session) throw new NotFoundError('Register session');

  let cash = 0;
  // Opening float (also recorded as a movement; iterate movements is the
  // canonical path — but skip the OPENING_FLOAT mirror if we'd double count).
  cash += session.openingFloatPaise;

  for (const bill of session.bills) {
    if (bill.voidedAt) continue;
    for (const p of bill.payments) {
      if (p.mode === 'CASH') cash += p.amountPaise;
    }
    // Refunds reduce cash on the assumption refunds go back in cash. If the
    // refund went to UPI etc. day-end variance will flag it.
    for (const r of bill.refunds) cash -= r.amountPaise;
  }
  for (const m of session.cashMovements) {
    if (m.type === 'OPENING_FLOAT') continue; // already counted via session.openingFloatPaise
    if (m.type === 'PAY_IN') cash += m.amountPaise;
    if (m.type === 'PAY_OUT' || m.type === 'DEPOSIT') cash -= m.amountPaise;
  }
  return cash;
}

export async function closeRegister(sessionId: string, input: { countedCashPaise: number; notes?: string | null }, closedByUserId: string) {
  const expected = await computeExpectedCash(sessionId);
  const variance = input.countedCashPaise - expected;
  return prisma.registerSession.update({
    where: { id: sessionId },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      closedByUserId,
      countedCashPaise: input.countedCashPaise,
      expectedCashPaise: expected,
      variancePaise: variance,
      notes: input.notes ?? undefined,
    },
  });
}

export async function recordCashMovement(input: {
  shopId: string;
  type: 'PAY_IN' | 'PAY_OUT' | 'DEPOSIT';
  amountPaise: number;
  reason: string;
}, performedByUserId: string) {
  const session = await prisma.registerSession.findFirst({
    where: { shopId: input.shopId, status: 'OPEN' },
    select: { id: true },
  });
  if (!session) throw new BadRequestError('Open the register before recording cash movements');
  const tenantId = tenantIdOrThrow();
  return prisma.cashMovement.create({
    data: {
      tenantId,
      shopId: input.shopId,
      registerSessionId: session.id,
      type: input.type,
      amountPaise: input.amountPaise,
      reason: input.reason,
      performedByUserId,
    },
  });
}

// ------------------------------------------------------------------
// Parked bills.
// ------------------------------------------------------------------

export async function parkBill(input: {
  shopId: string;
  customerLabel: string;
  customerPhone?: string | null;
  draft: Record<string, unknown>;
}, parkedByUserId: string) {
  const tenantId = tenantIdOrThrow();
  return prisma.parkedBill.create({
    data: {
      tenantId,
      shopId: input.shopId,
      customerLabel: input.customerLabel,
      customerPhone: input.customerPhone ?? null,
      draft: input.draft as never,
      parkedByUserId,
    },
  });
}

export async function listParkedBills(shopId: string) {
  return prisma.parkedBill.findMany({
    where: { shopId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  });
}

export async function resumeParkedBill(id: string) {
  const parked = await prisma.parkedBill.findUnique({ where: { id } });
  if (!parked) throw new NotFoundError('Parked bill');
  if (parked.status !== 'ACTIVE') throw new ConflictError('Parked bill is no longer active');
  await prisma.parkedBill.update({
    where: { id },
    data: { status: 'RESUMED', resumedAt: new Date() },
  });
  return parked.draft as unknown;
}

export async function abandonParkedBill(id: string): Promise<void> {
  await prisma.parkedBill.update({
    where: { id },
    data: { status: 'ABANDONED', abandonedAt: new Date() },
  });
}

// ------------------------------------------------------------------
// Estimates (kachi parchi).
// ------------------------------------------------------------------

const PURITIES = [2400, 2200, 1800, 1400, 0] as const;

export async function createEstimate(input: {
  shopId: string;
  customerId?: string | null;
  customerLabel: string;
  customerPhone?: string | null;
  lines: Array<{ itemId: string; weightMg: number; purityCaratX100: number; makingChargeBps?: number; stoneChargePaise: number }>;
  validDays: number;
}, createdByUserId: string) {
  // Snapshot rates.
  const ratesSnapshot: Record<string, number> = {};
  for (const p of PURITIES) {
    const r = await readGoldRatePaise(p);
    ratesSnapshot[String(p)] = r?.paise ?? DEFAULT_GOLD_RATE;
  }

  // Compute totals.
  const items = await prisma.item.findMany({
    where: { id: { in: input.lines.map((l) => l.itemId) } },
    select: { id: true, sku: true, makingChargeBps: true },
  });
  const itemById = new Map(items.map((i) => [i.id, i]));
  let subtotal = 0;
  let making = 0;
  for (const l of input.lines) {
    const rate = ratesSnapshot[String(l.purityCaratX100)] ?? DEFAULT_GOLD_RATE;
    const gold = computeGoldValuePaise(l.weightMg, l.purityCaratX100, rate);
    const makingBps = l.makingChargeBps ?? itemById.get(l.itemId)?.makingChargeBps ?? DEFAULT_MAKING_BPS;
    subtotal += gold;
    making += applyBps(gold, makingBps);
  }
  const stones = sumPaise(input.lines.map((l) => l.stoneChargePaise));
  const total = subtotal + making + stones;

  // Per-shop sequence number.
  const count = await prisma.estimate.count({ where: { shopId: input.shopId } });
  const estimateNumber = `EST-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

  const validUntil = new Date(Date.now() + input.validDays * 86_400_000);
  const tenantId = tenantIdOrThrow();

  return prisma.estimate.create({
    data: {
      tenantId,
      shopId: input.shopId,
      estimateNumber,
      customerId: input.customerId ?? null,
      customerLabel: input.customerLabel,
      customerPhone: input.customerPhone ?? null,
      createdByUserId,
      ratesSnapshotJson: ratesSnapshot as never,
      lines: input.lines as never,
      subtotalPaise: subtotal,
      makingChargesPaise: making,
      totalPaise: total + stones,
      validUntil,
    },
  });
}

export async function listEstimates(shopId: string, status?: 'DRAFT' | 'SENT' | 'CONVERTED' | 'EXPIRED') {
  return prisma.estimate.findMany({
    where: { shopId, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

// ------------------------------------------------------------------
// Repairs / job-work.
// ------------------------------------------------------------------

export async function createRepair(input: {
  shopId: string;
  customerId?: string | null;
  customerName: string;
  customerPhone: string;
  itemDescription: string;
  weightInMg: number;
  purityCaratX100: number;
  problem: string;
  estimatedCostPaise: number;
  advancePaise: number;
  promisedAt?: Date | null;
  notes?: string | null;
}, intakeUserId: string) {
  const tenantId = tenantIdOrThrow();
  const count = await prisma.repair.count({ where: { shopId: input.shopId } });
  const ticketNumber = `RPR-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
  return prisma.repair.create({
    data: {
      tenantId,
      shopId: input.shopId,
      ticketNumber,
      customerId: input.customerId ?? null,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      itemDescription: input.itemDescription,
      weightInMg: input.weightInMg,
      purityCaratX100: input.purityCaratX100,
      problem: input.problem,
      estimatedCostPaise: input.estimatedCostPaise,
      advancePaise: input.advancePaise,
      promisedAt: input.promisedAt ?? null,
      notes: input.notes ?? null,
      intakeUserId,
    },
  });
}

export async function listRepairs(shopId: string, status?: 'INTAKE' | 'IN_WORKSHOP' | 'READY' | 'DELIVERED' | 'CANCELLED') {
  return prisma.repair.findMany({
    where: { shopId, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function updateRepair(id: string, input: {
  status?: 'INTAKE' | 'IN_WORKSHOP' | 'READY' | 'DELIVERED' | 'CANCELLED';
  weightOutMg?: number | null;
  finalCostPaise?: number | null;
  notes?: string | null;
}) {
  return prisma.repair.update({
    where: { id },
    data: {
      status: input.status,
      weightOutMg: input.weightOutMg ?? undefined,
      finalCostPaise: input.finalCostPaise ?? undefined,
      notes: input.notes ?? undefined,
    },
  });
}

// ------------------------------------------------------------------
// Advances / booking receipts.
// ------------------------------------------------------------------

export async function createAdvance(input: {
  shopId: string;
  customerId?: string | null;
  customerName?: string;
  customerPhone?: string;
  amountPaise: number;
  lockRates: boolean;
  validDays: number;
  notes?: string | null;
}, createdByUserId: string) {
  const tenantId = tenantIdOrThrow();

  // Resolve the customer: an explicit CRM pick wins; otherwise upsert by phone
  // so a walk-in can be saved on the spot without a prior CRM record. Phone is
  // the identity (unique per tenant) — if it already exists we reuse that row
  // rather than erroring on the unique constraint.
  let customerId = input.customerId ?? null;
  if (!customerId) {
    if (!input.customerName || !input.customerPhone) {
      throw new BadRequestError('Customer name and phone are required for a new customer');
    }
    const existing = await prisma.customer.findFirst({
      where: { phone: input.customerPhone },
      select: { id: true },
    });
    customerId = existing
      ? existing.id
      : (
          await prisma.customer.create({
            data: { tenantId, name: input.customerName.trim(), phone: input.customerPhone, tags: [] },
            select: { id: true },
          })
        ).id;
  }

  let lockedRatesJson: Record<string, number> | null = null;
  if (input.lockRates) {
    lockedRatesJson = {};
    for (const p of PURITIES) {
      const r = await readGoldRatePaise(p);
      lockedRatesJson[String(p)] = r?.paise ?? DEFAULT_GOLD_RATE;
    }
  }
  const count = await prisma.advance.count({ where: { shopId: input.shopId } });
  const receiptNumber = `ADV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
  return prisma.advance.create({
    data: {
      tenantId,
      shopId: input.shopId,
      receiptNumber,
      customerId,
      amountPaise: input.amountPaise,
      lockedRatesJson: lockedRatesJson as never,
      validUntil: input.validDays ? new Date(Date.now() + input.validDays * 86_400_000) : null,
      notes: input.notes ?? null,
      createdByUserId,
    },
  });
}

export async function listAdvances(filters: { shopId?: string; customerId?: string; status?: 'ACTIVE' | 'CONSUMED' | 'REFUNDED' }) {
  return prisma.advance.findMany({
    where: {
      ...(filters.shopId ? { shopId: filters.shopId } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    include: {
      customer: { select: { name: true, phone: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function refundAdvance(id: string): Promise<void> {
  const advance = await prisma.advance.findUnique({ where: { id } });
  if (!advance) throw new NotFoundError('Advance');
  if (advance.status !== 'ACTIVE') throw new ConflictError('Advance is not active');
  await prisma.advance.update({
    where: { id },
    data: { status: 'REFUNDED', refundedAt: new Date() },
  });
}

// ------------------------------------------------------------------
// Bill voids + refunds.
// ------------------------------------------------------------------

export async function voidBill(billId: string, reason: string, voidedByUserId: string) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { lines: true },
  });
  if (!bill) throw new NotFoundError('Bill');
  if (bill.voidedAt) throw new ConflictError('Bill is already voided');
  if (Date.now() - bill.createdAt.getTime() > 24 * 60 * 60 * 1000) {
    throw new BusinessRuleError('VOID_WINDOW_EXPIRED', 'Bills can only be voided within 24 hours of creation');
  }
  // Pull each item's mode so we branch correctly when restoring stock.
  const items = await prisma.item.findMany({
    where: { id: { in: bill.lines.map((l) => l.itemId) } },
    select: { id: true, isSerialized: true },
  });
  const isSerializedById = new Map(items.map((i) => [i.id, i.isSerialized]));
  const tenantId = tenantIdOrThrow();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.bill.update({
      where: { id: billId },
      data: { voidedAt: new Date(), voidReason: reason, paymentStatus: 'REFUNDED' },
    });

    // Restore stock — symmetric to createBill's decrement.
    //   serialized: flip SOLD -> IN_STOCK.
    //   lot:        increment quantityOnHand back by 1 per line; if the row
    //               had flipped to SOLD when it hit zero, flip it back.
    const serializedIds: string[] = [];
    const lotItemIds: string[] = [];
    for (const l of bill.lines) {
      if (isSerializedById.get(l.itemId) === false) lotItemIds.push(l.itemId);
      else serializedIds.push(l.itemId);
    }

    if (serializedIds.length > 0) {
      await tx.item.updateMany({
        where: { id: { in: serializedIds }, status: 'SOLD' },
        data: { status: 'IN_STOCK' },
      });
    }
    for (const id of lotItemIds) {
      await tx.item.update({
        where: { id },
        data: {
          quantityOnHand: { increment: 1 },
          // Restoring a previously sold-out lot — flip back to IN_STOCK so it
          // shows up in catalogs again. If the row was already IN_STOCK, the
          // status write is a no-op.
          status: 'IN_STOCK',
        },
      });
    }

    // RETURN movement per line — symmetric to the SALE rows createBill wrote.
    // Keeps the item-history view balanced for both serialized and lot rows.
    await tx.itemMovement.createMany({
      data: bill.lines.map((l) => ({
        tenantId,
        itemId: l.itemId,
        type: 'RETURN' as const,
        toShopId: bill.shopId,
        qty: 1,
        reason: `Void bill ${bill.billNumber}: ${reason}`,
        performedByUserId: voidedByUserId,
      })),
    });

    // Audit
    await rawPrisma.auditLog.create({
      data: {
        tenantId,
        userId: voidedByUserId,
        entityType: 'Bill',
        entityId: billId,
        action: 'VOID',
        beforeJson: { paymentStatus: bill.paymentStatus, voidedAt: null },
        afterJson: { paymentStatus: 'REFUNDED', voidedAt: updated.voidedAt, voidReason: reason },
      },
    }).catch(() => undefined);
    return updated;
  });
}

export async function refundBill(input: { billId: string; amountPaise: number; reason: string }, processedByUserId: string) {
  const bill = await prisma.bill.findUnique({ where: { id: input.billId }, include: { refunds: true } });
  if (!bill) throw new NotFoundError('Bill');
  if (bill.voidedAt) throw new ConflictError('Cannot refund a voided bill');
  const refunded = sumPaise(bill.refunds.map((r) => r.amountPaise));
  if (refunded + input.amountPaise > bill.totalPaise) {
    throw new BusinessRuleError('REFUND_OVER_TOTAL', 'Refund would exceed bill total');
  }
  return prisma.$transaction(async (tx) => {
    const refund = await tx.refund.create({
      data: {
        billId: input.billId,
        amountPaise: input.amountPaise,
        reason: input.reason,
        processedByUserId,
      },
    });
    const newTotal = refunded + input.amountPaise;
    const newStatus = newTotal >= bill.totalPaise ? 'REFUNDED' : 'PARTIAL';
    await tx.bill.update({
      where: { id: input.billId },
      data: { paymentStatus: newStatus },
    });
    return refund;
  });
}
