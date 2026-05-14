import { useMemo } from 'react';
import { MetricCard } from '@/components/ui/MetricCard';
import { Money } from '@/components/ui/money';
import { ChartCard, RevenueAreaChart } from '@/components/ui/charts';
import { useGetDashboardSummaryQuery } from '@/features/dashboard/dashboardApi';

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

export function DashboardPage(): JSX.Element {
  const { data, isLoading, isError } = useGetDashboardSummaryQuery(undefined, {
    pollingInterval: 60_000,
  });
  const summary = data?.data;

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

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-eyebrow uppercase text-ink-500">Today</p>
        <h1 className="font-display text-display-sm text-ink-900">Welcome back, Anant.</h1>
      </header>

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

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard
          className="lg:col-span-2"
          title="Sales — last 7 days"
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
          <h3 className="text-md text-ink-900 font-medium mb-3">Live gold rate</h3>
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
        </div>
      </section>
    </div>
  );
}
