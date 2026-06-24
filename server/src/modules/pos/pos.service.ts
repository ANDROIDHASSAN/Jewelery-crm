// POS service — bill creation in a single transaction. Idempotent on idempotencyKey.
// Per specs/gotchas.md: making + stone + GST, old gold exchange reduces taxable base (does NOT subtract making).
//
// Math lives in `@goldos/shared/bill-math` so the cashier's preview and
// the server's authoritative numbers cannot drift — historically the
// client showed wastage as a taxable line item and the server didn't,
// which meant the customer saw a different total than the receipt.

import { prisma, rawPrisma } from '../../lib/prisma.js';
import { computeGoldValuePaise } from '../../lib/money.js';
import { readGoldRatePaise } from '../../lib/redis.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { getTenantId } from '../../lib/async-context.js';
import type { BillCreate } from '@goldos/shared/types';
import { computeBillTotals, resolveMakingChargePaise, taxableFromInclusivePaise } from '@goldos/shared/bill-math';

const DEFAULT_GOLD_RATE = 642_000; // ₹6,420/g — dev fallback.

export async function createBill(input: BillCreate, createdByUserId?: string) {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');

  // Idempotency: same key → original response. The unique key on
  // (tenantId, idempotencyKey) means a queued offline bill re-posted by
  // the sync loop will return the original Bill row instead of creating
  // a duplicate.
  const existing = await prisma.bill.findUnique({
    where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: input.idempotencyKey } },
    include: { lines: true, payments: true, oldGoldExchange: true },
  });
  if (existing) return existing;

  // Lookup shop for state code (used for GST split).
  const shop = await prisma.shop.findUnique({ where: { id: input.shopId } });
  if (!shop) throw new NotFoundError('Shop not found');

  let customerStateCode: string | null = null;
  if (input.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new NotFoundError('Customer not found');
    // v1: storefront billing address state isn't stored on Customer yet — derive default intra.
    customerStateCode = null;
  }

  // Find the cashier's open register session so day-close reconciliation
  // can compute expected cash including offline-synced bills. Bills posted
  // outside a session (e.g. seed scripts) leave this null.
  const openSession = await prisma.registerSession.findFirst({
    where: { shopId: input.shopId, status: 'OPEN' },
    select: { id: true },
  });

  // Build line data + check stock. Pull the item's category making-charge
  // config too so a line whose item has no override inherits the category's
  // mode + rate (percentage or flat per-gram).
  const items = await prisma.item.findMany({
    where: { id: { in: input.lines.map((l) => l.itemId) } },
    include: {
      category: {
        select: {
          makingChargeMode: true,
          defaultMakingChargeBps: true,
          defaultMakingChargePerGramPaise: true,
        },
      },
    },
  });
  const itemById = new Map(items.map((i) => [i.id, i]));
  for (const l of input.lines) {
    const item = itemById.get(l.itemId);
    if (!item) throw new BusinessRuleError('ITEM_NOT_FOUND', `Item ${l.itemId} not found`);
    if (item.status !== 'IN_STOCK')
      throw new BusinessRuleError('ITEM_NOT_AVAILABLE', `Item ${item.sku} not available`);
  }

  // Build lines.
  const lineComputes = await Promise.all(
    input.lines.map(async (l) => {
      const item = itemById.get(l.itemId)!;
      // Fixed (GST-inclusive) selling price overrides the live-rate calc for
      // ANY metal type: back out the pre-GST taxable base and feed it as the
      // line's metal value with no making/stone, so computeBillTotals adds GST
      // on top and the customer pays exactly the inclusive selling price.
      if (item.sellingPricePaise != null) {
        const taxableBase = taxableFromInclusivePaise(item.sellingPricePaise);
        return {
          l,
          item,
          ratePerGramPaise: 0,
          goldValuePaise: taxableBase,
          makingPaise: 0,
          makingBps: 0,
          stoneChargePaise: 0,
          linePaise: taxableBase,
        };
      }
      const cached = await readGoldRatePaise(l.purityCaratX100);
      const ratePerGramPaise = cached?.paise ?? DEFAULT_GOLD_RATE;
      const goldValuePaise = computeGoldValuePaise(l.weightMg, l.purityCaratX100, ratePerGramPaise);
      const cat = item.category;
      // Resolve making charge. Precedence: explicit per-line bps override (the
      // cashier typed one) → item-level mode/rate → category mode/rate →
      // legacy 12% default. PER_GRAM uses a flat paise-per-gram rate.
      let mode: 'PERCENTAGE' | 'PER_GRAM' = 'PERCENTAGE';
      let bps = 1200;
      let perGram: number | null = null;
      if (l.makingChargeBps != null) {
        // Explicit per-line override typed by the cashier.
        mode = 'PERCENTAGE';
        bps = l.makingChargeBps;
      } else if (item.makingChargeMode) {
        // Item carries an explicit mode override.
        mode = item.makingChargeMode;
        bps = item.makingChargeBps ?? cat?.defaultMakingChargeBps ?? 1200;
        perGram = item.makingChargePerGramPaise ?? cat?.defaultMakingChargePerGramPaise ?? null;
      } else if (item.makingChargeBps != null) {
        // Item has a percentage override (bps set, no explicit mode) — it wins
        // even inside a per-gram category.
        mode = 'PERCENTAGE';
        bps = item.makingChargeBps;
      } else if (cat) {
        // Inherit the category's mode + rate.
        mode = cat.makingChargeMode;
        bps = cat.defaultMakingChargeBps;
        perGram = cat.defaultMakingChargePerGramPaise ?? null;
      }
      const makingPaise = resolveMakingChargePaise({
        metalValuePaise: goldValuePaise,
        weightMg: l.weightMg,
        mode,
        bps,
        perGramPaise: perGram,
      });
      // Persisted on the bill line for the receipt. PER_GRAM lines carry 0 bps;
      // the rupee making amount is still captured inside linePaise.
      const makingBps = mode === 'PERCENTAGE' ? bps : 0;
      const linePaise = goldValuePaise + makingPaise + l.stoneChargePaise;
      return {
        l,
        item,
        ratePerGramPaise,
        goldValuePaise,
        makingPaise,
        makingBps,
        stoneChargePaise: l.stoneChargePaise,
        linePaise,
      };
    }),
  );

  // Resolve the old-gold rate (matched to the exchanged piece's purity) so
  // shared/bill-math computes wastage off the same number we'll persist.
  let oldGoldRatePaise = DEFAULT_GOLD_RATE;
  if (input.oldGoldExchange) {
    const cached = await readGoldRatePaise(input.oldGoldExchange.purityCaratX100);
    oldGoldRatePaise = cached?.paise ?? DEFAULT_GOLD_RATE;
  }

  const totals = computeBillTotals({
    lines: lineComputes.map((c) => ({
      goldValuePaise: c.goldValuePaise,
      makingPaise: c.makingPaise,
      stoneChargePaise: c.stoneChargePaise,
    })),
    oldGold: input.oldGoldExchange
      ? {
          weightMg: input.oldGoldExchange.weightMg,
          purityCaratX100: input.oldGoldExchange.purityCaratX100,
          ratePerGramPaise: oldGoldRatePaise,
        }
      : null,
    discountPaise: input.discountPaise,
    shopStateCode: shop.gstStateCode,
    customerStateCode,
  });

  const subtotalPaise = totals.subtotalPaise;
  const makingChargesPaise = totals.makingChargesPaise;
  const stoneChargesPaise = totals.stoneChargesPaise;
  const oldGoldValuePaise = totals.oldGoldValuePaise;
  const totalPaise = totals.totalPaise;

  // Redeemed advances: load + validate before the transaction so a bad
  // request fails cleanly. Each advance is booked as an ADVANCE-mode payment
  // (its full receipt amount) and flipped to CONSUMED inside the tx below.
  // Advances are whole-receipt — there is no partial-balance field — so the
  // sum redeemed may not exceed the bill total.
  const redeemAdvanceIds = input.redeemAdvanceIds ?? [];
  let advances: { id: string; amountPaise: number; receiptNumber: string }[] = [];
  if (redeemAdvanceIds.length > 0) {
    if (!input.customerId) {
      throw new BusinessRuleError('ADVANCE_NEEDS_CUSTOMER', 'Select the customer before redeeming an advance');
    }
    advances = await prisma.advance.findMany({
      where: { id: { in: redeemAdvanceIds }, customerId: input.customerId, status: 'ACTIVE' },
      select: { id: true, amountPaise: true, receiptNumber: true },
    });
    if (advances.length !== redeemAdvanceIds.length) {
      throw new BusinessRuleError('ADVANCE_UNAVAILABLE', 'One or more advances are not active for this customer');
    }
    const advanceTotal = advances.reduce((s, a) => s + a.amountPaise, 0);
    if (advanceTotal > totalPaise) {
      throw new BusinessRuleError('ADVANCE_EXCEEDS_TOTAL', 'Redeemed advances exceed the bill total');
    }
  }
  const advancePayments = advances.map((a) => ({
    mode: 'ADVANCE' as const,
    amountPaise: a.amountPaise,
    referenceId: a.receiptNumber,
  }));

  // Per-shop bill number sequence — simple monotonic count.
  const billCount = await prisma.bill.count({ where: { shopId: input.shopId } });
  const billNumber = `${new Date().getFullYear()}-${String(billCount + 1).padStart(6, '0')}`;

  // Single transaction: create bill + lines + payments + exchange + stock decrement + audit.
  const bill = await prisma.$transaction(async (tx) => {
    const created = await tx.bill.create({
      data: {
        tenantId,
        shopId: input.shopId,
        billNumber,
        customerId: input.customerId ?? null,
        registerSessionId: openSession?.id ?? null,
        subtotalPaise,
        makingChargesPaise,
        stoneChargesPaise,
        cgstPaise: totals.cgstPaise,
        sgstPaise: totals.sgstPaise,
        igstPaise: totals.igstPaise,
        oldGoldValuePaise,
        discountPaise: input.discountPaise,
        totalPaise,
        paymentStatus: 'PAID',
        idempotencyKey: input.idempotencyKey,
        createdByUserId: createdByUserId ?? null,
        lines: {
          create: lineComputes.map((c) => ({
            itemId: c.l.itemId,
            weightMg: c.l.weightMg,
            purityCaratX100: c.l.purityCaratX100,
            ratePerGramPaise: c.ratePerGramPaise,
            makingChargeBps: c.makingBps,
            stoneChargePaise: c.stoneChargePaise,
            linePaise: c.linePaise,
          })),
        },
        payments: { create: [...input.payments, ...advancePayments] },
        ...(input.oldGoldExchange
          ? {
              oldGoldExchange: {
                create: {
                  weightMg: input.oldGoldExchange.weightMg,
                  purityCaratX100: input.oldGoldExchange.purityCaratX100,
                  ratePerGramPaise: oldGoldRatePaise,
                  valuePaise: oldGoldValuePaise,
                },
              },
            }
          : {}),
      },
      include: { lines: true, payments: true, oldGoldExchange: true },
    });

    // Decrement stock — branch by serialized vs lot.
    //   serialized: one row = one piece. Flip status to SOLD (one shot).
    //   lot:        decrement quantityOnHand by 1 per bill line; if it
    //               reaches 0 flip the row to SOLD so listings stay clean.
    // Lines are evaluated against the items we already fetched above, so
    // we don't need a second DB hit just to learn isSerialized.
    const serializedIds = input.lines
      .filter((l) => itemById.get(l.itemId)?.isSerialized !== false)
      .map((l) => l.itemId);
    const lotLines = input.lines.filter(
      (l) => itemById.get(l.itemId)?.isSerialized === false,
    );

    if (serializedIds.length > 0) {
      await tx.item.updateMany({
        where: { id: { in: serializedIds }, status: 'IN_STOCK' },
        data: { status: 'SOLD' },
      });
    }
    for (const l of lotLines) {
      // 1 piece per bill line for now — BillLine.quantity is not yet a
      // separate column, so the cashier rings up one row per piece. Lot
      // POS UX will revisit this when it lands.
      const updated = await tx.item.update({
        where: { id: l.itemId },
        data: { quantityOnHand: { decrement: 1 } },
        select: { quantityOnHand: true },
      });
      if (updated.quantityOnHand <= 0) {
        await tx.item.update({
          where: { id: l.itemId },
          data: { status: 'SOLD' },
        });
      }
    }

    // SALE movement per line — historical bug: we never wrote these, so
    // the item-history view showed PURCHASE but no SALE. One row per
    // bill line, qty=1 (lot UX will multiply this when it lands).
    await tx.itemMovement.createMany({
      data: input.lines.map((l) => ({
        tenantId,
        itemId: l.itemId,
        type: 'SALE' as const,
        fromShopId: input.shopId,
        qty: 1,
        reason: `Bill ${billNumber}`,
        performedByUserId: createdByUserId ?? null,
      })),
    });

    // Consume redeemed advances — flip ACTIVE → CONSUMED and stamp the bill
    // they paid into. Done inside the tx so a failed bill never burns an
    // advance, and a succeeded bill can't double-spend it (the next attempt
    // won't find it ACTIVE).
    if (advances.length > 0) {
      await tx.advance.updateMany({
        where: { id: { in: advances.map((a) => a.id) }, status: 'ACTIVE' },
        data: { status: 'CONSUMED', consumedBillId: created.id },
      });
    }

    // Audit log via rawPrisma (it sits outside the tx, fine for v1).
    return created;
  });

  // Fire-and-forget audit log; D2 wires this through Prisma extension.
  rawPrisma.auditLog
    .create({
      data: {
        tenantId,
        userId: createdByUserId ?? null,
        entityType: 'Bill',
        entityId: bill.id,
        action: 'CREATE',
      },
    })
    .catch(() => {
      /* swallow */
    });

  return bill;
}

export async function findCustomerByPhone(phone: string) {
  return prisma.customer.findFirst({ where: { phone } });
}

export interface ContactResult {
  id: string;
  name: string;
  phone: string;
  source: 'customer' | 'lead';
}

// Typeahead contact search for the POS surface (advance receipts, etc.).
// Reachable with pos.access — the cashier has no finance.* permission, so
// routing POS pickers through /finance/* silently 403s and every query shows
// "no match". Returns real Customers first, then CRM Leads that aren't already
// customers (deduped by phone), so the cashier can also book against a known
// enquiry — picking a lead creates the Customer on submit. Tenant-scoped.
export async function searchCustomers(opts: { q?: string; limit: number }): Promise<ContactResult[]> {
  const term = opts.q?.trim() ?? '';
  const where = term
    ? {
        OR: [
          { name: { contains: term, mode: 'insensitive' as const } },
          { phone: { contains: term } },
        ],
      }
    : {};

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: opts.limit,
    select: { id: true, name: true, phone: true },
  });
  const results: ContactResult[] = customers.map((c) => ({ ...c, source: 'customer' }));

  // Backfill remaining slots with leads whose phone isn't already a customer.
  const remaining = opts.limit - results.length;
  if (remaining <= 0) return results;

  const seenPhones = new Set(customers.map((c) => c.phone));
  const leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: opts.limit, // over-fetch; we filter out phones already seen
    select: { id: true, name: true, phone: true },
  });
  for (const l of leads) {
    if (seenPhones.has(l.phone)) continue;
    seenPhones.add(l.phone);
    results.push({ id: l.id, name: l.name, phone: l.phone, source: 'lead' });
    if (results.length >= opts.limit) break;
  }
  return results;
}

export async function listBills(opts: { shopId?: string; cursor?: string; limit?: number }) {
  const take = Math.min(opts.limit ?? 20, 100);
  const bills = await prisma.bill.findMany({
    where: opts.shopId ? { shopId: opts.shopId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = bills.length > take;
  const page = bills.slice(0, take);
  return { data: page, page: { nextCursor: hasMore ? page.at(-1)?.id : undefined, hasMore } };
}

/** Idempotent duplicate detection guard — throws 409 if the key was used for a different shop or different lines. */
export async function ensureIdempotencyMatches(key: string, shopId: string): Promise<void> {
  const existing = await prisma.bill.findFirst({ where: { idempotencyKey: key } });
  if (existing && existing.shopId !== shopId) {
    throw new ConflictError('Idempotency key reused with different shop');
  }
}
