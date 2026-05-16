// Read-only "Offline Shops" monitor — what the owner / accountant sees from
// the admin panel. Aggregates POS activity across every shop in the tenant.
//
// All queries are tenant-scoped via the Prisma extension. No mutations live
// here — writes belong to the POS subdomain endpoints (pos.routes.ts +
// pos-features.routes.ts) which require the cashier permission `pos.access`,
// not `pos.monitor`.

import { prisma } from '../../lib/prisma.js';
import { sumPaise } from '../../lib/money.js';

/**
 * Per-shop snapshot used by the admin "Offline Shops" dashboard. One row
 * per shop, with today's headline metrics + open-till state at a glance.
 */
export interface ShopCounterSummary {
  shopId: string;
  shopName: string;
  // Live state
  registerStatus: 'OPEN' | 'CLOSED';
  openSessionId: string | null;
  openedAt: string | null;
  openedByUserId: string | null;
  openedByName: string | null;
  openingFloatPaise: number;
  // Today's running totals (00:00 IST → now)
  billsCountToday: number;
  revenueTodayPaise: number;
  cashSalesTodayPaise: number;
  digitalSalesTodayPaise: number;
  refundsTodayPaise: number;
  activeParkedBills: number;
  // Repairs & estimates queue depth
  activeRepairs: number;
  activeEstimates: number;
  activeAdvancesPaise: number;
}

function istStartOfDay(now = new Date()): Date {
  // IST is +5:30 from UTC. Round to the start of the IST calendar day.
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const istMidnightUtc = Date.UTC(
    istNow.getUTCFullYear(),
    istNow.getUTCMonth(),
    istNow.getUTCDate(),
  );
  // Convert back to a real UTC instant.
  return new Date(istMidnightUtc - 5.5 * 60 * 60 * 1000);
}

export async function getCounterSummary(): Promise<ShopCounterSummary[]> {
  const since = istStartOfDay();

  const [shops, openSessions, todaysBills, parked, repairs, estimates, advances] = await Promise.all([
    prisma.shop.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.registerSession.findMany({
      where: { status: 'OPEN' },
      include: { openedBy: { select: { id: true, name: true } } },
    }),
    prisma.bill.findMany({
      where: { createdAt: { gte: since } },
      select: {
        shopId: true,
        totalPaise: true,
        voidedAt: true,
        payments: { select: { mode: true, amountPaise: true } },
        refunds: { select: { amountPaise: true } },
      },
    }),
    prisma.parkedBill.groupBy({ by: ['shopId'], where: { status: 'ACTIVE' }, _count: { _all: true } }),
    prisma.repair.groupBy({
      by: ['shopId'],
      where: { status: { in: ['INTAKE', 'IN_WORKSHOP', 'READY'] } },
      _count: { _all: true },
    }),
    prisma.estimate.groupBy({
      by: ['shopId'],
      where: { status: { in: ['DRAFT', 'SENT'] }, validUntil: { gte: new Date() } },
      _count: { _all: true },
    }),
    prisma.advance.groupBy({
      by: ['shopId'],
      where: { status: 'ACTIVE' },
      _sum: { amountPaise: true },
    }),
  ]);

  const openByShop = new Map(openSessions.map((s) => [s.shopId, s]));
  const parkedByShop = new Map(parked.map((p) => [p.shopId, p._count._all]));
  const repairsByShop = new Map(repairs.map((r) => [r.shopId, r._count._all]));
  const estimatesByShop = new Map(estimates.map((e) => [e.shopId, e._count._all]));
  const advancesByShop = new Map(advances.map((a) => [a.shopId, a._sum.amountPaise ?? 0]));

  // Bills aggregation per shop.
  const billsByShop = new Map<string, {
    count: number;
    revenuePaise: number;
    cashPaise: number;
    digitalPaise: number;
    refundsPaise: number;
  }>();
  for (const bill of todaysBills) {
    if (bill.voidedAt) continue; // voided bills don't count toward revenue
    const agg = billsByShop.get(bill.shopId) ?? {
      count: 0,
      revenuePaise: 0,
      cashPaise: 0,
      digitalPaise: 0,
      refundsPaise: 0,
    };
    agg.count += 1;
    agg.revenuePaise += bill.totalPaise;
    for (const p of bill.payments) {
      if (p.mode === 'CASH') agg.cashPaise += p.amountPaise;
      else if (p.mode !== 'GOLD_EXCHANGE' && p.mode !== 'LOYALTY' && p.mode !== 'STORE_CREDIT' && p.mode !== 'ADVANCE') {
        agg.digitalPaise += p.amountPaise;
      }
    }
    agg.refundsPaise += sumPaise(bill.refunds.map((r) => r.amountPaise));
    billsByShop.set(bill.shopId, agg);
  }

  return shops.map((s) => {
    const open = openByShop.get(s.id);
    const bills = billsByShop.get(s.id);
    return {
      shopId: s.id,
      shopName: s.name,
      registerStatus: open ? 'OPEN' : 'CLOSED',
      openSessionId: open?.id ?? null,
      openedAt: open?.openedAt.toISOString() ?? null,
      openedByUserId: open?.openedByUserId ?? null,
      openedByName: open?.openedBy.name ?? null,
      openingFloatPaise: open?.openingFloatPaise ?? 0,
      billsCountToday: bills?.count ?? 0,
      revenueTodayPaise: bills?.revenuePaise ?? 0,
      cashSalesTodayPaise: bills?.cashPaise ?? 0,
      digitalSalesTodayPaise: bills?.digitalPaise ?? 0,
      refundsTodayPaise: bills?.refundsPaise ?? 0,
      activeParkedBills: parkedByShop.get(s.id) ?? 0,
      activeRepairs: repairsByShop.get(s.id) ?? 0,
      activeEstimates: estimatesByShop.get(s.id) ?? 0,
      activeAdvancesPaise: advancesByShop.get(s.id) ?? 0,
    } satisfies ShopCounterSummary;
  });
}

/** Today's bills across every shop — for the live tape on the monitor. */
export async function listRecentBills(opts: { shopId?: string; limit?: number }) {
  const take = Math.min(opts.limit ?? 25, 100);
  return prisma.bill.findMany({
    where: opts.shopId ? { shopId: opts.shopId } : undefined,
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      billNumber: true,
      shopId: true,
      totalPaise: true,
      paymentStatus: true,
      voidedAt: true,
      createdAt: true,
      customer: { select: { name: true, phone: true } },
      shop: { select: { name: true } },
      createdByUserId: true,
    },
  });
}

/** Register sessions list — both open and recently-closed (last 7 days). */
export async function listRegisterSessions() {
  const since = new Date(Date.now() - 7 * 86_400_000);
  return prisma.registerSession.findMany({
    where: { OR: [{ status: 'OPEN' }, { closedAt: { gte: since } }] },
    orderBy: [{ status: 'asc' }, { openedAt: 'desc' }],
    include: {
      shop: { select: { name: true } },
      openedBy: { select: { name: true } },
      _count: { select: { bills: true } },
    },
    take: 100,
  });
}

/** Salesperson / cashier leaderboard for the day. */
export async function getStaffPerformance(opts: { from?: Date; to?: Date }) {
  const from = opts.from ?? istStartOfDay();
  const to = opts.to ?? new Date();
  const grouped = await prisma.bill.groupBy({
    by: ['createdByUserId', 'shopId'],
    where: { createdAt: { gte: from, lte: to }, voidedAt: null, createdByUserId: { not: null } },
    _count: { _all: true },
    _sum: { totalPaise: true },
  });
  const userIds = [...new Set(grouped.map((g) => g.createdByUserId!))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, role: { select: { slug: true } } },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));
  return grouped.map((g) => ({
    userId: g.createdByUserId!,
    userName: userById.get(g.createdByUserId!)?.name ?? '—',
    roleSlug: userById.get(g.createdByUserId!)?.role.slug ?? null,
    shopId: g.shopId,
    billCount: g._count._all,
    revenuePaise: g._sum.totalPaise ?? 0,
  })).sort((a, b) => b.revenuePaise - a.revenuePaise);
}
