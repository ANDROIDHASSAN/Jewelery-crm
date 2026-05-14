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

financeRouter.post('/expenses', async (req, res, next) => {
  try {
    const body = ExpenseInputSchema.parse(req.body);
    const created = await prisma.expense.create({ data: body });
    res.status(201).json({ data: created });
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
