// Returns / refunds ledger — trend chart + detail table with date-range filter.

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { MetricCard } from '@/components/ui/MetricCard';
import { ChartCard, CurrencyBarChart } from '@/components/ui/charts';
import { useGetReturnsQuery } from '@/features/finance/financeApi';
import { downloadCsv, paiseToRupeeString } from '@/features/finance/lib/export';
import { FilterRow, ShopPicker, DateInput } from '@/features/finance/components/FinanceFilters';

function startOfMonth(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ReturnsSection(): JSX.Element {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [shopId, setShopId] = useState<string | undefined>(undefined);

  const fromIso = new Date(from).toISOString();
  const toIso = new Date(`${to}T23:59:59.999Z`).toISOString();

  const { data, isLoading } = useGetReturnsQuery({ from: fromIso, to: toIso, shopId });
  const ret = data?.data;

  function handleCsvExport(): void {
    if (!ret) return;
    const rows: (string | number)[][] = [
      ['Returns / Refunds', `${from} to ${to}`],
      [],
      ['Total refunds', paiseToRupeeString(ret.totals.refundPaise)],
      ['Count', ret.totals.refundCount],
      [],
      ['Source', 'Ref #', 'Customer', 'Shop', 'Amount (₹)', 'Reason', 'Date'],
      ...ret.refunds.map((r) => [
        r.source === 'ECOM' ? 'Online' : 'POS',
        r.source === 'ECOM' ? (r.orderNumber ?? '—') : (r.billNumber ?? '—'),
        r.customerName ?? '—',
        r.shopName,
        paiseToRupeeString(r.amountPaise),
        r.reason,
        new Date(r.refundedAt).toLocaleDateString('en-IN'),
      ]),
    ];
    downloadCsv(`returns-${from}-to-${to}.csv`, rows);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
        <ShopPicker value={shopId} onChange={setShopId} />
        <div className="flex items-end">
          <Button variant="outline" size="sm" onClick={handleCsvExport} disabled={!ret}>
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </FilterRow>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          label="Total refunded"
          value={ret ? <Money paise={ret.totals.refundPaise} /> : isLoading ? '…' : '—'}
          delta={
            ret ? { value: `${ret.totals.refundCount} refund${ret.totals.refundCount === 1 ? '' : 's'}`, direction: 'flat' } : undefined
          }
          tone={ret && ret.totals.refundPaise > 0 ? 'danger' : 'neutral'}
        />
      </section>

      {ret && ret.trend.length > 0 && (
        <ChartCard title="Monthly refund trend" eyebrow="Returns">
          <CurrencyBarChart
            data={ret.trend.map((r) => ({
              label: r.label,
              refunds: r.refundPaise,
            }))}
            series={[{ key: 'refunds', name: 'Refunds', color: '#DC2626' }]}
            height={220}
          />
        </ChartCard>
      )}

      <section className="rounded-md border border-ink-100 bg-ink-0">
        <header className="px-4 py-3 border-b border-ink-100 flex items-center justify-between">
          <div>
            <p className="text-eyebrow uppercase text-ink-500">Ledger</p>
            <h2 className="text-md font-medium text-ink-900">Refund details</h2>
          </div>
          {ret && <p className="text-xs text-ink-500">{ret.refunds.length} records</p>}
        </header>
        {isLoading && <p className="px-4 py-3 text-sm text-ink-500">Loading…</p>}
        {!isLoading && ret?.refunds.length === 0 && (
          <p className="px-4 py-6 text-sm text-ink-500 text-center">
            No refunds in this period.
          </p>
        )}
        {ret && ret.refunds.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
                <tr>
                  <th className="text-left px-4 py-2.5">Date</th>
                  <th className="text-left px-4 py-2.5">Source</th>
                  <th className="text-left px-4 py-2.5">Ref #</th>
                  <th className="text-left px-4 py-2.5">Customer</th>
                  <th className="text-left px-4 py-2.5">Reason</th>
                  <th className="text-right px-4 py-2.5">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {ret.refunds.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-700">
                      {new Date(r.refundedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${r.source === 'ECOM' ? 'bg-blue-50 text-blue-700' : 'bg-ink-100 text-ink-600'}`}>
                        {r.source === 'ECOM' ? 'Online' : 'POS'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-ink-900 font-medium">
                      {r.source === 'ECOM' ? (r.orderNumber ?? '—') : (r.billNumber ?? '—')}
                    </td>
                    <td className="px-4 py-2.5 text-ink-700">{r.customerName ?? '—'}</td>
                    <td className="px-4 py-2.5 text-ink-600 max-w-xs truncate">{r.reason}</td>
                    <td className="px-4 py-2.5 text-right text-danger-700 font-medium">
                      <Money paise={r.amountPaise} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
