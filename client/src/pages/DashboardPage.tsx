// Dashboard — single scrollable command center for the admin.
// Every section is live from the DB; no hardcoded numbers. Polling intervals
// are conservative (30–60s) so the page stays cheap to keep open all day.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Coins,
  Flame,
  Package,
  Receipt,
  ScrollText,
  ShoppingBag,
  Store,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { MetricCard } from '@/components/ui/MetricCard';
import { Money } from '@/components/ui/money';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionCard } from '@/components/ui/SectionCard';
import { cn } from '@/lib/cn';
import {
  ChartCard,
  CurrencyBarChart,
  CurrencyDonutChart,
  RankedBarChart,
  RevenueAreaChart,
} from '@/components/ui/charts';
import { useGetDashboardSummaryQuery } from '@/features/dashboard/dashboardApi';
import { useSelectedShopId } from '@/features/ui/shopFilterSlice';
import { useGetPlQuery, useGetExpensesByCategoryQuery } from '@/features/finance/financeApi';
import { useGetLeadsQuery } from '@/features/crm/crmApi';
import { useGetOrdersQuery, type AdminOrder } from '@/features/ecommerce/ecommerceApi';
import { useGetBillsQuery } from '@/features/pos/posApi';
import {
  useGetLowStockQuery,
  useGetVendorsQuery,
  useGetAuditLogQuery,
  useGetCategoriesQuery,
} from '@/features/inventory/inventoryApi';
import { useGetTopProductsQuery } from '@/features/analytics/analyticsApi';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import { LEAD_STATUSES, type LeadStatus } from '@goldos/shared/constants';

function delta(curr: number, prev: number, suffix: string): {
  value: string;
  direction: 'up' | 'down' | 'flat';
} {
  if (prev === 0 && curr === 0) return { value: `No data ${suffix}`, direction: 'flat' };
  if (prev === 0) return { value: `▲ first ${suffix}`, direction: 'up' };
  const pct = Math.round(((curr - prev) / prev) * 100);
  if (pct > 0) return { value: `▲ ${pct}% vs ${suffix}`, direction: 'up' };
  if (pct < 0) return { value: `▼ ${Math.abs(pct)}% vs ${suffix}`, direction: 'down' };
  return { value: `Flat vs ${suffix}`, direction: 'flat' };
}

function deltaCount(curr: number, prev: number, suffix: string): {
  value: string;
  direction: 'up' | 'down' | 'flat';
} {
  const diff = curr - prev;
  if (diff > 0) return { value: `▲ ${diff} vs ${suffix}`, direction: 'up' };
  if (diff < 0) return { value: `▼ ${Math.abs(diff)} vs ${suffix}`, direction: 'down' };
  return { value: `Flat vs ${suffix}`, direction: 'flat' };
}

function formatRate(paise: number, stale: boolean): string {
  if (!paise) return stale ? 'No data' : '—';
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/g`;
}

// Range for MTD finance queries. CRITICAL: do not include `Date.now()` in the
// returned values. RTK Query keys queries by JSON-serialised args; if `to`
// shifted every millisecond the cache key would change every render, every
// re-render would cancel the in-flight request and fire a new one, and the
// /finance/pl + /finance/expenses/by-category queries would never resolve
// (the other dashboard queries don't take args, so they were unaffected —
// hence "Loading P&L…" forever while the rest of the dashboard worked).
//
// We anchor `to` to the END of today (UTC) so the cache key is stable for
// the rest of the calendar day; the polling interval still drives freshness.
function monthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  return { from: from.toISOString(), to: to.toISOString() };
}

function shortTime(d: string | Date): string {
  return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

// Funnel-stage color scale. NEW is cool/neutral → CONVERTED is success-green;
// LOST breaks out into danger-red. Reads visually like a heat map.
const LEAD_STAGE_COLOR: Record<LeadStatus, string> = {
  NEW: 'bg-ink-300',
  CONTACTED: 'bg-info-500',
  INTERESTED: 'bg-warning-500',
  NEGOTIATION: 'bg-warning-700',
  CONVERTED: 'bg-success-500',
  LOST: 'bg-danger-500',
};

// Order-status tone:
//   PENDING   → warning (needs action)
//   CONFIRMED → info    (acknowledged, in flow)
//   PACKED    → info
//   SHIPPED   → info
//   DELIVERED → success (revenue realised)
//   CANCELLED → danger  (lost sale)
//   RETURNED  → danger  (refund liability)
const ORDER_STATUS_TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'danger'> = {
  DELIVERED: 'success',
  SHIPPED: 'info',
  PACKED: 'info',
  CONFIRMED: 'info',
  PENDING: 'warning',
  CANCELLED: 'danger',
  RETURNED: 'danger',
};

export function DashboardPage(): JSX.Element {
  // Stable per-day reference — see monthRange() comment for why.
  const range = useMemo(() => monthRange(), []);
  // Top-bar shop scope. null = consolidated; a specific id narrows every
  // shop-aware query on the page (currently the dashboard summary, which
  // already accepts ?shopId=).
  const selectedShopId = useSelectedShopId();
  const summaryArg = selectedShopId ? { shopId: selectedShopId } : undefined;
  const { data: summaryRes, isLoading, isError } = useGetDashboardSummaryQuery(summaryArg, {
    pollingInterval: 60_000,
  });
  const { data: plRes, isLoading: plLoading, isError: plError, error: plErrorObj } = useGetPlQuery(range, { pollingInterval: 60_000 });
  const { data: expensesByCatRes, isLoading: expCatLoading, isError: expCatError, error: expCatErrorObj } = useGetExpensesByCategoryQuery(range);
  const { data: leadsRes } = useGetLeadsQuery(undefined, { pollingInterval: 60_000 });
  const { data: ordersRes } = useGetOrdersQuery(undefined, { pollingInterval: 60_000 });
  const { data: billsRes } = useGetBillsQuery({}, { pollingInterval: 60_000 });
  const { data: lowStockRes } = useGetLowStockQuery({ threshold: 3 });
  const { data: vendorsRes } = useGetVendorsQuery();
  const { data: auditRes } = useGetAuditLogQuery(undefined, { pollingInterval: 60_000 });
  const { data: topProductsRes } = useGetTopProductsQuery();
  const { data: shopsRes } = useGetShopsQuery();
  const { data: catsRes } = useGetCategoriesQuery();
  const shopsById = useMemo(
    () => new Map((shopsRes?.data ?? []).map((s) => [s.id, s.name])),
    [shopsRes],
  );
  const catsById = useMemo(
    () => new Map((catsRes?.data ?? []).map((c) => [c.id, c.name])),
    [catsRes],
  );

  const summary = summaryRes?.data;
  const pl = plRes?.data;
  const leads = leadsRes?.data ?? [];
  const orders = ordersRes?.data ?? [];
  const bills = billsRes?.data ?? [];
  const lowStock = lowStockRes?.data?.rows ?? [];
  const vendors = vendorsRes?.data ?? [];
  const audit = auditRes?.data ?? [];
  const topProducts = topProductsRes?.data ?? [];
  const expenseCats = expensesByCatRes?.data ?? [];

  const rate24 = summary?.goldRate.find((r) => r.purity === 2400);
  const rate22 = summary?.goldRate.find((r) => r.purity === 2200);
  const rate18 = summary?.goldRate.find((r) => r.purity === 1800);
  const rateSilver = summary?.goldRate.find((r) => r.purity === 0);

  const chartData = useMemo(
    () =>
      (summary?.sevenDay ?? []).map((p) => ({
        label: new Date(p.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        value: p.revenuePaise,
      })),
    [summary?.sevenDay],
  );
  const sevenDayTotal = useMemo(
    () => (summary?.sevenDay ?? []).reduce((s, p) => s + p.revenuePaise, 0),
    [summary?.sevenDay],
  );

  // Lead funnel — count per stage.
  const leadCounts = useMemo(() => {
    const map = new Map<LeadStatus, number>();
    for (const status of LEAD_STATUSES) map.set(status, 0);
    for (const l of leads) map.set(l.status, (map.get(l.status) ?? 0) + 1);
    return map;
  }, [leads]);
  const totalLeads = leads.length;

  // Order KPI computations.
  const openOrders = orders.filter(
    (o) => !['DELIVERED', 'CANCELLED', 'RETURNED'].includes(o.status),
  ).length;
  const monthOrderRevenue = orders
    .filter((o) => new Date(o.createdAt) >= new Date(range.from))
    .reduce((s, o) => s + o.totalPaise, 0);

  const vendorOutstanding = vendors.reduce((s, v) => s + v.outstandingPaise, 0);
  const lowStockShops = new Set(lowStock.map((r) => r.shopId)).size;

  // Expense donut data.
  const expenseDonut = useMemo(
    () => expenseCats.map((c) => ({ label: c.category, value: c.amountPaise })),
    [expenseCats],
  );
  const expenseTotal = expenseCats.reduce((s, c) => s + c.amountPaise, 0);

  // Top products ranked-bar input.
  const topProductsBar = useMemo(
    () =>
      topProducts.map((p) => ({
        label: p.name,
        value: p.revenuePaise,
        sub: `${p.qty} sold`,
      })),
    [topProducts],
  );

  // Revenue vs expenses bar — current month (MTD figure split into a small comparison view).
  const monthBar = useMemo(
    () =>
      pl
        ? [
            {
              label: new Date(pl.from).toLocaleDateString('en-IN', { month: 'short' }),
              revenue: pl.revenuePaise,
              expense: pl.expensePaise,
            },
          ]
        : [],
    [pl],
  );

  return (
    <div className="space-y-5 sm:space-y-6 pb-8 sm:pb-12">
      {/* ---- 1. Header ---- */}
      <PageHeader
        eyebrow={`Today · ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}`}
        title="Welcome back, Anant."
        description="Live across every shop — bills, leads, stock value and gold rate updating on a 60-second polling cadence."
        actions={
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-500 px-2.5 h-8 rounded-full bg-ink-25 border border-ink-100">
            <span className="relative inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
              <span className="absolute inset-0 h-1.5 w-1.5 rounded-full bg-success-500 animate-ping opacity-75" />
            </span>
            <span className="font-medium text-ink-700">Live</span>
            {summary?.asOf && (
              <span className="font-mono text-ink-500">
                · {new Date(summary.asOf).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </span>
        }
      />

      {/* ---- 1a. Gold rate hero ticker ----
       *  Linear-style command bar: a single row showing the 4 metal rates the
       *  jeweller checks compulsively, with a "stale" flag if MCX feed missed
       *  its 5-minute beat. This is the highest-anxiety number in the building.
       */}
      <section className="relative overflow-hidden rounded-md border border-brand-200/60 bg-gradient-to-br from-brand-50/60 via-ink-0 to-ink-0">
        <div aria-hidden className="absolute inset-0 bg-hairlines opacity-30 pointer-events-none" />
        <div className="relative grid grid-cols-2 sm:grid-cols-4 divide-x divide-ink-100">
          {[
            { label: '24K', rate: rate24 },
            { label: '22K', rate: rate22 },
            { label: '18K', rate: rate18 },
            { label: 'Silver', rate: rateSilver },
          ].map(({ label, rate }, i) => (
            <div
              key={label}
              className={cn(
                'px-4 py-3.5 flex items-center justify-between gap-2',
                i >= 2 && 'border-t sm:border-t-0 border-ink-100',
              )}
            >
              <div className="flex items-center gap-2">
                <Coins className={cn('h-3.5 w-3.5', label === 'Silver' ? 'text-ink-400' : 'text-brand-500')} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">
                  {label}
                </span>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm text-ink-900 font-medium tabular-nums">
                  {rate ? formatRate(rate.ratePerGramPaise, rate.stale) : '—'}
                </p>
                {rate?.stale && (
                  <p className="text-[10px] text-warning-700 font-medium leading-none mt-0.5">stale</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- 2. Primary KPI tiles ----
       *  Color psychology applied via MetricCard.tone:
       *    - Today's sales: success if up vs yesterday, danger if down.
       *    - Open leads: success (always good to have inbound interest).
       *    - Stock valuation & Bills today: neutral (informational).
       */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          label="Today's sales"
          value={summary ? <Money paise={summary.today.revenuePaise} /> : isLoading ? '…' : '—'}
          delta={summary ? delta(summary.today.revenuePaise, summary.yesterday.revenuePaise, 'yesterday') : undefined}
          tone={
            summary
              ? summary.today.revenuePaise >= summary.yesterday.revenuePaise
                ? 'success'
                : 'danger'
              : 'neutral'
          }
        />
        <MetricCard
          label="Bills today"
          value={summary ? String(summary.today.billCount) : isLoading ? '…' : '—'}
          delta={summary ? deltaCount(summary.today.billCount, summary.yesterday.billCount, 'yesterday') : undefined}
        />
        <MetricCard
          label="Stock valuation"
          value={summary ? <Money paise={summary.stock.valuationPaise} /> : isLoading ? '…' : '—'}
          delta={{
            value: rate22 ? `Live · 22K ${formatRate(rate22.ratePerGramPaise, rate22.stale)}` : 'Live rate pending',
            direction: 'flat',
          }}
        />
        <MetricCard
          label="Open leads"
          value={summary ? String(summary.leads.open) : isLoading ? '…' : '—'}
          delta={summary ? { value: `▲ ${summary.leads.today} today`, direction: 'up' } : undefined}
          tone="success"
        />
      </section>

      {/* ---- 3. Secondary KPI tiles ----
       *  - Revenue MTD: success when net is positive, danger when negative.
       *  - Vendor outstanding: warning when there's money owed, success at ₹0.
       */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          label="Revenue MTD"
          value={pl ? <Money paise={pl.revenuePaise} /> : '—'}
          delta={pl ? { value: `Net ${(pl.netPaise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, direction: pl.netPaise >= 0 ? 'up' : 'down' } : undefined}
          tone={pl ? (pl.netPaise >= 0 ? 'success' : 'danger') : 'neutral'}
        />
        <MetricCard
          label="Storefront orders"
          value={String(openOrders)}
          delta={{ value: `${orders.length} total`, direction: 'flat' }}
        />
        <MetricCard
          label="Order revenue MTD"
          value={<Money paise={monthOrderRevenue} />}
          delta={{ value: 'Website + WhatsApp', direction: 'flat' }}
          tone={monthOrderRevenue > 0 ? 'success' : 'neutral'}
        />
        <MetricCard
          label="Vendor outstanding"
          value={<Money paise={vendorOutstanding} />}
          delta={{ value: `${vendors.length} vendors`, direction: 'flat' }}
          tone={vendorOutstanding > 0 ? 'warning' : 'success'}
        />
      </section>

      {/* ---- 3a. Recent storefront reservations — high-priority, kept above the fold ---- */}
      <RecentReservations orders={orders} />

      {/* ---- 4. Sales chart + Gold rate ---- */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <ChartCard
          className="lg:col-span-2"
          title="Sales — last 7 days"
          eyebrow="Trend"
          action={
            chartData.length > 0 ? (
              <span className="text-xs text-ink-500">
                Total <Money paise={sevenDayTotal} />
              </span>
            ) : undefined
          }
        >
          {chartData.length > 0 ? (
            <RevenueAreaChart data={chartData} height={240} name="Revenue" />
          ) : (
            <p className="text-sm text-ink-500">
              {isLoading ? 'Loading…' : isError ? 'Failed to load.' : 'No sales in the last 7 days yet.'}
            </p>
          )}
        </ChartCard>
        <SectionCard
          eyebrow="Locations"
          title="Shops"
          icon={<Store className="h-4 w-4" />}
          action={
            <span className="text-[11px] text-ink-500 font-mono">
              {(shopsRes?.data ?? []).filter((s) => s.isActive).length}/{shopsRes?.data?.length ?? 0} open
            </span>
          }
        >
          <ul className="divide-y divide-ink-50 -my-1.5">
            {(shopsRes?.data ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full shrink-0',
                      s.isActive ? 'bg-success-500' : 'bg-ink-300',
                    )}
                  />
                  <span className="truncate text-ink-800">{s.name}</span>
                </span>
                <Badge tone={s.isActive ? 'success' : 'neutral'}>{s.isActive ? 'open' : 'closed'}</Badge>
              </li>
            ))}
            {(!shopsRes?.data || shopsRes.data.length === 0) && (
              <li className="py-3 text-sm text-ink-500">No shops configured yet.</li>
            )}
          </ul>
          <p className="mt-4 pt-3 border-t border-ink-100 text-[11px] text-ink-500 inline-flex items-center gap-1.5">
            <Activity className="h-3 w-3 text-success-500" />
            {summary?.asOf
              ? `Polling · last beat ${new Date(summary.asOf).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
              : 'Awaiting first poll…'}
          </p>
        </SectionCard>
      </section>

      {/* ---- 5. Lead funnel + Top products ---- */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <SectionCard
          eyebrow="Pipeline"
          title="Lead funnel"
          icon={<Users className="h-4 w-4" />}
          action={
            <Link to="/admin/crm" className="text-ink-500 hover:text-ink-900 inline-flex items-center gap-1 font-medium">
              Open CRM <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          {totalLeads === 0 ? (
            <p className="text-sm text-ink-500">No leads yet — the funnel populates as enquiries land.</p>
          ) : (
            <ul className="space-y-3">
              {LEAD_STATUSES.map((status) => {
                const count = leadCounts.get(status) ?? 0;
                const pct = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;
                return (
                  <li key={status}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-ink-700 capitalize font-medium">{status.toLowerCase()}</span>
                      <span className="font-mono tabular-nums text-ink-500">
                        <span className="text-ink-900">{count}</span> · {pct}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-ink-50 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all duration-slow', LEAD_STAGE_COLOR[status])}
                        style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <ChartCard title="Top-selling products" eyebrow="This month" action={
          <Link to="/admin/ecommerce" className="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1">
            All products <ArrowRight className="h-3 w-3" />
          </Link>
        }>
          {topProductsBar.length === 0 ? (
            <p className="text-sm text-ink-500">No orders yet. Storefront sales will show here.</p>
          ) : (
            <RankedBarChart data={topProductsBar} unit="currency" name="Revenue" height={220} />
          )}
        </ChartCard>
      </section>

      {/* ---- 6. Recent storefront orders + Recent bills ---- */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <SectionCard
          eyebrow="Online"
          title="Recent storefront orders"
          icon={<ShoppingBag className="h-4 w-4 text-brand-500" />}
          action={
            <Link to="/admin/ecommerce" className="text-ink-500 hover:text-ink-900 inline-flex items-center gap-1 font-medium">
              All orders <ArrowRight className="h-3 w-3" />
            </Link>
          }
          bareBody
        >
          {orders.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-ink-500">
              No orders yet. The cart &ldquo;Reserve at store&rdquo; flow shows up here once submitted.
            </p>
          ) : (
            <ul className="divide-y divide-ink-50">
              {orders.slice(0, 6).map((o) => (
                <li key={o.id}>
                  <Link
                    to="/admin/ecommerce"
                    className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-ink-25 transition-colors duration-fast"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs text-ink-800 truncate font-medium">#{o.id.slice(-8).toUpperCase()}</p>
                      <p className="text-xs text-ink-500 mt-0.5">
                        {shortTime(o.createdAt)} · {o.paymentMethod.replace(/-/g, ' ')}
                      </p>
                    </div>
                    <Badge tone={ORDER_STATUS_TONE[o.status] ?? 'neutral'}>{o.status.toLowerCase()}</Badge>
                    <Money paise={o.totalPaise} className="font-mono tabular-nums text-sm text-ink-900 font-medium" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          eyebrow="Counter"
          title="Recent POS bills"
          icon={<Receipt className="h-4 w-4 text-brand-500" />}
          action={
            // Admin users land on the counter monitor (read-only across every
            // shop). The cashier billing surface lives on the pos.<host>
            // subdomain and requires pos.access — not appropriate to deep-
            // link from the owner / accountant dashboard.
            <Link to="/admin/counter" className="text-ink-500 hover:text-ink-900 inline-flex items-center gap-1 font-medium">
              Counter monitor <ArrowRight className="h-3 w-3" />
            </Link>
          }
          bareBody
        >
          {bills.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-ink-500">No bills yet.</p>
          ) : (
            <ul className="divide-y divide-ink-50">
              {bills.slice(0, 6).map((b) => (
                <li key={b.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-ink-900 truncate font-medium">{b.billNumber}</p>
                    <p className="text-xs text-ink-500 mt-0.5">{shortTime(b.createdAt)}</p>
                  </div>
                  <Badge
                    tone={
                      b.paymentStatus === 'PAID'
                        ? 'success'
                        : b.paymentStatus === 'PARTIAL'
                          ? 'warning'
                          : b.paymentStatus === 'REFUNDED'
                            ? 'danger'
                            : 'neutral'
                    }
                  >
                    {b.paymentStatus.toLowerCase()}
                  </Badge>
                  <Money paise={b.totalPaise} className="font-mono tabular-nums text-sm text-ink-900 font-medium" />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </section>

      {/* ---- 7. Finance — revenue/expense + GST + expense breakdown ---- */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <ChartCard className="lg:col-span-2" title="Revenue vs expenses (MTD)" eyebrow="Finance">
          {plLoading ? (
            <p className="text-sm text-ink-500">Loading P&L…</p>
          ) : plError ? (
            <p className="text-sm text-rose-600" title={JSON.stringify(plErrorObj)}>
              Failed to load P&L ({(plErrorObj as { status?: number | string })?.status ?? 'network'})
            </p>
          ) : monthBar.length > 0 ? (
            <CurrencyBarChart
              data={monthBar}
              series={[
                { key: 'revenue', name: 'Revenue', color: '#C99B2A' },
                { key: 'expense', name: 'Expenses', color: '#6E695F' },
              ]}
              height={220}
            />
          ) : (
            <p className="text-sm text-ink-500">No revenue or expense activity this month yet.</p>
          )}
          {pl && (
            <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
              <Stat label="Revenue" value={<Money paise={pl.revenuePaise} />} />
              <Stat label="Expenses" value={<Money paise={pl.expensePaise} />} />
              <Stat
                label="Net"
                value={<Money paise={pl.netPaise} />}
                tone={pl.netPaise >= 0 ? 'good' : 'bad'}
              />
            </div>
          )}
        </ChartCard>

        <ChartCard title="Expenses by category" eyebrow="MTD">
          {expCatLoading ? (
            <p className="text-sm text-ink-500">Loading expenses…</p>
          ) : expCatError ? (
            <p className="text-sm text-rose-600" title={JSON.stringify(expCatErrorObj)}>
              Failed to load expenses ({(expCatErrorObj as { status?: number | string })?.status ?? 'network'})
            </p>
          ) : expenseDonut.length === 0 ? (
            <p className="text-sm text-ink-500">No expenses logged this month.</p>
          ) : (
            <CurrencyDonutChart
              data={expenseDonut}
              height={200}
              centerLabel="Total"
              centerValue={`₹${(expenseTotal / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
            />
          )}
        </ChartCard>
      </section>

      {/* ---- 8. Inventory health (low stock + vendor outstanding) ---- */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <SectionCard
          eyebrow="Alerts"
          title="Low stock"
          icon={<TrendingDown className="h-4 w-4" />}
          tone={lowStock.length === 0 ? 'success' : 'danger'}
          action={
            <Link to="/admin/inventory" className="text-ink-500 hover:text-ink-900 inline-flex items-center gap-1 font-medium">
              Inventory <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          {lowStock.length === 0 ? (
            <p className="text-sm text-success-700 inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
              All category × shop combinations have healthy stock.
            </p>
          ) : (
            <>
              <p className="text-xs text-ink-500 mb-3">
                {lowStock.length} alert{lowStock.length === 1 ? '' : 's'} across {lowStockShops} shop{lowStockShops === 1 ? '' : 's'}.
              </p>
              <ul className="space-y-2 text-sm">
                {lowStock.slice(0, 6).map((r, i) => (
                  <li key={i} className="flex items-center justify-between border-b border-ink-50 pb-2 last:border-0">
                    <span className="text-ink-800 text-xs">
                      <span className="text-ink-900 font-medium">{catsById.get(r.categoryId) ?? r.categoryId.slice(-6)}</span>
                      <span className="text-ink-400"> · </span>
                      <span>{shopsById.get(r.shopId) ?? r.shopId.slice(-6)}</span>
                    </span>
                    <Badge tone="warning">{r.itemCount} items</Badge>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>

        <SectionCard
          eyebrow="Payables"
          title="Vendor outstanding"
          icon={<Users className="h-4 w-4 text-brand-500" />}
          action={
            <Link to="/admin/inventory" className="text-ink-500 hover:text-ink-900 inline-flex items-center gap-1 font-medium">
              Vendors <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          {vendors.length === 0 ? (
            <p className="text-sm text-ink-500">No vendors yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {vendors
                .slice()
                .sort((a, b) => b.outstandingPaise - a.outstandingPaise)
                .slice(0, 6)
                .map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 border-b border-ink-50 pb-2 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-ink-800 truncate font-medium">{v.name}</p>
                      <p className="text-xs text-ink-500 font-mono">{v.phone}</p>
                    </div>
                    <Money
                      paise={v.outstandingPaise}
                      className={cn(
                        'font-mono tabular-nums text-sm',
                        v.outstandingPaise === 0 && 'text-success-700',
                        v.outstandingPaise > 0 && v.outstandingPaise < 100_000_00 && 'text-warning-700',
                        v.outstandingPaise >= 100_000_00 && 'text-danger-700',
                      )}
                    />
                  </li>
                ))}
            </ul>
          )}
        </SectionCard>
      </section>

      {/* ---- 9. Inventory + activity ---- */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <SectionCard
          eyebrow="Stock"
          title="Inventory snapshot"
          icon={<Boxes className="h-4 w-4 text-brand-500" />}
        >
          <dl className="space-y-3 text-sm">
            <Row label="Items in stock" value={summary ? <span className="font-mono tabular-nums text-ink-900 font-medium">{summary.stock.itemCount}</span> : '…'} />
            <Row label="Stock value" value={summary ? <Money paise={summary.stock.valuationPaise} className="font-mono tabular-nums text-ink-900 font-medium" /> : '…'} />
            <Row label="Vendors" value={<span className="font-mono tabular-nums">{vendors.length}</span>} />
            <Row label="Top product" value={topProducts[0]?.name ?? '—'} />
            <Row label="Low-stock alerts" value={<Badge tone={lowStock.length > 0 ? 'warning' : 'success'}>{lowStock.length}</Badge>} />
          </dl>
        </SectionCard>

        <SectionCard
          className="lg:col-span-2"
          eyebrow="Audit"
          title="Recent activity"
          icon={<ScrollText className="h-4 w-4 text-ink-500" />}
          action={
            <Link to="/admin/inventory" className="text-ink-500 hover:text-ink-900 inline-flex items-center gap-1 font-medium">
              Full audit log <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          {audit.length === 0 ? (
            <p className="text-sm text-ink-500">No activity yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {audit.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-center gap-3 border-b border-ink-50 pb-2 last:border-0">
                  <span
                    className={cn(
                      'h-6 w-6 rounded-full inline-flex items-center justify-center shrink-0',
                      a.action === 'CREATE'
                        ? 'bg-success-50'
                        : a.action === 'DELETE' || a.action === 'WASTAGE'
                          ? 'bg-danger-50'
                          : a.action === 'UPDATE'
                            ? 'bg-info-50'
                            : 'bg-ink-50',
                    )}
                  >
                    {a.action === 'CREATE' ? (
                      <TrendingUp className="h-3 w-3 text-success-700" />
                    ) : a.action === 'DELETE' || a.action === 'WASTAGE' ? (
                      <Flame className="h-3 w-3 text-danger-700" />
                    ) : a.action === 'UPDATE' ? (
                      <ArrowUpRight className="h-3 w-3 text-info-700" />
                    ) : (
                      <ArrowUpRight className="h-3 w-3 text-ink-500" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink-800">
                      <span className="font-medium">{a.action.toLowerCase()}</span>{' '}
                      <span className="text-ink-500">on</span>{' '}
                      <span className="font-mono text-xs">{a.entityType}</span>
                    </p>
                    <p className="text-xs text-ink-500 font-mono truncate">{a.entityId.slice(-12)}</p>
                  </div>
                  <span className="text-xs text-ink-400 font-mono whitespace-nowrap">
                    {shortTime(a.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </section>

      {/* ---- 10. Quick links footer ---- */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <QuickLink to="/admin/inventory" icon={Package} label="Open inventory" desc="Stock & SKUs" />
        <QuickLink to="/admin/counter" icon={Receipt} label="Counter monitor" desc="Offline shops · read-only" />
        <QuickLink to="/admin/crm" icon={Users} label="Open CRM" desc="Leads & broadcasts" />
        <QuickLink to="/admin/website" icon={ShoppingBag} label="Edit storefront" desc="Website CMS" />
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between border-b border-ink-50 pb-2 last:border-0">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-ink-800">{value}</dd>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'good' | 'bad';
}): JSX.Element {
  return (
    <div className="rounded-md bg-ink-25 px-3 py-2">
      <p className="text-eyebrow uppercase text-ink-500">{label}</p>
      <p className={`mt-1 font-mono text-base ${tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-rose-700' : 'text-ink-900'}`}>
        {value}
      </p>
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  label,
  desc,
}: {
  to: string;
  icon: typeof Package;
  label: string;
  desc: string;
}): JSX.Element {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-md border border-ink-100 bg-ink-0 px-4 py-3 hover:border-brand-300 hover:bg-brand-25 transition-colors group"
    >
      <span className="h-9 w-9 rounded-full bg-brand-50 text-brand-700 inline-flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-900 leading-tight">{label}</p>
        <p className="text-xs text-ink-500 mt-0.5">{desc}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-ink-400 group-hover:text-ink-700 ml-auto" />
    </Link>
  );
}

// Storefront reservations — orders placed via "Reserve at store" (paymentMethod
// === 'reserve-at-store'). Sourced from the same orders feed as the rest of the
// dashboard so we don't depend on the Lead-mirror succeeding on checkout.
function RecentReservations({ orders }: { orders: AdminOrder[] }): JSX.Element {
  const reservations = orders
    .filter((o) => o.paymentMethod === 'reserve-at-store')
    .slice(0, 6);

  return (
    <SectionCard
      eyebrow="Reservations"
      title="Recent storefront reservations"
      icon={<ShoppingBag className="h-4 w-4 text-brand-500" />}
      tone="brand"
      action={
        <Link to="/admin/ecommerce" className="text-ink-500 hover:text-ink-900 inline-flex items-center gap-1 font-medium">
          All reservations <ArrowRight className="h-3 w-3" />
        </Link>
      }
      bareBody
    >
      {reservations.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-ink-500">
          No reservations yet. Place one from the storefront and refresh.
        </p>
      ) : (
        <ul className="divide-y divide-ink-50">
          {reservations.map((o) => (
            <li key={o.id}>
              <Link
                to="/admin/ecommerce"
                className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-ink-25 transition-colors duration-fast"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-900 truncate font-medium">
                    {o.customer?.name ?? 'Guest'} · #{o.id.slice(-8).toUpperCase()}
                  </p>
                  <p className="text-xs text-ink-500 mt-0.5">
                    {o.customer?.phone && <span className="font-mono">{o.customer.phone} · </span>}
                    {shortTime(o.createdAt)}
                  </p>
                </div>
                <Badge tone={ORDER_STATUS_TONE[o.status] ?? 'neutral'}>{o.status.toLowerCase()}</Badge>
                <Money paise={o.totalPaise} className="font-mono tabular-nums text-sm text-ink-900 font-medium" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
