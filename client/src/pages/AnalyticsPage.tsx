import { useMemo, useState } from 'react';
import { MetricCard } from '@/components/ui/MetricCard';
import { Money } from '@/components/ui/money';
import { ChartCard, RevenueAreaChart, RankedBarChart } from '@/components/ui/charts';
import {
  useGetAnalyticsDashboardQuery,
  useGetStaffReportQuery,
  useGetTopProductsQuery,
} from '@/features/analytics/analyticsApi';
import { useGetDashboardSummaryQuery } from '@/features/dashboard/dashboardApi';

type Period = 'week' | 'month' | 'quarter';

function rangeFor(period: Period): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  const days = period === 'week' ? 7 : period === 'month' ? 30 : 90;
  from.setUTCDate(from.getUTCDate() - days);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function AnalyticsPage(): JSX.Element {
  const [period, setPeriod] = useState<Period>('week');
  const range = rangeFor(period);
  const { data: todayRes, isLoading: todayLoading } = useGetAnalyticsDashboardQuery(
    { period: 'today' },
    { pollingInterval: 60_000 },
  );
  const { data: weekRes } = useGetAnalyticsDashboardQuery({ period: 'week' });
  const { data: monthRes } = useGetAnalyticsDashboardQuery({ period: 'month' });
  const { data: staffRes, isLoading: staffLoading } = useGetStaffReportQuery(range);
  const { data: topProductsRes } = useGetTopProductsQuery({ from: range.from, to: range.to, limit: 6 });
  const { data: summaryRes } = useGetDashboardSummaryQuery();

  const today = todayRes?.data;
  const week = weekRes?.data;
  const month = monthRes?.data;
  const staff = staffRes?.data ?? [];
  const topProducts = topProductsRes?.data ?? [];
  const summary = summaryRes?.data;

  const avgDaily = week ? Math.round(week.revenuePaise / 7) : 0;
  const todayVsAvg = today && avgDaily > 0
    ? Math.round(((today.revenuePaise - avgDaily) / avgDaily) * 100)
    : null;

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
        .map((row) => ({
          label: row.userName ?? (row.userId ? `User ${row.userId.slice(-4)}` : 'Unattributed'),
          value: row.revenuePaise,
          sub: `${row.billCount} bills${row.userRole ? ` · ${row.userRole.toLowerCase()}` : ''}`,
        })),
    [staff],
  );

  const topProductsRanked = useMemo(
    () =>
      topProducts.map((p) => ({
        label: p.name,
        value: p.revenuePaise,
        sub: `${p.qty} sold`,
      })),
    [topProducts],
  );

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-eyebrow uppercase text-ink-500">Reports & analytics</p>
          <h1 className="font-display text-display-sm text-ink-900">Real-time</h1>
        </div>
        <div className="inline-flex rounded-md border border-ink-200 overflow-hidden text-sm">
          {(['week', 'month', 'quarter'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-4 h-9 ${period === p ? 'bg-ink-900 text-ink-0' : 'text-ink-700 hover:bg-ink-50'}`}
            >
              {p === 'week' ? 'Last 7 days' : p === 'month' ? 'Last 30 days' : 'Last 90 days'}
            </button>
          ))}
        </div>
      </header>
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Sales · last 7 days" eyebrow="Trend">
          {trendData.length > 0 ? (
            <RevenueAreaChart data={trendData} height={260} />
          ) : (
            <p className="text-sm text-ink-500">Loading…</p>
          )}
        </ChartCard>
        <ChartCard title={`Staff leaderboard · last ${period === 'week' ? '7 days' : period === 'month' ? '30 days' : '90 days'}`} eyebrow="Performance">
          {staffLoading ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : staffRanked.length === 0 ? (
            <p className="text-sm text-ink-500">No bills attributed to staff yet.</p>
          ) : (
            <RankedBarChart data={staffRanked} unit="currency" name="Revenue" height={260} />
          )}
        </ChartCard>
      </section>
      <section>
        <ChartCard title={`Top products · last ${period === 'week' ? '7 days' : period === 'month' ? '30 days' : '90 days'}`} eyebrow="Catalogue">
          {topProductsRanked.length === 0 ? (
            <p className="text-sm text-ink-500">No storefront orders in this period.</p>
          ) : (
            <RankedBarChart data={topProductsRanked} unit="currency" name="Revenue" height={260} />
          )}
        </ChartCard>
      </section>
    </div>
  );
}
