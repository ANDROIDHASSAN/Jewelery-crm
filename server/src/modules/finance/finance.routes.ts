import { Router } from 'express';
import { z } from 'zod';
import { ExpenseInputSchema } from '@goldos/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { sumPaise } from '../../lib/money.js';

export const financeRouter: Router = Router();

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
