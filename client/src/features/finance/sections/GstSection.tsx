// GST reports — monthly summary + invoice-level breakdown for filing.

import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { MetricCard } from '@/components/ui/MetricCard';
import { ChartCard, CurrencyDonutChart } from '@/components/ui/charts';
import {
  useGetGstSummaryQuery,
  useGetGstBillsQuery,
  useGetGstHsnSummaryQuery,
} from '@/features/finance/financeApi';
import { downloadCsv, paiseToRupeeString, printSection } from '@/features/finance/lib/export';
import { FilterRow, ShopPicker, MonthInput } from '@/features/finance/components/FinanceFilters';

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function GstSection(): JSX.Element {
  const [month, setMonth] = useState(currentMonth());
  const [shopId, setShopId] = useState<string | undefined>(undefined);
  const { data: summaryRes } = useGetGstSummaryQuery({ month, shopId });
  const { data: billsRes } = useGetGstBillsQuery({ month, shopId });
  const { data: hsnRes } = useGetGstHsnSummaryQuery({ month, shopId });
  const gst = summaryRes?.data;
  const bills = billsRes?.data ?? [];
  const hsnRows = hsnRes?.data ?? [];
  const ratePct = (bps: number): string => `${(bps / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;

  const total = gst ? gst.cgstPaise + gst.sgstPaise + gst.igstPaise : 0;
  const donut = gst
    ? [
        { label: 'CGST', value: gst.cgstPaise },
        { label: 'SGST', value: gst.sgstPaise },
        { label: 'IGST', value: gst.igstPaise },
      ].filter((d) => d.value > 0)
    : [];

  function handleCsv(): void {
    if (!gst) return;
    const rows: (string | number)[][] = [
      ['GSTR-style export', month],
      [],
      ['Summary'],
      ['CGST', paiseToRupeeString(gst.cgstPaise)],
      ['SGST', paiseToRupeeString(gst.sgstPaise)],
      ['IGST', paiseToRupeeString(gst.igstPaise)],
      ['Output GST (sales)', paiseToRupeeString(total)],
      ['Input GST (ITC, purchases)', paiseToRupeeString(gst.inputGstPaise)],
      ['Net GST payable', paiseToRupeeString(gst.netGstPayablePaise)],
      ['Taxable revenue', paiseToRupeeString(gst.taxableRevenuePaise)],
      ['Bills', gst.billCount],
      [],
      ['HSN summary'],
      ['HSN', 'Rate', 'Qty', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total tax'],
      ...hsnRows.map((h) => [
        h.hsnCode ?? 'Unclassified',
        ratePct(h.gstRateBps),
        h.quantity,
        paiseToRupeeString(h.taxablePaise),
        paiseToRupeeString(h.cgstPaise),
        paiseToRupeeString(h.sgstPaise),
        paiseToRupeeString(h.igstPaise),
        paiseToRupeeString(h.cgstPaise + h.sgstPaise + h.igstPaise),
      ]),
      [],
      ['Bill no', 'Date', 'Shop', 'State', 'Customer', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total'],
      ...bills.map((b) => [
        b.billNumber ?? '—',
        new Date(b.createdAt).toISOString().slice(0, 10),
        b.shop.name,
        b.shop.gstStateCode,
        b.customer?.name ?? '—',
        paiseToRupeeString(b.subtotalPaise),
        paiseToRupeeString(b.cgstPaise),
        paiseToRupeeString(b.sgstPaise),
        paiseToRupeeString(b.igstPaise),
        paiseToRupeeString(b.totalPaise),
      ]),
    ];
    downloadCsv(`gst-${month}.csv`, rows);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <MonthInput value={month} onChange={setMonth} />
        <ShopPicker value={shopId} onChange={setShopId} />
        <div className="sm:col-span-2 flex items-end gap-2">
          <Button variant="outline" size="sm" onClick={handleCsv} disabled={!gst}>
            <Download className="h-4 w-4" /> CSV / GSTR
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => printSection('gst-print', `GST ${month}`)}
          >
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </FilterRow>

      <div id="gst-print" className="space-y-4 sm:space-y-6">
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <MetricCard label="Output GST (sales)" value={gst ? <Money paise={total} /> : '—'} />
          <MetricCard label="CGST" value={gst ? <Money paise={gst.cgstPaise} /> : '—'} />
          <MetricCard label="SGST" value={gst ? <Money paise={gst.sgstPaise} /> : '—'} />
          <MetricCard label="IGST" value={gst ? <Money paise={gst.igstPaise} /> : '—'} />
        </section>

        {/* Input GST (ITC from purchases) → net liability owed after credit. */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <MetricCard
            label="Input GST (ITC)"
            value={gst ? <Money paise={gst.inputGstPaise} /> : '—'}
            tone="success"
          />
          <MetricCard
            label="Net GST payable"
            value={gst ? <Money paise={gst.netGstPayablePaise} /> : '—'}
            tone="warning"
          />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
          <ChartCard className="lg:col-span-1" title={`GST split — ${month}`} eyebrow="Tax">
            {donut.length === 0 ? (
              <p className="text-sm text-ink-500">No GST collected in this month.</p>
            ) : (
              <CurrencyDonutChart
                data={donut}
                height={240}
                centerLabel="Total"
                centerValue={`₹${(total / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              />
            )}
          </ChartCard>

          <section className="lg:col-span-2 rounded-md border border-ink-100 bg-ink-0">
            <header className="px-4 py-3 border-b border-ink-100">
              <p className="text-eyebrow uppercase text-ink-500">
                Invoices · {bills.length} of {gst?.billCount ?? 0}
              </p>
              <h2 className="text-md font-medium text-ink-900">GST invoices</h2>
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
                  {bills.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-center text-ink-500">
                        No invoices in this month.
                      </td>
                    </tr>
                  ) : (
                    bills.map((b) => (
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
                        <td className="px-4 py-2 text-ink-700">{b.shop.name}</td>
                        <td className="px-4 py-2 text-ink-700 max-w-[140px] truncate">
                          {b.customer?.name ?? '—'}
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
        </section>

        {/* HSN-wise summary (GSTR-1). Rate-wise taxable value + tax per HSN. */}
        <section className="rounded-md border border-ink-100 bg-ink-0">
          <header className="px-4 py-3 border-b border-ink-100">
            <p className="text-eyebrow uppercase text-ink-500">GSTR-1 · {hsnRows.length} HSN groups</p>
            <h2 className="text-md font-medium text-ink-900">HSN summary</h2>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
                <tr>
                  <th className="text-left px-4 py-2.5">HSN</th>
                  <th className="text-right px-4 py-2.5">Rate</th>
                  <th className="text-right px-4 py-2.5">Qty</th>
                  <th className="text-right px-4 py-2.5">Taxable</th>
                  <th className="text-right px-4 py-2.5">CGST</th>
                  <th className="text-right px-4 py-2.5">SGST</th>
                  <th className="text-right px-4 py-2.5">IGST</th>
                  <th className="text-right px-4 py-2.5">Total tax</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {hsnRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-ink-500">
                      No sales with HSN in this month. Set an HSN code on items to populate this.
                    </td>
                  </tr>
                ) : (
                  hsnRows.map((h) => (
                    <tr key={`${h.hsnCode ?? 'none'}-${h.gstRateBps}`}>
                      <td className="px-4 py-2 font-mono text-xs text-ink-900">
                        {h.hsnCode ?? <span className="text-ink-400">Unclassified</span>}
                      </td>
                      <td className="px-4 py-2 text-right text-ink-600 font-mono text-xs">{ratePct(h.gstRateBps)}</td>
                      <td className="px-4 py-2 text-right text-ink-700 tabular-nums">{h.quantity}</td>
                      <td className="px-4 py-2 text-right"><Money paise={h.taxablePaise} /></td>
                      <td className="px-4 py-2 text-right text-ink-700"><Money paise={h.cgstPaise} /></td>
                      <td className="px-4 py-2 text-right text-ink-700"><Money paise={h.sgstPaise} /></td>
                      <td className="px-4 py-2 text-right text-ink-700"><Money paise={h.igstPaise} /></td>
                      <td className="px-4 py-2 text-right font-medium">
                        <Money paise={h.cgstPaise + h.sgstPaise + h.igstPaise} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {hsnRows.length > 0 && (
                <tfoot className="border-t border-ink-200 bg-ink-25 font-medium text-ink-900">
                  <tr>
                    <td className="px-4 py-2" colSpan={2}>Total</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {hsnRows.reduce((s, h) => s + h.quantity, 0)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Money paise={hsnRows.reduce((s, h) => s + h.taxablePaise, 0)} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Money paise={hsnRows.reduce((s, h) => s + h.cgstPaise, 0)} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Money paise={hsnRows.reduce((s, h) => s + h.sgstPaise, 0)} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Money paise={hsnRows.reduce((s, h) => s + h.igstPaise, 0)} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Money paise={hsnRows.reduce((s, h) => s + h.cgstPaise + h.sgstPaise + h.igstPaise, 0)} />
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
