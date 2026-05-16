// Financial-year report — Apr 1 to Mar 31, YoY comparison, monthly trend,
// per-branch breakdown, downloadable annual report.

import { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { MetricCard } from '@/components/ui/MetricCard';
import { ChartCard, CurrencyBarChart } from '@/components/ui/charts';
import { useGetFinancialYearQuery } from '@/features/finance/financeApi';
import { downloadCsv, paiseToRupeeString, printSection } from '@/features/finance/lib/export';

function fyYearsAvailable(): number[] {
  // Last 5 FYs. v1 demo data probably only has the current FY but we offer
  // dropdown anyway.
  const now = new Date();
  const currentFy = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return Array.from({ length: 5 }, (_, i) => currentFy - i);
}

export function FinancialYearSection(): JSX.Element {
  const [fy, setFy] = useState<string | undefined>(undefined);
  const { data, isLoading } = useGetFinancialYearQuery(fy ? { fy } : undefined);
  const rep = data?.data;

  const chartData = useMemo(
    () =>
      (rep?.monthly ?? []).map((m) => ({
        label: new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString('en-IN', {
          month: 'short',
          timeZone: 'UTC',
        }),
        revenue: m.revenuePaise,
        expense: m.expensePaise,
      })),
    [rep],
  );

  function handleCsv(): void {
    if (!rep) return;
    const rows: (string | number)[][] = [
      [`Financial Year report — ${rep.fyLabel}`],
      [`${rep.fyStart} → ${rep.fyEnd}`],
      [],
      ['Metric', 'Value'],
      ['Revenue', paiseToRupeeString(rep.revenuePaise)],
      ['Expenses', paiseToRupeeString(rep.expensePaise)],
      ['Net', paiseToRupeeString(rep.netPaise)],
      ['GST collected', paiseToRupeeString(rep.gstPaise)],
      ['Bills', rep.billCount],
      ['Expense entries', rep.expenseCount],
      ['Prev FY revenue', paiseToRupeeString(rep.prev.revenuePaise)],
      ['Prev FY expenses', paiseToRupeeString(rep.prev.expensePaise)],
      ['YoY revenue %', rep.yoyRevenuePct?.toFixed(2) ?? '—'],
      ['YoY expense %', rep.yoyExpensePct?.toFixed(2) ?? '—'],
      [],
      ['Month', 'Revenue (₹)', 'Expenses (₹)', 'Net (₹)'],
      ...rep.monthly.map((m) => [
        m.month,
        paiseToRupeeString(m.revenuePaise),
        paiseToRupeeString(m.expensePaise),
        paiseToRupeeString(m.netPaise),
      ]),
      [],
      ['Shop', 'Revenue (₹)', 'GST (₹)', 'Bills'],
      ...rep.byShop.map((s) => [
        s.shopName,
        paiseToRupeeString(s.revenuePaise),
        paiseToRupeeString(s.gstPaise),
        s.billCount,
      ]),
    ];
    downloadCsv(`${rep.fyLabel}-report.csv`, rows);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="text-[11px] uppercase tracking-wider text-ink-500">
            Financial year
          </span>
          <select
            value={fy ?? ''}
            onChange={(e) => setFy(e.target.value || undefined)}
            className="mt-1 h-10 px-3 rounded-md border border-ink-200 bg-ink-0 text-sm min-w-[140px]"
          >
            <option value="">Current FY</option>
            {fyYearsAvailable().map((y) => (
              <option key={y} value={String(y)}>
                FY{String(y).slice(-2)}-{String(y + 1).slice(-2)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={handleCsv} disabled={!rep}>
          <Download className="h-4 w-4" /> Annual CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => printSection('fy-print', rep?.fyLabel ?? 'FY report')}
        >
          <Printer className="h-4 w-4" /> Print
        </Button>
      </div>

      <div id="fy-print" className="space-y-4 sm:space-y-6">
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <MetricCard
            label={`Revenue · ${rep?.fyLabel ?? 'current FY'}`}
            value={rep ? <Money paise={rep.revenuePaise} /> : isLoading ? '…' : '—'}
            tone="success"
            delta={
              rep && rep.yoyRevenuePct !== null
                ? {
                    value: `${rep.yoyRevenuePct >= 0 ? '+' : ''}${rep.yoyRevenuePct.toFixed(1)}% YoY`,
                    direction: rep.yoyRevenuePct >= 0 ? 'up' : 'down',
                  }
                : undefined
            }
          />
          <MetricCard
            label="Expenses"
            value={rep ? <Money paise={rep.expensePaise} /> : '—'}
            tone="warning"
            delta={
              rep && rep.yoyExpensePct !== null
                ? {
                    value: `${rep.yoyExpensePct >= 0 ? '+' : ''}${rep.yoyExpensePct.toFixed(1)}% YoY`,
                    direction: rep.yoyExpensePct <= 0 ? 'up' : 'down',
                  }
                : undefined
            }
          />
          <MetricCard
            label="Net"
            value={rep ? <Money paise={rep.netPaise} /> : '—'}
            tone={rep ? (rep.netPaise >= 0 ? 'success' : 'danger') : 'neutral'}
          />
          <MetricCard
            label="GST collected"
            value={rep ? <Money paise={rep.gstPaise} /> : '—'}
            delta={
              rep ? { value: `${rep.billCount} bills`, direction: 'flat' } : undefined
            }
          />
        </section>

        <ChartCard title="Monthly performance" eyebrow="Trend">
          {chartData.length === 0 ? (
            <p className="text-sm text-ink-500">
              {isLoading ? 'Loading…' : 'No data for this FY.'}
            </p>
          ) : (
            <CurrencyBarChart
              data={chartData}
              series={[
                { key: 'revenue', name: 'Revenue', color: '#C99B2A' },
                { key: 'expense', name: 'Expenses', color: '#6E695F' },
              ]}
              height={300}
            />
          )}
        </ChartCard>

        {rep && rep.byShop.length > 0 && (
          <section className="rounded-md border border-ink-100 bg-ink-0">
            <header className="px-4 py-3 border-b border-ink-100">
              <p className="text-eyebrow uppercase text-ink-500">Shop-wise</p>
              <h2 className="text-md font-medium text-ink-900">
                Branch performance · {rep.fyLabel}
              </h2>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
                  <tr>
                    <th className="text-left px-4 py-2.5">Branch</th>
                    <th className="text-right px-4 py-2.5">Revenue</th>
                    <th className="text-right px-4 py-2.5">GST</th>
                    <th className="text-right px-4 py-2.5">Bills</th>
                    <th className="text-right px-4 py-2.5">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {rep.byShop.map((s) => {
                    const share = rep.revenuePaise
                      ? (s.revenuePaise / rep.revenuePaise) * 100
                      : 0;
                    return (
                      <tr key={s.shopId}>
                        <td className="px-4 py-2 font-medium text-ink-900">{s.shopName}</td>
                        <td className="px-4 py-2 text-right">
                          <Money paise={s.revenuePaise} />
                        </td>
                        <td className="px-4 py-2 text-right text-ink-700">
                          <Money paise={s.gstPaise} />
                        </td>
                        <td className="px-4 py-2 text-right text-ink-600 tabular-nums">
                          {s.billCount}
                        </td>
                        <td className="px-4 py-2 text-right text-ink-600 tabular-nums">
                          {share.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
