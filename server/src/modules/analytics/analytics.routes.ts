import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { sumPaise } from '../../lib/money.js';

export const analyticsRouter: Router = Router();

analyticsRouter.get('/dashboard', async (req, res, next) => {
  try {
    const q = z
      .object({ shopId: z.string().optional(), period: z.enum(['today', 'week', 'month']).default('today') })
      .parse(req.query);

    const now = new Date();
    const start = new Date(now);
    if (q.period === 'today') start.setUTCHours(0, 0, 0, 0);
    else if (q.period === 'week') start.setUTCDate(now.getUTCDate() - 7);
    else start.setUTCDate(now.getUTCDate() - 30);

    const where = { createdAt: { gte: start, lte: now }, ...(q.shopId ? { shopId: q.shopId } : {}) };
    const [bills, leadCount] = await Promise.all([
      prisma.bill.findMany({ where, select: { totalPaise: true } }),
      prisma.lead.count({ where: { createdAt: { gte: start } } }),
    ]);

    res.json({
      data: {
        period: q.period,
        revenuePaise: sumPaise(bills.map((b) => b.totalPaise)),
        billCount: bills.length,
        newLeads: leadCount,
        asOf: now.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get('/staff', async (req, res, next) => {
  try {
    const q = z.object({ from: z.coerce.date(), to: z.coerce.date() }).parse(req.query);
    const grouped = await prisma.bill.groupBy({
      by: ['createdByUserId'],
      where: { createdAt: { gte: q.from, lte: q.to }, createdByUserId: { not: null } },
      _sum: { totalPaise: true },
      _count: { _all: true },
    });
    res.json({
      data: grouped.map((g) => ({
        userId: g.createdByUserId,
        billCount: g._count._all,
        revenuePaise: g._sum.totalPaise ?? 0,
      })),
    });
  } catch (err) {
    next(err);
  }
});
