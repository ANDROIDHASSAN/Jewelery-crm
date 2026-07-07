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
import { applySaleToPrePaise, type SaleOffer } from '@goldos/shared/sale';

const DEFAULT_GOLD_RATE = 642_000; // ₹6,420/g — dev fallback.

// The item's effective Season Sale offer (its active campaign's), or null.
// campaignId lets BOGO pair only within the same campaign.
function itemSaleOffer(item: {
  saleItem?: {
    campaign?: {
      id: string;
      discountType: 'PERCENT' | 'FLAT' | 'BOGO' | 'FIXED_PRICE';
      discountBps: number;
      discountFlatPaise: number;
      isActive: boolean;
    } | null;
  } | null;
}): (SaleOffer & { campaignId: string }) | null {
  const c = item.saleItem?.campaign;
  if (!c || !c.isActive) return null;
  return { type: c.discountType, discountBps: c.discountBps, discountFlatPaise: c.discountFlatPaise, campaignId: c.id };
}

// Scale a line's metal / making / stone components by a PERCENT or FLAT offer
// (proportionally, so the pre-GST total drops by exactly the offer amount and
// GST is charged on the reduced base — matching the storefront). BOGO makes no
// per-unit change here; it frees the cheaper of a pair in a separate pass.
function scaleComponentsForOffer(
  c: { gold: number; making: number; stone: number },
  offer: SaleOffer | null,
): { gold: number; making: number; stone: number } {
  if (!offer || offer.type === 'BOGO') return c;
  const sum = c.gold + c.making + c.stone;
  if (sum <= 0) return c;
  const factor = applySaleToPrePaise(sum, offer) / sum;
  return {
    gold: Math.round(c.gold * factor),
    making: Math.round(c.making * factor),
    stone: Math.round(c.stone * factor),
  };
}

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
      // The item's active Season Sale campaign, so POS strikes the same sale
      // price the storefront shows (shared/sale.ts math).
      saleItem: {
        select: {
          campaign: {
            select: { id: true, discountType: true, discountBps: true, discountFlatPaise: true, isActive: true },
          },
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
      // Season Sale offer for this item, applied to the pre-GST line value so
      // POS strikes the same price as the storefront.
      const offer = itemSaleOffer(item);
      // Fixed (GST-inclusive) selling price overrides the live-rate calc for
      // ANY metal type: back out the pre-GST taxable base and feed it as the
      // line's metal value with no making/stone, so computeBillTotals adds GST
      // on top and the customer pays exactly the inclusive selling price.
      if (item.sellingPricePaise != null) {
        const taxableBase = taxableFromInclusivePaise(item.sellingPricePaise);
        const scaled = scaleComponentsForOffer({ gold: taxableBase, making: 0, stone: 0 }, offer);
        return {
          l,
          item,
          offer,
          ratePerGramPaise: 0,
          goldValuePaise: scaled.gold,
          makingPaise: 0,
          makingBps: 0,
          stoneChargePaise: 0,
          linePaise: scaled.gold,
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
      // Apply the Season Sale offer proportionally across the components.
      const scaled = scaleComponentsForOffer(
        { gold: goldValuePaise, making: makingPaise, stone: l.stoneChargePaise },
        offer,
      );
      const linePaise = scaled.gold + scaled.making + scaled.stone;
      return {
        l,
        item,
        offer,
        ratePerGramPaise,
        goldValuePaise: scaled.gold,
        makingPaise: scaled.making,
        makingBps,
        stoneChargePaise: scaled.stone,
        linePaise,
      };
    }),
  );

  // Buy-1-Get-1: within each BOGO campaign, free the cheaper of each pair by
  // zeroing its charge (the whole unit — GST included — is free, matching the
  // storefront). POS rings one unit per line, so pairing is line-by-line.
  const bogoGroups = new Map<string, number[]>();
  lineComputes.forEach((c, i) => {
    if (c.offer?.type === 'BOGO') {
      const arr = bogoGroups.get(c.offer.campaignId) ?? [];
      arr.push(i);
      bogoGroups.set(c.offer.campaignId, arr);
    }
  });
  for (const indices of bogoGroups.values()) {
    const sorted = [...indices].sort((a, b) => lineComputes[b]!.linePaise - lineComputes[a]!.linePaise);
    for (let k = 1; k < sorted.length; k += 2) {
      const c = lineComputes[sorted[k]!]!;
      c.goldValuePaise = 0;
      c.makingPaise = 0;
      c.stoneChargePaise = 0;
      c.linePaise = 0;
    }
  }

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
      // Per-line GST rate from the item (default 3%). Drives the CGST/SGST/IGST
      // computed for this line and snapshotted onto the BillLine below.
      gstRateBps: c.item.gstRateBps ?? 300,
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
          create: lineComputes.map((c, i) => ({
            itemId: c.l.itemId,
            weightMg: c.l.weightMg,
            purityCaratX100: c.l.purityCaratX100,
            ratePerGramPaise: c.ratePerGramPaise,
            makingChargeBps: c.makingBps,
            stoneChargePaise: c.stoneChargePaise,
            linePaise: c.linePaise,
            // GST snapshot — HSN + rate from the item, and the per-line taxable
            // base + CGST/SGST/IGST from computeBillTotals (same index order),
            // so the GST report can summarise by HSN with exact tax figures.
            hsnCode: c.item.hsnCode ?? null,
            gstRateBps: c.item.gstRateBps ?? 300,
            quantity: 1,
            taxablePaise: totals.lineTaxablePaise[i] ?? 0,
            cgstPaise: totals.lineCgstPaise[i] ?? 0,
            sgstPaise: totals.lineSgstPaise[i] ?? 0,
            igstPaise: totals.lineIgstPaise[i] ?? 0,
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

// Create a customer from the POS counter — the cashier's "Add customer" flow
// when a phone lookup finds no match. Idempotent on (tenantId, phone): if the
// number is already on file we return the existing record (flagged
// created:false) rather than 500'ing on the unique constraint. Every genuinely
// new customer is also mirrored into the CRM as a NEW walk-in lead so the sales
// team sees the counter footfall alongside online enquiries — the lead write is
// best-effort and never blocks the customer create.
export async function createPosCustomer(
  input: { name: string; phone: string; email?: string | null },
  createdByUserId?: string,
): Promise<{ customer: Awaited<ReturnType<typeof prisma.customer.findFirst>>; created: boolean }> {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');

  const existing = await prisma.customer.findFirst({
    where: { tenantId, phone: input.phone },
  });
  if (existing) return { customer: existing, created: false };

  const customer = await prisma.customer.create({
    data: {
      tenantId,
      name: input.name,
      phone: input.phone,
      email: input.email ?? null,
      tags: ['POS'],
    },
  });

  // Mirror into the CRM as a walk-in lead. Non-fatal: a CRM hiccup must not
  // undo a customer the cashier just created at the counter.
  try {
    const lead = await prisma.lead.create({
      data: {
        tenantId,
        source: 'walkin',
        customerId: customer.id,
        name: customer.name,
        phone: customer.phone,
        status: 'NEW',
      },
    });
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        type: 'pos_add_customer',
        notes: 'Added at POS counter',
        performedByUserId: createdByUserId ?? null,
      },
    });
  } catch {
    /* swallow — customer is created regardless */
  }

  return { customer, created: true };
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
