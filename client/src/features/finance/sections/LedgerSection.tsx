// General Ledger — drill into a single account by slug. Running balance
// column lets the user verify the closing figure that lands on the Trial
// Balance and Balance Sheet.

import { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { MetricCard } from '@/components/ui/MetricCard';
import {
  useGetLedgerQuery,
  useGetBankAccountsQuery,
  useGetVendorListQuery,
} from '@/features/finance/financeApi';
import { downloadCsv, paiseToRupeeString, printSection } from '@/features/finance/lib/export';
import { FilterRow, DateInput } from '@/features/finance/components/FinanceFilters';
import { EXPENSE_CATEGORIES } from '@/features/finance/components/AddExpenseDialog';

function startOfMonth(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LedgerSection(): JSX.Element {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [account, setAccount] = useState('cash');

  const { data: banksRes } = useGetBankAccountsQuery();
  const { data: vendorsRes } = useGetVendorListQuery();

  const accountOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string; group: string }> = [
      { group: 'Cash', value: 'cash', label: 'Cash on hand' },
      { group: 'Income', value: 'sales', label: 'Sales A/c' },
      { group: 'Tax', value: 'gst', label: 'GST Payable' },
      { group: 'Loans', value: 'gold-loans', label: 'Gold loans receivable' },
      { group: 'Advances', value: 'advances', label: 'Customer advances' },
    ];
    for (const b of banksRes?.data ?? []) {
      opts.push({
        group: 'Bank',
        value: `bank-${b.id}`,
        label: `Bank — ${b.nickname} ····${b.accountLast4}`,
      });
    }
    for (const v of vendorsRes?.data ?? []) {
      opts.push({
        group: 'Vendors',
        value: `vendor-${v.id}`,
        label: `Vendor — ${v.name}`,
      });
    }
    for (const c of EXPENSE_CATEGORIES) {
      opts.push({
        group: 'Expenses',
        value: `expense-${c}`,
        label: `Expense — ${c}`,
      });
    }
    return opts;
  }, [banksRes, vendorsRes]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof accountOptions>();
    for (const o of accountOptions) {
      if (!map.has(o.group)) map.set(o.group, []);
      map.get(o.group)!.push(o);
    }
    return map;
  }, [accountOptions]);

  const { data, isLoading } = useGetLedgerQuery({
    account,
    from: new Date(from).toISOString(),
    to: new Date(`${to}T23:59:59.999Z`).toISOString(),
  });
  const led = data?.data;

  function handleCsv(): void {
    if (!led) return;
    const rows: (string | number)[][] = [
      [`Ledger — ${account}`, `${from} → ${to}`],
      [],
      ['Date', 'Voucher', 'Narration', 'Debit (₹)', 'Credit (₹)', 'Balance (₹)'],
      ...led.entries.map((e) => [
        new Date(e.date).toISOString().slice(0, 10),
        e.voucher,
        e.narration,
        e.debitPaise === 0 ? '' : paiseToRupeeString(e.debitPaise),
        e.creditPaise === 0 ? '' : paiseToRupeeString(e.creditPaise),
        paiseToRupeeString(e.balancePaise),
      ]),
      [],
      ['Total', '', '', paiseToRupeeString(led.totals.debitPaise), paiseToRupeeString(led.totals.creditPaise), paiseToRupeeString(led.totals.closingBalancePaise)],
    ];
    downloadCsv(`ledger-${account}-${from}-to-${to}.csv`, rows);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <label className="block text-sm sm:col-span-2">
          <span className="text-[11px] uppercase tracking-wider text-ink-500">Account</span>
          <select
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            className="mt-1 w-full h-10 px-3 rounded-md border border-ink-200 bg-ink-0 text-sm"
          >
            {Array.from(grouped.entries()).map(([g, list]) => (
              <optgroup key={g} label={g}>
                {list.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
      </FilterRow>

      <section className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <MetricCard
          label="Total debits"
          value={led ? <Money paise={led.totals.debitPaise} /> : '—'}
        />
        <MetricCard
          label="Total credits"
          value={led ? <Money paise={led.totals.creditPaise} /> : '—'}
        />
        <MetricCard
          label="Closing balance"
          value={led ? <Money paise={led.totals.closingBalancePaise} /> : '—'}
          tone={
            led
              ? led.totals.closingBalancePaise >= 0
                ? 'success'
                : 'warning'
              : 'neutral'
          }
        />
      </section>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleCsv} disabled={!led || led.entries.length === 0}>
          <Download className="h-4 w-4" /> CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => printSection('ledger-print', `Ledger — ${account}`)}
        >
          <Printer className="h-4 w-4" /> Print
        </Button>
      </div>

      <section id="ledger-print" className="rounded-md border border-ink-100 bg-ink-0">
        <header className="px-4 py-3 border-b border-ink-100">
          <p className="text-eyebrow uppercase text-ink-500">Ledger detail</p>
          <h2 className="text-md font-medium text-ink-900">
            {accountOptions.find((o) => o.value === account)?.label ?? account}
          </h2>
        </header>
        {isLoading && <p className="px-4 py-3 text-sm text-ink-500">Loading…</p>}
        {!isLoading && led && led.entries.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink-500">
            No entries for this account in the selected range.
          </p>
        )}
        {led && led.entries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
                <tr>
                  <th className="text-left px-4 py-2.5">Date</th>
                  <th className="text-left px-4 py-2.5">Voucher</th>
                  <th className="text-left px-4 py-2.5">Narration</th>
                  <th className="text-right px-4 py-2.5">Debit</th>
                  <th className="text-right px-4 py-2.5">Credit</th>
                  <th className="text-right px-4 py-2.5">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {led.entries.map((e, i) => (
                  <tr key={`${e.voucher}-${i}`} className="hover:bg-ink-25">
                    <td className="px-4 py-2 font-mono text-xs text-ink-700">
                      {new Date(e.date).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{e.voucher}</td>
                    <td className="px-4 py-2 text-ink-700">{e.narration}</td>
                    <td className="px-4 py-2 text-right">
                      {e.debitPaise > 0 ? <Money paise={e.debitPaise} /> : <span className="text-ink-300">—</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {e.creditPaise > 0 ? <Money paise={e.creditPaise} /> : <span className="text-ink-300">—</span>}
                    </td>
                    <td
                      className={
                        e.balancePaise >= 0
                          ? 'px-4 py-2 text-right font-medium'
                          : 'px-4 py-2 text-right font-medium text-warning-700'
                      }
                    >
                      <Money paise={e.balancePaise} />
                    </td>
                  </tr>
                ))}
                <tr className="bg-ink-50 font-semibold">
                  <td colSpan={3} className="px-4 py-2.5 text-right text-ink-900">
                    Total
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Money paise={led.totals.debitPaise} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Money paise={led.totals.creditPaise} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Money paise={led.totals.closingBalancePaise} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
