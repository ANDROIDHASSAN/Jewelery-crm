import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { sumPaise } from '../../lib/money.js';
import { readGoldRatePaise } from '../../lib/redis.js';
import { computeGoldValuePaise } from '../../lib/money.js';

export const analyticsRouter: Router = Router();

// Single round-trip for the admin Dashboard tiles + 7d sales chart + live gold rate.
// Heavy aggregation but cheap on small/medium tenants; cache later if needed.
analyticsRouter.get('/summary', async (req, res, next) => {
  try {
    const q = z.object({ shopId: z.string().optional() }).parse(req.query);
    const shopWhere = q.shopId ? { shopId: q.shopId } : {};

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setUTCDate(startOfToday.getUTCDate() - 1);
    const sevenDaysAgo = new Date(startOfToday);
    sevenDaysAgo.setUTCDate(startOfToday.getUTCDate() - 6);

    const [todayBills, yesterdayBills, sevenDayBills, openLeads, leadsToday, items, purities] =
      await Promise.all([
        prisma.bill.findMany({
          where: { ...shopWhere, createdAt: { gte: startOfToday, lte: now } },
          select: { totalPaise: true },
        }),
        prisma.bill.findMany({
          where: { ...shopWhere, createdAt: { gte: startOfYesterday, lt: startOfToday } },
          select: { totalPaise: true },
        }),
        prisma.bill.findMany({
          where: { ...shopWhere, createdAt: { gte: sevenDaysAgo, lte: now } },
          select: { totalPaise: true, createdAt: true },
        }),
        prisma.lead.count({ where: { status: { in: ['NEW', 'CONTACTED', 'INTERESTED', 'NEGOTIATION'] } } }),
        prisma.lead.count({ where: { createdAt: { gte: startOfToday } } }),
        prisma.item.findMany({
          where: { status: 'IN_STOCK', ...(q.shopId ? { shopId: q.shopId } : {}) },
          select: { weightMg: true, purityCaratX100: true },
        }),
        // Gold rate cache for the purities we surface on the dashboard.
        Promise.all(
          [2400, 2200, 1800, 0].map(async (p) => ({
            purity: p,
            cached: await readGoldRatePaise(p),
          })),
        ),
      ]);

    // 7-day series, bucketed by UTC day. Fill in missing days with 0.
    const buckets = new Map<string, number>();
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(sevenDaysAgo);
      d.setUTCDate(sevenDaysAgo.getUTCDate() + i);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const b of sevenDayBills) {
      const key = b.createdAt.toISOString().slice(0, 10);
      buckets.set(key, (buckets.get(key) ?? 0) + b.totalPaise);
    }
    const sevenDaySeries = Array.from(buckets.entries()).map(([date, revenuePaise]) => ({
      date,
      revenuePaise,
    }));

    // Stock valuation — re-use the inventory math inline (avoid a second findMany).
    let stockValuationPaise = 0;
    for (const it of items) {
      const cached = await readGoldRatePaise(it.purityCaratX100);
      const ratePerGramPaise = cached?.paise ?? 642_000;
      stockValuationPaise += computeGoldValuePaise(it.weightMg, it.purityCaratX100, ratePerGramPaise);
    }

    const todayRevenuePaise = sumPaise(todayBills.map((b) => b.totalPaise));
    const yesterdayRevenuePaise = sumPaise(yesterdayBills.map((b) => b.totalPaise));

    res.json({
      data: {
        today: { revenuePaise: todayRevenuePaise, billCount: todayBills.length },
        yesterday: { revenuePaise: yesterdayRevenuePaise, billCount: yesterdayBills.length },
        leads: { open: openLeads, today: leadsToday },
        stock: { valuationPaise: stockValuationPaise, itemCount: items.length },
        sevenDay: sevenDaySeries,
        goldRate: purities.map((p) => ({
          purity: p.purity,
          ratePerGramPaise: p.cached?.paise ?? 0,
          stale: p.cached?.stale ?? true,
        })),
        asOf: now.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

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

analyticsRouter.get('/top-products', async (req, res, next) => {
  try {
    const q = z
      .object({
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        limit: z.coerce.number().int().positive().max(50).default(5),
      })
      .parse(req.query);
    const grouped = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: q.from || q.to ? { order: { createdAt: { gte: q.from, lte: q.to } } } : undefined,
      _sum: { qty: true, pricePaise: true },
      _count: { _all: true },
      orderBy: { _sum: { qty: 'desc' } },
      take: q.limit,
    });
    const productIds = grouped.map((g) => g.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, slug: true, basePricePaise: true },
    });
    const productById = new Map(products.map((p) => [p.id, p]));
    res.json({
      data: grouped.map((g) => {
        const p = productById.get(g.productId);
        return {
          productId: g.productId,
          name: p?.name ?? 'Unknown',
          slug: p?.slug ?? '',
          qty: g._sum.qty ?? 0,
          orderCount: g._count._all,
          revenuePaise: g._sum.pricePaise ?? 0,
        };
      }),
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
    const userIds = grouped.map((g) => g.createdByUserId!).filter(Boolean);
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, role: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    res.json({
      data: grouped.map((g) => {
        const u = g.createdByUserId ? byId.get(g.createdByUserId) : null;
        return {
          userId: g.createdByUserId,
          userName: u?.name ?? null,
          userRole: u?.role ?? null,
          billCount: g._count._all,
          revenuePaise: g._sum.totalPaise ?? 0,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});
