// Analytics — Gold-OS live business command centre. Tabbed dashboard
// with 15 reports per the module spec (real-time, top products, inventory
// valuation, customer acquisition, P&L by period, festive trend,
// scheduled emails, low-margin alerts, shop performance, staff
// leaderboard, GST filing, ad ROI, gold rate impact, export, date
// filters). One page, ?tab=… selects the section.

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Mail, Plus, Trash2, X, AlertTriangle, CheckCircle2, ChevronRight, ChevronDown } from 'lucide-react';
import type {
  InventoryValuationMain,
  InventoryValuationSub,
} from '@/features/analytics/analyticsApi';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { MetricCard } from '@/components/ui/MetricCard';
import { TableToolbar, useTableSearch } from '@/components/data/TableToolbar';
import { Money, Weight } from '@/components/ui/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ChartCard,
  CountBarChart,
  CurrencyBarChart,
  CurrencyDonutChart,
  RankedBarChart,
  RevenueAreaChart,
} from '@/components/ui/charts';
import {
  useGetAnalyticsDashboardQuery,
  useGetStaffReportQuery,
  useGetTopProductsQuery,
  useGetTopCategoriesQuery,
  useGetShopPerformanceQuery,
  useGetInventoryValuationQuery,
  useGetCustomerAcquisitionQuery,
  useGetPlByPeriodQuery,
  useGetFestiveTrendQuery,
  useGetLowMarginQuery,
  useGetGstSummaryRangeQuery,
  useGetAdRoiQuery,
  useGetGoldRateImpactQuery,
  useGetScheduledReportsQuery,
  useCreateScheduledReportMutation,
  useDeleteScheduledReportMutation,
  useGetRepeatOrdersQuery,
  useGetReturnsQuery,
  type ScheduledReport,
} from '@/features/analytics/analyticsApi';
import { useGetDashboardSummaryQuery } from '@/features/dashboard/dashboardApi';
import { FinanceTabs } from '@/features/finance/components/FinanceTabs';
import {
  FilterRow,
  DateInput,
  ShopPicker,
} from '@/features/finance/components/FinanceFilters';
import { downloadCsv, paiseToRupeeString, printSection } from '@/features/finance/lib/export';
import { cn } from '@/lib/cn';

type TabKey =
  | 'realtime'
  | 'pl'
  | 'shop'
  | 'staff'
  | 'topproducts'
  | 'inventory'
  | 'lowmargin'
  | 'customers'
  | 'festive'
  | 'gst'
  | 'adroi'
  | 'goldimpact'
  | 'repeatorders'
  | 'returns'
  | 'scheduled';

const TAB_DEFS: Array<{ key: TabKey; label: string; eyebrow: string; title: string }> = [
  { key: 'realtime', label: 'Real-time', eyebrow: 'Reports & analytics', title: 'Real-time sales dashboard' },
  { key: 'pl', label: 'P&L by period', eyebrow: 'Profitability', title: 'Daily / weekly / monthly P&L' },
  { key: 'shop', label: 'Shop performance', eyebrow: 'Branches', title: 'Shop-wise performance' },
  { key: 'staff', label: 'Staff', eyebrow: 'Team', title: 'Staff sales leaderboard' },
  { key: 'topproducts', label: 'Top products', eyebrow: 'Catalogue', title: 'Top-selling products' },
  { key: 'inventory', label: 'Inventory value', eyebrow: 'Stock', title: 'Inventory valuation at today’s rate' },
  { key: 'lowmargin', label: 'Low-margin', eyebrow: 'Alerts', title: 'Low-margin product alert' },
  { key: 'customers', label: 'Customers', eyebrow: 'Acquisition', title: 'Customer acquisition report' },
  { key: 'festive', label: 'Festive trend', eyebrow: 'Seasonality', title: 'Festive season YoY comparison' },
  { key: 'gst', label: 'GST filing', eyebrow: 'Tax', title: 'GST filing summary' },
  { key: 'adroi', label: 'Ad ROI', eyebrow: 'Marketing', title: 'Ad ROI report' },
  { key: 'goldimpact', label: 'Gold rate impact', eyebrow: 'Macro', title: 'Gold rate impact on revenue' },
  { key: 'repeatorders', label: 'Repeat orders', eyebrow: 'Retention', title: 'Repeat orders · shop-wise & ecommerce' },
  { key: 'returns', label: 'Returns / RTO', eyebrow: 'Returns', title: 'Returns & RTO · POS vs ecommerce' },
  { key: 'scheduled', label: 'Email reports', eyebrow: 'Automation', title: 'Scheduled email reports' },
];

function tabLink(key: TabKey): string {
  return `/admin/analytics?tab=${key}`;
}

function startOfMonth(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export function AnalyticsPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') as TabKey | null;
  const activeTab = useMemo<TabKey>(() => {
    const valid = TAB_DEFS.find((t) => t.key === tabParam);
    return (valid?.key ?? 'realtime') as TabKey;
  }, [tabParam]);
  const def = TAB_DEFS.find((t) => t.key === activeTab) ?? TAB_DEFS[0]!;

  useEffect(() => {
    if (!tabParam) {
      const next = new URLSearchParams(params);
      next.set('tab', 'realtime');
      setParams(next, { replace: true });
    }
  }, [tabParam, params, setParams]);

  return (
    <div className="space-y-4 sm:space-y-5">
      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <p className="text-eyebrow uppercase text-ink-500">{def.eyebrow}</p>
          <h1 className="font-display text-xl sm:text-display-sm text-ink-900">{def.title}</h1>
        </div>
      </header>

      <FinanceTabs
        tabs={TAB_DEFS.map((t) => ({ to: tabLink(t.key), label: t.label }))}
      />

      <div>
        {activeTab === 'realtime' && <RealTimeSection />}
        {activeTab === 'pl' && <PlByPeriodSection />}
        {activeTab === 'shop' && <ShopPerformanceSection />}
        {activeTab === 'staff' && <StaffSection />}
        {activeTab === 'topproducts' && <TopProductsSection />}
        {activeTab === 'inventory' && <InventoryValuationSection />}
        {activeTab === 'lowmargin' && <LowMarginSection />}
        {activeTab === 'customers' && <CustomerAcquisitionSection />}
        {activeTab === 'festive' && <FestiveTrendSection />}
        {activeTab === 'gst' && <GstFilingSection />}
        {activeTab === 'adroi' && <AdRoiSection />}
        {activeTab === 'goldimpact' && <GoldRateImpactSection />}
        {activeTab === 'repeatorders' && <RepeatOrdersSection />}
        {activeTab === 'returns' && <ReturnsSection />}
        {activeTab === 'scheduled' && <ScheduledReportsSection />}
      </div>
    </div>
  );
}

// =====================================================================
// 1. Real-time sales dashboard
// =====================================================================

function RealTimeSection(): JSX.Element {
  type Period = 'week' | 'month' | 'quarter';
  const [period, setPeriod] = useState<Period>('week');
  const range = useMemo(() => {
    const now = new Date();
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const days = period === 'week' ? 7 : period === 'month' ? 30 : 90;
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days));
    return { from: from.toISOString(), to: to.toISOString() };
  }, [period]);

  const { data: todayRes, isLoading: todayLoading } = useGetAnalyticsDashboardQuery(
    { period: 'today' },
    { pollingInterval: 60_000 },
  );
  const { data: weekRes } = useGetAnalyticsDashboardQuery({ period: 'week' });
  const { data: monthRes } = useGetAnalyticsDashboardQuery({ period: 'month' });
  const { data: staffRes, isLoading: staffLoading } = useGetStaffReportQuery(range);
  const { data: summaryRes } = useGetDashboardSummaryQuery();

  const today = todayRes?.data;
  const week = weekRes?.data;
  const month = monthRes?.data;
  const staff = staffRes?.data ?? [];
  const summary = summaryRes?.data;

  const avgDaily = week ? Math.round(week.revenuePaise / 7) : 0;
  const todayVsAvg =
    today && avgDaily > 0 ? Math.round(((today.revenuePaise - avgDaily) / avgDaily) * 100) : null;

  const trendData = useMemo(
    () =>
      (summary?.sevenDay ?? []).map((p) => ({
        label: new Date(p.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        value: p.revenuePaise,
      })),
    [summary?.sevenDay],
  );

  const staffRanked = useMemo(
    () =>
      [...staff]
        .sort((a, b) => b.revenuePaise - a.revenuePaise)
        .slice(0, 6)
        .map((r) => ({
          label: r.userName ?? (r.userId ? `User ${r.userId.slice(-4)}` : 'Unattributed'),
          value: r.revenuePaise,
          sub: `${r.billCount} bills${r.userRole ? ' · ' + r.userRole.toLowerCase() : ''}`,
        })),
    [staff],
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex justify-end">
        <div className="inline-flex rounded-md border border-ink-200 overflow-hidden text-xs sm:text-sm">
          {(['week', 'month', 'quarter'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                'px-3 sm:px-4 h-9 whitespace-nowrap',
                period === p ? 'bg-ink-900 text-ink-0' : 'text-ink-700 hover:bg-ink-50',
              )}
            >
              {p === 'week' ? 'Last 7 days' : p === 'month' ? 'Last 30 days' : 'Last 90 days'}
            </button>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          label="Revenue (today)"
          value={today ? <Money paise={today.revenuePaise} /> : todayLoading ? '…' : '—'}
          delta={
            todayVsAvg !== null
              ? {
                  value: `${todayVsAvg >= 0 ? '▲' : '▼'} ${Math.abs(todayVsAvg)}% vs avg`,
                  direction: todayVsAvg >= 0 ? 'up' : 'down',
                }
              : undefined
          }
          tone="success"
        />
        <MetricCard
          label="Bills (today)"
          value={today ? String(today.billCount) : todayLoading ? '…' : '—'}
        />
        <MetricCard
          label="Revenue (week)"
          value={week ? <Money paise={week.revenuePaise} /> : '—'}
          delta={{ value: `${week?.billCount ?? 0} bills`, direction: 'flat' }}
        />
        <MetricCard
          label="Revenue (month)"
          value={month ? <Money paise={month.revenuePaise} /> : '—'}
          delta={{ value: `${month?.newLeads ?? 0} new leads`, direction: 'flat' }}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <ChartCard title="Sales · last 7 days" eyebrow="Trend">
          {trendData.length > 0 ? (
            <RevenueAreaChart data={trendData} height={260} />
          ) : (
            <p className="text-sm text-ink-500">Loading…</p>
          )}
        </ChartCard>
        <ChartCard
          title={`Staff leaderboard · last ${
            period === 'week' ? '7 days' : period === 'month' ? '30 days' : '90 days'
          }`}
          eyebrow="Performance"
        >
          {staffLoading ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : staffRanked.length === 0 ? (
            <p className="text-sm text-ink-500">No bills attributed to staff yet.</p>
          ) : (
            <RankedBarChart data={staffRanked} unit="currency" name="Revenue" height={260} />
          )}
        </ChartCard>
      </section>
    </div>
  );
}

// =====================================================================
// 2. P&L by period (daily / weekly / monthly)
// =====================================================================

function PlByPeriodSection(): JSX.Element {
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [shopId, setShopId] = useState<string | undefined>(undefined);

  const { data, isLoading } = useGetPlByPeriodQuery({
    granularity,
    from: new Date(from).toISOString(),
    to: new Date(`${to}T23:59:59.999Z`).toISOString(),
    shopId,
  });
  const rows = data?.data.rows ?? [];

  const totalRevenue = rows.reduce((a, r) => a + r.revenuePaise, 0);
  const totalExpense = rows.reduce((a, r) => a + r.expensePaise, 0);
  const totalGst = rows.reduce((a, r) => a + r.gstPaise, 0);
  const totalNet = rows.reduce((a, r) => a + r.netProfitPaise, 0);
  const totalBills = rows.reduce((a, r) => a + r.billCount, 0);

  const chartData = rows.map((r) => ({
    label:
      granularity === 'month'
        ? new Date(r.bucket).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
        : new Date(r.bucket).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    revenue: r.netRevenuePaise,
    expense: r.expensePaise,
  }));

  function handleCsv(): void {
    const out: (string | number)[][] = [
      [`P&L by ${granularity}`, `${from} → ${to}`],
      [],
      [granularity, 'Revenue (₹)', 'GST (₹)', 'Net revenue (₹)', 'Expenses (₹)', 'Net profit (₹)', 'Bills'],
      ...rows.map((r) => [
        r.bucket.slice(0, 10),
        paiseToRupeeString(r.revenuePaise),
        paiseToRupeeString(r.gstPaise),
        paiseToRupeeString(r.netRevenuePaise),
        paiseToRupeeString(r.expensePaise),
        paiseToRupeeString(r.netProfitPaise),
        r.billCount,
      ]),
    ];
    downloadCsv(`pl-${granularity}-${from}-to-${to}.csv`, out);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <label className="block text-sm">
          <span className="text-[11px] uppercase tracking-wider text-ink-500">Granularity</span>
          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as 'day' | 'week' | 'month')}
            className="mt-1 w-full h-10 px-3 rounded-md border border-ink-200 text-sm"
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </label>
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
        <ShopPicker value={shopId} onChange={setShopId} />
      </FilterRow>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Revenue" value={<Money paise={totalRevenue} />} tone="success" />
        <MetricCard label="GST" value={<Money paise={totalGst} />} />
        <MetricCard label="Expenses" value={<Money paise={totalExpense} />} tone="warning" />
        <MetricCard
          label="Net profit"
          value={<Money paise={totalNet} />}
          tone={totalNet >= 0 ? 'success' : 'danger'}
          delta={{ value: `${totalBills} bills`, direction: 'flat' }}
        />
      </section>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleCsv} disabled={rows.length === 0}>
          <Download className="h-4 w-4" /> CSV
        </Button>
      </div>

      <ChartCard title={`Net revenue vs expenses · by ${granularity}`} eyebrow="Trend">
        {isLoading ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : chartData.length === 0 ? (
          <p className="text-sm text-ink-500">No bills in this range.</p>
        ) : (
          <CurrencyBarChart
            data={chartData}
            series={[
              { key: 'revenue', name: 'Net revenue', color: '#C99B2A' },
              { key: 'expense', name: 'Expenses', color: '#6E695F' },
            ]}
            height={300}
          />
        )}
      </ChartCard>

      <section className="rounded-md border border-ink-100 bg-ink-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
            <tr>
              <th className="text-left px-4 py-2.5 capitalize">{granularity}</th>
              <th className="text-right px-4 py-2.5">Revenue</th>
              <th className="text-right px-4 py-2.5">GST</th>
              <th className="text-right px-4 py-2.5">Net revenue</th>
              <th className="text-right px-4 py-2.5">Expenses</th>
              <th className="text-right px-4 py-2.5">Net profit</th>
              <th className="text-right px-4 py-2.5">Bills</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((r) => (
              <tr key={r.bucket}>
                <td className="px-4 py-2 font-mono text-xs text-ink-700">{r.bucket.slice(0, 10)}</td>
                <td className="px-4 py-2 text-right"><Money paise={r.revenuePaise} /></td>
                <td className="px-4 py-2 text-right text-ink-700"><Money paise={r.gstPaise} /></td>
                <td className="px-4 py-2 text-right text-ink-900 font-medium"><Money paise={r.netRevenuePaise} /></td>
                <td className="px-4 py-2 text-right text-warning-700"><Money paise={r.expensePaise} /></td>
                <td className={cn('px-4 py-2 text-right font-semibold', r.netProfitPaise >= 0 ? 'text-success-700' : 'text-danger-700')}>
                  <Money paise={r.netProfitPaise} />
                </td>
                <td className="px-4 py-2 text-right text-ink-600 tabular-nums">{r.billCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// =====================================================================
// 3. Shop-wise performance
// =====================================================================

function ShopPerformanceSection(): JSX.Element {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const { data, isLoading } = useGetShopPerformanceQuery({
    from: new Date(from).toISOString(),
    to: new Date(`${to}T23:59:59.999Z`).toISOString(),
  });
  const rows = data?.data.rows ?? [];

  function handleCsv(): void {
    downloadCsv(`shop-performance-${from}-to-${to}.csv`, [
      ['Shop performance', `${from} → ${to}`],
      [],
      ['Branch', 'Revenue (₹)', 'GST (₹)', 'Expenses (₹)', 'Net profit (₹)', 'Profit %', 'Share %', 'Bills'],
      ...rows.map((r) => [
        r.shopName,
        paiseToRupeeString(r.revenuePaise),
        paiseToRupeeString(r.gstPaise),
        paiseToRupeeString(r.expensePaise),
        paiseToRupeeString(r.netProfitPaise),
        r.profitPct.toFixed(1),
        r.sharePct.toFixed(1),
        r.billCount,
      ]),
    ]);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
        <div className="sm:col-span-2 flex items-end justify-end">
          <Button variant="outline" size="sm" onClick={handleCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </FilterRow>

      <ChartCard title="Revenue by branch" eyebrow="Performance">
        {isLoading ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-ink-500">No bills in this range.</p>
        ) : (
          <RankedBarChart
            data={rows.map((r) => ({
              label: r.shopName,
              value: r.revenuePaise,
              sub: `${r.billCount} bills`,
            }))}
            height={Math.max(160, rows.length * 36)}
            unit="currency"
            name="Revenue"
          />
        )}
      </ChartCard>

      <section className="rounded-md border border-ink-100 bg-ink-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
            <tr>
              <th className="text-left px-4 py-2.5">Branch</th>
              <th className="text-right px-4 py-2.5">Revenue</th>
              <th className="text-right px-4 py-2.5">GST</th>
              <th className="text-right px-4 py-2.5">Expenses</th>
              <th className="text-right px-4 py-2.5">Net profit</th>
              <th className="text-right px-4 py-2.5">Profit %</th>
              <th className="text-right px-4 py-2.5">Share</th>
              <th className="text-right px-4 py-2.5">Bills</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((r) => (
              <tr key={r.shopId}>
                <td className="px-4 py-2 font-medium text-ink-900">{r.shopName}</td>
                <td className="px-4 py-2 text-right"><Money paise={r.revenuePaise} /></td>
                <td className="px-4 py-2 text-right text-ink-700"><Money paise={r.gstPaise} /></td>
                <td className="px-4 py-2 text-right text-warning-700"><Money paise={r.expensePaise} /></td>
                <td className={cn('px-4 py-2 text-right font-semibold', r.netProfitPaise >= 0 ? 'text-success-700' : 'text-danger-700')}>
                  <Money paise={r.netProfitPaise} />
                </td>
                <td className={cn('px-4 py-2 text-right tabular-nums', r.profitPct >= 0 ? 'text-success-700' : 'text-danger-700')}>
                  {r.profitPct.toFixed(1)}%
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-600">{r.sharePct.toFixed(1)}%</td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-600">{r.billCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// =====================================================================
// 4. Staff leaderboard
// =====================================================================

function StaffSection(): JSX.Element {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const range = {
    from: new Date(from).toISOString(),
    to: new Date(`${to}T23:59:59.999Z`).toISOString(),
  };
  const { data, isLoading } = useGetStaffReportQuery(range);
  const rows = (data?.data ?? []).slice().sort((a, b) => b.revenuePaise - a.revenuePaise);

  function handleCsv(): void {
    downloadCsv(`staff-leaderboard-${from}-to-${to}.csv`, [
      ['Staff sales leaderboard', `${from} → ${to}`],
      [],
      ['Rank', 'Staff', 'Role', 'Bills', 'Revenue (₹)', 'Avg bill (₹)'],
      ...rows.map((r, i) => [
        i + 1,
        r.userName ?? '—',
        r.userRole ?? '—',
        r.billCount,
        paiseToRupeeString(r.revenuePaise),
        paiseToRupeeString(r.billCount > 0 ? Math.round(r.revenuePaise / r.billCount) : 0),
      ]),
    ]);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
        <div className="sm:col-span-2 flex items-end justify-end">
          <Button variant="outline" size="sm" onClick={handleCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </FilterRow>

      <ChartCard title="Staff revenue" eyebrow="Leaderboard">
        {isLoading ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-ink-500">No staff-attributed bills in this range.</p>
        ) : (
          <RankedBarChart
            data={rows.map((r) => ({
              label: r.userName ?? 'Unattributed',
              value: r.revenuePaise,
              sub: `${r.billCount} bills`,
            }))}
            height={Math.max(200, rows.length * 36)}
            unit="currency"
          />
        )}
      </ChartCard>
    </div>
  );
}

// =====================================================================
// 5. Top-selling products
// =====================================================================

function TopProductsSection(): JSX.Element {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [search, setSearch] = useState('');
  // Category view is the primary focus per the client (M3 FR#3); product view
  // is a drill-down.
  const [view, setView] = useState<'category' | 'product'>('category');
  const range = {
    from: new Date(from).toISOString(),
    to: new Date(`${to}T23:59:59.999Z`).toISOString(),
    limit: 20,
  };
  const catQ = useGetTopCategoriesQuery(range, { skip: view !== 'category' });
  const prodQ = useGetTopProductsQuery(range, { skip: view !== 'product' });
  const isLoading = view === 'category' ? catQ.isLoading : prodQ.isLoading;

  // Normalise both shapes to a common row for the chart/table.
  const allRows = useMemo(() => {
    if (view === 'category') {
      return (catQ.data?.data ?? []).map((r) => ({
        id: r.categoryId,
        name: r.name,
        sub: null as string | null,
        qty: r.qty,
        orderCount: r.orderCount,
        revenuePaise: r.revenuePaise,
      }));
    }
    return (prodQ.data?.data ?? []).map((r) => ({
      id: r.productId,
      name: r.name,
      sub: r.mainCategoryName ?? null,
      qty: r.qty,
      orderCount: r.orderCount,
      revenuePaise: r.revenuePaise,
    }));
  }, [view, catQ.data, prodQ.data]);
  const rows = useTableSearch(allRows, (r) => [r.name, r.sub ?? ''], search);
  const noun = view === 'category' ? 'category' : 'product';

  function handleCsv(): void {
    downloadCsv(`top-${noun}-${from}-to-${to}.csv`, [
      [`Top ${noun === 'category' ? 'categories' : 'products'}`, `${from} → ${to}`],
      [],
      view === 'category'
        ? ['Rank', 'Category', 'Qty sold', 'Orders', 'Revenue (₹)']
        : ['Rank', 'Product', 'Main category', 'Qty sold', 'Orders', 'Revenue (₹)'],
      ...rows.map((r, i) =>
        view === 'category'
          ? [i + 1, r.name, r.qty, r.orderCount, paiseToRupeeString(r.revenuePaise)]
          : [i + 1, r.name, r.sub ?? '', r.qty, r.orderCount, paiseToRupeeString(r.revenuePaise)],
      ),
    ]);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
        <div className="sm:col-span-2 flex items-end justify-end gap-2">
          <div className="flex rounded-md border border-ink-200 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setView('category')}
              className={`h-8 px-3 rounded font-medium transition-colors ${view === 'category' ? 'bg-brand-500 text-ink-0' : 'text-ink-600 hover:bg-ink-50'}`}
            >
              By category
            </button>
            <button
              type="button"
              onClick={() => setView('product')}
              className={`h-8 px-3 rounded font-medium transition-colors ${view === 'product' ? 'bg-brand-500 text-ink-0' : 'text-ink-600 hover:bg-ink-50'}`}
            >
              By product
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={handleCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </FilterRow>

      <ChartCard
        title={view === 'category' ? 'Top-selling categories' : 'Top-selling products'}
        eyebrow="Catalogue"
      >
        {isLoading ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-ink-500">No online orders in this period.</p>
        ) : (
          <RankedBarChart
            data={rows.map((r) => ({ label: r.name, value: r.revenuePaise, sub: `${r.qty} sold` }))}
            height={Math.max(200, rows.length * 32)}
            unit="currency"
          />
        )}
      </ChartCard>

      <TableToolbar
        query={search}
        onQueryChange={setSearch}
        searchPlaceholder={`Search top ${noun === 'category' ? 'categories' : 'products'}…`}
        count={rows.length}
        countLabel={rows.length === 1 ? noun : `${noun === 'category' ? 'categories' : 'products'}`}
      />
      <section className="rounded-md border border-ink-100 bg-ink-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
            <tr>
              <th className="text-left px-4 py-2.5">Rank</th>
              <th className="text-left px-4 py-2.5">{view === 'category' ? 'Category' : 'Product'}</th>
              {view === 'product' && <th className="text-left px-4 py-2.5">Main category</th>}
              <th className="text-right px-4 py-2.5">Qty</th>
              <th className="text-right px-4 py-2.5">Orders</th>
              <th className="text-right px-4 py-2.5">Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className="px-4 py-2 font-mono text-xs text-ink-500">#{i + 1}</td>
                <td className="px-4 py-2 text-ink-900">{r.name}</td>
                {view === 'product' && (
                  <td className="px-4 py-2 text-ink-600">{r.sub ?? '—'}</td>
                )}
                <td className="px-4 py-2 text-right tabular-nums">{r.qty}</td>
                <td className="px-4 py-2 text-right text-ink-600 tabular-nums">{r.orderCount}</td>
                <td className="px-4 py-2 text-right"><Money paise={r.revenuePaise} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// =====================================================================
// 6. Inventory valuation at today's rate
// =====================================================================

function InventoryValuationSection(): JSX.Element {
  const [shopId, setShopId] = useState<string | undefined>(undefined);
  const [byProductSearch, setByProductSearch] = useState('');
  const { data, isLoading } = useGetInventoryValuationQuery(shopId ? { shopId } : undefined);
  const rep = data?.data;
  const allByProduct = rep?.byProduct ?? [];
  const byProduct = useTableSearch(
    allByProduct,
    (p) => [p.productName, p.categoryName, p.metalType],
    byProductSearch,
  );

  function handleCsv(): void {
    if (!rep) return;
    downloadCsv(`inventory-valuation-${today()}.csv`, [
      ['Inventory valuation', new Date(rep.asOf).toLocaleString('en-IN')],
      [],
      ['Total items', rep.total.count, 'Total weight (g)', (rep.total.weightMg / 1000).toFixed(3)],
      ['Cost basis (₹)', paiseToRupeeString(rep.total.costPaise)],
      ['Market value (₹)', paiseToRupeeString(rep.total.marketPaise)],
      ['Unrealized profit (₹)', paiseToRupeeString(rep.total.unrealizedProfitPaise)],
      [],
      ['By shop'],
      ['Shop', 'Items', 'Weight (g)', 'Cost (₹)', 'Market (₹)', 'Unrealized (₹)'],
      ...rep.byShop.map((s) => [
        s.shopName,
        s.count,
        (s.weightMg / 1000).toFixed(3),
        paiseToRupeeString(s.costPaise),
        paiseToRupeeString(s.marketPaise),
        paiseToRupeeString(s.unrealizedProfitPaise),
      ]),
      [],
      ['By category'],
      ['Category', 'Metal', 'Items', 'Weight (g)', 'Cost (₹)', 'Market (₹)', 'Unrealized (₹)'],
      ...rep.byCategory.map((c) => [
        c.categoryName,
        c.metalType,
        c.count,
        (c.weightMg / 1000).toFixed(3),
        paiseToRupeeString(c.costPaise),
        paiseToRupeeString(c.marketPaise),
        paiseToRupeeString(c.unrealizedProfitPaise),
      ]),
      [],
      ['By product'],
      ['Product', 'Category', 'Metal', 'Qty in stock', 'Weight (g)', 'Cost (₹)', 'Market (₹)', 'Unrealized (₹)'],
      ...rep.byProduct.map((p) => [
        p.productName,
        p.categoryName,
        p.metalType,
        p.count,
        (p.weightMg / 1000).toFixed(3),
        paiseToRupeeString(p.costPaise),
        paiseToRupeeString(p.marketPaise),
        paiseToRupeeString(p.unrealizedProfitPaise),
      ]),
    ]);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <ShopPicker value={shopId} onChange={setShopId} />
        <div className="sm:col-span-3 flex items-end justify-end">
          <Button variant="outline" size="sm" onClick={handleCsv} disabled={!rep}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </FilterRow>

      {isLoading && <p className="text-sm text-ink-500">Loading valuation…</p>}
      {rep && (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <MetricCard
              label="Items in stock"
              value={String(rep.total.count)}
              delta={{ value: <Weight mg={rep.total.weightMg} /> as unknown as string, direction: 'flat' }}
            />
            <MetricCard label="Cost basis" value={<Money paise={rep.total.costPaise} />} />
            <MetricCard
              label="Market value (today’s rate)"
              value={<Money paise={rep.total.marketPaise} />}
              tone="success"
            />
            <MetricCard
              label="Unrealized profit"
              value={<Money paise={rep.total.unrealizedProfitPaise} />}
              tone={rep.total.unrealizedProfitPaise >= 0 ? 'success' : 'danger'}
              delta={{
                value:
                  rep.total.costPaise > 0
                    ? `${((rep.total.unrealizedProfitPaise / rep.total.costPaise) * 100).toFixed(1)}%`
                    : '—',
                direction: rep.total.unrealizedProfitPaise >= 0 ? 'up' : 'down',
              }}
            />
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <ChartCard title="By shop" eyebrow="Branches">
              <RankedBarChart
                data={rep.byShop.map((s) => ({
                  label: s.shopName,
                  value: s.marketPaise,
                  sub: `${s.count} items`,
                }))}
                height={Math.max(160, rep.byShop.length * 36)}
                unit="currency"
                name="Market value"
              />
            </ChartCard>
            <ChartCard title="By category" eyebrow="Catalogue">
              {rep.byCategory.length === 0 ? (
                <p className="text-sm text-ink-500">No stock to value.</p>
              ) : (
                <CurrencyDonutChart
                  data={rep.byCategory.map((c) => ({ label: c.categoryName, value: c.marketPaise }))}
                  height={240}
                  centerLabel="Market"
                  centerValue={`₹${(rep.total.marketPaise / 100).toLocaleString('en-IN', {
                    maximumFractionDigits: 0,
                  })}`}
                />
              )}
            </ChartCard>
          </section>

          {/* Main → Sub → Items breakdown. Reads from the same source as
              the donut above but lets the operator drill into per-product
              detail without leaving the page. The flat "By category" table
              that used to live here was a duplicate of the donut — removed
              in favour of this tree, which surfaces the sub + product
              detail too. New main categories appear automatically when
              they have at least one IN_STOCK item. */}
          <InventoryValuationTree tree={rep.categoryTree ?? []} />

          <TableToolbar
            query={byProductSearch}
            onQueryChange={setByProductSearch}
            searchPlaceholder="Search products by name, category or metal…"
            count={byProduct.length}
            countLabel={byProduct.length === 1 ? 'product' : 'products'}
          />
          <section className="rounded-md border border-ink-100 bg-ink-0 overflow-x-auto">
            <header className="px-4 py-3 border-b border-ink-100 flex items-center justify-between">
              <h2 className="text-md font-medium text-ink-900">By product</h2>
              <p className="text-xs text-ink-500">{byProduct.length} of {allByProduct.length} products</p>
            </header>
            {allByProduct.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink-500">No in-stock products to value.</p>
            ) : byProduct.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink-500">No products match the search.</p>
            ) : (
              <table className="w-full text-sm min-w-[860px]">
                <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
                  <tr>
                    <th className="text-left px-4 py-2.5">Product</th>
                    <th className="text-left px-4 py-2.5">Category</th>
                    <th className="text-right px-4 py-2.5">Qty in stock</th>
                    <th className="text-right px-4 py-2.5">Weight</th>
                    <th className="text-right px-4 py-2.5">Cost</th>
                    <th className="text-right px-4 py-2.5">Market</th>
                    <th className="text-right px-4 py-2.5">Unrealized</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {byProduct.map((p) => (
                    <tr key={p.productKey}>
                      <td className="px-4 py-2 font-medium text-ink-900">{p.productName}</td>
                      <td className="px-4 py-2 text-ink-700">
                        {p.categoryName}
                        <span className="ml-1 text-xs text-ink-500">· {p.metalType}</span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{p.count}</td>
                      <td className="px-4 py-2 text-right"><Weight mg={p.weightMg} /></td>
                      <td className="px-4 py-2 text-right"><Money paise={p.costPaise} /></td>
                      <td className="px-4 py-2 text-right text-ink-900 font-medium">
                        <Money paise={p.marketPaise} />
                      </td>
                      <td className={cn('px-4 py-2 text-right font-semibold', p.unrealizedProfitPaise >= 0 ? 'text-success-700' : 'text-danger-700')}>
                        <Money paise={p.unrealizedProfitPaise} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}


// Hierarchical Main → Sub → Items breakdown for the Inventory value page.
// Mains always show. Click the chevron (or row body) to expand into the
// sub categories under that main; click again to expand a sub into the
// individual products inside. New main categories appear automatically
// as soon as they have at least one IN_STOCK item — the server builds
// the tree from each item's category.parent.
function InventoryValuationTree({
  tree,
}: {
  tree: InventoryValuationMain[];
}): JSX.Element {
  const [openMains, setOpenMains] = useState<Set<string>>(new Set());

  function toggleMain(id: string): void {
    setOpenMains((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (tree.length === 0) {
    return (
      <section className="rounded-md border border-ink-100 bg-ink-0">
        <header className="px-4 py-3 border-b border-ink-100">
          <h2 className="text-md font-medium text-ink-900">By category tree</h2>
          <p className="text-xs text-ink-500">
            Hierarchical breakdown will appear here once items are linked to main / sub
            categories in <strong>Inventory → Categories</strong>.
          </p>
        </header>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-ink-100 bg-ink-0 overflow-x-auto">
      <header className="px-4 py-3 border-b border-ink-100 flex items-center justify-between">
        <div>
          <h2 className="text-md font-medium text-ink-900">By category</h2>
          <p className="text-xs text-ink-500">
            Main category → sub category → items. Click any row to drill in.
          </p>
        </div>
        <p className="text-xs text-ink-500">
          {tree.length} main categor{tree.length === 1 ? 'y' : 'ies'}
        </p>
      </header>
      <table className="w-full text-sm min-w-[860px]">
        <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
          <tr>
            <th className="text-left px-4 py-2.5">Category</th>
            <th className="text-right px-4 py-2.5">Qty</th>
            <th className="text-right px-4 py-2.5">Weight</th>
            <th className="text-right px-4 py-2.5">Cost</th>
            <th className="text-right px-4 py-2.5">Market</th>
            <th className="text-right px-4 py-2.5">Unrealized</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {tree.map((main) => (
            <InventoryValuationMainRow
              key={main.mainCategoryId}
              main={main}
              isOpen={openMains.has(main.mainCategoryId)}
              onToggle={() => toggleMain(main.mainCategoryId)}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function InventoryValuationMainRow({
  main,
  isOpen,
  onToggle,
}: {
  main: InventoryValuationMain;
  isOpen: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <>
      <tr className="bg-ink-25/50 hover:bg-ink-25 cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-2.5 font-semibold text-ink-900">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="inline-flex items-center gap-1.5 text-left"
            aria-expanded={isOpen}
          >
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-ink-500" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-ink-500" />
            )}
            <span>{main.mainCategoryName}</span>
            <span className="text-[10px] uppercase tracking-wider text-ink-500 ml-1">
              {main.metalType}
            </span>
            <span className="text-[10px] text-ink-500 ml-2">
              · {main.subs.length} sub{main.subs.length === 1 ? '' : 's'}
            </span>
          </button>
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums">{main.count}</td>
        <td className="px-4 py-2.5 text-right"><Weight mg={main.weightMg} /></td>
        <td className="px-4 py-2.5 text-right"><Money paise={main.costPaise} /></td>
        <td className="px-4 py-2.5 text-right text-ink-900 font-medium">
          <Money paise={main.marketPaise} />
        </td>
        <td className={cn('px-4 py-2.5 text-right font-semibold', main.unrealizedProfitPaise >= 0 ? 'text-success-700' : 'text-danger-700')}>
          <Money paise={main.unrealizedProfitPaise} />
        </td>
      </tr>
      {isOpen &&
        main.subs.map((sub) => (
          <InventoryValuationSubRow key={sub.subCategoryId} sub={sub} />
        ))}
    </>
  );
}

function InventoryValuationSubRow({ sub }: { sub: InventoryValuationSub }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="hover:bg-ink-25 cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <td className="px-4 py-2 text-ink-800 pl-10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            className="inline-flex items-center gap-1.5 text-left"
            aria-expanded={open}
          >
            {open ? (
              <ChevronDown className="h-3 w-3 text-ink-500" />
            ) : (
              <ChevronRight className="h-3 w-3 text-ink-500" />
            )}
            <span>{sub.subCategoryName}</span>
            <span className="text-[10px] text-ink-500 ml-2">
              · {sub.items.length} product{sub.items.length === 1 ? '' : 's'}
            </span>
          </button>
        </td>
        <td className="px-4 py-2 text-right tabular-nums">{sub.count}</td>
        <td className="px-4 py-2 text-right"><Weight mg={sub.weightMg} /></td>
        <td className="px-4 py-2 text-right"><Money paise={sub.costPaise} /></td>
        <td className="px-4 py-2 text-right text-ink-900">
          <Money paise={sub.marketPaise} />
        </td>
        <td className={cn('px-4 py-2 text-right', sub.unrealizedProfitPaise >= 0 ? 'text-success-700' : 'text-danger-700')}>
          <Money paise={sub.unrealizedProfitPaise} />
        </td>
      </tr>
      {open &&
        sub.items.map((item, idx) => (
          <tr key={`${sub.subCategoryId}-${item.itemId}-${idx}`} className="bg-ink-0">
            <td className="px-4 py-2 text-ink-700 pl-16 text-xs">
              <span>{item.productName}</span>
              <span className="ml-2 text-[10px] text-ink-400 font-mono">{item.itemId}</span>
            </td>
            <td className="px-4 py-2 text-right text-xs tabular-nums">{item.count}</td>
            <td className="px-4 py-2 text-right text-xs"><Weight mg={item.weightMg} /></td>
            <td className="px-4 py-2 text-right text-xs"><Money paise={item.costPaise} /></td>
            <td className="px-4 py-2 text-right text-xs"><Money paise={item.marketPaise} /></td>
            <td className={cn('px-4 py-2 text-right text-xs', item.unrealizedProfitPaise >= 0 ? 'text-success-700' : 'text-danger-700')}>
              <Money paise={item.unrealizedProfitPaise} />
            </td>
          </tr>
        ))}
    </>
  );
}

// =====================================================================
// 7. Low-margin alert
// =====================================================================

function LowMarginSection(): JSX.Element {
  const [threshold, setThreshold] = useState('8');
  const [search, setSearch] = useState('');
  const { data, isLoading } = useGetLowMarginQuery({
    thresholdPct: Number(threshold) || 0,
    limit: 100,
  });
  const rep = data?.data;
  const allItems = rep?.items ?? [];
  const items = useTableSearch(
    allItems,
    (it) => [it.sku, it.shopName, it.categoryName],
    search,
  );

  function handleCsv(): void {
    if (!rep) return;
    downloadCsv(`low-margin-${threshold}pct.csv`, [
      ['Low-margin items', `Threshold: ${threshold}%`],
      [],
      ['SKU', 'Shop', 'Category', 'Weight (g)', 'Cost (₹)', 'Market (₹)', 'Margin (₹)', 'Margin %'],
      ...items.map((it) => [
        it.sku,
        it.shopName,
        it.categoryName,
        (it.weightMg / 1000).toFixed(3),
        paiseToRupeeString(it.costPricePaise),
        paiseToRupeeString(it.marketPaise),
        paiseToRupeeString(it.marginPaise),
        it.marginPct.toFixed(2),
      ]),
    ]);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <label className="block text-sm">
          <span className="text-[11px] uppercase tracking-wider text-ink-500">Margin threshold %</span>
          <Input
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            min={0}
            max={100}
          />
        </label>
        <div className="sm:col-span-3 flex items-end justify-end">
          <Button variant="outline" size="sm" onClick={handleCsv} disabled={items.length === 0}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </FilterRow>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <MetricCard
          label="Items flagged"
          value={String(rep?.flaggedCount ?? 0)}
          tone={rep && rep.flaggedCount > 0 ? 'warning' : 'success'}
        />
        <MetricCard
          label="Flagged market value"
          value={rep ? <Money paise={rep.flaggedValuePaise} /> : '—'}
        />
        <MetricCard label="Threshold" value={`< ${threshold}%`} />
      </section>

      {isLoading && <p className="text-sm text-ink-500">Loading…</p>}
      {rep && allItems.length === 0 && (
        <div className="rounded-md border border-success-500/40 bg-success-50/40 px-4 py-3 text-sm text-success-700 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          No items below {threshold}% margin — healthy stock.
        </div>
      )}
      {allItems.length > 0 && (
        <TableToolbar
          query={search}
          onQueryChange={setSearch}
          searchPlaceholder="Search flagged items by SKU, shop or category…"
          count={items.length}
          countLabel={items.length === 1 ? 'item' : 'items'}
        />
      )}
      {items.length > 0 && (
        <section className="rounded-md border border-warning-500/40 bg-ink-0">
          <header className="px-4 py-3 border-b border-warning-500/40 flex items-center gap-2 text-warning-700">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-md font-medium">Items below {threshold}% margin</p>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
                <tr>
                  <th className="text-left px-4 py-2.5">SKU</th>
                  <th className="text-left px-4 py-2.5">Shop</th>
                  <th className="text-left px-4 py-2.5">Category</th>
                  <th className="text-right px-4 py-2.5">Weight</th>
                  <th className="text-right px-4 py-2.5">Cost</th>
                  <th className="text-right px-4 py-2.5">Market</th>
                  <th className="text-right px-4 py-2.5">Margin</th>
                  <th className="text-right px-4 py-2.5">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {items.map((it) => (
                  <tr key={it.itemId}>
                    <td className="px-4 py-2 font-mono text-xs text-ink-900">{it.sku}</td>
                    <td className="px-4 py-2 text-ink-700">{it.shopName}</td>
                    <td className="px-4 py-2 text-ink-700">{it.categoryName}</td>
                    <td className="px-4 py-2 text-right"><Weight mg={it.weightMg} /></td>
                    <td className="px-4 py-2 text-right"><Money paise={it.costPricePaise} /></td>
                    <td className="px-4 py-2 text-right text-ink-900"><Money paise={it.marketPaise} /></td>
                    <td className={cn('px-4 py-2 text-right font-semibold', it.marginPaise >= 0 ? 'text-warning-700' : 'text-danger-700')}>
                      <Money paise={it.marginPaise} />
                    </td>
                    <td className={cn('px-4 py-2 text-right tabular-nums font-semibold', it.marginPct >= 0 ? 'text-warning-700' : 'text-danger-700')}>
                      {it.marginPct.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// =====================================================================
// 8. Customer acquisition
// =====================================================================

function CustomerAcquisitionSection(): JSX.Element {
  const [from, setFrom] = useState(daysAgo(60));
  const [to, setTo] = useState(today());
  const { data, isLoading } = useGetCustomerAcquisitionQuery({
    from: new Date(from).toISOString(),
    to: new Date(`${to}T23:59:59.999Z`).toISOString(),
  });
  const rep = data?.data;

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
      </FilterRow>

      {rep && (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <MetricCard label="Total leads" value={String(rep.totals.totalLeads)} />
            <MetricCard
              label="Converted"
              value={String(rep.totals.converted)}
              tone="success"
              delta={{ value: `${rep.totals.conversionPct.toFixed(1)}% conversion`, direction: 'up' }}
            />
            <MetricCard label="New customers" value={String(rep.totals.newCustomers)} tone="success" />
            <MetricCard
              label="Returning customers"
              value={String(rep.totals.returningCustomers)}
              tone="success"
            />
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <ChartCard title="Leads by channel" eyebrow="Sources">
              {rep.bySource.length === 0 ? (
                <p className="text-sm text-ink-500">No leads in this period.</p>
              ) : (
                <CurrencyDonutChart
                  data={rep.bySource.map((s) => ({ label: s.source, value: s.leadCount }))}
                  height={240}
                  centerLabel="Total"
                  centerValue={String(rep.totals.totalLeads)}
                />
              )}
            </ChartCard>
            <ChartCard title="New vs returning revenue" eyebrow="Cohort">
              <RankedBarChart
                data={[
                  { label: 'New customers', value: rep.totals.newRevenuePaise, sub: `${rep.totals.newCustomers} people` },
                  {
                    label: 'Returning customers',
                    value: rep.totals.returningRevenuePaise,
                    sub: `${rep.totals.returningCustomers} people`,
                  },
                ]}
                unit="currency"
                height={200}
              />
            </ChartCard>
          </section>

          <section className="rounded-md border border-ink-100 bg-ink-0 overflow-x-auto">
            <header className="px-4 py-3 border-b border-ink-100">
              <h2 className="text-md font-medium text-ink-900">Channel breakdown</h2>
            </header>
            {isLoading && <p className="px-4 py-3 text-sm text-ink-500">Loading…</p>}
            <table className="w-full text-sm min-w-[480px]">
              <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
                <tr>
                  <th className="text-left px-4 py-2.5">Source</th>
                  <th className="text-right px-4 py-2.5">Leads</th>
                  <th className="text-right px-4 py-2.5">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rep.bySource.map((s) => (
                  <tr key={s.source}>
                    <td className="px-4 py-2 font-medium text-ink-900 capitalize">{s.source}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.leadCount}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-600">
                      {s.sharePct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

// =====================================================================
// 9. Festive trend (YoY)
// =====================================================================

function FestiveTrendSection(): JSX.Element {
  const { data, isLoading } = useGetFestiveTrendQuery();
  const rep = data?.data;

  const chartData = (rep?.series ?? []).map((s) => ({
    label: s.monthLabel,
    current: s.currentRevenuePaise,
    previous: s.previousRevenuePaise,
  }));

  const totalCurrent = (rep?.series ?? []).reduce((a, s) => a + s.currentRevenuePaise, 0);
  const totalPrevious = (rep?.series ?? []).reduce((a, s) => a + s.previousRevenuePaise, 0);
  const yoyPct = totalPrevious > 0 ? ((totalCurrent - totalPrevious) / totalPrevious) * 100 : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {rep && (
        <section className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <MetricCard
            label={`Revenue FY${String(rep.currentYear).slice(-2)}`}
            value={<Money paise={totalCurrent} />}
            tone="success"
          />
          <MetricCard
            label={`Revenue FY${String(rep.previousYear).slice(-2)}`}
            value={<Money paise={totalPrevious} />}
          />
          <MetricCard
            label="YoY growth"
            value={yoyPct !== null ? `${yoyPct >= 0 ? '+' : ''}${yoyPct.toFixed(1)}%` : '—'}
            tone={yoyPct !== null && yoyPct >= 0 ? 'success' : 'warning'}
          />
        </section>
      )}

      <ChartCard title="Monthly revenue · this year vs last year" eyebrow="YoY">
        {isLoading ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : (
          <CurrencyBarChart
            data={chartData}
            series={[
              { key: 'current', name: `FY${String(rep?.currentYear).slice(-2) ?? ''}`, color: '#C99B2A' },
              { key: 'previous', name: `FY${String(rep?.previousYear).slice(-2) ?? ''}`, color: '#6E695F' },
            ]}
            height={320}
          />
        )}
      </ChartCard>

      {rep && (
        <section className="rounded-md border border-ink-100 bg-ink-0 overflow-x-auto">
          <header className="px-4 py-3 border-b border-ink-100">
            <h2 className="text-md font-medium text-ink-900">By month</h2>
          </header>
          <table className="w-full text-sm min-w-[560px]">
            <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
              <tr>
                <th className="text-left px-4 py-2.5">Month</th>
                <th className="text-right px-4 py-2.5">{rep.currentYear}</th>
                <th className="text-right px-4 py-2.5">{rep.previousYear}</th>
                <th className="text-right px-4 py-2.5">Δ%</th>
                <th className="text-left px-4 py-2.5">Festive?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rep.series.map((s) => {
                const delta =
                  s.previousRevenuePaise > 0
                    ? ((s.currentRevenuePaise - s.previousRevenuePaise) / s.previousRevenuePaise) * 100
                    : null;
                return (
                  <tr key={s.monthIdx} className={s.isFestive ? 'bg-brand-50/30' : ''}>
                    <td className="px-4 py-2 font-medium text-ink-900">{s.monthLabel}</td>
                    <td className="px-4 py-2 text-right"><Money paise={s.currentRevenuePaise} /></td>
                    <td className="px-4 py-2 text-right text-ink-700">
                      <Money paise={s.previousRevenuePaise} />
                    </td>
                    <td className={cn('px-4 py-2 text-right tabular-nums', delta !== null && delta >= 0 ? 'text-success-700' : 'text-danger-700')}>
                      {delta !== null ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-2">
                      {s.isFestive && (
                        <span className="inline-block rounded-sm bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-700 font-medium">
                          Festive
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

// =====================================================================
// 10. GST filing summary
// =====================================================================

function GstFilingSection(): JSX.Element {
  const [from, setFrom] = useState(daysAgo(90));
  const [to, setTo] = useState(today());
  const { data, isLoading } = useGetGstSummaryRangeQuery({
    from: new Date(from).toISOString(),
    to: new Date(`${to}T23:59:59.999Z`).toISOString(),
  });
  const rows = data?.data.monthly ?? [];
  const totals = rows.reduce(
    (acc, r) => ({
      cgst: acc.cgst + r.cgstPaise,
      sgst: acc.sgst + r.sgstPaise,
      igst: acc.igst + r.igstPaise,
      total: acc.total + r.totalGstPaise,
      bills: acc.bills + r.billCount,
    }),
    { cgst: 0, sgst: 0, igst: 0, total: 0, bills: 0 },
  );

  function handleCsv(): void {
    downloadCsv(`gst-filing-${from}-to-${to}.csv`, [
      ['GST filing summary', `${from} → ${to}`],
      [],
      ['Month', 'CGST', 'SGST', 'IGST', 'Total GST', 'Taxable revenue', 'Bills'],
      ...rows.map((r) => [
        r.month,
        paiseToRupeeString(r.cgstPaise),
        paiseToRupeeString(r.sgstPaise),
        paiseToRupeeString(r.igstPaise),
        paiseToRupeeString(r.totalGstPaise),
        paiseToRupeeString(r.taxableRevenuePaise),
        r.billCount,
      ]),
    ]);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
        <div className="sm:col-span-2 flex items-end justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handleCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => printSection('gst-print', 'GST Filing')}>
            Print
          </Button>
        </div>
      </FilterRow>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Total GST" value={<Money paise={totals.total} />} tone="warning" />
        <MetricCard label="CGST" value={<Money paise={totals.cgst} />} />
        <MetricCard label="SGST" value={<Money paise={totals.sgst} />} />
        <MetricCard label="IGST" value={<Money paise={totals.igst} />} />
      </section>

      <div id="gst-print" className="rounded-md border border-ink-100 bg-ink-0 overflow-x-auto">
        <header className="px-4 py-3 border-b border-ink-100">
          <h2 className="text-md font-medium text-ink-900">Monthly breakdown</h2>
        </header>
        {isLoading && <p className="px-4 py-3 text-sm text-ink-500">Loading…</p>}
        <table className="w-full text-sm min-w-[680px]">
          <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
            <tr>
              <th className="text-left px-4 py-2.5">Month</th>
              <th className="text-right px-4 py-2.5">Taxable revenue</th>
              <th className="text-right px-4 py-2.5">CGST</th>
              <th className="text-right px-4 py-2.5">SGST</th>
              <th className="text-right px-4 py-2.5">IGST</th>
              <th className="text-right px-4 py-2.5">Total GST</th>
              <th className="text-right px-4 py-2.5">Bills</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((r) => (
              <tr key={r.month}>
                <td className="px-4 py-2 font-mono text-xs text-ink-900">{r.month}</td>
                <td className="px-4 py-2 text-right"><Money paise={r.taxableRevenuePaise} /></td>
                <td className="px-4 py-2 text-right text-ink-700"><Money paise={r.cgstPaise} /></td>
                <td className="px-4 py-2 text-right text-ink-700"><Money paise={r.sgstPaise} /></td>
                <td className="px-4 py-2 text-right text-ink-700"><Money paise={r.igstPaise} /></td>
                <td className="px-4 py-2 text-right text-ink-900 font-medium">
                  <Money paise={r.totalGstPaise} />
                </td>
                <td className="px-4 py-2 text-right text-ink-600 tabular-nums">{r.billCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =====================================================================
// 11. Ad ROI
// =====================================================================

function AdRoiSection(): JSX.Element {
  const [from, setFrom] = useState(daysAgo(60));
  const [to, setTo] = useState(today());
  const { data, isLoading } = useGetAdRoiQuery({
    from: new Date(from).toISOString(),
    to: new Date(`${to}T23:59:59.999Z`).toISOString(),
  });
  const rep = data?.data;

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
      </FilterRow>

      {rep && (
        <section className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <MetricCard label="Marketing spend" value={<Money paise={rep.totals.spendPaise} />} tone="warning" />
          <MetricCard
            label="Attributed revenue"
            value={<Money paise={rep.totals.attributedRevenuePaise} />}
            tone="success"
          />
          <MetricCard
            label="ROI"
            value={rep.totals.roiX !== null ? `${rep.totals.roiX.toFixed(2)}x` : '—'}
            tone={rep.totals.roiX !== null && rep.totals.roiX >= 1 ? 'success' : 'danger'}
            delta={{
              value: rep.totals.spendPaise > 0 ? 'Lead-attributed' : 'No spend logged',
              direction: 'flat',
            }}
          />
        </section>
      )}

      <ChartCard title="Attributed revenue by campaign" eyebrow="Marketing">
        {isLoading ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : !rep || rep.campaigns.length === 0 ? (
          <p className="text-sm text-ink-500">
            No campaign leads in this range. Set <code>utmCampaign</code> on incoming leads to attribute.
          </p>
        ) : (
          <RankedBarChart
            data={rep.campaigns.map((c) => ({
              label: c.campaign,
              value: c.attributedRevenuePaise,
              sub: `${c.leadCount} leads · ${c.conversionPct.toFixed(1)}% conv`,
            }))}
            height={Math.max(180, rep.campaigns.length * 36)}
            unit="currency"
          />
        )}
      </ChartCard>

      {rep && rep.campaigns.length > 0 && (
        <section className="rounded-md border border-ink-100 bg-ink-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
              <tr>
                <th className="text-left px-4 py-2.5">Campaign</th>
                <th className="text-right px-4 py-2.5">Leads</th>
                <th className="text-right px-4 py-2.5">Converted</th>
                <th className="text-right px-4 py-2.5">Conv %</th>
                <th className="text-right px-4 py-2.5">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rep.campaigns.map((c) => (
                <tr key={c.campaign}>
                  <td className="px-4 py-2 font-medium text-ink-900">{c.campaign}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{c.leadCount}</td>
                  <td className="px-4 py-2 text-right text-success-700 tabular-nums">
                    {c.convertedCount}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{c.conversionPct.toFixed(1)}%</td>
                  <td className="px-4 py-2 text-right">
                    <Money paise={c.attributedRevenuePaise} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

// =====================================================================
// 12. Gold rate impact
// =====================================================================

function GoldRateImpactSection(): JSX.Element {
  const { data, isLoading } = useGetGoldRateImpactQuery();
  const rep = data?.data;

  const chartData = (rep?.series ?? []).map((s) => ({
    label: new Date(s.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    rate: s.rate22KPaise,
    revenue: s.revenuePaise,
  }));

  return (
    <div className="space-y-4 sm:space-y-6">
      {rep && (
        <section className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <MetricCard
            label="Rate change · 60d"
            value={`${rep.meta.rateChangePct >= 0 ? '+' : ''}${rep.meta.rateChangePct.toFixed(2)}%`}
            tone={rep.meta.rateChangePct >= 0 ? 'warning' : 'success'}
          />
          <MetricCard
            label="Revenue · 60d"
            value={<Money paise={rep.meta.totalRevenuePaise} />}
            tone="success"
          />
          <MetricCard label="Observation days" value={String(rep.meta.observationCount)} />
        </section>
      )}

      <ChartCard title="22K rate vs daily revenue" eyebrow="Macro">
        {isLoading ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : chartData.length === 0 ? (
          <p className="text-sm text-ink-500">
            No daily gold-rate snapshots yet — the worker fetches one per day. Check back tomorrow.
          </p>
        ) : (
          <CurrencyBarChart
            data={chartData}
            series={[
              { key: 'revenue', name: 'Revenue', color: '#C99B2A' },
              { key: 'rate', name: '22K rate / g', color: '#6E695F' },
            ]}
            height={320}
          />
        )}
      </ChartCard>

      {rep && rep.series.length > 0 && (
        <section className="rounded-md border border-ink-100 bg-ink-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
              <tr>
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-right px-4 py-2.5">24K / g</th>
                <th className="text-right px-4 py-2.5">22K / g</th>
                <th className="text-right px-4 py-2.5">Revenue</th>
                <th className="text-right px-4 py-2.5">Bills</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rep.series.map((s) => (
                <tr key={s.date}>
                  <td className="px-4 py-2 font-mono text-xs text-ink-700">{s.date}</td>
                  <td className="px-4 py-2 text-right text-ink-700">
                    <Money paise={s.rate24KPaise} />
                  </td>
                  <td className="px-4 py-2 text-right text-ink-900 font-medium">
                    <Money paise={s.rate22KPaise} />
                  </td>
                  <td className="px-4 py-2 text-right text-success-700">
                    <Money paise={s.revenuePaise} />
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-600">{s.billCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

// =====================================================================
// 14. Repeat orders — shop-wise + ecommerce, by granularity
// =====================================================================

function RepeatOrdersSection(): JSX.Element {
  type Granularity = 'month' | 'quarter' | 'year';
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [from, setFrom] = useState(daysAgo(365));
  const [to, setTo] = useState(today());
  const [shopId, setShopId] = useState<string | undefined>(undefined);

  const { data, isLoading } = useGetRepeatOrdersQuery({
    granularity,
    from: new Date(from).toISOString(),
    to: new Date(`${to}T23:59:59.999Z`).toISOString(),
    shopId,
  });
  const rep = data?.data;
  const series = rep?.series ?? [];

  function bucketLabel(b: string): string {
    const d = new Date(b);
    if (granularity === 'year') return d.toLocaleDateString('en-IN', { year: 'numeric' });
    if (granularity === 'quarter') {
      const q = Math.floor(d.getUTCMonth() / 3) + 1;
      return `Q${q} ${d.getUTCFullYear()}`;
    }
    return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  }

  const chartData = series.map((s) => ({
    label: bucketLabel(s.bucket),
    pos: s.posRepeatOrders,
    ecom: s.ecomRepeatOrders,
  }));

  const shopData = (rep?.byShop ?? []).map((s) => ({
    label: s.shopName,
    value: s.repeatOrders,
    sub: `${s.repeatCustomers} repeat customers`,
  }));

  function handleCsv(): void {
    const out: (string | number)[][] = [
      ['Repeat Orders', `${from} → ${to}`, `Granularity: ${granularity}`],
      [],
      ['Period', 'POS Repeat Orders', 'POS Repeat Customers', 'Ecom Repeat Orders', 'Ecom Repeat Customers', 'Total'],
      ...series.map((s) => [
        bucketLabel(s.bucket),
        s.posRepeatOrders,
        s.posRepeatCustomers,
        s.ecomRepeatOrders,
        s.ecomRepeatCustomers,
        s.totalRepeatOrders,
      ]),
    ];
    downloadCsv(`repeat-orders-${granularity}-${from}-to-${to}.csv`, out);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <label className="block text-sm">
          <span className="text-[11px] uppercase tracking-wider text-ink-500">Granularity</span>
          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as Granularity)}
            className="mt-1 w-full h-10 px-3 rounded-md border border-ink-200 text-sm"
          >
            <option value="month">Monthly</option>
            <option value="quarter">Quarterly</option>
            <option value="year">Yearly</option>
          </select>
        </label>
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
        <ShopPicker value={shopId} onChange={setShopId} />
      </FilterRow>

      {rep && (
        <section className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <MetricCard
            label="Total repeat orders"
            value={String(rep.totals?.totalRepeatOrders ?? 0)}
            tone="success"
            delta={{ value: 'POS + Ecommerce', direction: 'flat' }}
          />
          <MetricCard
            label="POS repeat orders"
            value={String(rep.totals?.posRepeatOrders ?? 0)}
            delta={{ value: 'In-store returning', direction: 'flat' }}
          />
          <MetricCard
            label="Ecom repeat orders"
            value={String(rep.totals?.ecomRepeatOrders ?? 0)}
            tone={(rep.totals?.ecomRepeatOrders ?? 0) > 0 ? 'success' : undefined}
            delta={{ value: 'Online returning', direction: 'flat' }}
          />
        </section>
      )}

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleCsv} disabled={series.length === 0}>
          <Download className="h-4 w-4" /> CSV
        </Button>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <ChartCard title={`Repeat orders · POS vs Ecommerce · by ${granularity}`} eyebrow="Retention">
          {isLoading ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : chartData.length === 0 ? (
            <p className="text-sm text-ink-500">No repeat orders in this range.</p>
          ) : (
            <CountBarChart
              data={chartData}
              series={[
                { key: 'pos', name: 'POS (in-store)', color: '#C99B2A' },
                { key: 'ecom', name: 'Ecommerce', color: '#604910' },
              ]}
              height={300}
            />
          )}
        </ChartCard>

        <ChartCard title="Repeat orders by shop" eyebrow="Shop-wise">
          {isLoading ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : shopData.length === 0 ? (
            <p className="text-sm text-ink-500">No shop data available.</p>
          ) : (
            <RankedBarChart data={shopData} unit="count" name="Repeat orders" height={300} />
          )}
        </ChartCard>
      </section>

      <section className="rounded-md border border-ink-100 bg-ink-0 overflow-x-auto">
        <header className="px-4 py-3 border-b border-ink-100">
          <h2 className="text-md font-medium text-ink-900">Period breakdown</h2>
        </header>
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
            <tr>
              <th className="text-left px-4 py-2.5">Period</th>
              <th className="text-right px-4 py-2.5">POS orders</th>
              <th className="text-right px-4 py-2.5">POS customers</th>
              <th className="text-right px-4 py-2.5">Ecom orders</th>
              <th className="text-right px-4 py-2.5">Ecom customers</th>
              <th className="text-right px-4 py-2.5">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {series.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-500">
                  No repeat orders found.
                </td>
              </tr>
            )}
            {series.map((s) => (
              <tr key={s.bucket} className="hover:bg-ink-25/50">
                <td className="px-4 py-2 font-medium text-ink-900">{bucketLabel(s.bucket)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{s.posRepeatOrders.toLocaleString('en-IN')}</td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-600">{s.posRepeatCustomers.toLocaleString('en-IN')}</td>
                <td className="px-4 py-2 text-right tabular-nums">{s.ecomRepeatOrders.toLocaleString('en-IN')}</td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-600">{s.ecomRepeatCustomers.toLocaleString('en-IN')}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-ink-900">{s.totalRepeatOrders.toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// =====================================================================
// 15. Returns / RTO — POS refunds + ecommerce returns by granularity
// =====================================================================

function ReturnsSection(): JSX.Element {
  type Granularity = 'month' | 'quarter' | 'year';
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [from, setFrom] = useState(daysAgo(365));
  const [to, setTo] = useState(today());
  const [shopId, setShopId] = useState<string | undefined>(undefined);

  const { data, isLoading } = useGetReturnsQuery({
    granularity,
    from: new Date(from).toISOString(),
    to: new Date(`${to}T23:59:59.999Z`).toISOString(),
    shopId,
  });
  const rep = data?.data;
  const series = rep?.series ?? [];

  function bucketLabel(b: string): string {
    const d = new Date(b);
    if (granularity === 'year') return d.toLocaleDateString('en-IN', { year: 'numeric' });
    if (granularity === 'quarter') {
      const q = Math.floor(d.getUTCMonth() / 3) + 1;
      return `Q${q} ${d.getUTCFullYear()}`;
    }
    return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  }

  const chartData = series.map((s) => ({
    label: bucketLabel(s.bucket),
    pos: s.posCount,
    ecomReturn: s.ecomReturnCount,
    ecomCancel: s.ecomCancelCount,
  }));

  const shopData = (rep?.byShop ?? []).map((s) => ({
    label: s.shopName,
    value: s.count,
    sub: `Refund: ${s.count}`,
  }));

  function handleCsv(): void {
    const out: (string | number)[][] = [
      ['Returns / RTO', `${from} → ${to}`, `Granularity: ${granularity}`],
      [],
      ['Period', 'POS Returns', 'POS Amount (₹)', 'Ecom Returned', 'Ecom Cancelled', 'Total Count'],
      ...series.map((s) => [
        bucketLabel(s.bucket),
        s.posCount,
        paiseToRupeeString(s.posAmountPaise),
        s.ecomReturnCount,
        s.ecomCancelCount,
        s.totalCount,
      ]),
    ];
    downloadCsv(`returns-${granularity}-${from}-to-${to}.csv`, out);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <label className="block text-sm">
          <span className="text-[11px] uppercase tracking-wider text-ink-500">Granularity</span>
          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as Granularity)}
            className="mt-1 w-full h-10 px-3 rounded-md border border-ink-200 text-sm"
          >
            <option value="month">Monthly</option>
            <option value="quarter">Quarterly</option>
            <option value="year">Yearly</option>
          </select>
        </label>
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
        <ShopPicker value={shopId} onChange={setShopId} />
      </FilterRow>

      {rep && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <MetricCard
            label="Total returns"
            value={String(rep.totals?.totalCount ?? 0)}
            tone={(rep.totals?.totalCount ?? 0) > 0 ? 'warning' : undefined}
          />
          <MetricCard
            label="POS refunds"
            value={String(rep.totals?.posCount ?? 0)}
            delta={{ value: `₹${((rep.totals?.posAmountPaise ?? 0) / 100).toLocaleString('en-IN')}`, direction: 'flat' }}
          />
          <MetricCard
            label="Ecom returned"
            value={String(rep.totals?.ecomReturnCount ?? 0)}
            tone={(rep.totals?.ecomReturnCount ?? 0) > 0 ? 'warning' : undefined}
          />
          <MetricCard
            label="Ecom cancelled"
            value={String(rep.totals?.ecomCancelCount ?? 0)}
          />
        </section>
      )}

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleCsv} disabled={series.length === 0}>
          <Download className="h-4 w-4" /> CSV
        </Button>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <ChartCard title={`Returns by channel · by ${granularity}`} eyebrow="RTO">
          {isLoading ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : chartData.length === 0 ? (
            <p className="text-sm text-ink-500">No returns in this range.</p>
          ) : (
            <CountBarChart
              data={chartData}
              series={[
                { key: 'pos', name: 'POS refunds', color: '#C99B2A' },
                { key: 'ecomReturn', name: 'Ecom returned', color: '#B91C1C' },
                { key: 'ecomCancel', name: 'Ecom cancelled', color: '#6E695F' },
              ]}
              height={300}
            />
          )}
        </ChartCard>

        <ChartCard title="POS returns by shop" eyebrow="Shop-wise">
          {isLoading ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : shopData.length === 0 ? (
            <p className="text-sm text-ink-500">No POS return data available.</p>
          ) : (
            <RankedBarChart data={shopData} unit="count" name="Returns" height={300} />
          )}
        </ChartCard>
      </section>

      <section className="rounded-md border border-ink-100 bg-ink-0 overflow-x-auto">
        <header className="px-4 py-3 border-b border-ink-100">
          <h2 className="text-md font-medium text-ink-900">Period breakdown</h2>
        </header>
        <table className="w-full text-sm min-w-[680px]">
          <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
            <tr>
              <th className="text-left px-4 py-2.5">Period</th>
              <th className="text-right px-4 py-2.5">POS refunds</th>
              <th className="text-right px-4 py-2.5">POS amount</th>
              <th className="text-right px-4 py-2.5">Ecom returned</th>
              <th className="text-right px-4 py-2.5">Ecom cancelled</th>
              <th className="text-right px-4 py-2.5">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {series.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-500">
                  No returns found.
                </td>
              </tr>
            )}
            {series.map((s) => (
              <tr key={s.bucket} className="hover:bg-ink-25/50">
                <td className="px-4 py-2 font-medium text-ink-900">{bucketLabel(s.bucket)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{s.posCount.toLocaleString('en-IN')}</td>
                <td className="px-4 py-2 text-right">
                  {s.posAmountPaise > 0 ? <Money paise={s.posAmountPaise} /> : '—'}
                </td>
                <td className={cn('px-4 py-2 text-right tabular-nums', s.ecomReturnCount > 0 ? 'text-danger-700' : '')}>
                  {s.ecomReturnCount.toLocaleString('en-IN')}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-600">
                  {s.ecomCancelCount.toLocaleString('en-IN')}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-ink-900">
                  {s.totalCount.toLocaleString('en-IN')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// =====================================================================
// 13. Scheduled email reports
// =====================================================================

const REPORT_TYPES: Array<{ value: ScheduledReport['reportType']; label: string }> = [
  { value: 'daily-sales', label: 'Daily sales summary' },
  { value: 'weekly-pl', label: 'Weekly P&L' },
  { value: 'monthly-gst', label: 'Monthly GST filing' },
  { value: 'inventory-valuation', label: 'Inventory valuation' },
];

const FREQUENCIES: Array<{ value: ScheduledReport['frequency']; label: string }> = [
  { value: 'daily', label: 'Daily · 9 AM IST' },
  { value: 'weekly', label: 'Weekly · Mon 9 AM' },
  { value: 'monthly', label: 'Monthly · 1st 9 AM' },
];

function ScheduledReportsSection(): JSX.Element {
  const { data, isLoading } = useGetScheduledReportsQuery();
  const rows = data?.data ?? [];
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteReport] = useDeleteScheduledReportMutation();

  async function handleDelete(id: string): Promise<void> {
    if (!confirm('Delete this scheduled report?')) return;
    try {
      await deleteReport(id).unwrap();
      toast.success('Schedule removed');
    } catch {
      toast.error('Could not delete');
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-ink-600">
          Auto-email reports to your accountant or owner inbox. Delivery runs via a backend queue —
          this page manages the schedule.
        </p>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New schedule
        </Button>
      </div>

      <section className="rounded-md border border-ink-100 bg-ink-0">
        <header className="px-4 py-3 border-b border-ink-100">
          <h2 className="text-md font-medium text-ink-900">Active schedules</h2>
        </header>
        {isLoading && <p className="px-4 py-3 text-sm text-ink-500">Loading…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink-500">
            No scheduled reports yet. Click <strong>New schedule</strong> to add one.
          </p>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
                <tr>
                  <th className="text-left px-4 py-2.5">Report</th>
                  <th className="text-left px-4 py-2.5">Frequency</th>
                  <th className="text-left px-4 py-2.5">Recipients</th>
                  <th className="text-right px-4 py-2.5">Created</th>
                  <th className="text-right px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-medium text-ink-900">
                      {REPORT_TYPES.find((rt) => rt.value === r.reportType)?.label ?? r.reportType}
                    </td>
                    <td className="px-4 py-2 text-ink-700">
                      {FREQUENCIES.find((f) => f.value === r.frequency)?.label ?? r.frequency}
                    </td>
                    <td className="px-4 py-2 text-xs text-ink-600">{r.recipients.join(', ')}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-ink-500">
                      {new Date(r.createdAt).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void handleDelete(r.id)}
                        className="text-ink-400 hover:text-danger-700"
                        aria-label="Delete schedule"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {createOpen && <CreateScheduleDialog onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

function CreateScheduleDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [reportType, setReportType] = useState<ScheduledReport['reportType']>('daily-sales');
  const [frequency, setFrequency] = useState<ScheduledReport['frequency']>('daily');
  const [recipients, setRecipients] = useState('');
  const [create, { isLoading }] = useCreateScheduledReportMutation();

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const emails = recipients
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      toast.error('Enter at least one email');
      return;
    }
    try {
      await create({ reportType, frequency, recipients: emails }).unwrap();
      toast.success('Schedule created');
      onClose();
    } catch (err) {
      const msg = (err as { data?: { error?: { message?: string } } }).data?.error?.message;
      toast.error(msg ?? 'Could not save');
    }
  }

  return (
    <Dialog.Root open onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-md bg-ink-0 rounded-lg shadow-xl border border-ink-100">
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <Dialog.Title className="font-display text-[20px] text-ink-900 flex items-center gap-2">
                  <Mail className="h-5 w-5 text-brand-700" />
                  New scheduled report
                </Dialog.Title>
                <p className="text-xs text-ink-500 mt-0.5">
                  Auto-email the chosen report on the chosen cadence.
                </p>
              </div>
              <Dialog.Close className="text-ink-500 hover:text-ink-900 p-1" aria-label="Close">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <label className="block text-sm">
              <span className="text-[11px] uppercase tracking-wider text-ink-500">Report</span>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as ScheduledReport['reportType'])}
                className="mt-1 w-full h-10 px-3 rounded-md border border-ink-200 text-sm"
              >
                {REPORT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="text-[11px] uppercase tracking-wider text-ink-500">Frequency</span>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as ScheduledReport['frequency'])}
                className="mt-1 w-full h-10 px-3 rounded-md border border-ink-200 text-sm"
              >
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="text-[11px] uppercase tracking-wider text-ink-500">
                Recipients (comma-separated)
              </span>
              <Input
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                placeholder="owner@you.com, ca@firm.com"
                required
              />
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving…' : 'Create schedule'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
