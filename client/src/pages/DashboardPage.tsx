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
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { MetricCard } from '@/components/ui/MetricCard';
import { Money } from '@/components/ui/money';
import { Badge } from '@/components/ui/badge';
import {
  ChartCard,
  CurrencyBarChart,
  CurrencyDonutChart,
  RankedBarChart,
  RevenueAreaChart,
} from '@/components/ui/charts';
import { useGetDashboardSummaryQuery } from '@/features/dashboard/dashboardApi';
import { useGetPlQuery, useGetExpensesByCategoryQuery } from '@/features/finance/financeApi';
import { useGetLeadsQuery } from '@/features/crm/crmApi';
import { useGetOrdersQuery } from '@/features/ecommerce/ecommerceApi';
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

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { from: from.toISOString(), to: now.toISOString() };
}

function shortTime(d: string | Date): string {
  return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

const LEAD_STAGE_COLOR: Record<LeadStatus, string> = {
  NEW: 'bg-ink-200',
  CONTACTED: 'bg-brand-200',
  INTERESTED: 'bg-brand-300',
  NEGOTIATION: 'bg-brand-400',
  CONVERTED: 'bg-emerald-500',
  LOST: 'bg-rose-300',
};

const ORDER_STATUS_TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  DELIVERED: 'success',
  SHIPPED: 'info',
  PACKED: 'info',
  CONFIRMED: 'warning',
  PENDING: 'neutral',
  CANCELLED: 'neutral',
  RETURNED: 'neutral',
};

export function DashboardPage(): JSX.Element {
  const range = monthRange();
  const { data: summaryRes, isLoading, isError } = useGetDashboardSummaryQuery(undefined, {
    pollingInterval: 60_000,
  });
  const { data: plRes } = useGetPlQuery(range, { pollingInterval: 60_000 });
  const { data: expensesByCatRes } = useGetExpensesByCategoryQuery(range);
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
    <div className="space-y-6 pb-12">
      {/* ---- 1. Header ---- */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-eyebrow uppercase text-ink-500">Today · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="font-display text-display-sm text-ink-900">Welcome back, Anant.</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-500">
          <Activity className="h-3.5 w-3.5 text-emerald-500" />
          {summary?.asOf ? `Live · updated ${new Date(summary.asOf).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Live'}
        </div>
      </header>

      {/* ---- 2. Primary KPI tiles ---- */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Today's sales"
          value={summary ? <Money paise={summary.today.revenuePaise} /> : isLoading ? '…' : '—'}
          delta={summary ? delta(summary.today.revenuePaise, summary.yesterday.revenuePaise, 'yesterday') : undefined}
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
        />
      </section>

      {/* ---- 3. Secondary KPI tiles ---- */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Revenue MTD"
          value={pl ? <Money paise={pl.revenuePaise} /> : '—'}
          delta={pl ? { value: `Net ${(pl.netPaise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, direction: pl.netPaise >= 0 ? 'up' : 'down' } : undefined}
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
        />
        <MetricCard
          label="Vendor outstanding"
          value={<Money paise={vendorOutstanding} />}
          delta={{ value: `${vendors.length} vendors`, direction: 'flat' }}
        />
      </section>

      {/* ---- 4. Sales chart + Gold rate ---- */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
        <div className="rounded-md border border-ink-100 bg-ink-0 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-md text-ink-900 font-medium">Live gold rate</h3>
            <Coins className="h-4 w-4 text-brand-500" />
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-500">22K</dt>
              <dd className="font-mono">{rate22 ? formatRate(rate22.ratePerGramPaise, rate22.stale) : '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">18K</dt>
              <dd className="font-mono">{rate18 ? formatRate(rate18.ratePerGramPaise, rate18.stale) : '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Silver</dt>
              <dd className="font-mono">{rateSilver ? formatRate(rateSilver.ratePerGramPaise, rateSilver.stale) : '—'}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-ink-400">
            {summary?.asOf ? `Updated ${new Date(summary.asOf).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · MCX` : 'Awaiting feed'}
            {(rate22?.stale || rate18?.stale || rateSilver?.stale) && ' · stale'}
          </p>
          <hr className="my-4 border-ink-100" />
          <p className="text-eyebrow uppercase text-ink-500 mb-2">Shops</p>
          <ul className="space-y-1 text-xs text-ink-700">
            {(shopsRes?.data ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between">
                <span className="truncate">{s.name}</span>
                <Badge tone={s.isActive ? 'success' : 'neutral'}>{s.isActive ? 'open' : 'closed'}</Badge>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- 5. Lead funnel + Top products ---- */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-md border border-ink-100 bg-ink-0 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-eyebrow uppercase text-ink-500">Pipeline</p>
              <h3 className="text-md text-ink-900 font-medium">Lead funnel</h3>
            </div>
            <Link to="/admin/crm" className="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1">
              Open CRM <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {totalLeads === 0 ? (
            <p className="text-sm text-ink-500">No leads yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {LEAD_STATUSES.map((status) => {
                const count = leadCounts.get(status) ?? 0;
                const pct = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;
                return (
                  <li key={status}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-ink-700 capitalize">{status.toLowerCase()}</span>
                      <span className="font-mono text-ink-500">
                        {count} · {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-ink-50 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${LEAD_STAGE_COLOR[status]}`}
                        style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

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

      {/* ---- 6a. Recent storefront reservations — leads from Reserve at Store ---- */}
      <RecentReservations />

      {/* ---- 6. Recent storefront orders + Recent bills ---- */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-md border border-ink-100 bg-ink-0">
          <div className="flex items-center justify-between px-5 pt-5 mb-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-brand-500" />
              <h3 className="text-md text-ink-900 font-medium">Recent storefront orders</h3>
            </div>
            <Link to="/admin/ecommerce" className="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1">
              All orders <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {orders.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-ink-500">
              No orders yet. The cart &ldquo;Reserve at store&rdquo; flow shows up here once submitted.
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {orders.slice(0, 6).map((o) => (
                <li key={o.id}>
                  <Link
                    to="/admin/ecommerce"
                    className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-ink-25"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs text-ink-500 truncate">#{o.id.slice(-8).toUpperCase()}</p>
                      <p className="text-xs text-ink-600 mt-0.5">
                        {shortTime(o.createdAt)} · {o.paymentMethod.replace(/-/g, ' ')}
                      </p>
                    </div>
                    <Badge tone={ORDER_STATUS_TONE[o.status] ?? 'neutral'}>{o.status.toLowerCase()}</Badge>
                    <Money paise={o.totalPaise} className="font-mono tabular-nums text-sm" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border border-ink-100 bg-ink-0">
          <div className="flex items-center justify-between px-5 pt-5 mb-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-brand-500" />
              <h3 className="text-md text-ink-900 font-medium">Recent POS bills</h3>
            </div>
            <Link to="/admin/pos" className="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1">
              Open POS <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {bills.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-ink-500">No bills yet.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {bills.slice(0, 6).map((b) => (
                <li key={b.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-ink-900 truncate">{b.billNumber}</p>
                    <p className="text-xs text-ink-500 mt-0.5">{shortTime(b.createdAt)}</p>
                  </div>
                  <Badge tone={b.paymentStatus === 'PAID' ? 'success' : b.paymentStatus === 'PARTIAL' ? 'warning' : 'neutral'}>
                    {b.paymentStatus.toLowerCase()}
                  </Badge>
                  <Money paise={b.totalPaise} className="font-mono tabular-nums text-sm" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ---- 7. Finance — revenue/expense + GST + expense breakdown ---- */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard className="lg:col-span-2" title="Revenue vs expenses (MTD)" eyebrow="Finance">
          {monthBar.length > 0 ? (
            <CurrencyBarChart
              data={monthBar}
              series={[
                { key: 'revenue', name: 'Revenue', color: '#C99B2A' },
                { key: 'expense', name: 'Expenses', color: '#6E695F' },
              ]}
              height={220}
            />
          ) : (
            <p className="text-sm text-ink-500">Loading…</p>
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
          {expenseDonut.length === 0 ? (
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
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-md border border-ink-100 bg-ink-0 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-rose-500" />
              <h3 className="text-md text-ink-900 font-medium">Low stock alerts</h3>
            </div>
            <Link to="/admin/inventory" className="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1">
              Inventory <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {lowStock.length === 0 ? (
            <p className="text-sm text-ink-500">All category × shop combinations have healthy stock.</p>
          ) : (
            <>
              <p className="text-xs text-ink-500 mb-3">
                {lowStock.length} alert{lowStock.length === 1 ? '' : 's'} across {lowStockShops} shop{lowStockShops === 1 ? '' : 's'}.
              </p>
              <ul className="space-y-2 text-sm">
                {lowStock.slice(0, 6).map((r, i) => (
                  <li key={i} className="flex items-center justify-between border-b border-ink-50 pb-2 last:border-0">
                    <span className="text-ink-800 text-xs">
                      <span className="text-ink-900">{catsById.get(r.categoryId) ?? r.categoryId.slice(-6)}</span>
                      <span className="text-ink-400"> · </span>
                      <span>{shopsById.get(r.shopId) ?? r.shopId.slice(-6)}</span>
                    </span>
                    <Badge tone="warning">{r.itemCount} items</Badge>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="rounded-md border border-ink-100 bg-ink-0 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-brand-500" />
              <h3 className="text-md text-ink-900 font-medium">Vendor outstanding</h3>
            </div>
            <Link to="/admin/inventory" className="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1">
              Vendors <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
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
                      <p className="text-ink-800 truncate">{v.name}</p>
                      <p className="text-xs text-ink-500 font-mono">{v.phone}</p>
                    </div>
                    <Money
                      paise={v.outstandingPaise}
                      className={`font-mono tabular-nums text-sm ${v.outstandingPaise > 0 ? 'text-rose-700' : 'text-ink-500'}`}
                    />
                  </li>
                ))}
            </ul>
          )}
        </div>
      </section>

      {/* ---- 9. Inventory + activity ---- */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-md border border-ink-100 bg-ink-0 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Boxes className="h-4 w-4 text-brand-500" />
            <h3 className="text-md text-ink-900 font-medium">Inventory snapshot</h3>
          </div>
          <dl className="space-y-3 text-sm">
            <Row label="Items in stock" value={summary ? <span className="font-mono">{summary.stock.itemCount}</span> : '…'} />
            <Row label="Stock value" value={summary ? <Money paise={summary.stock.valuationPaise} className="font-mono" /> : '…'} />
            <Row label="Vendors" value={<span className="font-mono">{vendors.length}</span>} />
            <Row label="Top product" value={topProducts[0]?.name ?? '—'} />
            <Row label="Low-stock alerts" value={<Badge tone={lowStock.length > 0 ? 'warning' : 'success'}>{lowStock.length}</Badge>} />
          </dl>
        </div>

        <div className="lg:col-span-2 rounded-md border border-ink-100 bg-ink-0 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-ink-500" />
              <h3 className="text-md text-ink-900 font-medium">Recent activity</h3>
            </div>
            <Link to="/admin/inventory" className="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1">
              Full audit log <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {audit.length === 0 ? (
            <p className="text-sm text-ink-500">No activity yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {audit.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-center gap-3 border-b border-ink-50 pb-2 last:border-0">
                  <span className="h-6 w-6 rounded-full bg-ink-50 inline-flex items-center justify-center shrink-0">
                    {a.action === 'CREATE' ? (
                      <TrendingUp className="h-3 w-3 text-emerald-600" />
                    ) : a.action === 'DELETE' || a.action === 'WASTAGE' ? (
                      <Flame className="h-3 w-3 text-rose-600" />
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
        </div>
      </section>

      {/* ---- 10. Quick links footer ---- */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickLink to="/admin/inventory" icon={Package} label="Open inventory" desc="Stock & SKUs" />
        <QuickLink to="/admin/pos" icon={Receipt} label="Open POS" desc="Billing counter" />
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

// Storefront reservations — leads created from PDP "Reserve at store" or the
// cart's Reserve dialog. Polls 15s so newly-placed reservations show up fast.
const STOREFRONT_SOURCES = new Set(['store-reservation', 'newsletter', 'storefront']);

function RecentReservations(): JSX.Element {
  const { data: leadsRes, isLoading } = useGetLeadsQuery(undefined, {
    pollingInterval: 15_000,
  });
  const reservations = (leadsRes?.data ?? [])
    .filter((l) => STOREFRONT_SOURCES.has(l.source))
    .slice(0, 6);

  return (
    <section className="rounded-md border border-ink-100 bg-ink-0">
      <div className="flex items-center justify-between px-5 pt-5 mb-3">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-brand-500" />
          <h3 className="text-md text-ink-900 font-medium">Recent storefront reservations</h3>
          <span className="text-xs text-ink-500">· live (polling 15s)</span>
        </div>
        <Link to="/admin/ecommerce" className="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1">
          All reservations <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {isLoading && <p className="px-5 pb-5 text-sm text-ink-500">Loading…</p>}
      {!isLoading && reservations.length === 0 && (
        <p className="px-5 pb-5 text-sm text-ink-500">
          No reservations yet. Place one from the storefront and refresh.
        </p>
      )}
      {reservations.length > 0 && (
        <ul className="divide-y divide-ink-100">
          {reservations.map((l) => {
            // Reservation interest is formatted as "RESERVE: <name> · …"
            const parts = (l.interest ?? '').split(' · ');
            const piece = (parts[0] ?? '').replace(/^RESERVE:\s*/i, '') || 'Reservation';
            const total = parts.find((p) => p.toLowerCase().startsWith('total ')) ?? null;
            return (
              <li key={l.id}>
                <Link
                  to="/admin/ecommerce"
                  className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-ink-25"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-900 truncate">{piece}</p>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {l.name} · <span className="font-mono">{l.phone}</span> · {shortTime(l.createdAt)}
                    </p>
                  </div>
                  <Badge tone={l.status === 'CONVERTED' ? 'success' : l.status === 'LOST' ? 'neutral' : 'warning'}>
                    {l.status.toLowerCase()}
                  </Badge>
                  {total && (
                    <span className="font-mono tabular-nums text-sm text-ink-900">
                      {total.replace(/^total\s*/i, '')}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
