// Daily sales summary — today / yesterday / week / month, per shop.
// Payment-mode mix + per-day chart + per-shop ranking.

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { MetricCard } from '@/components/ui/MetricCard';
import { ChartCard, CurrencyBarChart, RankedBarChart } from '@/components/ui/charts';
import { useGetDailySalesQuery } from '@/features/finance/financeApi';
import { downloadCsv, paiseToRupeeString } from '@/features/finance/lib/export';
import { FilterRow, ShopPicker } from '@/features/finance/components/FinanceFilters';
import { cn } from '@/lib/cn';

type Range = 'today' | 'yesterday' | 'week' | 'month';

const RANGE_OPTIONS: Array<{ value: Range; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
];

export function DailySalesSection(): JSX.Element {
  const [range, setRange] = useState<Range>('today');
  const [shopId, setShopId] = useState<string | undefined>(undefined);

  const { data, isLoading } = useGetDailySalesQuery({ range, shopId });
  const ds = data?.data;

  function handleCsvExport(): void {
    if (!ds) return;
    const rows: (string | number)[][] = [
      ['Daily sales', `${ds.from} → ${ds.to}`],
      [],
      ['Metric', 'Value'],
      ['Revenue', paiseToRupeeString(ds.totals.revenuePaise)],
      ['Bills', ds.totals.billCount],
      ['Avg bill', paiseToRupeeString(ds.totals.avgBillPaise)],
      ['Cash', paiseToRupeeString(ds.totals.cashPaise)],
      ['Digital (UPI+Card)', paiseToRupeeString(ds.totals.digitalPaise)],
      ['GST', paiseToRupeeString(ds.totals.gstPaise)],
      ['Discount given', paiseToRupeeString(ds.totals.discountPaise)],
      ['Refund', paiseToRupeeString(ds.totals.refundPaise)],
      ['Net collection', paiseToRupeeString(ds.totals.netCollectionPaise)],
      [],
      ['Payment mode', 'Amount (₹)', 'Count'],
      ...ds.paymentMix.map((p) => [p.mode, paiseToRupeeString(p.amountPaise), p.count]),
      [],
      ['Shop', 'Revenue (₹)', 'GST (₹)', 'Bills'],
      ...ds.byShop.map((s) => [
        s.shopName,
        paiseToRupeeString(s.revenuePaise),
        paiseToRupeeString(s.gstPaise),
        s.billCount,
      ]),
      [],
      ['Invoice No.', 'Date', 'Shop', 'Customer', 'Taxable (₹)', 'CGST (₹)', 'SGST (₹)', 'IGST (₹)', 'Total (₹)'],
      ...ds.bills.map((b) => [
        b.billNumber ?? '—',
        new Date(b.createdAt).toLocaleString('en-IN'),
        b.shopName,
        b.customerName ?? '—',
        paiseToRupeeString(b.subtotalPaise),
        paiseToRupeeString(b.cgstPaise),
        paiseToRupeeString(b.sgstPaise),
        paiseToRupeeString(b.igstPaise),
        paiseToRupeeString(b.totalPaise),
      ]),
    ];
    downloadCsv(`daily-sales-${range}.csv`, rows);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <div className="sm:col-span-2 lg:col-span-2">
          <p className="text-[11px] uppercase tracking-wider text-ink-500 mb-1.5">Period</p>
          <div className="inline-flex rounded-md border border-ink-200 bg-ink-0 p-0.5 w-full overflow-x-auto">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                className={cn(
                  'h-9 px-3 text-sm rounded-[5px] whitespace-nowrap flex-1',
                  range === r.value
                    ? 'bg-brand-50 text-brand-700 font-medium'
                    : 'text-ink-600 hover:bg-ink-50',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <ShopPicker value={shopId} onChange={setShopId} />
        <div className="flex items-end">
          <Button variant="outline" size="sm" onClick={handleCsvExport} disabled={!ds}>
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </FilterRow>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          label="Revenue"
          value={ds ? <Money paise={ds.totals.revenuePaise} /> : isLoading ? '…' : '—'}
          delta={
            ds
              ? {
                  value: (ds.totals.ecomOrderCount ?? 0) > 0
                    ? `${ds.totals.billCount - (ds.totals.ecomOrderCount ?? 0)} POS + ${ds.totals.ecomOrderCount} online`
                    : `${ds.totals.billCount} bills`,
                  direction: 'flat',
                }
              : undefined
          }
          tone="success"
        />
        <MetricCard
          label="Avg bill"
          value={ds ? <Money paise={ds.totals.avgBillPaise} /> : '—'}
        />
        <MetricCard
          label="Cash vs digital"
          value={
            ds ? (
              <span className="text-sm font-mono">
                <Money paise={ds.totals.cashPaise} /> / <Money paise={ds.totals.digitalPaise} />
              </span>
            ) : (
              '—'
            )
          }
          delta={{ value: 'Cash / UPI+Card', direction: 'flat' }}
        />
        <MetricCard
          label="Net collection"
          value={ds ? <Money paise={ds.totals.netCollectionPaise} /> : '—'}
          delta={
            ds
              ? {
                  value: `Refunds ₹${(ds.totals.refundPaise / 100).toLocaleString('en-IN', {
                    maximumFractionDigits: 0,
                  })}`,
                  direction: ds.totals.refundPaise > 0 ? 'down' : 'flat',
                }
              : undefined
          }
          tone={ds && ds.totals.refundPaise > 0 ? 'warning' : 'neutral'}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <ChartCard title="Sales by day" eyebrow="Trend">
          {!ds || ds.byDay.length === 0 ? (
            <p className="text-sm text-ink-500">No sales in this window.</p>
          ) : (
            <CurrencyBarChart
              data={ds.byDay.map((d) => ({
                label: new Date(d.day).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                }),
                revenue: d.revenuePaise,
              }))}
              series={[{ key: 'revenue', name: 'Revenue', color: '#C99B2A' }]}
              height={260}
            />
          )}
        </ChartCard>
        <ChartCard title="Per-shop ranking" eyebrow="Branches">
          {!ds || ds.byShop.length === 0 ? (
            <p className="text-sm text-ink-500">No bills in this window.</p>
          ) : (
            <RankedBarChart
              data={ds.byShop.map((s) => ({ label: s.shopName, value: s.revenuePaise }))}
              height={Math.max(160, ds.byShop.length * 36)}
              unit="currency"
            />
          )}
        </ChartCard>
      </section>

      <section className="rounded-md border border-ink-100 bg-ink-0">
        <header className="px-4 py-3 border-b border-ink-100">
          <p className="text-eyebrow uppercase text-ink-500">Payments</p>
          <h2 className="text-md font-medium text-ink-900">Mode-wise collection</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
              <tr>
                <th className="text-left px-4 py-2.5">Mode</th>
                <th className="text-right px-4 py-2.5">Amount</th>
                <th className="text-right px-4 py-2.5">Count</th>
                <th className="text-right px-4 py-2.5">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {!ds || ds.paymentMix.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-ink-500" colSpan={4}>
                    No payments yet.
                  </td>
                </tr>
              ) : (
                ds.paymentMix.map((p) => {
                  const share = ds.totals.revenuePaise
                    ? (p.amountPaise / ds.totals.revenuePaise) * 100
                    : 0;
                  return (
                    <tr key={p.mode}>
                      <td className="px-4 py-2.5 font-medium text-ink-900">{p.mode}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Money paise={p.amountPaise} />
                      </td>
                      <td className="px-4 py-2.5 text-right text-ink-600 tabular-nums">
                        {p.count}
                      </td>
                      <td className="px-4 py-2.5 text-right text-ink-600 tabular-nums">
                        {share.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sales Bills report — every bill in the window with its GST split.
          POS bills + e-commerce orders (online ones tagged with a badge). */}
      <section className="rounded-md border border-ink-100 bg-ink-0">
        <header className="px-4 py-3 border-b border-ink-100">
          <p className="text-eyebrow uppercase text-ink-500">
            Invoices · {ds?.bills.length ?? 0}
          </p>
          <h2 className="text-md font-medium text-ink-900">Sales bills</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
              <tr>
                <th className="text-left px-4 py-2.5">Invoice No.</th>
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-4 py-2.5">Shop</th>
                <th className="text-left px-4 py-2.5">Customer</th>
                <th className="text-right px-4 py-2.5">Taxable</th>
                <th className="text-right px-4 py-2.5">CGST</th>
                <th className="text-right px-4 py-2.5">SGST</th>
                <th className="text-right px-4 py-2.5">IGST</th>
                <th className="text-right px-4 py-2.5">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {!ds || ds.bills.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-ink-500">
                    {isLoading ? 'Loading…' : 'No bills in this window.'}
                  </td>
                </tr>
              ) : (
                ds.bills.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-2 text-xs text-ink-900">
                      <span className="font-mono">{b.billNumber ?? '—'}</span>
                      {b.isEcom && (
                        <span className="ml-1.5 inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 leading-none">
                          Online
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-ink-600">
                      {new Date(b.createdAt).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-4 py-2 text-ink-700">{b.shopName}</td>
                    <td className="px-4 py-2 text-ink-700 max-w-[140px] truncate">
                      {b.customerName ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Money paise={b.subtotalPaise} />
                    </td>
                    <td className="px-4 py-2 text-right text-ink-700">
                      <Money paise={b.cgstPaise} />
                    </td>
                    <td className="px-4 py-2 text-right text-ink-700">
                      <Money paise={b.sgstPaise} />
                    </td>
                    <td className="px-4 py-2 text-right text-ink-700">
                      <Money paise={b.igstPaise} />
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      <Money paise={b.totalPaise} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
