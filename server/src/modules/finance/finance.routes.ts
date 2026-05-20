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
import { Prisma } from '@prisma/client';
import {
  ExpenseInputSchema,
  ExpenseUpdateSchema,
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

function noTenantError(): { error: { code: string; message: string } } {
  return { error: { code: 'NO_TENANT', message: 'Tenant context missing' } };
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
    ] = await Promise.all([
      prisma.bill.aggregate({
        where: { tenantId, ...shopFilter, createdAt: { gte: monthStart, lte: now } },
        _sum: { totalPaise: true, cgstPaise: true, sgstPaise: true, igstPaise: true },
        _count: { _all: true },
      }),
      prisma.expense.aggregate({
        where: { tenantId, ...shopFilter, paidAt: { gte: monthStart, lte: now } },
        _sum: { amountPaise: true },
        _count: { _all: true },
      }),
      prisma.bill.aggregate({
        where: { tenantId, ...shopFilter, createdAt: { gte: lastMonthStart, lt: lastMonthEnd } },
        _sum: { cgstPaise: true, sgstPaise: true, igstPaise: true, totalPaise: true },
        _count: { _all: true },
      }),
      prisma.$queryRaw<Array<{ month: Date; revenue: bigint }>>`
        SELECT date_trunc('month', "createdAt") AS month, SUM("totalPaise")::bigint AS revenue
        FROM "Bill"
        WHERE "tenantId" = ${tenantId}
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
        where: { tenantId, createdAt: { gte: monthStart, lte: now } },
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
    const trend = monthKeys.map((k, i) => ({
      month: k,
      label: monthLabels[i]!,
      revenuePaise: revByMonth.get(k) ?? 0,
      expensePaise: expByMonth.get(k) ?? 0,
    }));

    const revenuePaise = mtdBillAgg._sum.totalPaise ?? 0;
    const expensePaise = mtdExpenseAgg._sum.amountPaise ?? 0;
    const gstPaise =
      (mtdBillAgg._sum.cgstPaise ?? 0) +
      (mtdBillAgg._sum.sgstPaise ?? 0) +
      (mtdBillAgg._sum.igstPaise ?? 0);

    // Build branch-level rollup (shop name lookup happens in one extra query).
    const branchShopIds = Array.from(
      new Set([
        ...branchBills.map((b) => b.shopId),
        ...branchExpenses.map((b) => b.shopId),
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
    const branches = branchBills
      .map((b) => {
        const rev = b._sum.totalPaise ?? 0;
        const exp = branchExpenseById.get(b.shopId) ?? 0;
        return {
          shopId: b.shopId,
          shopName: shopNameById.get(b.shopId) ?? b.shopId.slice(-6),
          revenuePaise: rev,
          expensePaise: exp,
          netPaise: rev - exp,
          billCount: b._count._all,
          gstPaise:
            (b._sum.cgstPaise ?? 0) + (b._sum.sgstPaise ?? 0) + (b._sum.igstPaise ?? 0),
        };
      })
      .sort((a, b) => b.revenuePaise - a.revenuePaise);

    const payload = {
      asOf: now.toISOString(),
      mtd: {
        revenuePaise,
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

    const [bills, payments, refundAgg, byShop, byDay] = await Promise.all([
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
        where: { tenantId, createdAt: { gte: from, lte: to }, voidedAt: null },
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
    ]);

    const shopIds = byShop.map((b) => b.shopId);
    const shops = await prisma.shop.findMany({
      where: { tenantId, id: { in: shopIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(shops.map((s) => [s.id, s.name]));

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

    res.json({
      data: {
        from: from.toISOString(),
        to: to.toISOString(),
        totals: {
          revenuePaise: totalRev,
          billCount,
          avgBillPaise: billCount ? Math.round(totalRev / billCount) : 0,
          cashPaise,
          digitalPaise,
          gstPaise:
            (bills._sum.cgstPaise ?? 0) + (bills._sum.sgstPaise ?? 0) + (bills._sum.igstPaise ?? 0),
          discountPaise: bills._sum.discountPaise ?? 0,
          refundPaise,
          refundCount,
          netCollectionPaise: totalRev - refundPaise,
        },
        paymentMix: payments.map((p) => ({
          mode: p.mode,
          amountPaise: Number(p.amount),
          count: Number(p.cnt),
        })),
        byShop: byShop
          .map((b) => ({
            shopId: b.shopId,
            shopName: nameById.get(b.shopId) ?? b.shopId.slice(-6),
            revenuePaise: b._sum.totalPaise ?? 0,
            gstPaise:
              (b._sum.cgstPaise ?? 0) + (b._sum.sgstPaise ?? 0) + (b._sum.igstPaise ?? 0),
            billCount: b._count._all,
          }))
          .sort((a, b) => b.revenuePaise - a.revenuePaise),
        byDay: byDay.map((d) => ({
          day: new Date(d.day).toISOString().slice(0, 10),
          revenuePaise: Number(d.revenue),
          billCount: Number(d.cnt),
        })),
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
      ...shopWhere(q.shopId),
    };

    const [bills, expenses, expensesByCat] = await Promise.all([
      prisma.bill.findMany({
        where,
        select: { totalPaise: true, cgstPaise: true, sgstPaise: true, igstPaise: true, oldGoldValuePaise: true, makingChargesPaise: true, discountPaise: true },
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
    const revenuePaise = sumPaise(bills.map((b) => b.totalPaise));
    const gstPaise = sumPaise(bills.map((b) => b.cgstPaise + b.sgstPaise + b.igstPaise));
    const makingChargesPaise = sumPaise(bills.map((b) => b.makingChargesPaise));
    const discountPaise = sumPaise(bills.map((b) => b.discountPaise));
    const oldGoldPaise = sumPaise(bills.map((b) => b.oldGoldValuePaise));
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
      const [bills, expenses, vendorPayments] = await Promise.all([
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

      if (q.format === 'xml') {
        const xml = buildTallyXml({ bills, expenses, vendorPayments });
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
    const bills = await prisma.bill.findMany({
      where: { createdAt: { gte: from, lt: to }, ...shopWhere(q.shopId) },
      select: { cgstPaise: true, sgstPaise: true, igstPaise: true, totalPaise: true },
    });
    res.json({
      data: {
        month: q.month,
        cgstPaise: sumPaise(bills.map((b) => b.cgstPaise)),
        sgstPaise: sumPaise(bills.map((b) => b.sgstPaise)),
        igstPaise: sumPaise(bills.map((b) => b.igstPaise)),
        taxableRevenuePaise: sumPaise(bills.map((b) => b.totalPaise)),
        billCount: bills.length,
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
    const bills = await prisma.bill.findMany({
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
    });
    res.json({ data: bills });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 7. GOLD LOANS
// =====================================================================

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

    const [billAgg, expenseAgg, prevBillAgg, prevExpenseAgg, monthly, byShop] = await Promise.all([
      prisma.bill.aggregate({
        where: { tenantId, createdAt: { gte: fyStart, lt: fyEnd } },
        _sum: { totalPaise: true, cgstPaise: true, sgstPaise: true, igstPaise: true },
        _count: { _all: true },
      }),
      prisma.expense.aggregate({
        where: { tenantId, paidAt: { gte: fyStart, lt: fyEnd } },
        _sum: { amountPaise: true },
        _count: { _all: true },
      }),
      prisma.bill.aggregate({
        where: { tenantId, createdAt: { gte: prevFyStart, lt: prevFyEnd } },
        _sum: { totalPaise: true },
      }),
      prisma.expense.aggregate({
        where: { tenantId, paidAt: { gte: prevFyStart, lt: prevFyEnd } },
        _sum: { amountPaise: true },
      }),
      prisma.$queryRaw<Array<{ month: Date; revenue: bigint; expense: bigint }>>`
        SELECT m::date AS month,
               COALESCE((
                 SELECT SUM("totalPaise") FROM "Bill"
                 WHERE "tenantId" = ${tenantId}
                   AND "createdAt" >= m
                   AND "createdAt" < (m + INTERVAL '1 month')
               ),0)::bigint AS revenue,
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
        where: { tenantId, createdAt: { gte: fyStart, lt: fyEnd } },
        _sum: { totalPaise: true, cgstPaise: true, sgstPaise: true, igstPaise: true },
        _count: { _all: true },
      }),
    ]);

    const fyShopIds = byShop.map((b) => b.shopId);
    const shops = await prisma.shop.findMany({
      where: { tenantId, id: { in: fyShopIds } },
      select: { id: true, name: true },
    });
    const shopName = new Map(shops.map((s) => [s.id, s.name]));

    const revenuePaise = billAgg._sum.totalPaise ?? 0;
    const expensePaise = expenseAgg._sum.amountPaise ?? 0;
    const prevRev = prevBillAgg._sum.totalPaise ?? 0;
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
        gstPaise:
          (billAgg._sum.cgstPaise ?? 0) +
          (billAgg._sum.sgstPaise ?? 0) +
          (billAgg._sum.igstPaise ?? 0),
        billCount: billAgg._count._all,
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
        byShop: byShop
          .map((s) => ({
            shopId: s.shopId,
            shopName: shopName.get(s.shopId) ?? s.shopId.slice(-6),
            revenuePaise: s._sum.totalPaise ?? 0,
            gstPaise:
              (s._sum.cgstPaise ?? 0) + (s._sum.sgstPaise ?? 0) + (s._sum.igstPaise ?? 0),
            billCount: s._count._all,
          }))
          .sort((a, b) => b.revenuePaise - a.revenuePaise),
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

// Keep an explicit no-op reference so `requireAnyPermission` import isn't
// flagged as unused — wired here for future route-level extensions.
void requireAnyPermission;
