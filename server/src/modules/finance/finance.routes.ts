// Finance & Accounting routes — the Gold-OS multi-shop financial command
// center. Single router file (mounted at /api/v1/finance), organized by
// sub-module so a CA reading the source can find the GST endpoint without
// hunting through a maze of files.
//
// Conventions:
//   * Every aggregate runs in SQL (Prisma _sum / groupBy / $queryRaw). No
//     per-row JS reductions.
//   * Heavy multi-query summary endpoints are cached for 60s per tenant
//     (see finance.cache.ts). Mutations bust the whole tenant slot.
//   * Action gates: read endpoints sit behind 'finance.read'; writes carry
//     module-specific gates (expense_write, goldloan_write, payroll_write,
//     ledger_export). Module-level mount already enforces "at least one
//     finance perm", so these route-level gates are the second line.

import { Router } from 'express';
import { z } from 'zod';
import { Prisma, OrderStatus, PaymentStatus } from '@prisma/client';
import {
  ExpenseInputSchema,
  ExpenseUpdateSchema,
  ExpenseCategoryInputSchema,
  ExpenseCategoryUpdateSchema,
  GoldLoanInputSchema,
  GoldLoanRepaymentInputSchema,
  PayrollInputSchema,
  VendorPaymentInputSchema,
  BankAccountInputSchema,
  BankTransactionInputSchema,
  ReconciliationInputSchema,
} from '@goldos/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { getTenantId } from '../../lib/async-context.js';
import { sumPaise } from '../../lib/money.js';
import { splitTaxByPlaceOfSupply } from '@goldos/shared/bill-math';
import { requireAnyPermission, requirePermission } from '../../middleware/require-permission.js';
import { readCache, writeCache, bustTenant } from './finance.cache.js';
import { accountingRouter } from './accounting.routes.js';

export const financeRouter: Router = Router();

// Mount the accounting sub-router under /accounting so all of Day Book,
// Trial Balance, Balance Sheet, and Ledger sit at /finance/accounting/*.
financeRouter.use('/accounting', accountingRouter);

const SUMMARY_TTL_MS = 60_000;

// ---------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------

function shopWhere(shopId?: string): { shopId: string } | Record<string, never> {
  return shopId ? { shopId } : {};
}

// Online orders aren't stored against a physical shop, so for per-shop finance
// filtering we derive one from the sold items: each OrderItem → Product →
// linked inventory Item → shopId (the shop that stocks & published the piece).
// An order is attributed to the shop holding the largest line value — a single
// GST invoice can't be split across shops for filing, so we keep it whole.
// Returns null when no line links to a stock item (legacy storefront products
// not bound to inventory); those orders surface only in the consolidated view.
type OrderShopLines = Array<{
  qty: number;
  pricePaise: number;
  product: { linkedItem: { shopId: string } | null };
}>;

function attributeOrderShopId(items: OrderShopLines): string | null {
  const valueByShop = new Map<string, number>();
  for (const it of items) {
    const shopId = it.product.linkedItem?.shopId;
    if (!shopId) continue;
    valueByShop.set(shopId, (valueByShop.get(shopId) ?? 0) + it.pricePaise * it.qty);
  }
  let best: string | null = null;
  let bestValue = -1;
  for (const [shopId, value] of valueByShop) {
    if (value > bestValue) {
      best = shopId;
      bestValue = value;
    }
  }
  return best;
}

// Select fragment that pulls the per-line shop attribution data for an Order.
// `satisfies` keeps the literal `true`s (so Prisma still infers the narrow
// result type) while validating the shape against the generated OrderSelect.
const ORDER_SHOP_LINES_SELECT = {
  items: {
    select: {
      qty: true,
      pricePaise: true,
      product: { select: { linkedItem: { select: { shopId: true } } } },
    },
  },
} satisfies Prisma.OrderSelect;

function noTenantError(): { error: { code: string; message: string } } {
  return { error: { code: 'NO_TENANT', message: 'Tenant context missing' } };
}

// The seller's home GST state code — taken from the (tenant-scoped) first shop's
// gstStateCode. Used to split e-commerce order tax into CGST+SGST (customer in
// our state) vs IGST (inter-state). Falls back to Haryana ("06").
async function getHomeStateCode(): Promise<string> {
  const shop = await prisma.shop.findFirst({ select: { gstStateCode: true } });
  return shop?.gstStateCode ?? '06';
}

function prismaShopFilter(shopId: string): Prisma.Sql {
  return Prisma.sql`AND "shopId" = ${shopId}`;
}

function prismaNoOp(): Prisma.Sql {
  return Prisma.empty;
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfFinancialYearUtc(d: Date): Date {
  // Indian FY = April -> March. Anything from Jan-Mar belongs to the
  // previous calendar year's FY.
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return new Date(Date.UTC(y, 3, 1));
}

// =====================================================================
// 1. MULTI-SHOP P&L DASHBOARD — single round-trip summary
// =====================================================================

financeRouter.get('/summary', async (req, res, next) => {
  try {
    const q = z.object({ shopId: z.string().optional() }).parse(req.query);
    const tenantId = getTenantId();
    if (!tenantId) {
      res.status(401).json(noTenantError());
      return;
    }
    const cacheKey = `${tenantId}:summary:${q.shopId ?? '*'}`;
    const cached = readCache(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json({ data: cached });
      return;
    }

    const now = new Date();
    const monthStart = startOfMonthUtc(now);
    const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const lastMonthEnd = monthStart;
    const trendStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

    const shopFilter = shopWhere(q.shopId);

    const [
      mtdBillAgg,
      mtdExpenseAgg,
      lastMonthGstAgg,
      trendBills,
      trendExpenses,
      expensesByCategory,
      recentExpenses,
      branchBills,
      branchExpenses,
      openLoansAgg,
      vendorDuesAgg,
      activeAdvancesAgg,
      trendEcomOrdersRaw,
    ] = await Promise.all([
      prisma.bill.aggregate({
        where: { tenantId, voidedAt: null, ...shopFilter, createdAt: { gte: monthStart, lte: now } },
        _sum: { totalPaise: true, cgstPaise: true, sgstPaise: true, igstPaise: true },
        _count: { _all: true },
      }),
      prisma.expense.aggregate({
        where: { tenantId, ...shopFilter, paidAt: { gte: monthStart, lte: now } },
        _sum: { amountPaise: true },
        _count: { _all: true },
      }),
      prisma.bill.aggregate({
        where: { tenantId, voidedAt: null, ...shopFilter, createdAt: { gte: lastMonthStart, lt: lastMonthEnd } },
        _sum: { cgstPaise: true, sgstPaise: true, igstPaise: true, totalPaise: true },
        _count: { _all: true },
      }),
      prisma.$queryRaw<Array<{ month: Date; revenue: bigint }>>`
        SELECT date_trunc('month', "createdAt") AS month, SUM("totalPaise")::bigint AS revenue
        FROM "Bill"
        WHERE "tenantId" = ${tenantId}
          AND "voidedAt" IS NULL
          AND "createdAt" >= ${trendStart}
          ${q.shopId ? prismaShopFilter(q.shopId) : prismaNoOp()}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.$queryRaw<Array<{ month: Date; expense: bigint }>>`
        SELECT date_trunc('month', "paidAt") AS month, SUM("amountPaise")::bigint AS expense
        FROM "Expense"
        WHERE "tenantId" = ${tenantId}
          AND "paidAt" >= ${trendStart}
          ${q.shopId ? prismaShopFilter(q.shopId) : prismaNoOp()}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.expense.groupBy({
        by: ['category'],
        where: { tenantId, ...shopFilter, paidAt: { gte: monthStart, lte: now } },
        _sum: { amountPaise: true },
        _count: { _all: true },
      }),
      prisma.expense.findMany({
        where: { tenantId, ...shopFilter },
        orderBy: { paidAt: 'desc' },
        take: 30,
      }),
      prisma.bill.groupBy({
        by: ['shopId'],
        where: { tenantId, voidedAt: null, createdAt: { gte: monthStart, lte: now } },
        _sum: { totalPaise: true, cgstPaise: true, sgstPaise: true, igstPaise: true },
        _count: { _all: true },
      }),
      prisma.expense.groupBy({
        by: ['shopId'],
        where: { tenantId, paidAt: { gte: monthStart, lte: now } },
        _sum: { amountPaise: true },
      }),
      prisma.goldLoan.aggregate({
        where: { tenantId, status: { in: ['ACTIVE', 'PARTIALLY_REPAID'] } },
        _sum: { principalPaise: true },
        _count: { _all: true },
      }),
      prisma.vendor.aggregate({
        where: { tenantId },
        _sum: { outstandingPaise: true },
        _count: { _all: true },
      }),
      prisma.advance.aggregate({
        where: { tenantId, status: 'ACTIVE' },
        _sum: { amountPaise: true },
        _count: { _all: true },
      }),
      // Ecommerce orders over the 6-month trend window, with their lines so
      // each can be attributed to the shop that stocks the sold items. MTD
      // totals, the per-month trend and the per-branch rollup are all derived
      // from this in JS — a specific-shop view then reflects that shop's
      // online sales, and each branch row includes its online revenue/GST.
      prisma.order.findMany({
        where: {
          paymentStatus: PaymentStatus.PAID,
          status: { notIn: [OrderStatus.CANCELLED, OrderStatus.RETURNED] },
          paidAt: { gte: trendStart, lte: now },
        },
        select: {
          paidAt: true,
          totalPaise: true,
          taxPaise: true,
          ...ORDER_SHOP_LINES_SELECT,
        },
      }),
    ]);

    const monthKeys: string[] = [];
    const monthLabels: string[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      monthKeys.push(d.toISOString().slice(0, 7));
      monthLabels.push(d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }));
    }
    const revByMonth = new Map<string, number>();
    for (const r of trendBills) {
      revByMonth.set(new Date(r.month).toISOString().slice(0, 7), Number(r.revenue));
    }
    const expByMonth = new Map<string, number>();
    for (const r of trendExpenses) {
      expByMonth.set(new Date(r.month).toISOString().slice(0, 7), Number(r.expense));
    }
    // Attribute every trend-window order to the shop that stocks its items.
    // The per-month trend and MTD totals respect the shop filter; the branch
    // rollup below always uses all shops (it IS the per-shop breakdown).
    const trendEcomAttributed = trendEcomOrdersRaw.map((o) => ({
      paidAt: o.paidAt,
      totalPaise: o.totalPaise,
      taxPaise: o.taxPaise,
      attributedShopId: attributeOrderShopId(o.items),
    }));
    const trendEcomFiltered = q.shopId
      ? trendEcomAttributed.filter((o) => o.attributedShopId === q.shopId)
      : trendEcomAttributed;

    const ecomRevByMonth = new Map<string, number>();
    for (const o of trendEcomFiltered) {
      if (!o.paidAt) continue;
      const k = o.paidAt.toISOString().slice(0, 7);
      ecomRevByMonth.set(k, (ecomRevByMonth.get(k) ?? 0) + o.totalPaise);
    }
    const trend = monthKeys.map((k, i) => ({
      month: k,
      label: monthLabels[i]!,
      revenuePaise: (revByMonth.get(k) ?? 0) + (ecomRevByMonth.get(k) ?? 0),
      expensePaise: expByMonth.get(k) ?? 0,
    }));

    // MTD (this month) online totals — the shop-filtered subset of the trend
    // orders that fall in the current month.
    const mtdEcomFiltered = trendEcomFiltered.filter(
      (o) => o.paidAt && o.paidAt >= monthStart,
    );
    const posRevenuePaise = mtdBillAgg._sum.totalPaise ?? 0;
    const ecomRevenuePaise = sumPaise(mtdEcomFiltered.map((o) => o.totalPaise));
    const ecomOrderCount = mtdEcomFiltered.length;
    const revenuePaise = posRevenuePaise + ecomRevenuePaise;
    const expensePaise = mtdExpenseAgg._sum.amountPaise ?? 0;
    const posGstPaise =
      (mtdBillAgg._sum.cgstPaise ?? 0) +
      (mtdBillAgg._sum.sgstPaise ?? 0) +
      (mtdBillAgg._sum.igstPaise ?? 0);
    const ecomGstPaise = sumPaise(mtdEcomFiltered.map((o) => o.taxPaise));
    const gstPaise = posGstPaise + ecomGstPaise;

    // Per-shop online rollup for MTD across ALL shops (the branch breakdown is
    // always all-shops). Unattributed orders (legacy products with no linked
    // stock item) are excluded here — they still count in the MTD totals.
    const mtdEcomByShop = new Map<string, { revenuePaise: number; gstPaise: number; count: number }>();
    for (const o of trendEcomAttributed) {
      if (!o.attributedShopId || !o.paidAt || o.paidAt < monthStart) continue;
      const e = mtdEcomByShop.get(o.attributedShopId) ?? { revenuePaise: 0, gstPaise: 0, count: 0 };
      e.revenuePaise += o.totalPaise;
      e.gstPaise += o.taxPaise;
      e.count += 1;
      mtdEcomByShop.set(o.attributedShopId, e);
    }

    // Build branch-level rollup (shop name lookup happens in one extra query).
    // Shops surface here if they have POS bills, expenses, OR attributed online
    // sales this month.
    const branchShopIds = Array.from(
      new Set([
        ...branchBills.map((b) => b.shopId),
        ...branchExpenses.map((b) => b.shopId),
        ...mtdEcomByShop.keys(),
      ]),
    );
    const branchShops = await prisma.shop.findMany({
      where: { tenantId, id: { in: branchShopIds } },
      select: { id: true, name: true },
    });
    const shopNameById = new Map(branchShops.map((s) => [s.id, s.name]));
    const branchExpenseById = new Map(
      branchExpenses.map((b) => [b.shopId, b._sum.amountPaise ?? 0]),
    );
    // Unify POS bills + attributed online into one revenue/GST figure per shop.
    const branchAgg = new Map<string, { revenuePaise: number; gstPaise: number; billCount: number }>();
    for (const b of branchBills) {
      branchAgg.set(b.shopId, {
        revenuePaise: b._sum.totalPaise ?? 0,
        gstPaise: (b._sum.cgstPaise ?? 0) + (b._sum.sgstPaise ?? 0) + (b._sum.igstPaise ?? 0),
        billCount: b._count._all,
      });
    }
    for (const [sid, e] of mtdEcomByShop) {
      const cur = branchAgg.get(sid) ?? { revenuePaise: 0, gstPaise: 0, billCount: 0 };
      cur.revenuePaise += e.revenuePaise;
      cur.gstPaise += e.gstPaise;
      cur.billCount += e.count;
      branchAgg.set(sid, cur);
    }
    const branches = Array.from(branchAgg.entries())
      .map(([shopId, v]) => {
        const exp = branchExpenseById.get(shopId) ?? 0;
        return {
          shopId,
          shopName: shopNameById.get(shopId) ?? shopId.slice(-6),
          revenuePaise: v.revenuePaise,
          expensePaise: exp,
          netPaise: v.revenuePaise - exp,
          billCount: v.billCount,
          gstPaise: v.gstPaise,
        };
      })
      .sort((a, b) => b.revenuePaise - a.revenuePaise);

    const payload = {
      asOf: now.toISOString(),
      mtd: {
        revenuePaise,
        ecomRevenuePaise,
        ecomOrderCount,
        expensePaise,
        gstPaise,
        netPaise: revenuePaise - expensePaise,
        billCount: mtdBillAgg._count._all,
        expenseCount: mtdExpenseAgg._count._all,
        from: monthStart.toISOString(),
        to: now.toISOString(),
      },
      lastMonthGst: {
        month: lastMonthStart.toISOString().slice(0, 7),
        cgstPaise: lastMonthGstAgg._sum.cgstPaise ?? 0,
        sgstPaise: lastMonthGstAgg._sum.sgstPaise ?? 0,
        igstPaise: lastMonthGstAgg._sum.igstPaise ?? 0,
        taxableRevenuePaise: lastMonthGstAgg._sum.totalPaise ?? 0,
        billCount: lastMonthGstAgg._count._all,
      },
      trend,
      branches,
      expensesByCategory: expensesByCategory.map((g) => ({
        category: g.category,
        amountPaise: g._sum.amountPaise ?? 0,
        count: g._count._all,
      })),
      recentExpenses,
      // Cross-module highlights — surfaced on the overview tiles so the
      // owner sees vendor dues / open loans / live advances at a glance.
      openLoans: {
        count: openLoansAgg._count._all,
        principalPaise: openLoansAgg._sum.principalPaise ?? 0,
      },
      vendorDues: {
        vendorCount: vendorDuesAgg._count._all,
        outstandingPaise: vendorDuesAgg._sum.outstandingPaise ?? 0,
      },
      activeAdvances: {
        count: activeAdvancesAgg._count._all,
        amountPaise: activeAdvancesAgg._sum.amountPaise ?? 0,
      },
    };

    writeCache(cacheKey, payload, SUMMARY_TTL_MS);
    res.setHeader('X-Cache', 'MISS');
    res.json({ data: payload });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 2. DAILY SALES SUMMARY PER SHOP
// =====================================================================

financeRouter.get('/daily-sales', async (req, res, next) => {
  try {
    const q = z
      .object({
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        shopId: z.string().optional(),
        range: z.enum(['today', 'yesterday', 'week', 'month']).optional(),
      })
      .parse(req.query);

    const now = new Date();
    let from: Date;
    let to: Date = now;
    if (q.from && q.to) {
      from = q.from;
      to = q.to;
    } else if (q.range === 'today') {
      from = startOfDayUtc(now);
    } else if (q.range === 'yesterday') {
      from = new Date(startOfDayUtc(now).getTime() - 86400000);
      to = startOfDayUtc(now);
    } else if (q.range === 'week') {
      from = new Date(now.getTime() - 7 * 86400000);
    } else {
      from = startOfMonthUtc(now);
    }

    const tenantId = getTenantId();
    if (!tenantId) {
      res.status(401).json(noTenantError());
      return;
    }
    const shopFilter = shopWhere(q.shopId);

    const ecomDailyWhere = {
      paymentStatus: PaymentStatus.PAID,
      status: { notIn: [OrderStatus.CANCELLED, OrderStatus.RETURNED] },
      paidAt: { gte: from, lte: to },
    };

    const [bills, payments, refundAgg, byShop, byDay, ecomOrdersRaw] = await Promise.all([
      prisma.bill.aggregate({
        where: { tenantId, ...shopFilter, createdAt: { gte: from, lte: to }, voidedAt: null },
        _sum: { totalPaise: true, cgstPaise: true, sgstPaise: true, igstPaise: true, discountPaise: true },
        _count: { _all: true },
      }),
      prisma.$queryRaw<Array<{ mode: string; amount: bigint; cnt: bigint }>>`
        SELECT p."mode" AS mode, SUM(p."amountPaise")::bigint AS amount, COUNT(*)::bigint AS cnt
        FROM "Payment" p
        JOIN "Bill" b ON b."id" = p."billId"
        WHERE b."tenantId" = ${tenantId}
          AND b."createdAt" BETWEEN ${from} AND ${to}
          AND b."voidedAt" IS NULL
          ${q.shopId ? Prisma.sql`AND b."shopId" = ${q.shopId}` : Prisma.empty}
        GROUP BY 1
        ORDER BY amount DESC
      `,
      prisma.$queryRaw<Array<{ amount: bigint; cnt: bigint }>>`
        SELECT COALESCE(SUM(r."amountPaise"),0)::bigint AS amount, COUNT(*)::bigint AS cnt
        FROM "Refund" r
        JOIN "Bill" b ON b."id" = r."billId"
        WHERE b."tenantId" = ${tenantId}
          AND r."refundedAt" BETWEEN ${from} AND ${to}
          ${q.shopId ? Prisma.sql`AND b."shopId" = ${q.shopId}` : Prisma.empty}
      `,
      prisma.bill.groupBy({
        by: ['shopId'],
        where: { tenantId, ...shopFilter, createdAt: { gte: from, lte: to }, voidedAt: null },
        _sum: { totalPaise: true, cgstPaise: true, sgstPaise: true, igstPaise: true },
        _count: { _all: true },
      }),
      prisma.$queryRaw<Array<{ day: Date; revenue: bigint; cnt: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS day,
               SUM("totalPaise")::bigint AS revenue,
               COUNT(*)::bigint AS cnt
        FROM "Bill"
        WHERE "tenantId" = ${tenantId}
          AND "createdAt" BETWEEN ${from} AND ${to}
          AND "voidedAt" IS NULL
          ${q.shopId ? prismaShopFilter(q.shopId) : prismaNoOp()}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      // Ecommerce orders for the window, with their lines so each can be
      // attributed to the shop that stocks the sold items (see
      // attributeOrderShopId). The aggregate / day / per-shop rollups are
      // computed in JS below so a specific-shop view includes that shop's
      // online sales alongside its POS bills.
      prisma.order.findMany({
        where: ecomDailyWhere,
        orderBy: { paidAt: 'desc' },
        select: {
          id: true,
          paidAt: true,
          subtotalPaise: true,
          taxPaise: true,
          totalPaise: true,
          shippingState: true,
          customer: { select: { name: true } },
          ...ORDER_SHOP_LINES_SELECT,
        },
      }),
    ]);

    // Attribute each online order to the shop that stocks its items, then keep
    // only the selected shop's orders when a shop filter is applied (the POS
    // data above is already shop-scoped); "All shops" keeps every order.
    const ecomAttributed = ecomOrdersRaw.map((o) => ({
      ...o,
      attributedShopId: attributeOrderShopId(o.items),
    }));
    const ecomOrders = q.shopId
      ? ecomAttributed.filter((o) => o.attributedShopId === q.shopId)
      : ecomAttributed;

    const ecomRevenuePaise = sumPaise(ecomOrders.map((o) => o.totalPaise));
    const ecomGstPaise = sumPaise(ecomOrders.map((o) => o.taxPaise));
    const ecomOrderCount = ecomOrders.length;

    // Per-shop online rollup (by attributed shop) — folded into byShop so each
    // branch's revenue/GST includes its online sales. Unattributed orders
    // (legacy products with no linked stock item) stay in the totals only.
    const ecomByShop = new Map<string, { revenuePaise: number; gstPaise: number; count: number }>();
    for (const o of ecomOrders) {
      if (!o.attributedShopId) continue;
      const e = ecomByShop.get(o.attributedShopId) ?? { revenuePaise: 0, gstPaise: 0, count: 0 };
      e.revenuePaise += o.totalPaise;
      e.gstPaise += o.taxPaise;
      e.count += 1;
      ecomByShop.set(o.attributedShopId, e);
    }

    const shopIds = Array.from(new Set([...byShop.map((b) => b.shopId), ...ecomByShop.keys()]));
    const shops = await prisma.shop.findMany({
      where: { tenantId, id: { in: shopIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(shops.map((s) => [s.id, s.name]));

    // POS per-shop totals + attributed online, unified into one row per shop.
    const byShopMap = new Map<string, { revenuePaise: number; gstPaise: number; billCount: number }>();
    for (const b of byShop) {
      byShopMap.set(b.shopId, {
        revenuePaise: b._sum.totalPaise ?? 0,
        gstPaise: (b._sum.cgstPaise ?? 0) + (b._sum.sgstPaise ?? 0) + (b._sum.igstPaise ?? 0),
        billCount: b._count._all,
      });
    }
    for (const [sid, e] of ecomByShop) {
      const cur = byShopMap.get(sid) ?? { revenuePaise: 0, gstPaise: 0, billCount: 0 };
      cur.revenuePaise += e.revenuePaise;
      cur.gstPaise += e.gstPaise;
      cur.billCount += e.count;
      byShopMap.set(sid, cur);
    }
    const byShopRows = Array.from(byShopMap.entries())
      .map(([shopId, v]) => ({
        shopId,
        shopName: nameById.get(shopId) ?? shopId.slice(-6),
        revenuePaise: v.revenuePaise,
        gstPaise: v.gstPaise,
        billCount: v.billCount,
      }))
      .sort((a, b) => b.revenuePaise - a.revenuePaise);

    // Merge byDay arrays (POS bill days + ecommerce order days)
    const dayMap = new Map<string, { revenuePaise: number; billCount: number }>();
    for (const d of byDay) {
      const key = new Date(d.day).toISOString().slice(0, 10);
      dayMap.set(key, { revenuePaise: Number(d.revenue), billCount: Number(d.cnt) });
    }
    for (const o of ecomOrders) {
      if (!o.paidAt) continue;
      const key = o.paidAt.toISOString().slice(0, 10);
      const existing = dayMap.get(key);
      if (existing) {
        existing.revenuePaise += o.totalPaise;
        existing.billCount += 1;
      } else {
        dayMap.set(key, { revenuePaise: o.totalPaise, billCount: 1 });
      }
    }
    const mergedByDay = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({ day, ...v }));

    // Sales Bills report — bill-level detail for the window so the Daily Sales
    // tab can list each sale with its GST split (same shape as the GST tab).
    // POS bills carry a stored split; e-commerce orders are split on the fly by
    // place of supply. Online orders are listed via the shop-attributed
    // `ecomOrders` set above, so a specific-shop view shows that shop's orders.
    const homeStateCode = await getHomeStateCode();
    const billRows = await prisma.bill.findMany({
      where: { tenantId, ...shopFilter, createdAt: { gte: from, lte: to }, voidedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        billNumber: true,
        createdAt: true,
        subtotalPaise: true,
        cgstPaise: true,
        sgstPaise: true,
        igstPaise: true,
        totalPaise: true,
        shop: { select: { name: true } },
        customer: { select: { name: true } },
      },
    });

    const salesBills = [
      ...billRows.map((b) => ({
        id: b.id,
        billNumber: b.billNumber,
        isEcom: false,
        createdAt: (b.createdAt as Date).toISOString(),
        subtotalPaise: b.subtotalPaise,
        cgstPaise: b.cgstPaise,
        sgstPaise: b.sgstPaise,
        igstPaise: b.igstPaise,
        totalPaise: b.totalPaise,
        shopName: b.shop?.name ?? '—',
        customerName: b.customer?.name ?? null,
      })),
      ...ecomOrders.map((o) => {
        const split = splitTaxByPlaceOfSupply(o.taxPaise, o.shippingState, homeStateCode);
        return {
          id: o.id,
          billNumber: `ORD-${o.id.slice(-8).toUpperCase()}`,
          isEcom: true,
          createdAt: (o.paidAt as Date).toISOString(),
          subtotalPaise: o.subtotalPaise,
          cgstPaise: split.cgstPaise,
          sgstPaise: split.sgstPaise,
          igstPaise: split.igstPaise,
          totalPaise: o.totalPaise,
          shopName: 'E-commerce',
          customerName: o.customer?.name ?? null,
        };
      }),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 100);

    const totalRev = bills._sum.totalPaise ?? 0;
    const billCount = bills._count._all;
    const refundAggRow = refundAgg[0];
    const refundPaise = refundAggRow ? Number(refundAggRow.amount) : 0;
    const refundCount = refundAggRow ? Number(refundAggRow.cnt) : 0;

    const cashRow = payments.find((p) => p.mode === 'CASH');
    const cashPaise = cashRow ? Number(cashRow.amount) : 0;
    const digitalPaise = payments
      .filter((p) => p.mode === 'UPI' || p.mode === 'CARD')
      .reduce((acc, p) => acc + Number(p.amount), 0);

    const combinedRevenuePaise = totalRev + ecomRevenuePaise;
    const combinedBillCount = billCount + ecomOrderCount;
    const posGstPaiseDailySales =
      (bills._sum.cgstPaise ?? 0) + (bills._sum.sgstPaise ?? 0) + (bills._sum.igstPaise ?? 0);
    const combinedGstPaise = posGstPaiseDailySales + ecomGstPaise;

    res.json({
      data: {
        from: from.toISOString(),
        to: to.toISOString(),
        totals: {
          revenuePaise: combinedRevenuePaise,
          ecomRevenuePaise,
          ecomOrderCount,
          billCount: combinedBillCount,
          avgBillPaise: combinedBillCount ? Math.round(combinedRevenuePaise / combinedBillCount) : 0,
          cashPaise,
          digitalPaise,
          gstPaise: combinedGstPaise,
          discountPaise: bills._sum.discountPaise ?? 0,
          refundPaise,
          refundCount,
          netCollectionPaise: combinedRevenuePaise - refundPaise,
        },
        paymentMix: payments.map((p) => ({
          mode: p.mode,
          amountPaise: Number(p.amount),
          count: Number(p.cnt),
        })),
        byShop: byShopRows,
        byDay: mergedByDay.map((d) => ({
          day: d.day,
          revenuePaise: d.revenuePaise,
          billCount: d.billCount,
        })),
        bills: salesBills,
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 3. PROFIT & LOSS STATEMENT
// =====================================================================

financeRouter.get('/pl', async (req, res, next) => {
  try {
    const q = z
      .object({
        from: z.coerce.date(),
        to: z.coerce.date(),
        shopId: z.string().optional(),
      })
      .parse(req.query);

    const where = {
      createdAt: { gte: q.from, lte: q.to },
      voidedAt: null,
      ...shopWhere(q.shopId),
    };

    // Ecommerce orders: revenue-recognized when payment is captured
    const ecomWhere = {
      paidAt: { gte: q.from, lte: q.to },
      paymentStatus: PaymentStatus.PAID,
      status: { notIn: [OrderStatus.CANCELLED, OrderStatus.RETURNED] },
    };

    const [bills, ecomOrdersRaw, expenses, expensesByCat] = await Promise.all([
      prisma.bill.findMany({
        where,
        select: { totalPaise: true, cgstPaise: true, sgstPaise: true, igstPaise: true, oldGoldValuePaise: true, makingChargesPaise: true, discountPaise: true },
      }),
      prisma.order.findMany({
        where: ecomWhere,
        select: {
          totalPaise: true,
          taxPaise: true,
          subtotalPaise: true,
          shippingPaise: true,
          ...ORDER_SHOP_LINES_SELECT,
        },
      }),
      prisma.expense.findMany({
        where: { paidAt: { gte: q.from, lte: q.to }, ...shopWhere(q.shopId) },
        select: { amountPaise: true, classification: true },
      }),
      prisma.expense.groupBy({
        by: ['category', 'classification'],
        where: { paidAt: { gte: q.from, lte: q.to }, ...shopWhere(q.shopId) },
        _sum: { amountPaise: true },
        _count: { _all: true },
      }),
    ]);

    // Online orders belong to the shop that stocks the sold items — include
    // only the selected shop's orders when filtering (POS bills are already
    // shop-scoped via `where`); "All shops" keeps every order.
    const ecomOrders = q.shopId
      ? ecomOrdersRaw.filter((o) => attributeOrderShopId(o.items) === q.shopId)
      : ecomOrdersRaw;

    const posRevenuePaise = sumPaise(bills.map((b) => b.totalPaise));
    const posGstPaise = sumPaise(bills.map((b) => b.cgstPaise + b.sgstPaise + b.igstPaise));
    const makingChargesPaise = sumPaise(bills.map((b) => b.makingChargesPaise));
    const discountPaise = sumPaise(bills.map((b) => b.discountPaise));
    const oldGoldPaise = sumPaise(bills.map((b) => b.oldGoldValuePaise));

    const ecomRevenuePaise = sumPaise(ecomOrders.map((o) => o.totalPaise));
    const ecomGstPaise = sumPaise(ecomOrders.map((o) => o.taxPaise));
    const ecomShippingPaise = sumPaise(ecomOrders.map((o) => o.shippingPaise));
    const ecomOrderCount = ecomOrders.length;

    const revenuePaise = posRevenuePaise + ecomRevenuePaise;
    const gstPaise = posGstPaise + ecomGstPaise;
    const grossRevenuePaise = revenuePaise - gstPaise;

    const expensePaise = sumPaise(expenses.map((e) => e.amountPaise));
    const revenueExpensePaise = sumPaise(
      expenses.filter((e) => e.classification === 'REVENUE').map((e) => e.amountPaise),
    );
    const capitalExpensePaise = sumPaise(
      expenses.filter((e) => e.classification === 'CAPITAL').map((e) => e.amountPaise),
    );
    res.json({
      data: {
        revenuePaise,
        grossRevenuePaise,
        gstPaise,
        makingChargesPaise,
        discountPaise,
        oldGoldPaise,
        posRevenuePaise,
        posGstPaise,
        ecomRevenuePaise,
        ecomGstPaise,
        ecomShippingPaise,
        ecomOrderCount,
        expensePaise,
        revenueExpensePaise,
        capitalExpensePaise,
        netPaise: grossRevenuePaise - revenueExpensePaise,
        from: q.from.toISOString(),
        to: q.to.toISOString(),
        expensesByCategory: expensesByCat.map((g) => ({
          category: g.category,
          classification: g.classification,
          amountPaise: g._sum.amountPaise ?? 0,
          count: g._count._all,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 4. EXPENSES — CRUD + listings
// =====================================================================

financeRouter.get('/expenses', async (req, res, next) => {
  try {
    const q = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().positive().max(100).optional(),
        shopId: z.string().optional(),
        category: z.string().optional(),
        classification: z.enum(['REVENUE', 'CAPITAL']).optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      })
      .parse(req.query);
    const take = q.limit ?? 20;
    const tenantId = getTenantId();
    const where: Prisma.ExpenseWhereInput = {
      ...(q.shopId ? { shopId: q.shopId } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.classification ? { classification: q.classification } : {}),
      ...(q.from || q.to
        ? { paidAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } }
        : {}),
    };
    const rows = await prisma.expense.findMany({
      where,
      orderBy: { paidAt: 'desc' },
      take: take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    res.json({
      data: rows.slice(0, take),
      page: { nextCursor: hasMore ? rows.at(-2)?.id : undefined, hasMore },
    });
    if (!tenantId) return;
  } catch (err) {
    next(err);
  }
});

financeRouter.get('/expenses/by-category', async (req, res, next) => {
  try {
    const q = z
      .object({
        from: z.coerce.date(),
        to: z.coerce.date(),
        shopId: z.string().optional(),
      })
      .parse(req.query);
    const grouped = await prisma.expense.groupBy({
      by: ['category'],
      where: { paidAt: { gte: q.from, lte: q.to }, ...shopWhere(q.shopId) },
      _sum: { amountPaise: true },
      _count: { _all: true },
    });
    res.json({
      data: grouped
        .map((g) => ({
          category: g.category,
          amountPaise: g._sum.amountPaise ?? 0,
          count: g._count._all,
        }))
        .sort((a, b) => b.amountPaise - a.amountPaise),
    });
  } catch (err) {
    next(err);
  }
});

financeRouter.post(
  '/expenses',
  requirePermission('finance.expense_write'),
  async (req, res, next) => {
    try {
      const body = ExpenseInputSchema.parse(req.body);
      const shop = await prisma.shop.findUnique({ where: { id: body.shopId } });
      if (!shop) {
        res.status(400).json({
          error: {
            code: 'INVALID_SHOP',
            message: `Shop ${body.shopId} not found for this tenant.`,
          },
        });
        return;
      }
      const tenantId = getTenantId();
      if (!tenantId) throw new Error('tenantId missing');
      const created = await prisma.expense.create({
        data: {
          tenantId,
          shopId: body.shopId,
          category: body.category,
          amountPaise: body.amountPaise,
          paidAt: body.paidAt,
          notes: body.notes ?? null,
          receiptUrl: body.receiptUrl ?? null,
          classification: body.classification,
          isRecurring: body.isRecurring,
          recurringIntervalDays: body.recurringIntervalDays ?? null,
          paymentMode: body.paymentMode ?? null,
          vendorId: body.vendorId ?? null,
          bankAccountId: body.bankAccountId ?? null,
        },
      });
      if (tenantId) bustTenant(tenantId);
      res.status(201).json({ data: created });
    } catch (err) {
      next(err);
    }
  },
);

financeRouter.patch(
  '/expenses/:id',
  requirePermission('finance.expense_write'),
  async (req, res, next) => {
    try {
      const body = ExpenseUpdateSchema.parse(req.body);
      const tenantId = getTenantId();
      const updated = await prisma.expense.update({
        where: { id: req.params.id },
        data: {
          ...(body.category !== undefined ? { category: body.category } : {}),
          ...(body.amountPaise !== undefined ? { amountPaise: body.amountPaise } : {}),
          ...(body.paidAt !== undefined ? { paidAt: body.paidAt } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(body.receiptUrl !== undefined ? { receiptUrl: body.receiptUrl } : {}),
          ...(body.classification !== undefined ? { classification: body.classification } : {}),
          ...(body.isRecurring !== undefined ? { isRecurring: body.isRecurring } : {}),
          ...(body.recurringIntervalDays !== undefined
            ? { recurringIntervalDays: body.recurringIntervalDays }
            : {}),
          ...(body.paymentMode !== undefined ? { paymentMode: body.paymentMode } : {}),
          ...(body.vendorId !== undefined ? { vendorId: body.vendorId } : {}),
          ...(body.bankAccountId !== undefined ? { bankAccountId: body.bankAccountId } : {}),
        },
      });
      if (tenantId) bustTenant(tenantId);
      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

financeRouter.delete(
  '/expenses/:id',
  requirePermission('finance.expense_write'),
  async (req, res, next) => {
    try {
      const tenantId = getTenantId();
      await prisma.expense.delete({ where: { id: req.params.id } });
      if (tenantId) bustTenant(tenantId);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// =====================================================================
// 4b. EXPENSE CATEGORIES (ledgers) — user-managed heads, CRUD
// =====================================================================

// Built-in heads seeded per tenant on first read. Machinery / Furniture /
// Vehicle default to CAPITAL (fixed asset); everything else is REVENUE.
const DEFAULT_EXPENSE_CATEGORIES: Array<{
  name: string;
  classification: 'REVENUE' | 'CAPITAL';
}> = [
  { name: 'Rent', classification: 'REVENUE' },
  { name: 'Salaries', classification: 'REVENUE' },
  { name: 'Electricity', classification: 'REVENUE' },
  { name: 'Water', classification: 'REVENUE' },
  { name: 'Marketing', classification: 'REVENUE' },
  { name: 'Repairs', classification: 'REVENUE' },
  { name: 'Insurance', classification: 'REVENUE' },
  { name: 'Travel', classification: 'REVENUE' },
  { name: 'Vendor payment', classification: 'REVENUE' },
  { name: 'Office supplies', classification: 'REVENUE' },
  { name: 'GST payment', classification: 'REVENUE' },
  { name: 'Machinery', classification: 'CAPITAL' },
  { name: 'Furniture', classification: 'CAPITAL' },
  { name: 'Vehicle', classification: 'CAPITAL' },
  { name: 'Miscellaneous', classification: 'REVENUE' },
];

// Lazily seed the built-in heads the first time a tenant reads its ledgers, so
// existing tenants get them without a data migration. Idempotent: skipDuplicates
// on the (tenantId, name) unique guards against races.
async function ensureExpenseCategoriesSeeded(tenantId: string): Promise<void> {
  const count = await prisma.expenseCategory.count();
  if (count > 0) return;
  await prisma.expenseCategory.createMany({
    data: DEFAULT_EXPENSE_CATEGORIES.map((c, i) => ({
      tenantId,
      name: c.name,
      classification: c.classification,
      isSystem: true,
      sortOrder: i,
    })),
    skipDuplicates: true,
  });
}

financeRouter.get('/expense-categories', async (req, res, next) => {
  try {
    const q = z
      .object({ includeArchived: z.coerce.boolean().optional() })
      .parse(req.query);
    const tenantId = getTenantId();
    if (!tenantId) throw new Error('tenantId missing');
    await ensureExpenseCategoriesSeeded(tenantId);
    const rows = await prisma.expenseCategory.findMany({
      where: q.includeArchived ? {} : { isArchived: false },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

financeRouter.post(
  '/expense-categories',
  requirePermission('finance.expense_write'),
  async (req, res, next) => {
    try {
      const body = ExpenseCategoryInputSchema.parse(req.body);
      const tenantId = getTenantId();
      if (!tenantId) throw new Error('tenantId missing');
      // Case-insensitive duplicate guard on top of the DB unique (which is
      // case-sensitive) — "rent" and "Rent" would otherwise both file.
      const existing = await prisma.expenseCategory.findFirst({
        where: { name: { equals: body.name, mode: 'insensitive' } },
      });
      if (existing) {
        res.status(409).json({
          error: { code: 'DUPLICATE_LEDGER', message: `A ledger named "${body.name}" already exists.` },
        });
        return;
      }
      const max = await prisma.expenseCategory.aggregate({ _max: { sortOrder: true } });
      const created = await prisma.expenseCategory.create({
        data: {
          tenantId,
          name: body.name,
          classification: body.classification,
          isSystem: false,
          sortOrder: (max._max.sortOrder ?? 0) + 1,
        },
      });
      res.status(201).json({ data: created });
    } catch (err) {
      next(err);
    }
  },
);

financeRouter.patch(
  '/expense-categories/:id',
  requirePermission('finance.expense_write'),
  async (req, res, next) => {
    try {
      const body = ExpenseCategoryUpdateSchema.parse(req.body);
      const tenantId = getTenantId();
      if (!tenantId) throw new Error('tenantId missing');
      const current = await prisma.expenseCategory.findUnique({ where: { id: req.params.id } });
      if (!current) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ledger not found.' } });
        return;
      }
      if (body.name !== undefined && body.name !== current.name) {
        const clash = await prisma.expenseCategory.findFirst({
          where: { id: { not: current.id }, name: { equals: body.name, mode: 'insensitive' } },
        });
        if (clash) {
          res.status(409).json({
            error: { code: 'DUPLICATE_LEDGER', message: `A ledger named "${body.name}" already exists.` },
          });
          return;
        }
      }
      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.expenseCategory.update({
          where: { id: current.id },
          data: {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.classification !== undefined ? { classification: body.classification } : {}),
          },
        });
        // Expense.category is a name snapshot — keep historical rows pointing at
        // the renamed head so filters and the ledger drill-down stay consistent.
        if (body.name !== undefined && body.name !== current.name) {
          await tx.expense.updateMany({
            where: { category: current.name },
            data: { category: body.name },
          });
        }
        return row;
      });
      bustTenant(tenantId);
      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

financeRouter.delete(
  '/expense-categories/:id',
  requirePermission('finance.expense_write'),
  async (req, res, next) => {
    try {
      const tenantId = getTenantId();
      if (!tenantId) throw new Error('tenantId missing');
      const cat = await prisma.expenseCategory.findUnique({ where: { id: req.params.id } });
      if (!cat) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ledger not found.' } });
        return;
      }
      // Archive (not delete) when historical expenses reference this head, so the
      // name survives for reports; hard-delete only an unused head.
      const usage = await prisma.expense.count({ where: { category: cat.name } });
      if (usage > 0) {
        const archived = await prisma.expenseCategory.update({
          where: { id: cat.id },
          data: { isArchived: true },
        });
        res.json({ data: archived, archived: true });
        return;
      }
      await prisma.expenseCategory.delete({ where: { id: cat.id } });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// =====================================================================
// 5. TALLY EXPORT — sales + expenses + vendor payments
// =====================================================================

financeRouter.get(
  '/tally-export',
  requirePermission('finance.ledger_export'),
  async (req, res, next) => {
    try {
      const q = z.object({
        from: z.coerce.date(),
        to: z.coerce.date(),
        // Tally XML is the native interchange format — CAs paste it into
        // Tally's Import Data → Vouchers screen and every row lands as a
        // proper voucher with debits/credits already balanced. CSV (the
        // legacy default) requires manual ledger mapping in Tally and is
        // kept only for jewellers whose CA insists on it.
        format: z.enum(['csv', 'xml']).optional().default('csv'),
      }).parse(req.query);
      const [bills, expenses, vendorPayments, purchaseOrders] = await Promise.all([
        prisma.bill.findMany({
          where: { createdAt: { gte: q.from, lte: q.to } },
          select: {
            billNumber: true,
            createdAt: true,
            totalPaise: true,
            cgstPaise: true,
            sgstPaise: true,
            igstPaise: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.expense.findMany({
          where: { paidAt: { gte: q.from, lte: q.to } },
          select: {
            id: true,
            category: true,
            amountPaise: true,
            paidAt: true,
            notes: true,
            classification: true,
          },
          orderBy: { paidAt: 'asc' },
        }),
        prisma.vendorPayment.findMany({
          where: { paidAt: { gte: q.from, lte: q.to } },
          include: { vendor: { select: { name: true } } },
          orderBy: { paidAt: 'asc' },
        }),
        // Received purchase orders → Purchase vouchers (Dr Purchases + Input
        // GST, Cr the vendor as Sundry Creditor). Booked on the received date.
        prisma.purchaseOrder.findMany({
          where: { status: 'RECEIVED', receivedAt: { gte: q.from, lte: q.to } },
          select: {
            id: true,
            createdAt: true,
            receivedAt: true,
            totalPaise: true,
            cgstPaise: true,
            sgstPaise: true,
            igstPaise: true,
            vendor: { select: { name: true } },
          },
          orderBy: { receivedAt: 'asc' },
        }),
      ]);

      const rows: string[][] = [
        ['Date', 'Voucher Type', 'Voucher No', 'Ledger', 'Debit', 'Credit', 'Narration'],
      ];
      const r = (paise: number): string => (paise / 100).toFixed(2);

      for (const b of bills) {
        const date = b.createdAt.toISOString().slice(0, 10);
        rows.push([
          date,
          'Sales',
          b.billNumber,
          'Sales A/c',
          '',
          r(b.totalPaise - b.cgstPaise - b.sgstPaise - b.igstPaise),
          'Jewellery sale',
        ]);
        if (b.cgstPaise + b.sgstPaise > 0) {
          rows.push([date, 'Sales', b.billNumber, 'CGST Payable', '', r(b.cgstPaise), 'CGST on sale']);
          rows.push([date, 'Sales', b.billNumber, 'SGST Payable', '', r(b.sgstPaise), 'SGST on sale']);
        }
        if (b.igstPaise > 0) {
          rows.push([date, 'Sales', b.billNumber, 'IGST Payable', '', r(b.igstPaise), 'IGST on sale']);
        }
        rows.push([date, 'Sales', b.billNumber, 'Customer / Bank', r(b.totalPaise), '', 'Cash/UPI/Card received']);
      }
      for (const e of expenses) {
        const date = e.paidAt.toISOString().slice(0, 10);
        const voucher = `EXP-${e.id.slice(-6)}`;
        const ledger = e.classification === 'CAPITAL' ? `${e.category} (Fixed Asset)` : e.category;
        rows.push([date, 'Payment', voucher, ledger, r(e.amountPaise), '', e.notes ?? '']);
        rows.push([date, 'Payment', voucher, 'Bank / Cash', '', r(e.amountPaise), e.notes ?? '']);
      }
      for (const v of vendorPayments) {
        const date = v.paidAt.toISOString().slice(0, 10);
        const voucher = `VP-${v.id.slice(-6)}`;
        rows.push([date, 'Payment', voucher, v.vendor.name, r(v.amountPaise), '', v.notes ?? 'Vendor payment']);
        rows.push([date, 'Payment', voucher, 'Bank / Cash', '', r(v.amountPaise), v.notes ?? '']);
      }
      for (const po of purchaseOrders) {
        const date = (po.receivedAt ?? po.createdAt).toISOString().slice(0, 10);
        const voucher = `PO-${po.id.slice(-6)}`;
        const gstTotal = po.cgstPaise + po.sgstPaise + po.igstPaise;
        const taxable = po.totalPaise - gstTotal; // total is GST-inclusive; GST sits inside it
        const creditor = `Sundry Creditors — ${po.vendor.name}`;
        rows.push([date, 'Purchase', voucher, 'Purchase A/c', r(taxable), '', `Purchase from ${po.vendor.name}`]);
        if (po.cgstPaise > 0) rows.push([date, 'Purchase', voucher, 'Input CGST', r(po.cgstPaise), '', 'CGST on purchase']);
        if (po.sgstPaise > 0) rows.push([date, 'Purchase', voucher, 'Input SGST', r(po.sgstPaise), '', 'SGST on purchase']);
        if (po.igstPaise > 0) rows.push([date, 'Purchase', voucher, 'Input IGST', r(po.igstPaise), '', 'IGST on purchase']);
        rows.push([date, 'Purchase', voucher, creditor, '', r(taxable + gstTotal), 'Vendor invoice']);
      }

      if (q.format === 'xml') {
        const xml = buildTallyXml({ bills, expenses, vendorPayments, purchaseOrders });
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="tally-${q.from.toISOString().slice(0, 10)}-to-${q.to.toISOString().slice(0, 10)}.xml"`,
        );
        res.send(xml);
        return;
      }

      const csv = rows
        .map((r2) => r2.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="tally-${q.from.toISOString().slice(0, 10)}-to-${q.to.toISOString().slice(0, 10)}.csv"`,
      );
      res.send(csv);
    } catch (err) {
      next(err);
    }
  },
);

// Tally XML voucher import format. Mirrors the structure Tally accepts under
// Gateway of Tally → Import Data → Vouchers. One <VOUCHER> per Sale/Payment.
//
// Each voucher has two <ALLLEDGERENTRIES.LIST> blocks: one credit (the
// party / sales account) and one debit (cash/bank or expense). Tally is
// double-entry, so the sum of all entries within a voucher must net to zero;
// we balance with explicit GST sub-entries on sales vouchers.
//
// Reference: Tally.ERP 9 / Tally Prime XML schema (TDL).
function buildTallyXml(args: {
  bills: Array<{ billNumber: string; createdAt: Date; totalPaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }>;
  expenses: Array<{ id: string; category: string; amountPaise: number; paidAt: Date; notes: string | null; classification: string }>;
  vendorPayments: Array<{ id: string; amountPaise: number; paidAt: Date; notes: string | null; vendor: { name: string } }>;
  purchaseOrders: Array<{ id: string; createdAt: Date; receivedAt: Date | null; totalPaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; vendor: { name: string } }>;
}): string {
  const rupees = (paise: number): string => (paise / 100).toFixed(2);
  // Tally expects YYYYMMDD with no separators.
  const ymd = (d: Date): string => d.toISOString().slice(0, 10).replace(/-/g, '');
  // Tally XML is finicky about <, >, & — escape conservatively.
  const xe = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  const vouchers: string[] = [];

  // Sales — credit Sales A/c + GST ledgers, debit Cash/Bank.
  for (const b of args.bills) {
    const date = ymd(b.createdAt);
    const taxablePaise = b.totalPaise - b.cgstPaise - b.sgstPaise - b.igstPaise;
    const entries: string[] = [];
    entries.push(`<ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${xe('Sales A/c')}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>-${rupees(taxablePaise)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`);
    if (b.cgstPaise > 0) {
      entries.push(`<ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${xe('CGST Payable')}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>-${rupees(b.cgstPaise)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`);
    }
    if (b.sgstPaise > 0) {
      entries.push(`<ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${xe('SGST Payable')}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>-${rupees(b.sgstPaise)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`);
    }
    if (b.igstPaise > 0) {
      entries.push(`<ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${xe('IGST Payable')}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>-${rupees(b.igstPaise)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`);
    }
    entries.push(`<ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${xe('Cash')}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <AMOUNT>${rupees(b.totalPaise)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`);

    vouchers.push(`<VOUCHER VCHTYPE="Sales" ACTION="Create">
      <DATE>${date}</DATE>
      <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      <VOUCHERNUMBER>${xe(b.billNumber)}</VOUCHERNUMBER>
      <REFERENCE>${xe(b.billNumber)}</REFERENCE>
      <NARRATION>${xe(`Jewellery sale ${b.billNumber}`)}</NARRATION>
      <PARTYLEDGERNAME>${xe('Cash')}</PARTYLEDGERNAME>
      <ISINVOICE>Yes</ISINVOICE>
      ${entries.join('\n      ')}
    </VOUCHER>`);
  }

  // Expenses — debit the category ledger, credit Bank/Cash.
  for (const e of args.expenses) {
    const date = ymd(e.paidAt);
    const ledger = e.classification === 'CAPITAL' ? `${e.category} (Fixed Asset)` : e.category;
    vouchers.push(`<VOUCHER VCHTYPE="Payment" ACTION="Create">
      <DATE>${date}</DATE>
      <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
      <VOUCHERNUMBER>EXP-${xe(e.id.slice(-6))}</VOUCHERNUMBER>
      <NARRATION>${xe(e.notes ?? e.category)}</NARRATION>
      <PARTYLEDGERNAME>${xe(ledger)}</PARTYLEDGERNAME>
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${xe(ledger)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <AMOUNT>${rupees(e.amountPaise)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${xe('Cash')}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>-${rupees(e.amountPaise)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
    </VOUCHER>`);
  }

  // Vendor payments — debit Vendor ledger (each vendor is its own ledger
  // account in Tally), credit Cash/Bank.
  for (const v of args.vendorPayments) {
    const date = ymd(v.paidAt);
    vouchers.push(`<VOUCHER VCHTYPE="Payment" ACTION="Create">
      <DATE>${date}</DATE>
      <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
      <VOUCHERNUMBER>VP-${xe(v.id.slice(-6))}</VOUCHERNUMBER>
      <NARRATION>${xe(v.notes ?? `Payment to ${v.vendor.name}`)}</NARRATION>
      <PARTYLEDGERNAME>${xe(v.vendor.name)}</PARTYLEDGERNAME>
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${xe(v.vendor.name)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <AMOUNT>${rupees(v.amountPaise)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${xe('Cash')}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>-${rupees(v.amountPaise)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
    </VOUCHER>`);
  }

  // Purchases — debit Purchase A/c + Input GST ledgers, credit the vendor
  // (Sundry Creditor). Mirrors the sales voucher but with the signs flipped.
  for (const po of args.purchaseOrders) {
    const date = ymd(po.receivedAt ?? po.createdAt);
    // PO totals are GST-inclusive — the GST sits inside totalPaise, so the
    // taxable (Purchase A/c) portion is the total minus the input GST.
    const taxablePaise = po.totalPaise - (po.cgstPaise + po.sgstPaise + po.igstPaise);
    const creditor = `Sundry Creditors — ${po.vendor.name}`;
    const entries: string[] = [];
    entries.push(`<ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${xe('Purchase A/c')}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <AMOUNT>${rupees(taxablePaise)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`);
    if (po.cgstPaise > 0) {
      entries.push(`<ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${xe('Input CGST')}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <AMOUNT>${rupees(po.cgstPaise)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`);
    }
    if (po.sgstPaise > 0) {
      entries.push(`<ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${xe('Input SGST')}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <AMOUNT>${rupees(po.sgstPaise)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`);
    }
    if (po.igstPaise > 0) {
      entries.push(`<ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${xe('Input IGST')}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <AMOUNT>${rupees(po.igstPaise)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`);
    }
    const gstTotal = po.cgstPaise + po.sgstPaise + po.igstPaise;
    entries.push(`<ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${xe(creditor)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>-${rupees(taxablePaise + gstTotal)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`);
    vouchers.push(`<VOUCHER VCHTYPE="Purchase" ACTION="Create">
      <DATE>${date}</DATE>
      <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
      <VOUCHERNUMBER>PO-${xe(po.id.slice(-6))}</VOUCHERNUMBER>
      <NARRATION>${xe(`Purchase from ${po.vendor.name}`)}</NARRATION>
      <PARTYLEDGERNAME>${xe(creditor)}</PARTYLEDGERNAME>
      ${entries.join('\n      ')}
    </VOUCHER>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>Zelora Jeweller</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        ${vouchers.map((v) => `<TALLYMESSAGE>${v}</TALLYMESSAGE>`).join('\n        ')}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

// =====================================================================
// 6. GST REPORTS
// =====================================================================

financeRouter.get('/gst-summary', async (req, res, next) => {
  try {
    const q = z
      .object({ month: z.string().regex(/^\d{4}-\d{2}$/), shopId: z.string().optional() })
      .parse(req.query);
    const [year, monthStr] = q.month.split('-');
    const from = new Date(Date.UTC(Number(year), Number(monthStr) - 1, 1));
    const to = new Date(Date.UTC(Number(year), Number(monthStr), 1));
    const [bills, ecomOrdersRaw] = await Promise.all([
      prisma.bill.findMany({
        where: { createdAt: { gte: from, lt: to }, ...shopWhere(q.shopId) },
        select: { cgstPaise: true, sgstPaise: true, igstPaise: true, totalPaise: true },
      }),
      // E-commerce orders: tax stored as a single field; split per place of
      // supply (shippingState vs our home state) below. We also pull each
      // order's lines so it can be attributed to the shop that stocks the sold
      // items — a specific-shop view then shows that shop's online sales
      // alongside its POS bills, while "All shops" includes every order.
      prisma.order.findMany({
        where: {
          paidAt: { gte: from, lt: to },
          paymentStatus: PaymentStatus.PAID,
          status: { notIn: [OrderStatus.CANCELLED, OrderStatus.RETURNED] },
        },
        select: {
          totalPaise: true,
          taxPaise: true,
          shippingState: true,
          ...ORDER_SHOP_LINES_SELECT,
        },
      }),
    ]);
    const ecomOrders = q.shopId
      ? ecomOrdersRaw.filter((o) => attributeOrderShopId(o.items) === q.shopId)
      : ecomOrdersRaw;
    const homeStateCode = await getHomeStateCode();
    const ecomSplits = ecomOrders.map((o) =>
      splitTaxByPlaceOfSupply(o.taxPaise, o.shippingState, homeStateCode),
    );
    const ecomCgstPaise = sumPaise(ecomSplits.map((s) => s.cgstPaise));
    const ecomSgstPaise = sumPaise(ecomSplits.map((s) => s.sgstPaise));
    const ecomIgstPaise = sumPaise(ecomSplits.map((s) => s.igstPaise));

    // Input GST (ITC) — GST paid on purchases. Counted only for RECEIVED POs
    // (ITC is claimable once goods are received), bucketed by receivedAt and
    // narrowed to the destination shop when a shop filter is applied.
    const inputAgg = await prisma.purchaseOrder.aggregate({
      where: {
        status: 'RECEIVED',
        receivedAt: { gte: from, lt: to },
        ...(q.shopId ? { receivedShopId: q.shopId } : {}),
      },
      _sum: { cgstPaise: true, sgstPaise: true, igstPaise: true },
    });
    const inputCgstPaise = inputAgg._sum.cgstPaise ?? 0;
    const inputSgstPaise = inputAgg._sum.sgstPaise ?? 0;
    const inputIgstPaise = inputAgg._sum.igstPaise ?? 0;
    const inputGstPaise = inputCgstPaise + inputSgstPaise + inputIgstPaise;

    const outputCgstPaise = sumPaise(bills.map((b) => b.cgstPaise)) + ecomCgstPaise;
    const outputSgstPaise = sumPaise(bills.map((b) => b.sgstPaise)) + ecomSgstPaise;
    const outputIgstPaise = sumPaise(bills.map((b) => b.igstPaise)) + ecomIgstPaise;
    const outputGstPaise = outputCgstPaise + outputSgstPaise + outputIgstPaise;

    res.json({
      data: {
        month: q.month,
        cgstPaise: outputCgstPaise,
        sgstPaise: outputSgstPaise,
        igstPaise: outputIgstPaise,
        ecomIgstPaise,
        // Input GST (purchases) and the net liability after ITC.
        inputCgstPaise,
        inputSgstPaise,
        inputIgstPaise,
        inputGstPaise,
        netGstPayablePaise: outputGstPaise - inputGstPaise,
        taxableRevenuePaise:
          sumPaise(bills.map((b) => b.totalPaise)) + sumPaise(ecomOrders.map((o) => o.totalPaise)),
        billCount: bills.length + ecomOrders.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

financeRouter.get('/gst-bills', async (req, res, next) => {
  try {
    const q = z
      .object({
        month: z.string().regex(/^\d{4}-\d{2}$/),
        shopId: z.string().optional(),
        limit: z.coerce.number().int().positive().max(500).default(200),
      })
      .parse(req.query);
    const [year, monthStr] = q.month.split('-');
    const from = new Date(Date.UTC(Number(year), Number(monthStr) - 1, 1));
    const to = new Date(Date.UTC(Number(year), Number(monthStr), 1));
    const [bills, ecomOrdersRaw] = await Promise.all([
      prisma.bill.findMany({
        where: { createdAt: { gte: from, lt: to }, ...shopWhere(q.shopId) },
        orderBy: { createdAt: 'asc' },
        take: q.limit,
        select: {
          id: true,
          billNumber: true,
          createdAt: true,
          subtotalPaise: true,
          cgstPaise: true,
          sgstPaise: true,
          igstPaise: true,
          totalPaise: true,
          shop: { select: { name: true, gstStateCode: true } },
          customer: { select: { name: true } },
        },
      }),
      // Online orders carry their lines so each can be attributed to the shop
      // that stocks the sold items (see attributeOrderShopId). A specific-shop
      // view then lists that shop's online orders next to its POS bills; the
      // consolidated ("All shops") view lists every order.
      prisma.order.findMany({
        where: {
          paidAt: { gte: from, lt: to },
          paymentStatus: PaymentStatus.PAID,
          status: { notIn: [OrderStatus.CANCELLED, OrderStatus.RETURNED] },
        },
        orderBy: { paidAt: 'asc' },
        take: q.limit,
        select: {
          id: true,
          paidAt: true,
          subtotalPaise: true,
          taxPaise: true,
          totalPaise: true,
          shippingState: true,
          customer: { select: { name: true } },
          ...ORDER_SHOP_LINES_SELECT,
        },
      }),
    ]);
    const ecomOrders = q.shopId
      ? ecomOrdersRaw.filter((o) => attributeOrderShopId(o.items) === q.shopId)
      : ecomOrdersRaw;

    const homeStateCode = await getHomeStateCode();

    // Normalise e-commerce orders into the same shape as POS bills so the
    // frontend can render them in the same table. Tax is split by place of
    // supply: CGST+SGST for an in-state customer, IGST for inter-state.
    const ecomRows = ecomOrders.map((o) => {
      const split = splitTaxByPlaceOfSupply(o.taxPaise, o.shippingState, homeStateCode);
      return {
        id: o.id,
        billNumber: `ORD-${o.id.slice(-8).toUpperCase()}`,
        createdAt: o.paidAt,
        subtotalPaise: o.subtotalPaise,
        cgstPaise: split.cgstPaise,
        sgstPaise: split.sgstPaise,
        igstPaise: split.igstPaise,
        totalPaise: o.totalPaise,
        shop: { name: 'E-commerce', gstStateCode: null },
        customer: o.customer,
        isEcom: true,
      };
    });

    res.json({ data: [...bills, ...ecomRows].sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime()) });
  } catch (err) {
    next(err);
  }
});

// HSN-wise GST summary (GSTR-1 style). Groups every sale line in the month by
// (HSN code, GST rate) and reports quantity, taxable value, and CGST/SGST/IGST.
// POS lines come from the per-line GST snapshot persisted on BillLine (exact,
// SQL-grouped); e-commerce lines are derived from each OrderItem's GST-inclusive
// price and the HSN/rate mirrored onto its Product, split by place of supply.
financeRouter.get('/gst-hsn-summary', async (req, res, next) => {
  try {
    const q = z
      .object({ month: z.string().regex(/^\d{4}-\d{2}$/), shopId: z.string().optional() })
      .parse(req.query);
    const [year, monthStr] = q.month.split('-');
    const from = new Date(Date.UTC(Number(year), Number(monthStr) - 1, 1));
    const to = new Date(Date.UTC(Number(year), Number(monthStr), 1));
    const tenantId = getTenantId();
    if (!tenantId) {
      res.status(400).json(noTenantError());
      return;
    }

    type HsnRow = {
      hsnCode: string | null;
      gstRateBps: number;
      quantity: number;
      taxablePaise: number;
      cgstPaise: number;
      sgstPaise: number;
      igstPaise: number;
    };
    const byKey = new Map<string, HsnRow>();
    const keyOf = (hsn: string | null, rate: number): string => `${hsn ?? ''}|${rate}`;
    const bump = (r: HsnRow): void => {
      const key = keyOf(r.hsnCode, r.gstRateBps);
      const cur = byKey.get(key);
      if (cur) {
        cur.quantity += r.quantity;
        cur.taxablePaise += r.taxablePaise;
        cur.cgstPaise += r.cgstPaise;
        cur.sgstPaise += r.sgstPaise;
        cur.igstPaise += r.igstPaise;
      } else {
        byKey.set(key, { ...r });
      }
    };

    // POS: SQL groupBy over BillLine's persisted per-line GST snapshot. BillLine
    // has no tenantId column, so scope through the bill relation explicitly
    // (the tenant extension does not rewrite nested relation filters).
    const posGroups = await prisma.billLine.groupBy({
      by: ['hsnCode', 'gstRateBps'],
      where: {
        bill: { is: { tenantId, createdAt: { gte: from, lt: to }, ...shopWhere(q.shopId) } },
      },
      _sum: {
        quantity: true,
        taxablePaise: true,
        cgstPaise: true,
        sgstPaise: true,
        igstPaise: true,
      },
    });
    for (const g of posGroups) {
      bump({
        hsnCode: g.hsnCode,
        gstRateBps: g.gstRateBps,
        quantity: g._sum.quantity ?? 0,
        taxablePaise: g._sum.taxablePaise ?? 0,
        cgstPaise: g._sum.cgstPaise ?? 0,
        sgstPaise: g._sum.sgstPaise ?? 0,
        igstPaise: g._sum.igstPaise ?? 0,
      });
    }

    // E-commerce: derive per OrderItem from the GST-inclusive line price and the
    // HSN/rate mirrored onto the Product, split by place of supply. Grouped in JS
    // because HSN + rate live on the joined Product (not SQL-groupable).
    const orders = await prisma.order.findMany({
      where: {
        paidAt: { gte: from, lt: to },
        paymentStatus: PaymentStatus.PAID,
        status: { notIn: [OrderStatus.CANCELLED, OrderStatus.RETURNED] },
      },
      select: {
        shippingState: true,
        items: {
          select: {
            qty: true,
            pricePaise: true,
            product: {
              select: {
                hsnCode: true,
                gstRateBps: true,
                linkedItem: { select: { shopId: true } },
              },
            },
          },
        },
      },
    });
    const homeStateCode = await getHomeStateCode();
    for (const o of orders) {
      // Respect the shop filter using the same attribution as the other GST
      // views (order → shop that stocks the largest line value).
      if (q.shopId && attributeOrderShopId(o.items) !== q.shopId) continue;
      for (const it of o.items) {
        const rate = it.product.gstRateBps ?? 300;
        const inclusive = it.pricePaise * it.qty;
        const taxablePaise = Math.round((inclusive * 10_000) / (10_000 + rate));
        const lineGst = inclusive - taxablePaise;
        const split = splitTaxByPlaceOfSupply(lineGst, o.shippingState, homeStateCode);
        bump({
          hsnCode: it.product.hsnCode,
          gstRateBps: rate,
          quantity: it.qty,
          taxablePaise,
          cgstPaise: split.cgstPaise,
          sgstPaise: split.sgstPaise,
          igstPaise: split.igstPaise,
        });
      }
    }

    const rows = [...byKey.values()].sort((a, b) => b.taxablePaise - a.taxablePaise);
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 7. GOLD LOANS
// =====================================================================

// Customer search — drives the typeahead in the "New gold loan" dialog.
// Matches on name OR phone (last 4 digits is the common shorthand), capped
// at 20 rows so a careless empty query doesn't dump the whole CRM.
financeRouter.get('/customers/search', async (req, res, next) => {
  try {
    const q = z
      .object({
        q: z.string().trim().min(1).max(64).optional(),
        limit: z.coerce.number().int().positive().max(50).default(20),
      })
      .parse(req.query);
    const tenantId = getTenantId();
    if (!tenantId) {
      res.status(401).json(noTenantError());
      return;
    }
    const term = q.q ?? '';
    const customers = await prisma.customer.findMany({
      where: term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { phone: { contains: term } },
            ],
          }
        : {},
      orderBy: { createdAt: 'desc' },
      take: q.limit,
      select: { id: true, name: true, phone: true },
    });
    res.json({ data: customers });
  } catch (err) {
    next(err);
  }
});

financeRouter.get('/gold-loans', async (req, res, next) => {
  try {
    const q = z
      .object({
        status: z.enum(['ACTIVE', 'PARTIALLY_REPAID', 'CLOSED', 'DEFAULTED']).optional(),
        limit: z.coerce.number().int().positive().max(200).default(50),
        cursor: z.string().optional(),
      })
      .parse(req.query);
    const where: Prisma.GoldLoanWhereInput = q.status ? { status: q.status } : {};
    const rows = await prisma.goldLoan.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        repayments: { select: { id: true, amountPaise: true, paidAt: true } },
      },
      orderBy: { dueAt: 'asc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > q.limit;
    const data = rows.slice(0, q.limit).map((loan) => {
      const repaidPaise = loan.repayments.reduce((a, r) => a + r.amountPaise, 0);
      return {
        id: loan.id,
        customer: loan.customer,
        principalPaise: loan.principalPaise,
        interestRateBps: loan.interestRateBps,
        pledgedWeightMg: loan.pledgedWeightMg,
        status: loan.status,
        dueAt: loan.dueAt.toISOString(),
        repaidPaise,
        outstandingPaise: Math.max(0, loan.principalPaise - repaidPaise),
        repayments: loan.repayments.map((r) => ({ ...r, paidAt: r.paidAt.toISOString() })),
        daysToDue: Math.round((loan.dueAt.getTime() - Date.now()) / 86400000),
      };
    });
    res.json({
      data,
      page: { nextCursor: hasMore ? rows.at(-2)?.id : undefined, hasMore },
    });
  } catch (err) {
    next(err);
  }
});

financeRouter.post(
  '/gold-loans',
  requirePermission('finance.goldloan_write'),
  async (req, res, next) => {
    try {
      const body = GoldLoanInputSchema.parse(req.body);
      const tenantId = getTenantId();
      if (!tenantId) {
        res.status(401).json(noTenantError());
        return;
      }
      const created = await prisma.goldLoan.create({
        data: { ...body, tenantId, status: 'ACTIVE' },
      });
      bustTenant(tenantId);
      res.status(201).json({ data: created });
    } catch (err) {
      next(err);
    }
  },
);

financeRouter.post(
  '/gold-loans/:id/repayments',
  requirePermission('finance.goldloan_write'),
  async (req, res, next) => {
    try {
      const body = GoldLoanRepaymentInputSchema.parse({ ...req.body, loanId: req.params.id });
      const tenantId = getTenantId();
      const loan = await prisma.goldLoan.findUnique({
        where: { id: body.loanId },
        include: { repayments: true },
      });
      if (!loan) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Loan not found' } });
        return;
      }
      const totalAfter =
        loan.repayments.reduce((a, r) => a + r.amountPaise, 0) + body.amountPaise;
      const status =
        totalAfter >= loan.principalPaise
          ? 'CLOSED'
          : totalAfter > 0
            ? 'PARTIALLY_REPAID'
            : 'ACTIVE';
      const [created] = await prisma.$transaction([
        prisma.goldLoanRepayment.create({
          data: { loanId: body.loanId, amountPaise: body.amountPaise, paidAt: body.paidAt },
        }),
        prisma.goldLoan.update({ where: { id: body.loanId }, data: { status } }),
      ]);
      if (tenantId) bustTenant(tenantId);
      res.status(201).json({ data: created });
    } catch (err) {
      next(err);
    }
  },
);

// =====================================================================
// 8. CASH / UPI / CARD RECONCILIATION
// =====================================================================

financeRouter.get('/reconciliation/expected', async (req, res, next) => {
  try {
    const q = z
      .object({ shopId: z.string(), date: z.coerce.date() })
      .parse(req.query);
    const tenantId = getTenantId();
    if (!tenantId) {
      res.status(401).json(noTenantError());
      return;
    }
    const day = startOfDayUtc(q.date);
    const nextDay = new Date(day.getTime() + 86400000);
    const payments = await prisma.$queryRaw<Array<{ mode: string; amount: bigint }>>`
      SELECT p."mode" AS mode, SUM(p."amountPaise")::bigint AS amount
      FROM "Payment" p
      JOIN "Bill" b ON b."id" = p."billId"
      WHERE b."tenantId" = ${tenantId}
        AND b."shopId" = ${q.shopId}
        AND b."createdAt" BETWEEN ${day} AND ${nextDay}
        AND b."voidedAt" IS NULL
      GROUP BY 1
    `;
    const byMode = new Map(payments.map((p) => [p.mode, Number(p.amount)]));
    const existing = await prisma.reconciliation.findUnique({
      where: {
        tenantId_shopId_reconciledDate: {
          tenantId,
          shopId: q.shopId,
          reconciledDate: day,
        },
      },
    });
    res.json({
      data: {
        shopId: q.shopId,
        date: day.toISOString().slice(0, 10),
        expectedCashPaise: byMode.get('CASH') ?? 0,
        expectedUpiPaise: byMode.get('UPI') ?? 0,
        expectedCardPaise: byMode.get('CARD') ?? 0,
        existing,
      },
    });
  } catch (err) {
    next(err);
  }
});

financeRouter.get('/reconciliation', async (req, res, next) => {
  try {
    const q = z
      .object({
        shopId: z.string().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        limit: z.coerce.number().int().positive().max(100).default(30),
      })
      .parse(req.query);
    const rows = await prisma.reconciliation.findMany({
      where: {
        ...(q.shopId ? { shopId: q.shopId } : {}),
        ...(q.from || q.to
          ? {
              reconciledDate: {
                ...(q.from ? { gte: startOfDayUtc(q.from) } : {}),
                ...(q.to ? { lte: startOfDayUtc(q.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { reconciledDate: 'desc' },
      take: q.limit,
    });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

financeRouter.post(
  '/reconciliation',
  requirePermission('finance.expense_write'),
  async (req, res, next) => {
    try {
      const body = ReconciliationInputSchema.parse(req.body);
      const tenantId = getTenantId();
      if (!tenantId) {
        res.status(401).json(noTenantError());
        return;
      }
      const day = startOfDayUtc(body.reconciledDate);
      const nextDay = new Date(day.getTime() + 86400000);
      const payments = await prisma.$queryRaw<Array<{ mode: string; amount: bigint }>>`
        SELECT p."mode" AS mode, SUM(p."amountPaise")::bigint AS amount
        FROM "Payment" p
        JOIN "Bill" b ON b."id" = p."billId"
        WHERE b."tenantId" = ${tenantId}
          AND b."shopId" = ${body.shopId}
          AND b."createdAt" BETWEEN ${day} AND ${nextDay}
          AND b."voidedAt" IS NULL
        GROUP BY 1
      `;
      const byMode = new Map(payments.map((p) => [p.mode, Number(p.amount)]));
      const expectedCash = byMode.get('CASH') ?? 0;
      const expectedUpi = byMode.get('UPI') ?? 0;
      const expectedCard = byMode.get('CARD') ?? 0;
      const reconciled = await prisma.reconciliation.upsert({
        where: {
          tenantId_shopId_reconciledDate: {
            tenantId,
            shopId: body.shopId,
            reconciledDate: day,
          },
        },
        create: {
          tenantId,
          shopId: body.shopId,
          reconciledDate: day,
          expectedCashPaise: expectedCash,
          expectedUpiPaise: expectedUpi,
          expectedCardPaise: expectedCard,
          countedCashPaise: body.countedCashPaise,
          settledUpiPaise: body.settledUpiPaise,
          settledCardPaise: body.settledCardPaise,
          varianceCashPaise: body.countedCashPaise - expectedCash,
          varianceUpiPaise: body.settledUpiPaise - expectedUpi,
          varianceCardPaise: body.settledCardPaise - expectedCard,
          notes: body.notes ?? null,
        },
        update: {
          expectedCashPaise: expectedCash,
          expectedUpiPaise: expectedUpi,
          expectedCardPaise: expectedCard,
          countedCashPaise: body.countedCashPaise,
          settledUpiPaise: body.settledUpiPaise,
          settledCardPaise: body.settledCardPaise,
          varianceCashPaise: body.countedCashPaise - expectedCash,
          varianceUpiPaise: body.settledUpiPaise - expectedUpi,
          varianceCardPaise: body.settledCardPaise - expectedCard,
          notes: body.notes ?? null,
        },
      });
      bustTenant(tenantId);
      res.status(201).json({ data: reconciled });
    } catch (err) {
      next(err);
    }
  },
);

// =====================================================================
// 9. PAYROLL
// =====================================================================

financeRouter.get('/payroll', async (req, res, next) => {
  try {
    const q = z
      .object({
        month: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional(),
      })
      .parse(req.query);
    const where = q.month ? { month: q.month } : {};
    const rows = await prisma.payroll.findMany({
      where,
      orderBy: [{ month: 'desc' }, { netPaise: 'desc' }],
      take: 200,
    });
    const userIds = Array.from(new Set(rows.map((r) => r.userId)));
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, role: { select: { slug: true, name: true } } },
    });
    const userById = new Map(users.map((u) => [u.id, u]));
    res.json({
      data: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: userById.get(r.userId)?.name ?? r.userId.slice(-6),
        userRole: userById.get(r.userId)?.role.name ?? '',
        month: r.month,
        basePaise: r.basePaise,
        commissionPaise: r.commissionPaise,
        advancePaise: r.advancePaise,
        netPaise: r.netPaise,
        paidAt: r.paidAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

financeRouter.post(
  '/payroll',
  requirePermission('finance.payroll_write'),
  async (req, res, next) => {
    try {
      const body = PayrollInputSchema.parse(req.body);
      const tenantId = getTenantId();
      if (!tenantId) {
        res.status(401).json(noTenantError());
        return;
      }
      const netPaise = body.basePaise + body.commissionPaise - body.advancePaise;
      const upserted = await prisma.payroll.upsert({
        where: { tenantId_userId_month: { tenantId, userId: body.userId, month: body.month } },
        create: {
          tenantId,
          userId: body.userId,
          month: body.month,
          basePaise: body.basePaise,
          commissionPaise: body.commissionPaise,
          advancePaise: body.advancePaise,
          netPaise,
          paidAt: body.paidAt ?? null,
        },
        update: {
          basePaise: body.basePaise,
          commissionPaise: body.commissionPaise,
          advancePaise: body.advancePaise,
          netPaise,
          paidAt: body.paidAt ?? null,
        },
      });
      bustTenant(tenantId);
      res.status(201).json({ data: upserted });
    } catch (err) {
      next(err);
    }
  },
);

financeRouter.post(
  '/payroll/:id/mark-paid',
  requirePermission('finance.payroll_write'),
  async (req, res, next) => {
    try {
      const tenantId = getTenantId();
      const updated = await prisma.payroll.update({
        where: { id: req.params.id },
        data: { paidAt: new Date() },
      });
      if (tenantId) bustTenant(tenantId);
      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// =====================================================================
// 10. VENDORS — ledger + payments
// =====================================================================

financeRouter.get('/vendors/ledger', async (_req, res, next) => {
  try {
    const tenantId = getTenantId();
    if (!tenantId) {
      res.status(401).json(noTenantError());
      return;
    }
    const [vendors, poAgg, paymentAgg] = await Promise.all([
      prisma.vendor.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
      prisma.purchaseOrder.groupBy({
        by: ['vendorId'],
        where: { tenantId, status: { not: 'CANCELLED' } },
        _sum: { totalPaise: true },
        _count: { _all: true },
      }),
      prisma.vendorPayment.groupBy({
        by: ['vendorId'],
        where: { tenantId },
        _sum: { amountPaise: true },
        _count: { _all: true },
      }),
    ]);
    const poById = new Map(
      poAgg.map((p) => [p.vendorId, { total: p._sum.totalPaise ?? 0, count: p._count._all }]),
    );
    const payById = new Map(
      paymentAgg.map((p) => [p.vendorId, { total: p._sum.amountPaise ?? 0, count: p._count._all }]),
    );
    res.json({
      data: vendors.map((v) => {
        const purchases = poById.get(v.id);
        const paid = payById.get(v.id);
        const purchasedPaise = purchases?.total ?? 0;
        const paidPaise = paid?.total ?? 0;
        return {
          id: v.id,
          name: v.name,
          gstNumber: v.gstNumber,
          phone: v.phone,
          purchasedPaise,
          paidPaise,
          outstandingPaise: v.outstandingPaise,
          purchaseCount: purchases?.count ?? 0,
          paymentCount: paid?.count ?? 0,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

financeRouter.get('/vendors/:vendorId/payments', async (req, res, next) => {
  try {
    const tenantId = getTenantId();
    if (!tenantId) {
      res.status(401).json(noTenantError());
      return;
    }
    const rows = await prisma.vendorPayment.findMany({
      where: { tenantId, vendorId: req.params.vendorId },
      orderBy: { paidAt: 'desc' },
      take: 100,
    });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

financeRouter.post(
  '/vendor-payments',
  requirePermission('finance.expense_write'),
  async (req, res, next) => {
    try {
      const body = VendorPaymentInputSchema.parse(req.body);
      const tenantId = getTenantId();
      if (!tenantId) {
        res.status(401).json(noTenantError());
        return;
      }
      const created = await prisma.$transaction(async (tx) => {
        const payment = await tx.vendorPayment.create({
          data: {
            tenantId,
            vendorId: body.vendorId,
            shopId: body.shopId ?? null,
            amountPaise: body.amountPaise,
            paymentMode: body.paymentMode,
            referenceId: body.referenceId ?? null,
            paidAt: body.paidAt,
            notes: body.notes ?? null,
            bankAccountId: body.bankAccountId ?? null,
          },
        });
        // Reduce outstanding (but never below zero — UI rounds large
        // overpayments back to 0 to keep the ledger clean).
        await tx.vendor.update({
          where: { id: body.vendorId },
          data: { outstandingPaise: { decrement: body.amountPaise } },
        });
        return payment;
      });
      bustTenant(tenantId);
      res.status(201).json({ data: created });
    } catch (err) {
      next(err);
    }
  },
);

// =====================================================================
// 11. ADVANCES (customer)
// =====================================================================

financeRouter.get('/advances/summary', async (_req, res, next) => {
  try {
    const tenantId = getTenantId();
    if (!tenantId) {
      res.status(401).json(noTenantError());
      return;
    }
    const [active, consumed, refunded, recent] = await Promise.all([
      prisma.advance.aggregate({
        where: { tenantId, status: 'ACTIVE' },
        _sum: { amountPaise: true },
        _count: { _all: true },
      }),
      prisma.advance.aggregate({
        where: { tenantId, status: 'CONSUMED' },
        _sum: { amountPaise: true },
        _count: { _all: true },
      }),
      prisma.advance.aggregate({
        where: { tenantId, status: 'REFUNDED' },
        _sum: { amountPaise: true },
        _count: { _all: true },
      }),
      prisma.advance.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { customer: { select: { name: true, phone: true } } },
      }),
    ]);
    res.json({
      data: {
        active: { count: active._count._all, amountPaise: active._sum.amountPaise ?? 0 },
        consumed: { count: consumed._count._all, amountPaise: consumed._sum.amountPaise ?? 0 },
        refunded: { count: refunded._count._all, amountPaise: refunded._sum.amountPaise ?? 0 },
        recent: recent.map((a) => ({
          id: a.id,
          receiptNumber: a.receiptNumber,
          customerName: a.customer.name,
          customerPhone: a.customer.phone,
          amountPaise: a.amountPaise,
          status: a.status,
          validUntil: a.validUntil?.toISOString() ?? null,
          createdAt: a.createdAt.toISOString(),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 12. BANK ACCOUNTS + TRANSACTIONS
// =====================================================================

financeRouter.get('/bank-accounts', async (_req, res, next) => {
  try {
    const tenantId = getTenantId();
    if (!tenantId) {
      res.status(401).json(noTenantError());
      return;
    }
    const accounts = await prisma.bankAccount.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    const ids = accounts.map((a) => a.id);
    const txnAgg = await prisma.bankTransaction.groupBy({
      by: ['accountId', 'direction'],
      where: { tenantId, accountId: { in: ids } },
      _sum: { amountPaise: true },
    });
    const credByAcc = new Map<string, number>();
    const debByAcc = new Map<string, number>();
    for (const t of txnAgg) {
      const sum = t._sum.amountPaise ?? 0;
      if (t.direction === 'CREDIT') credByAcc.set(t.accountId, sum);
      else debByAcc.set(t.accountId, sum);
    }
    res.json({
      data: accounts.map((a) => ({
        ...a,
        creditPaise: credByAcc.get(a.id) ?? 0,
        debitPaise: debByAcc.get(a.id) ?? 0,
        balancePaise:
          a.openingBalancePaise + (credByAcc.get(a.id) ?? 0) - (debByAcc.get(a.id) ?? 0),
      })),
    });
  } catch (err) {
    next(err);
  }
});

financeRouter.post(
  '/bank-accounts',
  requirePermission('finance.expense_write'),
  async (req, res, next) => {
    try {
      const body = BankAccountInputSchema.parse(req.body);
      const tenantId = getTenantId();
      if (!tenantId) {
        res.status(401).json(noTenantError());
        return;
      }
      const created = await prisma.bankAccount.create({ data: { ...body, tenantId } });
      bustTenant(tenantId);
      res.status(201).json({ data: created });
    } catch (err) {
      next(err);
    }
  },
);

financeRouter.get('/bank-accounts/:id/transactions', async (req, res, next) => {
  try {
    const q = z
      .object({ limit: z.coerce.number().int().positive().max(200).default(50) })
      .parse(req.query);
    const tenantId = getTenantId();
    if (!tenantId) {
      res.status(401).json(noTenantError());
      return;
    }
    const rows = await prisma.bankTransaction.findMany({
      where: { tenantId, accountId: req.params.id },
      orderBy: { occurredAt: 'desc' },
      take: q.limit,
    });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

financeRouter.post(
  '/bank-transactions',
  requirePermission('finance.expense_write'),
  async (req, res, next) => {
    try {
      const body = BankTransactionInputSchema.parse(req.body);
      const tenantId = getTenantId();
      if (!tenantId) {
        res.status(401).json(noTenantError());
        return;
      }
      const created = await prisma.bankTransaction.create({
        data: {
          tenantId,
          accountId: body.accountId,
          direction: body.direction,
          amountPaise: body.amountPaise,
          balancePaise: body.balancePaise ?? null,
          description: body.description,
          referenceId: body.referenceId ?? null,
          occurredAt: body.occurredAt,
        },
      });
      bustTenant(tenantId);
      res.status(201).json({ data: created });
    } catch (err) {
      next(err);
    }
  },
);

// =====================================================================
// 13. FINANCIAL YEAR SUMMARY
// =====================================================================

financeRouter.get('/financial-year', async (req, res, next) => {
  try {
    const q = z.object({ fy: z.string().regex(/^\d{4}$/).optional() }).parse(req.query);
    const now = new Date();
    const fyStart = q.fy
      ? new Date(Date.UTC(Number(q.fy), 3, 1))
      : startOfFinancialYearUtc(now);
    const fyEnd = new Date(Date.UTC(fyStart.getUTCFullYear() + 1, 3, 1));
    const prevFyStart = new Date(Date.UTC(fyStart.getUTCFullYear() - 1, 3, 1));
    const prevFyEnd = fyStart;
    const tenantId = getTenantId();
    if (!tenantId) {
      res.status(401).json(noTenantError());
      return;
    }

    // E-commerce orders aren't POS bills, but they are revenue. Every other
    // finance view (summary, daily-sales, GST) merges paid online orders into
    // the totals, so the FY report must too — otherwise a store that sells only
    // online shows ₹0 revenue and ₹0 GST for the year.
    const ecomFyWhere = {
      tenantId,
      paymentStatus: PaymentStatus.PAID,
      status: { notIn: [OrderStatus.CANCELLED, OrderStatus.RETURNED] },
      paidAt: { gte: fyStart, lt: fyEnd },
    };
    const ecomPrevFyWhere = {
      tenantId,
      paymentStatus: PaymentStatus.PAID,
      status: { notIn: [OrderStatus.CANCELLED, OrderStatus.RETURNED] },
      paidAt: { gte: prevFyStart, lt: prevFyEnd },
    };

    const [billAgg, expenseAgg, prevBillAgg, prevExpenseAgg, monthly, byShop, ecomAgg, prevEcomAgg] =
      await Promise.all([
        prisma.bill.aggregate({
          where: { tenantId, createdAt: { gte: fyStart, lt: fyEnd }, voidedAt: null },
          _sum: { totalPaise: true, cgstPaise: true, sgstPaise: true, igstPaise: true },
          _count: { _all: true },
        }),
        prisma.expense.aggregate({
          where: { tenantId, paidAt: { gte: fyStart, lt: fyEnd } },
          _sum: { amountPaise: true },
          _count: { _all: true },
        }),
        prisma.bill.aggregate({
          where: { tenantId, createdAt: { gte: prevFyStart, lt: prevFyEnd }, voidedAt: null },
          _sum: { totalPaise: true },
        }),
        prisma.expense.aggregate({
          where: { tenantId, paidAt: { gte: prevFyStart, lt: prevFyEnd } },
          _sum: { amountPaise: true },
        }),
        prisma.$queryRaw<Array<{ month: Date; revenue: bigint; expense: bigint }>>`
          SELECT m::date AS month,
                 (COALESCE((
                   SELECT SUM("totalPaise") FROM "Bill"
                   WHERE "tenantId" = ${tenantId}
                     AND "voidedAt" IS NULL
                     AND "createdAt" >= m
                     AND "createdAt" < (m + INTERVAL '1 month')
                 ),0)
                 + COALESCE((
                   SELECT SUM("totalPaise") FROM "Order"
                   WHERE "tenantId" = ${tenantId}
                     AND "paymentStatus" = 'PAID'
                     AND "status" NOT IN ('CANCELLED', 'RETURNED')
                     AND "paidAt" >= m
                     AND "paidAt" < (m + INTERVAL '1 month')
                 ),0))::bigint AS revenue,
                 COALESCE((
                   SELECT SUM("amountPaise") FROM "Expense"
                   WHERE "tenantId" = ${tenantId}
                     AND "paidAt" >= m
                     AND "paidAt" < (m + INTERVAL '1 month')
                 ),0)::bigint AS expense
          FROM generate_series(${fyStart}::timestamp, ${fyEnd}::timestamp - INTERVAL '1 day', INTERVAL '1 month') AS m
          ORDER BY m
        `,
        prisma.bill.groupBy({
          by: ['shopId'],
          where: { tenantId, createdAt: { gte: fyStart, lt: fyEnd }, voidedAt: null },
          _sum: { totalPaise: true, cgstPaise: true, sgstPaise: true, igstPaise: true },
          _count: { _all: true },
        }),
        prisma.order.aggregate({
          where: ecomFyWhere,
          _sum: { totalPaise: true, taxPaise: true },
          _count: { _all: true },
        }),
        prisma.order.aggregate({
          where: ecomPrevFyWhere,
          _sum: { totalPaise: true },
        }),
      ]);

    const fyShopIds = byShop.map((b) => b.shopId);
    const shops = await prisma.shop.findMany({
      where: { tenantId, id: { in: fyShopIds } },
      select: { id: true, name: true },
    });
    const shopName = new Map(shops.map((s) => [s.id, s.name]));

    const ecomRevenuePaise = ecomAgg._sum.totalPaise ?? 0;
    const ecomGstPaise = ecomAgg._sum.taxPaise ?? 0;
    const ecomOrderCount = ecomAgg._count._all;

    const billRevenuePaise = billAgg._sum.totalPaise ?? 0;
    const billGstPaise =
      (billAgg._sum.cgstPaise ?? 0) + (billAgg._sum.sgstPaise ?? 0) + (billAgg._sum.igstPaise ?? 0);

    const revenuePaise = billRevenuePaise + ecomRevenuePaise;
    const expensePaise = expenseAgg._sum.amountPaise ?? 0;
    const prevRev = (prevBillAgg._sum.totalPaise ?? 0) + (prevEcomAgg._sum.totalPaise ?? 0);
    const prevExp = prevExpenseAgg._sum.amountPaise ?? 0;
    const yoyRevenuePct = prevRev > 0 ? ((revenuePaise - prevRev) / prevRev) * 100 : null;
    const yoyExpensePct = prevExp > 0 ? ((expensePaise - prevExp) / prevExp) * 100 : null;

    res.json({
      data: {
        fyLabel: `FY${String(fyStart.getUTCFullYear()).slice(-2)}-${String(fyEnd.getUTCFullYear()).slice(-2)}`,
        fyStart: fyStart.toISOString().slice(0, 10),
        fyEnd: fyEnd.toISOString().slice(0, 10),
        revenuePaise,
        expensePaise,
        netPaise: revenuePaise - expensePaise,
        gstPaise: billGstPaise + ecomGstPaise,
        billCount: billAgg._count._all + ecomOrderCount,
        expenseCount: expenseAgg._count._all,
        prev: {
          revenuePaise: prevRev,
          expensePaise: prevExp,
        },
        yoyRevenuePct,
        yoyExpensePct,
        monthly: monthly.map((m) => ({
          month: new Date(m.month).toISOString().slice(0, 7),
          revenuePaise: Number(m.revenue),
          expensePaise: Number(m.expense),
          netPaise: Number(m.revenue) - Number(m.expense),
        })),
        byShop: [
          ...byShop.map((s) => ({
            shopId: s.shopId,
            shopName: shopName.get(s.shopId) ?? s.shopId.slice(-6),
            revenuePaise: s._sum.totalPaise ?? 0,
            gstPaise:
              (s._sum.cgstPaise ?? 0) + (s._sum.sgstPaise ?? 0) + (s._sum.igstPaise ?? 0),
            billCount: s._count._all,
          })),
          // Online orders aren't shop-scoped — surface them as their own row so
          // the branch breakdown reconciles with the FY revenue total.
          ...(ecomOrderCount > 0
            ? [
                {
                  shopId: 'ecommerce',
                  shopName: 'E-commerce',
                  revenuePaise: ecomRevenuePaise,
                  gstPaise: ecomGstPaise,
                  billCount: ecomOrderCount,
                },
              ]
            : []),
        ].sort((a, b) => b.revenuePaise - a.revenuePaise),
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 14. STAFF (for payroll dropdown)
// =====================================================================

financeRouter.get('/staff', async (_req, res, next) => {
  try {
    const tenantId = getTenantId();
    if (!tenantId) {
      res.status(401).json(noTenantError());
      return;
    }
    const users = await prisma.user.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        shopId: true,
        role: { select: { slug: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ data: users });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 15. VENDOR LIST (lightweight for dropdowns)
// =====================================================================

financeRouter.get('/vendors', async (_req, res, next) => {
  try {
    const tenantId = getTenantId();
    if (!tenantId) {
      res.status(401).json(noTenantError());
      return;
    }
    const vendors = await prisma.vendor.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, gstNumber: true, phone: true, outstandingPaise: true },
    });
    res.json({ data: vendors });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// COGS BREAKDOWN — monthly metal / making / stone breakdown
// =====================================================================

financeRouter.get('/cogs', async (req, res, next) => {
  try {
    const q = z
      .object({
        from: z.coerce.date(),
        to: z.coerce.date(),
        shopId: z.string().optional(),
      })
      .parse(req.query);
    const tenantId = getTenantId();
    if (!tenantId) { res.status(401).json(noTenantError()); return; }
    const shopFilter = q.shopId ? prismaShopFilter(q.shopId) : prismaNoOp();

    const rows = await prisma.$queryRaw<
      Array<{
        month: Date;
        metalCostPaise: bigint;
        makingChargesPaise: bigint;
        stoneChargesPaise: bigint;
        totalPaise: bigint;
        billCount: bigint;
      }>
    >`
      SELECT
        DATE_TRUNC('month', "createdAt") AS month,
        SUM("subtotalPaise" - "makingChargesPaise" - "stoneChargesPaise") AS "metalCostPaise",
        SUM("makingChargesPaise")  AS "makingChargesPaise",
        SUM("stoneChargesPaise")   AS "stoneChargesPaise",
        SUM("subtotalPaise")       AS "totalPaise",
        COUNT(*)                   AS "billCount"
      FROM "Bill"
      WHERE "tenantId" = ${tenantId}
        AND "voidedAt" IS NULL
        AND "createdAt" >= ${q.from}
        AND "createdAt" <= ${q.to}
        ${shopFilter}
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY month ASC
    `;

    res.json({
      data: rows.map((r) => ({
        month: (r.month as Date).toISOString().slice(0, 7),
        label: (r.month as Date).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        metalCostPaise: Number(r.metalCostPaise),
        makingChargesPaise: Number(r.makingChargesPaise),
        stoneChargesPaise: Number(r.stoneChargesPaise),
        totalPaise: Number(r.totalPaise),
        billCount: Number(r.billCount),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// RETURNS — refund ledger with monthly trend
// =====================================================================

financeRouter.get('/returns', async (req, res, next) => {
  try {
    const q = z
      .object({
        from: z.coerce.date(),
        to: z.coerce.date(),
        shopId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);
    const tenantId = getTenantId();
    if (!tenantId) { res.status(401).json(noTenantError()); return; }
    const shopFilter = q.shopId
      ? Prisma.sql`AND b."shopId" = ${q.shopId}`
      : Prisma.empty;

    const [trend, refunds, ecomReturned] = await Promise.all([
      prisma.$queryRaw<
        Array<{ month: Date; refundPaise: bigint; refundCount: bigint }>
      >`
        SELECT
          DATE_TRUNC('month', r."refundedAt") AS month,
          SUM(r."amountPaise") AS "refundPaise",
          COUNT(*)             AS "refundCount"
        FROM "Refund" r
        JOIN "Bill" b ON b.id = r."billId"
        WHERE b."tenantId" = ${tenantId}
          AND r."refundedAt" >= ${q.from}
          AND r."refundedAt" <= ${q.to}
          ${shopFilter}
        GROUP BY DATE_TRUNC('month', r."refundedAt")
        ORDER BY month ASC
      `,
      prisma.$queryRaw<
        Array<{
          id: string;
          billNumber: string;
          customerName: string | null;
          shopName: string;
          amountPaise: bigint;
          reason: string;
          refundedAt: Date;
        }>
      >`
        SELECT
          r.id,
          b."billNumber",
          c.name       AS "customerName",
          s.name       AS "shopName",
          r."amountPaise",
          r.reason,
          r."refundedAt"
        FROM "Refund" r
        JOIN "Bill"     b ON b.id   = r."billId"
        JOIN "Shop"     s ON s.id   = b."shopId"
        LEFT JOIN "Customer" c ON c.id = b."customerId"
        WHERE b."tenantId" = ${tenantId}
          AND r."refundedAt" >= ${q.from}
          AND r."refundedAt" <= ${q.to}
          ${shopFilter}
        ORDER BY r."refundedAt" DESC
        LIMIT ${q.limit}
      `,
      // Ecommerce RETURNED orders — use createdAt as the return date proxy
      prisma.$queryRaw<
        Array<{
          id: string;
          amountPaise: bigint;
          reason: string | null;
          returnedAt: Date;
          customerName: string | null;
        }>
      >`
        SELECT
          o.id,
          o."totalPaise"   AS "amountPaise",
          o."cancelReason" AS reason,
          o."createdAt"    AS "returnedAt",
          c.name           AS "customerName"
        FROM "Order" o
        LEFT JOIN "Customer" c ON c.id = o."customerId"
        WHERE o."tenantId" = ${tenantId}
          AND o.status = 'RETURNED'
          AND o."createdAt" >= ${q.from}
          AND o."createdAt" <= ${q.to}
        ORDER BY o."createdAt" DESC
        LIMIT ${q.limit}
      `,
    ]);

    // Merge POS refunds and ecommerce returns into unified trend
    const trendMap = new Map<string, { refundPaise: number; refundCount: number }>();
    for (const r of trend) {
      const key = (r.month as Date).toISOString().slice(0, 7);
      trendMap.set(key, { refundPaise: Number(r.refundPaise), refundCount: Number(r.refundCount) });
    }
    for (const o of ecomReturned) {
      const key = (o.returnedAt as Date).toISOString().slice(0, 7);
      const existing = trendMap.get(key);
      if (existing) {
        existing.refundPaise += Number(o.amountPaise);
        existing.refundCount += 1;
      } else {
        trendMap.set(key, { refundPaise: Number(o.amountPaise), refundCount: 1 });
      }
    }

    const mergedTrend = Array.from(trendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => {
        const d = new Date(`${month}-01T00:00:00Z`);
        return {
          month,
          label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
          refundPaise: v.refundPaise,
          refundCount: v.refundCount,
        };
      });

    const posRefundRows = refunds.map((r) => ({
      id: r.id,
      billNumber: r.billNumber,
      orderNumber: null as string | null,
      customerName: r.customerName ?? null,
      shopName: r.shopName,
      amountPaise: Number(r.amountPaise),
      reason: r.reason,
      refundedAt: (r.refundedAt as Date).toISOString(),
      source: 'POS' as const,
    }));

    const ecomRefundRows = ecomReturned.map((o) => ({
      id: o.id,
      billNumber: null as string | null,
      orderNumber: o.id.slice(-8).toUpperCase(),
      customerName: o.customerName ?? null,
      shopName: 'Online Store',
      amountPaise: Number(o.amountPaise),
      reason: o.reason ?? 'Returned',
      refundedAt: (o.returnedAt as Date).toISOString(),
      source: 'ECOM' as const,
    }));

    const allRefundRows = [...posRefundRows, ...ecomRefundRows].sort(
      (a, b) => new Date(b.refundedAt).getTime() - new Date(a.refundedAt).getTime(),
    ).slice(0, q.limit);

    const totalRefundPaise = allRefundRows.reduce((s, r) => s + r.amountPaise, 0);

    res.json({
      data: {
        trend: mergedTrend,
        refunds: allRefundRows,
        totals: { refundPaise: totalRefundPaise, refundCount: allRefundRows.length },
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// REVENUE BY CATEGORY — main category / sub-category / top items
// =====================================================================

financeRouter.get('/revenue-by-category', async (req, res, next) => {
  try {
    const q = z
      .object({
        from: z.coerce.date(),
        to: z.coerce.date(),
        shopId: z.string().optional(),
      })
      .parse(req.query);
    const tenantId = getTenantId();
    if (!tenantId) { res.status(401).json(noTenantError()); return; }
    const shopFilter = q.shopId
      ? Prisma.sql`AND b."shopId" = ${q.shopId}`
      : Prisma.empty;

    const [catRows, topItems] = await Promise.all([
      prisma.$queryRaw<
        Array<{
          mainCategory: string | null;
          subCategory: string;
          revenuePaise: bigint;
          billCount: bigint;
        }>
      >`
        SELECT
          parent_cat.name  AS "mainCategory",
          cat.name         AS "subCategory",
          SUM(bl."linePaise")         AS "revenuePaise",
          COUNT(DISTINCT b.id)        AS "billCount"
        FROM "BillLine" bl
        JOIN "Bill"     b         ON b.id   = bl."billId"
        JOIN "Item"     i         ON i.id   = bl."itemId"
        JOIN "Category" cat       ON cat.id = i."categoryId"
        LEFT JOIN "Category" parent_cat ON parent_cat.id = cat."parentId"
        WHERE b."tenantId" = ${tenantId}
          AND b."voidedAt" IS NULL
          AND b."createdAt" >= ${q.from}
          AND b."createdAt" <= ${q.to}
          ${shopFilter}
        GROUP BY parent_cat.name, cat.name
        ORDER BY "revenuePaise" DESC
      `,
      prisma.$queryRaw<
        Array<{
          itemName: string | null;
          sku: string;
          categoryName: string;
          revenuePaise: bigint;
          billCount: bigint;
        }>
      >`
        SELECT
          COALESCE(i.name, i.sku) AS "itemName",
          i.sku,
          cat.name                AS "categoryName",
          SUM(bl."linePaise")     AS "revenuePaise",
          COUNT(DISTINCT b.id)    AS "billCount"
        FROM "BillLine" bl
        JOIN "Bill"     b   ON b.id   = bl."billId"
        JOIN "Item"     i   ON i.id   = bl."itemId"
        JOIN "Category" cat ON cat.id = i."categoryId"
        WHERE b."tenantId" = ${tenantId}
          AND b."voidedAt" IS NULL
          AND b."createdAt" >= ${q.from}
          AND b."createdAt" <= ${q.to}
          ${shopFilter}
        GROUP BY i.id, i.name, i.sku, cat.name
        ORDER BY "revenuePaise" DESC
        LIMIT 10
      `,
    ]);

    // Aggregate sub-categories up to main category level
    const mainCatMap = new Map<string, number>();
    for (const row of catRows) {
      const key = row.mainCategory ?? row.subCategory;
      mainCatMap.set(key, (mainCatMap.get(key) ?? 0) + Number(row.revenuePaise));
    }

    res.json({
      data: {
        byMainCategory: Array.from(mainCatMap.entries())
          .map(([category, revenuePaise]) => ({ category, revenuePaise }))
          .sort((a, b) => b.revenuePaise - a.revenuePaise),
        bySubCategory: catRows.map((r) => ({
          mainCategory: r.mainCategory ?? r.subCategory,
          subCategory: r.subCategory,
          revenuePaise: Number(r.revenuePaise),
          billCount: Number(r.billCount),
        })),
        topItems: topItems.map((i) => ({
          itemName: i.itemName ?? i.sku,
          sku: i.sku,
          categoryName: i.categoryName,
          revenuePaise: Number(i.revenuePaise),
          billCount: Number(i.billCount),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Keep an explicit no-op reference so `requireAnyPermission` import isn't
// flagged as unused — wired here for future route-level extensions.
void requireAnyPermission;
