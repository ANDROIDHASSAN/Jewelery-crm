// Day Book — chronological list of every voucher (Tally-style).

import { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { MetricCard } from '@/components/ui/MetricCard';
import { useGetDayBookQuery, type DayBookVoucher } from '@/features/finance/financeApi';
import { downloadCsv, paiseToRupeeString, printSection } from '@/features/finance/lib/export';
import {
  FilterRow,
  DateInput,
  ShopPicker,
} from '@/features/finance/components/FinanceFilters';
import { cn } from '@/lib/cn';

function startOfMonth(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const VOUCHER_COLORS: Record<DayBookVoucher['voucherType'], string> = {
  SALE: 'bg-success-50 text-success-700',
  EXPENSE: 'bg-warning-50 text-warning-700',
  VENDOR_PAYMENT: 'bg-danger-50 text-danger-700',
  BANK: 'bg-brand-50 text-brand-700',
  GOLD_LOAN: 'bg-ink-50 text-ink-700',
  REPAYMENT: 'bg-success-50 text-success-700',
  ADVANCE: 'bg-warning-50 text-warning-700',
};

export function DayBookSection(): JSX.Element {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [shopId, setShopId] = useState<string | undefined>(undefined);
  const [type, setType] = useState<DayBookVoucher['voucherType'] | ''>('');

  const { data, isLoading } = useGetDayBookQuery({
    from: new Date(from).toISOString(),
    to: new Date(`${to}T23:59:59.999Z`).toISOString(),
    shopId,
  });
  const rep = data?.data;

  const vouchers = useMemo(
    () => (type ? (rep?.vouchers ?? []).filter((v) => v.voucherType === type) : rep?.vouchers ?? []),
    [rep, type],
  );

  function handleCsv(): void {
    if (!rep) return;
    const rows: (string | number)[][] = [
      ['Day Book', `${from} → ${to}`],
      [],
      ['Date', 'Type', 'Voucher', 'Party', 'Debit account', 'Credit account', 'Amount (₹)', 'Narration'],
      ...vouchers.map((v) => [
        new Date(v.date).toISOString().slice(0, 10),
        v.voucherType,
        v.voucherNumber,
        v.party,
        v.debitAccount,
        v.creditAccount,
        paiseToRupeeString(v.amountPaise),
        v.narration,
      ]),
    ];
    downloadCsv(`day-book-${from}-to-${to}.csv`, rows);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
        <ShopPicker value={shopId} onChange={setShopId} />
        <label className="block text-sm">
          <span className="text-[11px] uppercase tracking-wider text-ink-500">Voucher type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="mt-1 w-full h-10 px-3 rounded-md border border-ink-200 bg-ink-0 text-sm"
          >
            <option value="">All</option>
            <option value="SALE">Sales</option>
            <option value="EXPENSE">Expenses</option>
            <option value="VENDOR_PAYMENT">Vendor payments</option>
            <option value="BANK">Bank</option>
            <option value="REPAYMENT">Gold loan repayments</option>
            <option value="ADVANCE">Customer advances</option>
          </select>
        </label>
      </FilterRow>

      <section className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <MetricCard
          label="Vouchers"
          value={String(vouchers.length)}
          delta={
            rep ? { value: `of ${rep.totals.voucherCount} total`, direction: 'flat' } : undefined
          }
        />
        <MetricCard
          label="Total debits"
          value={rep ? <Money paise={rep.totals.debitPaise} /> : '—'}
          tone="neutral"
        />
        <MetricCard
          label="Total credits"
          value={rep ? <Money paise={rep.totals.creditPaise} /> : '—'}
          tone="neutral"
          delta={{ value: 'Double-entry by construction', direction: 'flat' }}
        />
      </section>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleCsv} disabled={vouchers.length === 0}>
          <Download className="h-4 w-4" /> CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => printSection('daybook-print', 'Day Book')}
        >
          <Printer className="h-4 w-4" /> Print
        </Button>
      </div>

      <section id="daybook-print" className="rounded-md border border-ink-100 bg-ink-0">
        <header className="px-4 py-3 border-b border-ink-100">
          <p className="text-eyebrow uppercase text-ink-500">Chronological</p>
          <h2 className="text-md font-medium text-ink-900">Day book · {from} to {to}</h2>
        </header>
        {isLoading && <p className="px-4 py-3 text-sm text-ink-500">Loading…</p>}
        {!isLoading && vouchers.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink-500">
            No vouchers in this date range.
          </p>
        )}
        {vouchers.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
                <tr>
                  <th className="text-left px-4 py-2.5">Date</th>
                  <th className="text-left px-4 py-2.5">Type</th>
                  <th className="text-left px-4 py-2.5">Voucher</th>
                  <th className="text-left px-4 py-2.5">Party</th>
                  <th className="text-left px-4 py-2.5">Debit</th>
                  <th className="text-left px-4 py-2.5">Credit</th>
                  <th className="text-right px-4 py-2.5">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {vouchers.map((v, i) => (
                  <tr key={`${v.voucherNumber}-${i}`} className="hover:bg-ink-25">
                    <td className="px-4 py-2 font-mono text-xs text-ink-700">
                      {new Date(v.date).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          'inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-medium',
                          VOUCHER_COLORS[v.voucherType],
                        )}
                      >
                        {v.voucherType.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{v.voucherNumber}</td>
                    <td className="px-4 py-2 text-ink-700 max-w-[140px] truncate">{v.party}</td>
                    <td className="px-4 py-2 text-ink-700 text-xs">{v.debitAccount}</td>
                    <td className="px-4 py-2 text-ink-700 text-xs">{v.creditAccount}</td>
                    <td className="px-4 py-2 text-right font-medium">
                      <Money paise={v.amountPaise} />
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
