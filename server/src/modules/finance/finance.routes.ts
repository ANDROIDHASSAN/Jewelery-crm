import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { ExpenseInputSchema } from '@goldos/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { getTenantId } from '../../lib/async-context.js';
import { sumPaise } from '../../lib/money.js';

export const financeRouter: Router = Router();

// In-process LRU cache for the dashboard summary. 60s TTL means a busy
// shop sees fresh numbers every minute but doesn't re-aggregate on every
// tile re-render. Keyed by tenantId + shopId so multi-shop tenants get
// per-shop caches.
const summaryCache = new Map<string, { value: unknown; expiresAt: number }>();
const SUMMARY_TTL_MS = 60_000;

function readCache(key: string): unknown | null {
  const hit = summaryCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    summaryCache.delete(key);
    return null;
  }
  return hit.value;
}
function writeCache(key: string, value: unknown): void {
  summaryCache.set(key, { value, expiresAt: Date.now() + SUMMARY_TTL_MS });
  // Cap the cache so unbounded shop ids can't OOM us.
  if (summaryCache.size > 200) {
    const oldest = summaryCache.keys().next().value;
    if (oldest) summaryCache.delete(oldest);
  }
}

// Single-round-trip dashboard data: KPI tiles + 6-mo trend + GST split +
// expenses-by-category + recent expenses. Pulls everything in 5 parallel
// queries with SQL aggregation (no per-row JS sum) so it stays fast even
// at high volume.
financeRouter.get('/summary', async (req, res, next) => {
  try {
    const q = z.object({ shopId: z.string().optional() }).parse(req.query);
    const tenantId = getTenantId();
    if (!tenantId) {
      res.status(401).json({ error: { code: 'NO_TENANT', message: 'Tenant context missing' } });
      return;
    }
    const cacheKey = `${tenantId}:${q.shopId ?? '*'}`;
    const cached = readCache(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json({ data: cached });
      return;
    }

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const lastMonthEnd = monthStart;
    // 6-month window covers the current month + 5 prior. date_trunc returns
    // the 1st of each month so the floor of (now - 5 months) is what we want.
    const trendStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

    const shopFilter = q.shopId ? { shopId: q.shopId } : {};

    // Run all aggregations in parallel — one shot to Postgres, no per-row JS sums.
    const [
      mtdBillAgg,
      mtdExpenseAgg,
      lastMonthGstAgg,
      trendBills,
      trendExpenses,
      expensesByCategory,
      recentExpenses,
    ] = await Promise.all([
      // 1) MTD bills aggregate — sum revenue + GST in SQL, return scalar.
      prisma.bill.aggregate({
        where: { tenantId, ...shopFilter, createdAt: { gte: monthStart, lte: now } },
        _sum: { totalPaise: true, cgstPaise: true, sgstPaise: true, igstPaise: true },
        _count: { _all: true },
      }),
      // 2) MTD expenses aggregate.
      prisma.expense.aggregate({
        where: { tenantId, ...shopFilter, paidAt: { gte: monthStart, lte: now } },
        _sum: { amountPaise: true },
        _count: { _all: true },
      }),
      // 3) Last calendar month GST (for the donut split).
      prisma.bill.aggregate({
        where: { tenantId, ...shopFilter, createdAt: { gte: lastMonthStart, lt: lastMonthEnd } },
        _sum: { cgstPaise: true, sgstPaise: true, igstPaise: true, totalPaise: true },
        _count: { _all: true },
      }),
      // 4) Bills bucketed by month — SQL GROUP BY, one trip.
      prisma.$queryRaw<Array<{ month: Date; revenue: bigint }>>`
        SELECT date_trunc('month', "createdAt") AS month, SUM("totalPaise")::bigint AS revenue
        FROM "Bill"
        WHERE "tenantId" = ${tenantId}
          AND "createdAt" >= ${trendStart}
          ${q.shopId ? prismaShopFilter(q.shopId) : prismaNoOp()}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      // 5) Expenses bucketed by month.
      prisma.$queryRaw<Array<{ month: Date; expense: bigint }>>`
        SELECT date_trunc('month', "paidAt") AS month, SUM("amountPaise")::bigint AS expense
        FROM "Expense"
        WHERE "tenantId" = ${tenantId}
          AND "paidAt" >= ${trendStart}
          ${q.shopId ? prismaShopFilter(q.shopId) : prismaNoOp()}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      // 6) MTD expenses by category (donut).
      prisma.expense.groupBy({
        by: ['category'],
        where: { tenantId, ...shopFilter, paidAt: { gte: monthStart, lte: now } },
        _sum: { amountPaise: true },
        _count: { _all: true },
      }),
      // 7) Recent expenses list (top 30 most recent).
      prisma.expense.findMany({
        where: { tenantId, ...shopFilter },
        orderBy: { paidAt: 'desc' },
        take: 30,
      }),
    ]);

    // Fill out the 6-month series with zeros so the chart always shows 6 bars.
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
      (mtdBillAgg._sum.cgstPaise ?? 0) + (mtdBillAgg._sum.sgstPaise ?? 0) + (mtdBillAgg._sum.igstPaise ?? 0);

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
      expensesByCategory: expensesByCategory.map((g) => ({
        category: g.category,
        amountPaise: g._sum.amountPaise ?? 0,
        count: g._count._all,
      })),
      recentExpenses,
    };

    writeCache(cacheKey, payload);
    res.setHeader('X-Cache', 'MISS');
    res.json({ data: payload });
  } catch (err) {
    next(err);
  }
});

// Tiny helpers to keep $queryRaw template literal type-safe when the
// shopId filter is conditional. Prisma.sql segments compose cleanly.
function prismaShopFilter(shopId: string): Prisma.Sql {
  return Prisma.sql`AND "shopId" = ${shopId}`;
}
function prismaNoOp(): Prisma.Sql {
  return Prisma.empty;
}

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
      ...(q.shopId ? { shopId: q.shopId } : {}),
    };

    const [bills, expenses] = await Promise.all([
      prisma.bill.findMany({ where, select: { totalPaise: true, cgstPaise: true, sgstPaise: true, igstPaise: true } }),
      prisma.expense.findMany({
        where: {
          paidAt: { gte: q.from, lte: q.to },
          ...(q.shopId ? { shopId: q.shopId } : {}),
        },
        select: { amountPaise: true },
      }),
    ]);
    const revenuePaise = sumPaise(bills.map((b) => b.totalPaise));
    const expensePaise = sumPaise(expenses.map((e) => e.amountPaise));
    const gstPaise = sumPaise(bills.map((b) => b.cgstPaise + b.sgstPaise + b.igstPaise));
    res.json({
      data: {
        revenuePaise,
        expensePaise,
        gstPaise,
        netPaise: revenuePaise - expensePaise,
        from: q.from.toISOString(),
        to: q.to.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

financeRouter.get('/expenses', async (req, res, next) => {
  try {
    const q = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().positive().max(100).optional(),
      })
      .parse(req.query);
    const take = q.limit ?? 20;
    const rows = await prisma.expense.findMany({
      orderBy: { paidAt: 'desc' },
      take: take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    res.json({ data: rows.slice(0, take), page: { nextCursor: hasMore ? rows.at(-2)?.id : undefined, hasMore } });
  } catch (err) {
    next(err);
  }
});

financeRouter.get('/expenses/by-category', async (req, res, next) => {
  try {
    const q = z.object({ from: z.coerce.date(), to: z.coerce.date() }).parse(req.query);
    const grouped = await prisma.expense.groupBy({
      by: ['category'],
      where: { paidAt: { gte: q.from, lte: q.to } },
      _sum: { amountPaise: true },
      _count: { _all: true },
    });
    res.json({
      data: grouped.map((g) => ({
        category: g.category,
        amountPaise: g._sum.amountPaise ?? 0,
        count: g._count._all,
      })),
    });
  } catch (err) {
    next(err);
  }
});

financeRouter.post('/expenses', async (req, res, next) => {
  try {
    const body = ExpenseInputSchema.parse(req.body);
    const created = await prisma.expense.create({ data: body });
    res.status(201).json({ data: created });
  } catch (err) {
    next(err);
  }
});

// Tally-importable CSV — bills + expenses for a date range.
// Tally accepts a generic ledger import: Date, Voucher Type, Voucher No, Ledger, Debit, Credit, Narration.
financeRouter.get('/tally-export', async (req, res, next) => {
  try {
    const q = z.object({ from: z.coerce.date(), to: z.coerce.date() }).parse(req.query);
    const [bills, expenses] = await Promise.all([
      prisma.bill.findMany({
        where: { createdAt: { gte: q.from, lte: q.to } },
        select: { billNumber: true, createdAt: true, totalPaise: true, cgstPaise: true, sgstPaise: true, igstPaise: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.expense.findMany({
        where: { paidAt: { gte: q.from, lte: q.to } },
        select: { id: true, category: true, amountPaise: true, paidAt: true, notes: true },
        orderBy: { paidAt: 'asc' },
      }),
    ]);

    const rows: string[][] = [
      ['Date', 'Voucher Type', 'Voucher No', 'Ledger', 'Debit', 'Credit', 'Narration'],
    ];
    const r = (paise: number): string => (paise / 100).toFixed(2);

    for (const b of bills) {
      const date = b.createdAt.toISOString().slice(0, 10);
      rows.push([date, 'Sales', b.billNumber, 'Sales A/c', '', r(b.totalPaise - b.cgstPaise - b.sgstPaise - b.igstPaise), 'Jewellery sale']);
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
      rows.push([date, 'Payment', `EXP-${e.id.slice(-6)}`, e.category, r(e.amountPaise), '', e.notes ?? '']);
      rows.push([date, 'Payment', `EXP-${e.id.slice(-6)}`, 'Bank / Cash', '', r(e.amountPaise), e.notes ?? '']);
    }

    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
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
});

financeRouter.get('/gst-summary', async (req, res, next) => {
  try {
    const q = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(req.query);
    const [year, monthStr] = q.month.split('-');
    const from = new Date(Date.UTC(Number(year), Number(monthStr) - 1, 1));
    const to = new Date(Date.UTC(Number(year), Number(monthStr), 1));
    const bills = await prisma.bill.findMany({
      where: { createdAt: { gte: from, lt: to } },
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
