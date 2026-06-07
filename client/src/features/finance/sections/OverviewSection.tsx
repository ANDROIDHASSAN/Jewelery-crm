// Overview tab — the Gold-OS landing screen. KPI tiles + 6-month trend +
// last-month GST split + expenses-by-category + recent expenses. Single
// cached request from the backend (60s tenant cache) keeps it snappy.

import { useMemo } from 'react';
import { Banknote, TrendingDown, TrendingUp, Wallet, Building2, Users } from 'lucide-react';
import { MetricCard } from '@/components/ui/MetricCard';
import { Money } from '@/components/ui/money';
import { ChartCard, CurrencyBarChart, CurrencyDonutChart, RankedBarChart } from '@/components/ui/charts';
import {
  useGetFinanceSummaryQuery,
  type ExpenseRow,
  type BranchSummary,
} from '@/features/finance/financeApi';
import { useGetShopsQuery } from '@/features/shops/shopsApi';

export function OverviewSection({ shopId }: { shopId?: string }): JSX.Element {
  const { data: summaryRes, isLoading, isError } = useGetFinanceSummaryQuery(
    shopId ? { shopId } : undefined,
    { pollingInterval: 60_000 },
  );
  const summary = summaryRes?.data;

  const mtd = summary?.mtd;
  const trend = summary?.trend ?? [];
  const gst = summary?.lastMonthGst;
  const branches = summary?.branches ?? [];
  const expensesByCat = summary?.expensesByCategory ?? [];
  const recentExpenses = summary?.recentExpenses ?? [];

  const trendData = useMemo(
    () =>
      trend.map((t) => ({
        label: t.label,
        revenue: t.revenuePaise,
        expense: t.expensePaise,
      })),
    [trend],
  );

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
    <div className="space-y-4 sm:space-y-6">
      {isError && (
        <div className="rounded-md border border-danger-500/40 bg-danger-50/40 px-4 py-3 text-sm text-danger-700">
          Couldn&apos;t load the finance summary. Retrying every minute.
        </div>
      )}

      {/* KPI tiles */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          label="Revenue (MTD)"
          value={mtd ? <Money paise={mtd.revenuePaise} /> : isLoading ? '…' : '—'}
          delta={
            mtd
              ? {
                  value: (mtd.ecomOrderCount ?? 0) > 0
                    ? `${mtd.billCount} POS + ${mtd.ecomOrderCount} online`
                    : `${mtd.billCount} bill${mtd.billCount === 1 ? '' : 's'}`,
                  direction: 'flat',
                }
              : undefined
          }
          tone={mtd && mtd.revenuePaise > 0 ? 'success' : 'neutral'}
        />
        <MetricCard
          label="Expenses (MTD)"
          value={mtd ? <Money paise={mtd.expensePaise} /> : isLoading ? '…' : '—'}
          delta={
            mtd
              ? { value: `${mtd.expenseCount} entries`, direction: 'flat' }
              : undefined
          }
          tone={mtd && mtd.expensePaise > 0 ? 'warning' : 'neutral'}
        />
        <MetricCard
          label="Net (MTD)"
          value={mtd ? <Money paise={mtd.netPaise} /> : isLoading ? '…' : '—'}
          delta={
            mtd
              ? {
                  value: mtd.netPaise >= 0 ? 'Profitable MTD' : 'Loss MTD',
                  direction: mtd.netPaise >= 0 ? 'up' : 'down',
                }
              : undefined
          }
          tone={mtd ? (mtd.netPaise >= 0 ? 'success' : 'danger') : 'neutral'}
        />
        <MetricCard
          label="GST collected (MTD)"
          value={mtd ? <Money paise={mtd.gstPaise} /> : isLoading ? '…' : '—'}
          delta={{ value: 'Filing due 11th', direction: 'flat' }}
        />
      </section>

      {/* Secondary KPI strip */}
      <section className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        <SecondaryTile
          eyebrow="Vendor dues"
          icon={Building2}
          primary={
            summary ? (
              <Money paise={summary.vendorDues.outstandingPaise} />
            ) : (
              '…'
            )
          }
          secondary={
            summary ? `${summary.vendorDues.vendorCount} vendors` : ''
          }
        />
        <SecondaryTile
          eyebrow="Open gold loans"
          icon={Wallet}
          primary={
            summary ? <Money paise={summary.openLoans.principalPaise} /> : '…'
          }
          secondary={summary ? `${summary.openLoans.count} active` : ''}
        />
        <SecondaryTile
          eyebrow="Customer advances"
          icon={Users}
          primary={
            summary ? <Money paise={summary.activeAdvances.amountPaise} /> : '…'
          }
          secondary={summary ? `${summary.activeAdvances.count} active` : ''}
        />
      </section>

      {/* Charts row */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <ChartCard
          className="lg:col-span-2"
          title="Revenue vs expenses — last 6 months"
          eyebrow="Trend"
        >
          {trendData.length === 0 ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : (
            <CurrencyBarChart
              data={trendData}
              series={[
                { key: 'revenue', name: 'Revenue', color: '#C99B2A' },
                { key: 'expense', name: 'Expenses', color: '#6E695F' },
              ]}
              height={260}
            />
          )}
        </ChartCard>

        <ChartCard title={`GST split — ${gst?.month ?? ''}`} eyebrow="Tax">
          {!gst ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : gstSplit.length === 0 ? (
            <p className="text-sm text-ink-500">No GST collected last month.</p>
          ) : (
            <CurrencyDonutChart
              data={gstSplit}
              height={220}
              centerLabel="Total"
              centerValue={`₹${(gstTotal / 100).toLocaleString('en-IN', {
                maximumFractionDigits: 0,
              })}`}
            />
          )}
          {gst && (
            <p className="mt-2 text-xs text-ink-500 text-center">
              {gst.billCount} bills · taxable <Money paise={gst.taxableRevenuePaise} />
            </p>
          )}
        </ChartCard>
      </section>

      {/* Branch performance + expense breakdown */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <ChartCard title="Branch performance — MTD" eyebrow="Multi-shop">
          {branches.length === 0 ? (
            <p className="text-sm text-ink-500">
              {isLoading ? 'Loading…' : 'No branch revenue yet this month.'}
            </p>
          ) : (
            <RankedBarChart
              data={branches.map((b) => ({
                label: b.shopName,
                value: b.revenuePaise,
                sub: `${b.billCount} bills`,
              }))}
              height={Math.max(160, branches.length * 36)}
              unit="currency"
              name="Revenue"
            />
          )}
        </ChartCard>

        <ChartCard title="Expenses by category" eyebrow="Breakdown">
          {expensesByCat.length === 0 ? (
            <p className="text-sm text-ink-500">
              {isLoading ? 'Loading…' : 'No expenses recorded this month.'}
            </p>
          ) : (
            <CurrencyDonutChart
              data={expensesByCat.map((c) => ({
                label: c.category,
                value: c.amountPaise,
              }))}
              height={240}
              centerLabel="Total"
              centerValue={`₹${((mtd?.expensePaise ?? 0) / 100).toLocaleString('en-IN', {
                maximumFractionDigits: 0,
              })}`}
            />
          )}
        </ChartCard>
      </section>

      {branches.length > 0 && <BranchTable rows={branches} />}

      <RecentExpensesList rows={recentExpenses} loading={isLoading} />
    </div>
  );
}

function SecondaryTile({
  eyebrow,
  icon: Icon,
  primary,
  secondary,
}: {
  eyebrow: string;
  icon: typeof Banknote;
  primary: React.ReactNode;
  secondary: string;
}): JSX.Element {
  return (
    <div className="rounded-md border border-ink-100 bg-ink-0 p-4 flex items-start gap-3">
      <div className="rounded-md bg-brand-50 text-brand-700 h-9 w-9 grid place-items-center">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-eyebrow uppercase text-ink-500">{eyebrow}</p>
        <p className="text-lg font-mono tabular-nums text-ink-900 mt-0.5 truncate">{primary}</p>
        <p className="text-[11px] text-ink-500 mt-0.5">{secondary}</p>
      </div>
    </div>
  );
}

function BranchTable({ rows }: { rows: BranchSummary[] }): JSX.Element {
  return (
    <section className="rounded-md border border-ink-100 bg-ink-0">
      <header className="px-4 py-3 border-b border-ink-100">
        <p className="text-eyebrow uppercase text-ink-500">Multi-shop</p>
        <h2 className="text-md font-medium text-ink-900">Branch-wise P&amp;L — month to date</h2>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
            <tr>
              <th className="text-left px-4 py-2.5">Branch</th>
              <th className="text-right px-4 py-2.5">Revenue</th>
              <th className="text-right px-4 py-2.5">Expenses</th>
              <th className="text-right px-4 py-2.5">Net</th>
              <th className="text-right px-4 py-2.5">GST</th>
              <th className="text-right px-4 py-2.5">Bills</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((b) => (
              <tr key={b.shopId}>
                <td className="px-4 py-2.5 text-ink-900 font-medium">{b.shopName}</td>
                <td className="px-4 py-2.5 text-right">
                  <Money paise={b.revenuePaise} />
                </td>
                <td className="px-4 py-2.5 text-right text-ink-700">
                  <Money paise={b.expensePaise} />
                </td>
                <td
                  className={`px-4 py-2.5 text-right ${
                    b.netPaise >= 0 ? 'text-success-700' : 'text-danger-700'
                  }`}
                >
                  <Money paise={b.netPaise} />
                </td>
                <td className="px-4 py-2.5 text-right text-ink-700">
                  <Money paise={b.gstPaise} />
                </td>
                <td className="px-4 py-2.5 text-right text-ink-600 tabular-nums">
                  {b.billCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecentExpensesList({
  rows,
  loading,
}: {
  rows: ExpenseRow[];
  loading: boolean;
}): JSX.Element {
  const { data: shopsRes } = useGetShopsQuery();
  const shopsById = new Map((shopsRes?.data ?? []).map((s) => [s.id, s.name]));

  return (
    <section className="rounded-md border border-ink-100 bg-ink-0">
      <header className="px-4 py-3 border-b border-ink-100 flex items-center justify-between">
        <div>
          <p className="text-eyebrow uppercase text-ink-500">Activity</p>
          <h2 className="text-md font-medium text-ink-900">Recent expenses</h2>
        </div>
        <p className="text-xs text-ink-500">{rows.length} most recent</p>
      </header>
      {loading && <p className="px-4 py-3 text-sm text-ink-500">Loading…</p>}
      {!loading && rows.length === 0 && (
        <p className="px-4 py-6 text-sm text-ink-500 text-center">
          No expenses yet. Click <strong>Add expense</strong> to record one.
        </p>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
              <tr>
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-4 py-2.5">Category</th>
                <th className="text-left px-4 py-2.5">Shop</th>
                <th className="text-left px-4 py-2.5">Notes</th>
                <th className="text-right px-4 py-2.5">Amount</th>
                <th className="text-right px-4 py-2.5">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-700">
                    {new Date(e.paidAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                  </td>
                  <td className="px-4 py-2.5">{e.category}</td>
                  <td className="px-4 py-2.5 text-ink-700">
                    {shopsById.get(e.shopId) ?? e.shopId.slice(-6)}
                  </td>
                  <td className="px-4 py-2.5 text-ink-600 max-w-xs truncate">
                    {e.notes ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Money paise={e.amountPaise} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {e.classification === 'CAPITAL' ? (
                      <span className="inline-flex items-center gap-1 rounded-sm bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-700 font-medium">
                        <TrendingUp className="h-3 w-3" /> Capital
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-sm bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-600">
                        <TrendingDown className="h-3 w-3" /> Revenue
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
