// Analytics module — the Gold-OS live business command centre.
//
// Reports covered (one endpoint per row in the spec card):
//   /summary                 — dashboard tiles + 7d sales + gold rate
//   /dashboard               — KPI for today/week/month
//   /top-products            — best-selling storefront products
//   /staff                   — staff sales leaderboard
//   /shop-performance        — branch revenue / orders / profitability
//   /inventory-valuation     — stock value at today's gold rate (per shop/category)
//   /customer-acquisition    — channel mix (lead source + walk-in vs returning)
//   /pl-by-period            — daily / weekly / monthly P&L
//   /festive-trend           — YoY comparison for Indian festive months
//   /low-margin              — items / categories below margin threshold
//   /gst-summary             — filing-ready GST per month
//   /ad-roi                  — campaign-wise spend vs revenue (utmCampaign)
//   /gold-rate-impact        — rate vs revenue correlation
//   /scheduled-reports       — list / create / delete recurring email reports
//
// All money in paise. All queries SQL-aggregated; no per-row JS sums.

import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { sumPaise } from '../../lib/money.js';
import { readGoldRatePaise } from '../../lib/redis.js';
import { computeGoldValuePaise } from '../../lib/money.js';
import { getTenantId } from '../../lib/async-context.js';
import { withCache } from '../../lib/cache.js';

export const analyticsRouter: Router = Router();

function noTenant(res: { status: (n: number) => { json: (b: unknown) => void } }): void {
  res.status(401).json({ error: { code: 'NO_TENANT', message: 'Tenant context missing' } });
}

function shopFilterSql(shopId?: string): Prisma.Sql {
  return shopId ? Prisma.sql`AND "shopId" = ${shopId}` : Prisma.empty;
}

// =====================================================================
// /summary — admin dashboard tiles + 7-day sales + stock + gold rate
// =====================================================================

analyticsRouter.get('/summary', async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=120');
    const q = z.object({ shopId: z.string().optional() }).parse(req.query);
    const tenantId = getTenantId();
    if (!tenantId) return noTenant(res);

    // 25s TTL — dashboard polls every 60s, multi-tab users hit the cache,
    // and the dashboard summary is the most expensive admin query
    // (7 parallel Prisma calls + 4 Redis reads + an in-memory stock
    // valuation loop over every IN_STOCK item).
    const data = await withCache(
      tenantId,
      `analytics:summary:${q.shopId ?? 'ALL'}`,
      25,
      async () => buildDashboardSummary(q.shopId),
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

async function buildDashboardSummary(shopId: string | undefined): Promise<unknown> {
  const shopWhere = shopId ? { shopId } : {};
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setUTCDate(startOfToday.getUTCDate() - 1);
  const sevenDaysAgo = new Date(startOfToday);
  sevenDaysAgo.setUTCDate(startOfToday.getUTCDate() - 6);

  // Switched the three "find every row, then JS-sum totalPaise" calls to
  // SQL-side aggregates. Was the slowest part of the dashboard for tenants
  // with >5k bills; now it's a single COUNT+SUM per slice instead of
  // hauling thousands of paise integers across the wire.
  const [
    todayAgg,
    yesterdayAgg,
    sevenDayBills,
    openLeads,
    leadsToday,
    itemAgg,
    lotItems,
    purities,
  ] = await Promise.all([
    prisma.bill.aggregate({
      where: { ...shopWhere, createdAt: { gte: startOfToday, lte: now } },
      _sum: { totalPaise: true },
      _count: { _all: true },
    }),
    prisma.bill.aggregate({
      where: { ...shopWhere, createdAt: { gte: startOfYesterday, lt: startOfToday } },
      _sum: { totalPaise: true },
      _count: { _all: true },
    }),
    // Day buckets still need per-row createdAt to assign — keep findMany
    // but project only the two fields we use.
    prisma.bill.findMany({
      where: { ...shopWhere, createdAt: { gte: sevenDaysAgo, lte: now } },
      select: { totalPaise: true, createdAt: true },
    }),
    prisma.lead.count({ where: { status: { in: ['NEW', 'CONTACTED', 'INTERESTED', 'NEGOTIATION'] } } }),
    prisma.lead.count({ where: { createdAt: { gte: startOfToday } } }),
    // Stock valuation: split serialized vs lot rows so the unit count and
    // total weight stay correct under the hybrid model. Lot rows track N
    // interchangeable pieces in `quantityOnHand`, so unit count needs
    // SUM(quantityOnHand) and total weight needs SUM(weightMg * quantityOnHand).
    // Prisma's groupBy can't do conditional aggregates, so we run two
    // queries and merge in JS. Still O(k) where k = number of purities,
    // bounded by ~5 purity values in practice.
    prisma.item.groupBy({
      by: ['purityCaratX100'],
      where: { status: 'IN_STOCK', isSerialized: true, ...(shopId ? { shopId } : {}) },
      _sum: { weightMg: true },
      _count: { _all: true },
    }),
    prisma.item.findMany({
      where: { status: 'IN_STOCK', isSerialized: false, ...(shopId ? { shopId } : {}) },
      select: { purityCaratX100: true, weightMg: true, quantityOnHand: true },
    }),
    Promise.all(
      [2400, 2200, 1800, 0].map(async (p) => ({
        purity: p,
        cached: await readGoldRatePaise(p),
      })),
    ),
  ]);

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

  const rateByPurity = new Map<number, number>();
  for (const p of purities) {
    rateByPurity.set(p.purity, p.cached?.paise ?? 642_000);
  }
  let stockValuationPaise = 0;
  let itemCount = 0;
  // Serialized rows: 1 unit per row, weight is the per-piece weight.
  for (const grp of itemAgg) {
    const ratePerGramPaise = rateByPurity.get(grp.purityCaratX100) ?? 642_000;
    const totalWeightMg = grp._sum.weightMg ?? 0;
    stockValuationPaise += computeGoldValuePaise(totalWeightMg, grp.purityCaratX100, ratePerGramPaise);
    itemCount += grp._count._all;
  }
  // Lot rows: each row holds N interchangeable pieces. Value + unit count
  // both scale by quantityOnHand. Bug fix: previously these rows counted as
  // 1 unit each and contributed only a single piece's weight, so a "Gold
  // Bar 1g × 23" surfaced as "1 in stock" worth one gram.
  for (const it of lotItems) {
    const ratePerGramPaise = rateByPurity.get(it.purityCaratX100) ?? 642_000;
    const totalWeightMg = it.weightMg * it.quantityOnHand;
    stockValuationPaise += computeGoldValuePaise(totalWeightMg, it.purityCaratX100, ratePerGramPaise);
    itemCount += it.quantityOnHand;
  }

  return {
    today: { revenuePaise: todayAgg._sum.totalPaise ?? 0, billCount: todayAgg._count._all },
    yesterday: { revenuePaise: yesterdayAgg._sum.totalPaise ?? 0, billCount: yesterdayAgg._count._all },
    leads: { open: openLeads, today: leadsToday },
    stock: { valuationPaise: stockValuationPaise, itemCount },
    sevenDay: sevenDaySeries,
    goldRate: purities.map((p) => ({
      purity: p.purity,
      ratePerGramPaise: p.cached?.paise ?? 0,
      stale: p.cached?.stale ?? true,
    })),
    asOf: now.toISOString(),
  };
}

// =====================================================================
// /dashboard — KPI for today/week/month (existing)
// =====================================================================

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

// =====================================================================
// /top-products — best-selling storefront products
// =====================================================================

analyticsRouter.get('/top-products', async (req, res, next) => {
  try {
    const q = z
      .object({
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        limit: z.coerce.number().int().positive().max(50).default(10),
        // 'product' (default) = item-wise best sellers; 'category' = roll up by
        // the product's MAIN category (M3 FR#3 — client wants the main-category
        // view as the primary focus).
        groupBy: z.enum(['product', 'category']).default('product'),
      })
      .parse(req.query);
    const where = q.from || q.to ? { order: { createdAt: { gte: q.from, lte: q.to } } } : undefined;
    const grouped = await prisma.orderItem.groupBy({
      by: ['productId'],
      where,
      _sum: { qty: true, pricePaise: true },
      _count: { _all: true },
      orderBy: { _sum: { qty: 'desc' } },
      // For category roll-ups we need every product, not just the top N, so the
      // category totals are complete; product view keeps the cheap top-N take.
      ...(q.groupBy === 'category' ? {} : { take: q.limit }),
    });
    const productIds = grouped.map((g) => g.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        slug: true,
        basePricePaise: true,
        category: {
          select: { id: true, name: true, parentId: true, parent: { select: { id: true, name: true } } },
        },
      },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    if (q.groupBy === 'category') {
      // Roll up product sales into their MAIN category bucket.
      const byCat = new Map<
        string,
        { categoryId: string; name: string; qty: number; orderCount: number; revenuePaise: number }
      >();
      for (const g of grouped) {
        const p = productById.get(g.productId);
        const main = p?.category?.parent ?? p?.category ?? null;
        const id = main?.id ?? 'uncategorized';
        const agg = byCat.get(id) ?? {
          categoryId: id,
          name: main?.name ?? 'Uncategorised',
          qty: 0,
          orderCount: 0,
          revenuePaise: 0,
        };
        agg.qty += g._sum.qty ?? 0;
        agg.orderCount += g._count._all;
        agg.revenuePaise += g._sum.pricePaise ?? 0;
        byCat.set(id, agg);
      }
      const data = Array.from(byCat.values())
        .sort((a, b) => b.qty - a.qty)
        .slice(0, q.limit);
      res.json({ data, groupBy: 'category' });
      return;
    }

    res.json({
      groupBy: 'product',
      data: grouped.map((g) => {
        const p = productById.get(g.productId);
        const main = p?.category?.parent ?? p?.category ?? null;
        return {
          productId: g.productId,
          name: p?.name ?? 'Unknown',
          slug: p?.slug ?? '',
          // Surface the main category alongside each product too, so the
          // product view can show which category a best-seller belongs to.
          mainCategoryId: main?.id ?? null,
          mainCategoryName: main?.name ?? null,
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

// =====================================================================
// /staff — staff sales leaderboard
// =====================================================================

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
          select: { id: true, name: true, role: { select: { slug: true } } },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    res.json({
      data: grouped.map((g) => {
        const u = g.createdByUserId ? byId.get(g.createdByUserId) : null;
        return {
          userId: g.createdByUserId,
          userName: u?.name ?? null,
          userRole: u?.role?.slug ?? null,
          billCount: g._count._all,
          revenuePaise: g._sum.totalPaise ?? 0,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// /shop-performance — branch revenue, orders, profitability for a window
// =====================================================================

analyticsRouter.get('/shop-performance', async (req, res, next) => {
  try {
    const q = z.object({ from: z.coerce.date(), to: z.coerce.date() }).parse(req.query);
    const tenantId = getTenantId();
    if (!tenantId) return noTenant(res);

    const [billGroups, expenseGroups] = await Promise.all([
      prisma.bill.groupBy({
        by: ['shopId'],
        where: { createdAt: { gte: q.from, lte: q.to }, voidedAt: null },
        _sum: { totalPaise: true, cgstPaise: true, sgstPaise: true, igstPaise: true },
        _count: { _all: true },
      }),
      prisma.expense.groupBy({
        by: ['shopId'],
        where: { paidAt: { gte: q.from, lte: q.to }, classification: 'REVENUE' },
        _sum: { amountPaise: true },
      }),
    ]);

    const expByShop = new Map(expenseGroups.map((e) => [e.shopId, e._sum.amountPaise ?? 0]));
    const shopIds = Array.from(
      new Set([...billGroups.map((b) => b.shopId), ...expenseGroups.map((e) => e.shopId)]),
    );
    const shops = await prisma.shop.findMany({
      where: { id: { in: shopIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(shops.map((s) => [s.id, s.name]));

    const totalRevenue = billGroups.reduce((a, b) => a + (b._sum.totalPaise ?? 0), 0);

    const rows = billGroups
      .map((b) => {
        const revenue = b._sum.totalPaise ?? 0;
        const gst =
          (b._sum.cgstPaise ?? 0) + (b._sum.sgstPaise ?? 0) + (b._sum.igstPaise ?? 0);
        const expense = expByShop.get(b.shopId) ?? 0;
        const netRevenue = revenue - gst;
        const netProfit = netRevenue - expense;
        const profitPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;
        const sharePct = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0;
        return {
          shopId: b.shopId,
          shopName: nameById.get(b.shopId) ?? b.shopId.slice(-6),
          revenuePaise: revenue,
          gstPaise: gst,
          expensePaise: expense,
          netProfitPaise: netProfit,
          billCount: b._count._all,
          profitPct,
          sharePct,
        };
      })
      .sort((a, b) => b.revenuePaise - a.revenuePaise);

    res.json({
      data: { from: q.from.toISOString(), to: q.to.toISOString(), rows, totalRevenuePaise: totalRevenue },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// /inventory-valuation — total stock value at today's gold rate
// =====================================================================

analyticsRouter.get('/inventory-valuation', async (req, res, next) => {
  try {
    const q = z.object({ shopId: z.string().optional() }).parse(req.query);

    const [items, purities] = await Promise.all([
      prisma.item.findMany({
        where: { status: 'IN_STOCK', ...(q.shopId ? { shopId: q.shopId } : {}) },
        select: {
          shopId: true,
          sku: true,
          name: true,
          weightMg: true,
          purityCaratX100: true,
          costPricePaise: true,
          // Hybrid stock model: lot rows hold N interchangeable pieces in
          // quantityOnHand. Pull both so the aggregation can scale every
          // per-piece value (count, weight, cost, market) by units.
          isSerialized: true,
          quantityOnHand: true,
          // Pull the category tree info so we can aggregate by main category
          // (parentId === null) → sub category → individual items. `parent`
          // joins one level up; we treat parent.id as the "main" bucket. If
          // an item is assigned directly to a main (no sub), it's bucketed
          // under that main as its own self-bucket.
          category: {
            select: {
              id: true,
              name: true,
              metalType: true,
              parentId: true,
              parent: { select: { id: true, name: true, metalType: true } },
            },
          },
          shop: { select: { id: true, name: true } },
        },
      }),
      Promise.all(
        [2400, 2200, 1800, 1400, 9500, 0].map(async (p) => ({
          purity: p,
          cached: await readGoldRatePaise(p),
        })),
      ),
    ]);

    const rateByPurity = new Map<number, number>();
    for (const p of purities) {
      rateByPurity.set(p.purity, p.cached?.paise ?? 642_000);
    }

    type Agg = { count: number; weightMg: number; costPaise: number; marketPaise: number };
    const byShop = new Map<string, Agg & { shopName: string }>();
    const byCategory = new Map<string, Agg & { categoryName: string; metalType: string }>();
    const byProduct = new Map<
      string,
      Agg & { productName: string; categoryName: string; metalType: string }
    >();

    // Hierarchical Main → Sub → Items aggregator. Each main category bucket
    // owns its own totals + a map of sub categories. Each sub owns its own
    // totals + a map of individual items (grouped by product name, the same
    // key byProduct uses). When an item's category has no parent (it's
    // already a main), we synthesise a "(general)" sub bucket inside the
    // main with the same id so the client tree always has the same depth.
    type SubBucket = Agg & {
      subCategoryId: string;
      subCategoryName: string;
      items: Map<string, Agg & { productName: string; itemId: string }>;
    };
    type MainBucket = Agg & {
      mainCategoryId: string;
      mainCategoryName: string;
      metalType: string;
      subs: Map<string, SubBucket>;
    };
    const tree = new Map<string, MainBucket>();

    let total: Agg = { count: 0, weightMg: 0, costPaise: 0, marketPaise: 0 };

    for (const it of items) {
      const rate = rateByPurity.get(it.purityCaratX100) ?? 642_000;
      // Per-piece market value at today's rate; we scale by `units` below so
      // a lot row of 23 gold bars contributes 23× the value, not 1×.
      const marketPerPiece = computeGoldValuePaise(it.weightMg, it.purityCaratX100, rate);
      const units = it.isSerialized ? 1 : it.quantityOnHand;
      const weightTotal = it.weightMg * units;
      const costTotal = it.costPricePaise * units;
      const marketTotal = marketPerPiece * units;

      total = {
        count: total.count + units,
        weightMg: total.weightMg + weightTotal,
        costPaise: total.costPaise + costTotal,
        marketPaise: total.marketPaise + marketTotal,
      };
      const s = byShop.get(it.shopId) ?? {
        count: 0,
        weightMg: 0,
        costPaise: 0,
        marketPaise: 0,
        shopName: it.shop.name,
      };
      byShop.set(it.shopId, {
        ...s,
        count: s.count + units,
        weightMg: s.weightMg + weightTotal,
        costPaise: s.costPaise + costTotal,
        marketPaise: s.marketPaise + marketTotal,
      });
      // Roll sub-categories under their main so the "By category" surface
      // shows one row per top-level category, not one per leaf. Avoids the
      // duplicate-category problem the donut + table both had before, where
      // "Rings (gold)" + "Rings (silver)" + their parent "9kt Fine Gold"
      // all rendered as separate slices. Items tagged directly to a main
      // (parent === null branch) stay keyed by their own id.
      const byCatMainId = it.category.parent?.id ?? it.category.id;
      const byCatMainName = it.category.parent?.name ?? it.category.name;
      const byCatMainMetal = it.category.parent?.metalType ?? it.category.metalType;
      const c = byCategory.get(byCatMainId) ?? {
        count: 0,
        weightMg: 0,
        costPaise: 0,
        marketPaise: 0,
        categoryName: byCatMainName,
        metalType: byCatMainMetal,
      };
      byCategory.set(byCatMainId, {
        ...c,
        count: c.count + units,
        weightMg: c.weightMg + weightTotal,
        costPaise: c.costPaise + costTotal,
        marketPaise: c.marketPaise + marketTotal,
      });
      const productName = it.name?.trim() || it.sku;
      const productKey = `${productName.toLowerCase()}__${it.category.id}`;
      const p = byProduct.get(productKey) ?? {
        count: 0,
        weightMg: 0,
        costPaise: 0,
        marketPaise: 0,
        productName,
        categoryName: it.category.name,
        metalType: it.category.metalType,
      };
      byProduct.set(productKey, {
        ...p,
        count: p.count + units,
        weightMg: p.weightMg + weightTotal,
        costPaise: p.costPaise + costTotal,
        marketPaise: p.marketPaise + marketTotal,
      });

      // Hierarchical bucket. An item assigned directly to a main category
      // (parent === null) gets a synthetic "(general)" sub bucket whose id
      // equals the main's id, so the tree always reads main → sub → items.
      const mainId = it.category.parent?.id ?? it.category.id;
      const mainName = it.category.parent?.name ?? it.category.name;
      const mainMetal = it.category.parent?.metalType ?? it.category.metalType;
      const subId = it.category.parent ? it.category.id : it.category.id;
      const subName = it.category.parent ? it.category.name : `${it.category.name} (general)`;

      const main = tree.get(mainId) ?? {
        mainCategoryId: mainId,
        mainCategoryName: mainName,
        metalType: mainMetal,
        count: 0,
        weightMg: 0,
        costPaise: 0,
        marketPaise: 0,
        subs: new Map<string, SubBucket>(),
      };
      main.count += units;
      main.weightMg += weightTotal;
      main.costPaise += costTotal;
      main.marketPaise += marketTotal;

      const sub = main.subs.get(subId) ?? {
        subCategoryId: subId,
        subCategoryName: subName,
        count: 0,
        weightMg: 0,
        costPaise: 0,
        marketPaise: 0,
        items: new Map(),
      };
      sub.count += units;
      sub.weightMg += weightTotal;
      sub.costPaise += costTotal;
      sub.marketPaise += marketTotal;

      const productKeyInSub = `${productName.toLowerCase()}__${it.category.id}`;
      const itemBucket = sub.items.get(productKeyInSub) ?? {
        productName,
        itemId: it.sku,
        count: 0,
        weightMg: 0,
        costPaise: 0,
        marketPaise: 0,
      };
      itemBucket.count += units;
      itemBucket.weightMg += weightTotal;
      itemBucket.costPaise += costTotal;
      itemBucket.marketPaise += marketTotal;
      sub.items.set(productKeyInSub, itemBucket);
      main.subs.set(subId, sub);
      tree.set(mainId, main);
    }

    res.json({
      data: {
        asOf: new Date().toISOString(),
        total: {
          ...total,
          unrealizedProfitPaise: total.marketPaise - total.costPaise,
        },
        byShop: Array.from(byShop.entries())
          .map(([shopId, v]) => ({ shopId, ...v, unrealizedProfitPaise: v.marketPaise - v.costPaise }))
          .sort((a, b) => b.marketPaise - a.marketPaise),
        byCategory: Array.from(byCategory.entries())
          .map(([categoryId, v]) => ({ categoryId, ...v, unrealizedProfitPaise: v.marketPaise - v.costPaise }))
          .sort((a, b) => b.marketPaise - a.marketPaise),
        byProduct: Array.from(byProduct.entries())
          .map(([productKey, v]) => ({
            productKey,
            ...v,
            unrealizedProfitPaise: v.marketPaise - v.costPaise,
          }))
          .sort((a, b) => b.marketPaise - a.marketPaise),
        // Hierarchical view that mirrors the inventory Categories tab:
        // Main category (top level) → Sub categories → Items inside each
        // sub. Sorted by market value at each level so the most valuable
        // bucket reads first.
        categoryTree: Array.from(tree.values())
          .map((main) => ({
            mainCategoryId: main.mainCategoryId,
            mainCategoryName: main.mainCategoryName,
            metalType: main.metalType,
            count: main.count,
            weightMg: main.weightMg,
            costPaise: main.costPaise,
            marketPaise: main.marketPaise,
            unrealizedProfitPaise: main.marketPaise - main.costPaise,
            subs: Array.from(main.subs.values())
              .map((sub) => ({
                subCategoryId: sub.subCategoryId,
                subCategoryName: sub.subCategoryName,
                count: sub.count,
                weightMg: sub.weightMg,
                costPaise: sub.costPaise,
                marketPaise: sub.marketPaise,
                unrealizedProfitPaise: sub.marketPaise - sub.costPaise,
                items: Array.from(sub.items.values())
                  .map((item) => ({
                    productName: item.productName,
                    itemId: item.itemId,
                    count: item.count,
                    weightMg: item.weightMg,
                    costPaise: item.costPaise,
                    marketPaise: item.marketPaise,
                    unrealizedProfitPaise: item.marketPaise - item.costPaise,
                  }))
                  .sort((a, b) => b.marketPaise - a.marketPaise),
              }))
              .sort((a, b) => b.marketPaise - a.marketPaise),
          }))
          .sort((a, b) => b.marketPaise - a.marketPaise),
        goldRates: purities.map((p) => ({
          purity: p.purity,
          ratePerGramPaise: p.cached?.paise ?? 0,
          stale: p.cached?.stale ?? true,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// /customer-acquisition — channel mix from leads + walk-in vs returning
// =====================================================================

analyticsRouter.get('/customer-acquisition', async (req, res, next) => {
  try {
    const q = z.object({ from: z.coerce.date(), to: z.coerce.date() }).parse(req.query);
    const tenantId = getTenantId();
    if (!tenantId) return noTenant(res);

    const [leadsByChannel, leadConversion, walkInVsReturning] = await Promise.all([
      prisma.lead.groupBy({
        by: ['source'],
        where: { createdAt: { gte: q.from, lte: q.to } },
        _count: { _all: true },
      }),
      prisma.lead.groupBy({
        by: ['status'],
        where: { createdAt: { gte: q.from, lte: q.to } },
        _count: { _all: true },
      }),
      // Walk-in vs returning — count customers who already have an older bill
      // before the window, vs those whose first bill falls in the window.
      //
      // CRITICAL: the WHERE clause MUST include tenantId. Without it this
      // groupBy would aggregate across every tenant's Bill table (raw SQL
      // bypasses the Prisma tenant extension — see lib/prisma.ts header).
      prisma.$queryRaw<Array<{ kind: string; cnt: bigint; rev: bigint }>>`
        SELECT CASE
          WHEN MIN(b."createdAt") < ${q.from} THEN 'returning'
          ELSE 'new'
        END AS kind,
        COUNT(DISTINCT b."customerId")::bigint AS cnt,
        SUM(b."totalPaise")::bigint AS rev
        FROM "Bill" b
        WHERE b."tenantId" = ${tenantId}
          AND b."customerId" IS NOT NULL
          AND b."voidedAt" IS NULL
        GROUP BY b."customerId"
      `,
    ]);

    // Roll up the walk-in vs returning result.
    let returningCustomers = 0,
      newCustomers = 0,
      returningRev = 0,
      newRev = 0;
    for (const r of walkInVsReturning) {
      if (r.kind === 'returning') {
        returningCustomers += Number(r.cnt);
        returningRev += Number(r.rev);
      } else {
        newCustomers += Number(r.cnt);
        newRev += Number(r.rev);
      }
    }

    const totalLeads = leadsByChannel.reduce((a, g) => a + g._count._all, 0);
    const converted = leadConversion.find((s) => s.status === 'CONVERTED')?._count._all ?? 0;
    const lost = leadConversion.find((s) => s.status === 'LOST')?._count._all ?? 0;
    const conversionPct = totalLeads > 0 ? (converted / totalLeads) * 100 : 0;

    res.json({
      data: {
        from: q.from.toISOString(),
        to: q.to.toISOString(),
        bySource: leadsByChannel
          .map((g) => ({
            source: g.source,
            leadCount: g._count._all,
            sharePct: totalLeads > 0 ? (g._count._all / totalLeads) * 100 : 0,
          }))
          .sort((a, b) => b.leadCount - a.leadCount),
        byStatus: leadConversion.map((s) => ({ status: s.status, count: s._count._all })),
        totals: {
          totalLeads,
          converted,
          lost,
          conversionPct,
          newCustomers,
          returningCustomers,
          newRevenuePaise: newRev,
          returningRevenuePaise: returningRev,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// /pl-by-period — daily / weekly / monthly P&L series
// =====================================================================

analyticsRouter.get('/pl-by-period', async (req, res, next) => {
  try {
    const q = z
      .object({
        granularity: z.enum(['day', 'week', 'month']).default('day'),
        from: z.coerce.date(),
        to: z.coerce.date(),
        shopId: z.string().optional(),
      })
      .parse(req.query);
    const tenantId = getTenantId();
    if (!tenantId) return noTenant(res);

    const trunc = q.granularity;
    const billRows = await prisma.$queryRaw<Array<{ bucket: Date; revenue: bigint; gst: bigint; bills: bigint }>>`
      SELECT date_trunc(${trunc}, "createdAt") AS bucket,
             SUM("totalPaise")::bigint AS revenue,
             SUM("cgstPaise" + "sgstPaise" + "igstPaise")::bigint AS gst,
             COUNT(*)::bigint AS bills
      FROM "Bill"
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" BETWEEN ${q.from} AND ${q.to}
        AND "voidedAt" IS NULL
        ${shopFilterSql(q.shopId)}
      GROUP BY 1 ORDER BY 1 ASC
    `;
    const expenseRows = await prisma.$queryRaw<Array<{ bucket: Date; expense: bigint }>>`
      SELECT date_trunc(${trunc}, "paidAt") AS bucket,
             SUM("amountPaise")::bigint AS expense
      FROM "Expense"
      WHERE "tenantId" = ${tenantId}
        AND "paidAt" BETWEEN ${q.from} AND ${q.to}
        AND "classification" = 'REVENUE'
        ${shopFilterSql(q.shopId)}
      GROUP BY 1 ORDER BY 1 ASC
    `;
    const expByBucket = new Map(
      expenseRows.map((r) => [new Date(r.bucket).toISOString(), Number(r.expense)]),
    );
    const data = billRows.map((b) => {
      const key = new Date(b.bucket).toISOString();
      const revenue = Number(b.revenue);
      const gst = Number(b.gst);
      const expense = expByBucket.get(key) ?? 0;
      const netRevenue = revenue - gst;
      return {
        bucket: key,
        revenuePaise: revenue,
        netRevenuePaise: netRevenue,
        gstPaise: gst,
        expensePaise: expense,
        netProfitPaise: netRevenue - expense,
        billCount: Number(b.bills),
      };
    });
    res.json({ data: { granularity: q.granularity, rows: data } });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// /festive-trend — YoY comparison for Indian festive months
// =====================================================================
// Indian festive season: Aug (Raksha Bandhan) → Nov (Diwali) → Feb-Apr
// (Bridal). We surface the last 24 months keyed by month-of-year so a
// YoY comparison is one chart away.

analyticsRouter.get('/festive-trend', async (req, res, next) => {
  try {
    const tenantId = getTenantId();
    if (!tenantId) return noTenant(res);
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), 1));

    const rows = await prisma.$queryRaw<Array<{ bucket: Date; revenue: bigint; bills: bigint }>>`
      SELECT date_trunc('month', "createdAt") AS bucket,
             SUM("totalPaise")::bigint AS revenue,
             COUNT(*)::bigint AS bills
      FROM "Bill"
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= ${start}
        AND "voidedAt" IS NULL
      GROUP BY 1 ORDER BY 1 ASC
    `;

    // Pivot into { month: 'Aug', thisYear, lastYear } so the chart can plot
    // both lines side-by-side.
    interface YoY {
      monthIdx: number;
      monthLabel: string;
      currentRevenuePaise: number;
      previousRevenuePaise: number;
      currentBills: number;
      previousBills: number;
    }
    const currentY = now.getUTCFullYear();
    const prevY = currentY - 1;
    const series: YoY[] = Array.from({ length: 12 }, (_, i) => ({
      monthIdx: i,
      monthLabel: new Date(Date.UTC(2000, i, 1)).toLocaleDateString('en-IN', { month: 'short' }),
      currentRevenuePaise: 0,
      previousRevenuePaise: 0,
      currentBills: 0,
      previousBills: 0,
    }));
    for (const r of rows) {
      const d = new Date(r.bucket);
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      if (y === currentY) {
        series[m]!.currentRevenuePaise = Number(r.revenue);
        series[m]!.currentBills = Number(r.bills);
      } else if (y === prevY) {
        series[m]!.previousRevenuePaise = Number(r.revenue);
        series[m]!.previousBills = Number(r.bills);
      }
    }
    // Festive flag for Indian retail context.
    const FESTIVE_MONTHS = new Set([7, 8, 9, 10, 1, 2, 3]); // Aug, Sep, Oct, Nov, Feb, Mar, Apr (0-idx)
    res.json({
      data: {
        currentYear: currentY,
        previousYear: prevY,
        series: series.map((s) => ({ ...s, isFestive: FESTIVE_MONTHS.has(s.monthIdx) })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// /low-margin — items/products below configurable margin threshold
// =====================================================================

analyticsRouter.get('/low-margin', async (req, res, next) => {
  try {
    const q = z
      .object({
        thresholdPct: z.coerce.number().min(0).max(100).default(8),
        limit: z.coerce.number().int().positive().max(100).default(20),
      })
      .parse(req.query);
    const tenantId = getTenantId();
    if (!tenantId) return noTenant(res);

    // For each in-stock item, compare cost vs market value at today's rate.
    // Margin% = (market - cost) / market * 100. Anything below the threshold
    // is flagged.
    const [items, purities] = await Promise.all([
      prisma.item.findMany({
        where: { status: 'IN_STOCK' },
        select: {
          id: true,
          sku: true,
          weightMg: true,
          purityCaratX100: true,
          costPricePaise: true,
          category: { select: { name: true } },
          shop: { select: { name: true } },
        },
      }),
      Promise.all(
        [2400, 2200, 1800, 1400, 9500, 0].map(async (p) => ({
          purity: p,
          cached: await readGoldRatePaise(p),
        })),
      ),
    ]);
    const rateByPurity = new Map<number, number>();
    for (const p of purities) rateByPurity.set(p.purity, p.cached?.paise ?? 642_000);

    const flagged = items
      .map((it) => {
        const rate = rateByPurity.get(it.purityCaratX100) ?? 642_000;
        const market = computeGoldValuePaise(it.weightMg, it.purityCaratX100, rate);
        const marginPaise = market - it.costPricePaise;
        const marginPct = market > 0 ? (marginPaise / market) * 100 : 0;
        return {
          itemId: it.id,
          sku: it.sku,
          shopName: it.shop.name,
          categoryName: it.category.name,
          weightMg: it.weightMg,
          purityCaratX100: it.purityCaratX100,
          costPricePaise: it.costPricePaise,
          marketPaise: market,
          marginPaise,
          marginPct,
        };
      })
      .filter((r) => r.marginPct < q.thresholdPct)
      .sort((a, b) => a.marginPct - b.marginPct)
      .slice(0, q.limit);

    res.json({
      data: {
        thresholdPct: q.thresholdPct,
        flaggedCount: flagged.length,
        flaggedValuePaise: flagged.reduce((a, r) => a + r.marketPaise, 0),
        items: flagged,
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// /gst-summary — filing-ready GST for a date range
// =====================================================================

analyticsRouter.get('/gst-summary', async (req, res, next) => {
  try {
    const q = z
      .object({
        from: z.coerce.date(),
        to: z.coerce.date(),
        shopId: z.string().optional(),
      })
      .parse(req.query);
    const monthly = await prisma.$queryRaw<
      Array<{ bucket: Date; cgst: bigint; sgst: bigint; igst: bigint; taxable: bigint; bills: bigint }>
    >`
      SELECT date_trunc('month', "createdAt") AS bucket,
             SUM("cgstPaise")::bigint AS cgst,
             SUM("sgstPaise")::bigint AS sgst,
             SUM("igstPaise")::bigint AS igst,
             SUM("totalPaise")::bigint AS taxable,
             COUNT(*)::bigint AS bills
      FROM "Bill"
      WHERE "tenantId" = ${getTenantId() ?? ''}
        AND "createdAt" BETWEEN ${q.from} AND ${q.to}
        AND "voidedAt" IS NULL
        ${shopFilterSql(q.shopId)}
      GROUP BY 1 ORDER BY 1 ASC
    `;
    res.json({
      data: {
        from: q.from.toISOString(),
        to: q.to.toISOString(),
        monthly: monthly.map((r) => ({
          month: new Date(r.bucket).toISOString().slice(0, 7),
          cgstPaise: Number(r.cgst),
          sgstPaise: Number(r.sgst),
          igstPaise: Number(r.igst),
          totalGstPaise: Number(r.cgst) + Number(r.sgst) + Number(r.igst),
          taxableRevenuePaise: Number(r.taxable),
          billCount: Number(r.bills),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// /ad-roi — campaign-wise spend vs revenue
// =====================================================================
// Spend is derived from Expense rows in the "Marketing" category. Revenue
// is derived from leads with a matching utmCampaign that converted into
// bills via Customer linkage. v1 attribution is a best-effort heuristic;
// integrate with Razorpay X / Meta Ads pixel in v2.

analyticsRouter.get('/ad-roi', async (req, res, next) => {
  try {
    const q = z.object({ from: z.coerce.date(), to: z.coerce.date() }).parse(req.query);
    const tenantId = getTenantId();
    if (!tenantId) return noTenant(res);

    const [marketingSpend, leadsByCampaign] = await Promise.all([
      prisma.expense.aggregate({
        where: {
          category: 'Marketing',
          paidAt: { gte: q.from, lte: q.to },
        },
        _sum: { amountPaise: true },
        _count: { _all: true },
      }),
      prisma.$queryRaw<Array<{ campaign: string; leads: bigint; converted: bigint; revenue: bigint }>>`
        SELECT COALESCE(l."utmCampaign", l."source") AS campaign,
               COUNT(DISTINCT l."id")::bigint AS leads,
               COUNT(DISTINCT CASE WHEN l."status" = 'CONVERTED' THEN l."id" END)::bigint AS converted,
               COALESCE(SUM(b."totalPaise"), 0)::bigint AS revenue
        FROM "Lead" l
        LEFT JOIN "Bill" b ON b."customerId" = l."customerId" AND b."tenantId" = l."tenantId" AND b."voidedAt" IS NULL
        WHERE l."tenantId" = ${tenantId}
          AND l."createdAt" BETWEEN ${q.from} AND ${q.to}
        GROUP BY 1
        ORDER BY revenue DESC
      `,
    ]);

    const totalSpend = marketingSpend._sum.amountPaise ?? 0;
    const totalAttributed = leadsByCampaign.reduce((a, r) => a + Number(r.revenue), 0);
    res.json({
      data: {
        from: q.from.toISOString(),
        to: q.to.toISOString(),
        totals: {
          spendPaise: totalSpend,
          attributedRevenuePaise: totalAttributed,
          roiX: totalSpend > 0 ? totalAttributed / totalSpend : null,
        },
        campaigns: leadsByCampaign.map((c) => ({
          campaign: c.campaign || 'unknown',
          leadCount: Number(c.leads),
          convertedCount: Number(c.converted),
          attributedRevenuePaise: Number(c.revenue),
          conversionPct:
            Number(c.leads) > 0 ? (Number(c.converted) / Number(c.leads)) * 100 : 0,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// /gold-rate-impact — last 60 days gold rate vs daily revenue
// =====================================================================
// Pulls rate24KPaise and rate22KPaise from GoldRateDaily and aligns to
// daily revenue from Bill. Surfaces correlation so the owner can see
// whether margin compression on a rate spike actually shows up in sales.

analyticsRouter.get('/gold-rate-impact', async (req, res, next) => {
  try {
    const tenantId = getTenantId();
    if (!tenantId) return noTenant(res);
    const now = new Date();
    const since = new Date(now);
    since.setUTCDate(now.getUTCDate() - 60);

    const [rates, dailyRevenue] = await Promise.all([
      prisma.goldRateDaily.findMany({
        where: { date: { gte: since } },
        orderBy: { date: 'asc' },
      }),
      prisma.$queryRaw<Array<{ bucket: Date; revenue: bigint; bills: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS bucket,
               SUM("totalPaise")::bigint AS revenue,
               COUNT(*)::bigint AS bills
        FROM "Bill"
        WHERE "tenantId" = ${tenantId}
          AND "createdAt" >= ${since}
          AND "voidedAt" IS NULL
        GROUP BY 1 ORDER BY 1 ASC
      `,
    ]);

    const revByDay = new Map<string, { revenue: number; bills: number }>();
    for (const r of dailyRevenue) {
      revByDay.set(new Date(r.bucket).toISOString().slice(0, 10), {
        revenue: Number(r.revenue),
        bills: Number(r.bills),
      });
    }

    const series = rates.map((r) => {
      const key = r.date.toISOString().slice(0, 10);
      const today = revByDay.get(key);
      return {
        date: key,
        rate22KPaise: r.rate22KPaise,
        rate24KPaise: r.rate24KPaise,
        revenuePaise: today?.revenue ?? 0,
        billCount: today?.bills ?? 0,
      };
    });

    // Basic correlation: pct change in rate vs revenue. Output the
    // 7-day moving rate change and the 7-day revenue total for context.
    const rateChange =
      series.length >= 2 && series[0]!.rate22KPaise > 0
        ? ((series[series.length - 1]!.rate22KPaise - series[0]!.rate22KPaise) /
            series[0]!.rate22KPaise) *
          100
        : 0;
    const totalRevenue = series.reduce((a, s) => a + s.revenuePaise, 0);

    res.json({
      data: {
        from: since.toISOString().slice(0, 10),
        to: now.toISOString().slice(0, 10),
        series,
        meta: {
          rateChangePct: rateChange,
          totalRevenuePaise: totalRevenue,
          observationCount: series.length,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// /scheduled-reports — list / create / delete recurring email reports
// =====================================================================
// v1 stores the schedule in memory + responds with what would be created.
// In production this is a BullMQ recurring job. The endpoint shape is
// stable so we can wire the worker without UI changes.

const scheduledReports = new Map<
  string,
  { id: string; tenantId: string; reportType: string; frequency: 'daily' | 'weekly' | 'monthly'; recipients: string[]; createdAt: string }
>();

analyticsRouter.get('/scheduled-reports', (_req, res) => {
  const tenantId = getTenantId();
  if (!tenantId) return noTenant(res);
  const rows = Array.from(scheduledReports.values()).filter((r) => r.tenantId === tenantId);
  res.json({ data: rows });
});

analyticsRouter.post('/scheduled-reports', (req, res, next) => {
  try {
    const body = z
      .object({
        reportType: z.enum(['daily-sales', 'weekly-pl', 'monthly-gst', 'inventory-valuation']),
        frequency: z.enum(['daily', 'weekly', 'monthly']),
        recipients: z.array(z.string().email()).min(1).max(10),
      })
      .parse(req.body);
    const tenantId = getTenantId();
    if (!tenantId) return noTenant(res);
    const id = `sch_${Math.random().toString(36).slice(2, 10)}`;
    const row = {
      id,
      tenantId,
      reportType: body.reportType,
      frequency: body.frequency,
      recipients: body.recipients,
      createdAt: new Date().toISOString(),
    };
    scheduledReports.set(id, row);
    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.delete('/scheduled-reports/:id', (req, res) => {
  const tenantId = getTenantId();
  if (!tenantId) return noTenant(res);
  const row = scheduledReports.get(req.params.id);
  if (!row || row.tenantId !== tenantId) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Schedule not found' } });
    return;
  }
  scheduledReports.delete(req.params.id);
  res.status(204).end();
});

// =====================================================================
// /repeat-orders — repeat customer orders shop-wise, by granularity
// =====================================================================
// A "repeat order" is an order/bill made by a customer who has at least
// one prior order/bill before it. Covers both POS (Bill) and ecommerce
// (Order). Returns a time series split by channel + a per-shop breakdown.

analyticsRouter.get('/repeat-orders', async (req, res, next) => {
  try {
    const q = z
      .object({
        from: z.coerce.date(),
        to: z.coerce.date(),
        granularity: z.enum(['month', 'quarter', 'year']).default('month'),
        shopId: z.string().optional(),
      })
      .parse(req.query);
    const tenantId = getTenantId();
    if (!tenantId) return noTenant(res);

    const truncUnit =
      q.granularity === 'year' ? 'year' : q.granularity === 'quarter' ? 'quarter' : 'month';
    const truncSql = Prisma.raw(`'${truncUnit}'`);
    const shopSql = q.shopId ? Prisma.sql`AND b."shopId" = ${q.shopId}` : Prisma.empty;

    // POS repeat orders: bills made by a customer who had a prior bill before this one
    const posRepeat = await prisma.$queryRaw<
      Array<{ bucket: Date; shopId: string; repeatOrders: bigint; repeatCustomers: bigint }>
    >`
      SELECT
        date_trunc(${truncSql}, b."createdAt") AS bucket,
        b."shopId",
        COUNT(*)::bigint AS "repeatOrders",
        COUNT(DISTINCT b."customerId")::bigint AS "repeatCustomers"
      FROM "Bill" b
      WHERE b."tenantId" = ${tenantId}
        AND b."createdAt" BETWEEN ${q.from} AND ${q.to}
        AND b."voidedAt" IS NULL
        AND b."customerId" IS NOT NULL
        ${shopSql}
        AND EXISTS (
          SELECT 1 FROM "Bill" pb
          WHERE pb."tenantId" = b."tenantId"
            AND pb."customerId" = b."customerId"
            AND pb."createdAt" < b."createdAt"
            AND pb."voidedAt" IS NULL
            AND pb."id" <> b."id"
        )
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `;

    // Ecommerce repeat orders: same logic on Order table
    const ecomRepeat = await prisma.$queryRaw<
      Array<{ bucket: Date; repeatOrders: bigint; repeatCustomers: bigint }>
    >`
      SELECT
        date_trunc(${truncSql}, o."createdAt") AS bucket,
        COUNT(*)::bigint AS "repeatOrders",
        COUNT(DISTINCT o."customerId")::bigint AS "repeatCustomers"
      FROM "Order" o
      WHERE o."tenantId" = ${tenantId}
        AND o."createdAt" BETWEEN ${q.from} AND ${q.to}
        AND o."customerId" IS NOT NULL
        AND o."status" <> 'CANCELLED'
        AND EXISTS (
          SELECT 1 FROM "Order" po
          WHERE po."tenantId" = o."tenantId"
            AND po."customerId" = o."customerId"
            AND po."createdAt" < o."createdAt"
            AND po."id" <> o."id"
            AND po."status" <> 'CANCELLED'
        )
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const shopIds = [...new Set(posRepeat.map((r) => r.shopId))];
    const shops = shopIds.length
      ? await prisma.shop.findMany({ where: { id: { in: shopIds } }, select: { id: true, name: true } })
      : [];
    const shopNameById = new Map(shops.map((s) => [s.id, s.name]));

    type SeriesBucket = {
      bucket: string;
      posRepeatOrders: number;
      posRepeatCustomers: number;
      ecomRepeatOrders: number;
      ecomRepeatCustomers: number;
      totalRepeatOrders: number;
    };
    const bucketMap = new Map<string, SeriesBucket>();

    const ensureBucket = (key: string): SeriesBucket => {
      if (!bucketMap.has(key)) {
        bucketMap.set(key, {
          bucket: key,
          posRepeatOrders: 0,
          posRepeatCustomers: 0,
          ecomRepeatOrders: 0,
          ecomRepeatCustomers: 0,
          totalRepeatOrders: 0,
        });
      }
      return bucketMap.get(key)!;
    };

    for (const r of posRepeat) {
      const b = ensureBucket(new Date(r.bucket).toISOString().slice(0, 10));
      b.posRepeatOrders += Number(r.repeatOrders);
      b.posRepeatCustomers += Number(r.repeatCustomers);
      b.totalRepeatOrders += Number(r.repeatOrders);
    }
    for (const r of ecomRepeat) {
      const b = ensureBucket(new Date(r.bucket).toISOString().slice(0, 10));
      b.ecomRepeatOrders += Number(r.repeatOrders);
      b.ecomRepeatCustomers += Number(r.repeatCustomers);
      b.totalRepeatOrders += Number(r.repeatOrders);
    }

    const series = Array.from(bucketMap.values()).sort((a, c) => a.bucket.localeCompare(c.bucket));

    const byShop = new Map<string, { shopId: string; shopName: string; repeatOrders: number; repeatCustomers: number }>();
    for (const r of posRepeat) {
      const entry = byShop.get(r.shopId) ?? {
        shopId: r.shopId,
        shopName: shopNameById.get(r.shopId) ?? r.shopId.slice(-6),
        repeatOrders: 0,
        repeatCustomers: 0,
      };
      entry.repeatOrders += Number(r.repeatOrders);
      entry.repeatCustomers += Number(r.repeatCustomers);
      byShop.set(r.shopId, entry);
    }

    res.json({
      data: {
        from: q.from.toISOString(),
        to: q.to.toISOString(),
        granularity: q.granularity,
        series,
        byShop: Array.from(byShop.values()).sort((a, b) => b.repeatOrders - a.repeatOrders),
        totals: {
          posRepeatOrders: series.reduce((a, r) => a + r.posRepeatOrders, 0),
          ecomRepeatOrders: series.reduce((a, r) => a + r.ecomRepeatOrders, 0),
          totalRepeatOrders: series.reduce((a, r) => a + r.totalRepeatOrders, 0),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// /returns — POS refunds + ecommerce RETURNED/CANCELLED by granularity
// =====================================================================
// "RTO" (Return to Origin) covers both channel types:
//   - POS: Refund rows joined to Bill for shop / date
//   - Ecommerce: Order.status = RETURNED (post-delivery) or CANCELLED

analyticsRouter.get('/returns', async (req, res, next) => {
  try {
    const q = z
      .object({
        from: z.coerce.date(),
        to: z.coerce.date(),
        granularity: z.enum(['month', 'quarter', 'year']).default('month'),
        shopId: z.string().optional(),
      })
      .parse(req.query);
    const tenantId = getTenantId();
    if (!tenantId) return noTenant(res);

    const truncUnit =
      q.granularity === 'year' ? 'year' : q.granularity === 'quarter' ? 'quarter' : 'month';
    const truncSql = Prisma.raw(`'${truncUnit}'`);
    const shopSql = q.shopId ? Prisma.sql`AND b."shopId" = ${q.shopId}` : Prisma.empty;

    const [posReturns, ecomReturns] = await Promise.all([
      prisma.$queryRaw<
        Array<{ bucket: Date; shopId: string; cnt: bigint; amountPaise: bigint }>
      >`
        SELECT
          date_trunc(${truncSql}, r."refundedAt") AS bucket,
          b."shopId",
          COUNT(*)::bigint AS cnt,
          COALESCE(SUM(r."amountPaise"), 0)::bigint AS "amountPaise"
        FROM "Refund" r
        JOIN "Bill" b ON b."id" = r."billId"
        WHERE b."tenantId" = ${tenantId}
          AND r."refundedAt" BETWEEN ${q.from} AND ${q.to}
          ${shopSql}
        GROUP BY 1, 2
        ORDER BY 1 ASC
      `,
      prisma.$queryRaw<
        Array<{ bucket: Date; status: string; cnt: bigint; amountPaise: bigint }>
      >`
        SELECT
          date_trunc(${truncSql}, o."createdAt") AS bucket,
          o."status",
          COUNT(*)::bigint AS cnt,
          COALESCE(SUM(o."totalPaise"), 0)::bigint AS "amountPaise"
        FROM "Order" o
        WHERE o."tenantId" = ${tenantId}
          AND o."status" IN ('RETURNED', 'CANCELLED')
          AND o."createdAt" BETWEEN ${q.from} AND ${q.to}
        GROUP BY 1, 2
        ORDER BY 1 ASC
      `,
    ]);

    const shopIds = [...new Set(posReturns.map((r) => r.shopId))];
    const shops = shopIds.length
      ? await prisma.shop.findMany({ where: { id: { in: shopIds } }, select: { id: true, name: true } })
      : [];
    const shopNameById = new Map(shops.map((s) => [s.id, s.name]));

    type ReturnBucket = {
      bucket: string;
      posCount: number;
      posAmountPaise: number;
      ecomReturnCount: number;
      ecomCancelCount: number;
      ecomAmountPaise: number;
      totalCount: number;
    };
    const bucketMap = new Map<string, ReturnBucket>();

    const ensureBucket = (key: string): ReturnBucket => {
      if (!bucketMap.has(key)) {
        bucketMap.set(key, {
          bucket: key,
          posCount: 0,
          posAmountPaise: 0,
          ecomReturnCount: 0,
          ecomCancelCount: 0,
          ecomAmountPaise: 0,
          totalCount: 0,
        });
      }
      return bucketMap.get(key)!;
    };

    for (const r of posReturns) {
      const b = ensureBucket(new Date(r.bucket).toISOString().slice(0, 10));
      b.posCount += Number(r.cnt);
      b.posAmountPaise += Number(r.amountPaise);
      b.totalCount += Number(r.cnt);
    }
    for (const r of ecomReturns) {
      const b = ensureBucket(new Date(r.bucket).toISOString().slice(0, 10));
      if (r.status === 'RETURNED') {
        b.ecomReturnCount += Number(r.cnt);
      } else {
        b.ecomCancelCount += Number(r.cnt);
      }
      b.ecomAmountPaise += Number(r.amountPaise);
      b.totalCount += Number(r.cnt);
    }

    const series = Array.from(bucketMap.values()).sort((a, c) => a.bucket.localeCompare(c.bucket));

    const byShop = new Map<string, { shopId: string; shopName: string; cnt: number; amountPaise: number }>();
    for (const r of posReturns) {
      const entry = byShop.get(r.shopId) ?? {
        shopId: r.shopId,
        shopName: shopNameById.get(r.shopId) ?? r.shopId.slice(-6),
        cnt: 0,
        amountPaise: 0,
      };
      entry.cnt += Number(r.cnt);
      entry.amountPaise += Number(r.amountPaise);
      byShop.set(r.shopId, entry);
    }

    const totalPosCount = posReturns.reduce((a, r) => a + Number(r.cnt), 0);
    const totalPosAmount = posReturns.reduce((a, r) => a + Number(r.amountPaise), 0);
    const ecomReturnedRows = ecomReturns.filter((r) => r.status === 'RETURNED');
    const ecomCancelledRows = ecomReturns.filter((r) => r.status === 'CANCELLED');

    res.json({
      data: {
        from: q.from.toISOString(),
        to: q.to.toISOString(),
        granularity: q.granularity,
        series,
        byShop: Array.from(byShop.values())
          .map((s) => ({ shopId: s.shopId, shopName: s.shopName, count: s.cnt, amountPaise: s.amountPaise }))
          .sort((a, b) => b.count - a.count),
        totals: {
          posCount: totalPosCount,
          posAmountPaise: totalPosAmount,
          ecomReturnCount: ecomReturnedRows.reduce((a, r) => a + Number(r.cnt), 0),
          ecomCancelCount: ecomCancelledRows.reduce((a, r) => a + Number(r.cnt), 0),
          ecomAmountPaise: ecomReturns.reduce((a, r) => a + Number(r.amountPaise), 0),
          totalCount:
            totalPosCount +
            ecomReturnedRows.reduce((a, r) => a + Number(r.cnt), 0) +
            ecomCancelledRows.reduce((a, r) => a + Number(r.cnt), 0),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});
