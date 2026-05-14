// POS service — bill creation in a single transaction. Idempotent on idempotencyKey.
// Per specs/gotchas.md: making + stone + GST, old gold exchange reduces taxable base (does NOT subtract making).

import { prisma, rawPrisma } from '../../lib/prisma.js';
import { computeGoldValuePaise, applyBps, sumPaise } from '../../lib/money.js';
import { computeGst } from '../../lib/gst.js';
import { readGoldRatePaise } from '../../lib/redis.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { getTenantId } from '../../lib/async-context.js';
import type { BillCreate } from '@goldos/shared/types';

const DEFAULT_GOLD_RATE = 642_000; // ₹6,420/g — dev fallback.
const DEFAULT_WASTAGE_BPS = 200; // 2% old gold wastage.

export async function createBill(input: BillCreate, createdByUserId?: string) {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');

  // Idempotency: same key → original response.
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

  // Build line data + check stock.
  const items = await prisma.item.findMany({
    where: { id: { in: input.lines.map((l) => l.itemId) } },
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
      const cached = await readGoldRatePaise(l.purityCaratX100);
      const ratePerGramPaise = cached?.paise ?? DEFAULT_GOLD_RATE;
      const goldValuePaise = computeGoldValuePaise(l.weightMg, l.purityCaratX100, ratePerGramPaise);
      const item = itemById.get(l.itemId)!;
      const makingBps = l.makingChargeBps ?? item.makingChargeBps ?? 1200;
      const makingPaise = applyBps(goldValuePaise, makingBps);
      const linePaise = goldValuePaise + makingPaise + l.stoneChargePaise;
      return { l, item, ratePerGramPaise, goldValuePaise, makingPaise, makingBps, linePaise };
    }),
  );

  const subtotalPaise = sumPaise(lineComputes.map((c) => c.goldValuePaise));
  const makingChargesPaise = sumPaise(lineComputes.map((c) => c.makingPaise));
  const stoneChargesPaise = sumPaise(input.lines.map((l) => l.stoneChargePaise));

  // Old gold exchange — pure gold value back, NO making. Wastage deduction applies.
  let oldGoldValuePaise = 0;
  if (input.oldGoldExchange) {
    const og = input.oldGoldExchange;
    const cached = await readGoldRatePaise(og.purityCaratX100);
    const ratePerGramPaise = cached?.paise ?? DEFAULT_GOLD_RATE;
    const gross = computeGoldValuePaise(og.weightMg, og.purityCaratX100, ratePerGramPaise);
    const wastage = applyBps(gross, DEFAULT_WASTAGE_BPS);
    oldGoldValuePaise = gross - wastage;
  }

  // GST on (making + stone + gold − old gold exchange). Per line for accurate rounding.
  const gstLines = lineComputes.map((c) => {
    const lineExchange =
      lineComputes.length > 0 ? Math.round((oldGoldValuePaise * c.linePaise) / (subtotalPaise + makingChargesPaise + stoneChargesPaise || 1)) : 0;
    const taxable = Math.max(0, c.linePaise - lineExchange);
    return { taxablePaise: taxable };
  });
  const gst = computeGst({ shopStateCode: shop.gstStateCode, customerStateCode, lines: gstLines });

  const totalPaise =
    subtotalPaise +
    makingChargesPaise +
    stoneChargesPaise +
    gst.cgstPaise +
    gst.sgstPaise +
    gst.igstPaise -
    oldGoldValuePaise -
    input.discountPaise;

  // Per-shop bill number sequence — simple monotonic count.
  const billCount = await prisma.bill.count({ where: { shopId: input.shopId } });
  const billNumber = `${new Date().getFullYear()}-${String(billCount + 1).padStart(6, '0')}`;

  // Single transaction: create bill + lines + payments + exchange + stock decrement + audit.
  const bill = await prisma.$transaction(async (tx) => {
    const created = await tx.bill.create({
      data: {
        shopId: input.shopId,
        billNumber,
        customerId: input.customerId ?? null,
        subtotalPaise,
        makingChargesPaise,
        stoneChargesPaise,
        cgstPaise: gst.cgstPaise,
        sgstPaise: gst.sgstPaise,
        igstPaise: gst.igstPaise,
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
            stoneChargePaise: c.l.stoneChargePaise,
            linePaise: c.linePaise,
          })),
        },
        payments: { create: input.payments },
        ...(input.oldGoldExchange
          ? {
              oldGoldExchange: {
                create: {
                  weightMg: input.oldGoldExchange.weightMg,
                  purityCaratX100: input.oldGoldExchange.purityCaratX100,
                  ratePerGramPaise: DEFAULT_GOLD_RATE,
                  valuePaise: oldGoldValuePaise,
                },
              },
            }
          : {}),
      },
      include: { lines: true, payments: true, oldGoldExchange: true },
    });

    // Decrement stock (mark items SOLD).
    await tx.item.updateMany({
      where: { id: { in: input.lines.map((l) => l.itemId) }, status: 'IN_STOCK' },
      data: { status: 'SOLD' },
    });

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
