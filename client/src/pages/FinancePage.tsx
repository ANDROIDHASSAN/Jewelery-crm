import { useMemo } from 'react';
import { MetricCard } from '@/components/ui/MetricCard';
import { Money } from '@/components/ui/money';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { useGetPlQuery, useGetGstSummaryQuery } from '@/features/finance/financeApi';
import { ChartCard, CurrencyBarChart, CurrencyDonutChart } from '@/components/ui/charts';

function isoMonthAgo(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { from: from.toISOString(), to: now.toISOString() };
}

function rangeForMonth(offset: number): { from: string; to: string; label: string } {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - offset, 1);
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    label: from.toLocaleDateString('en-IN', { month: 'short' }),
  };
}

export function FinancePage(): JSX.Element {
  const range = monthRange();
  const { data: plRes, isLoading: plLoading } = useGetPlQuery(range, { pollingInterval: 60_000 });
  const lastMonth = isoMonthAgo(1);
  const { data: gstRes, isLoading: gstLoading } = useGetGstSummaryQuery({ month: lastMonth });

  // Pull last 6 months of P&L for the trend chart. Hooks must be unconditional.
  const m0 = useGetPlQuery(rangeForMonth(5));
  const m1 = useGetPlQuery(rangeForMonth(4));
  const m2 = useGetPlQuery(rangeForMonth(3));
  const m3 = useGetPlQuery(rangeForMonth(2));
  const m4 = useGetPlQuery(rangeForMonth(1));
  const m5 = useGetPlQuery(rangeForMonth(0));

  const trendData = useMemo(() => {
    const series = [m0, m1, m2, m3, m4, m5];
    return series.map((q, i) => {
      const r = rangeForMonth(5 - i);
      const d = q.data?.data;
      return {
        label: r.label,
        revenue: d?.revenuePaise ?? 0,
        expense: d?.expensePaise ?? 0,
      };
    });
  }, [m0.data, m1.data, m2.data, m3.data, m4.data, m5.data]);

  const pl = plRes?.data;
  const gst = gstRes?.data;

  const gstSplit = useMemo(() => {
    if (!gst) return [];
    return [
      { label: 'CGST', value: gst.cgstPaise },
      { label: 'SGST', value: gst.sgstPaise },
      { label: 'IGST', value: gst.igstPaise },
    ].filter((d) => d.value > 0);
  }, [gst]);

  const gstTotal = gst ? gst.cgstPaise + gst.sgstPaise + gst.igstPaise : 0;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-eyebrow uppercase text-ink-500">Finance & accounting</p>
          <h1 className="font-display text-display-sm text-ink-900">P&amp;L</h1>
        </div>
        <Button variant="outline">
          <Download className="h-4 w-4" /> Tally export
        </Button>
      </header>
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="Revenue (MTD)"
          value={pl ? <Money paise={pl.revenuePaise} /> : plLoading ? '…' : '—'}
        />
        <MetricCard
          label="Expenses (MTD)"
          value={pl ? <Money paise={pl.expensePaise} /> : plLoading ? '…' : '—'}
        />
        <MetricCard
          label="Net"
          value={pl ? <Money paise={pl.netPaise} /> : plLoading ? '…' : '—'}
          tone={pl && pl.netPaise >= 0 ? 'success' : undefined}
        />
        <MetricCard
          label="GST collected (MTD)"
          value={pl ? <Money paise={pl.gstPaise} /> : plLoading ? '…' : '—'}
          delta={{ value: 'Filing due 11th', direction: 'flat' }}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard
          className="lg:col-span-2"
          title="Revenue vs expenses — last 6 months"
          eyebrow="Trend"
        >
          <CurrencyBarChart
            data={trendData}
            series={[
              { key: 'revenue', name: 'Revenue', color: '#C99B2A' },
              { key: 'expense', name: 'Expenses', color: '#6E695F' },
            ]}
            height={260}
          />
        </ChartCard>

        <ChartCard title={`GST split — ${lastMonth}`} eyebrow="Tax">
          {gstLoading ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : gstSplit.length === 0 ? (
            <p className="text-sm text-ink-500">No GST collected last month.</p>
          ) : (
            <CurrencyDonutChart
              data={gstSplit}
              height={220}
              centerLabel="Total"
              centerValue={`₹${(gstTotal / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
            />
          )}
          {gst && (
            <p className="mt-2 text-xs text-ink-500 text-center">
              {gst.billCount} bills · taxable <Money paise={gst.taxableRevenuePaise} />
            </p>
          )}
        </ChartCard>
      </section>
    </div>
  );
}
