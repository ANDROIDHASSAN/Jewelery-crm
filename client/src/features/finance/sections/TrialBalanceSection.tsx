// Trial Balance — every ledger account with its closing debit / credit
// balance as of a date. Used by CAs to verify books balance before filing.

import { useMemo, useState } from 'react';
import { Download, Printer, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { MetricCard } from '@/components/ui/MetricCard';
import {
  useGetTrialBalanceQuery,
  type TrialBalanceRow,
} from '@/features/finance/financeApi';
import {
  downloadCsv,
  paiseToRupeeString,
  printSection,
} from '@/features/finance/lib/export';
import { FilterRow, DateInput, ShopPicker } from '@/features/finance/components/FinanceFilters';
import { cn } from '@/lib/cn';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const GROUP_ORDER: TrialBalanceRow['group'][] = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];

export function TrialBalanceSection(): JSX.Element {
  const [asOf, setAsOf] = useState(today());
  const [shopId, setShopId] = useState<string | undefined>(undefined);
  const { data, isLoading } = useGetTrialBalanceQuery({
    asOf: new Date(`${asOf}T23:59:59.999Z`).toISOString(),
    shopId,
  });
  const rep = data?.data;

  const grouped = useMemo(() => {
    const map = new Map<TrialBalanceRow['group'], TrialBalanceRow[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    if (rep) {
      for (const r of rep.rows) map.get(r.group)?.push(r);
    }
    return map;
  }, [rep]);

  const isBalanced = rep ? Math.abs(rep.totals.debitPaise - rep.totals.creditPaise) < 100 : false;

  function handleCsv(): void {
    if (!rep) return;
    const rows: (string | number)[][] = [
      ['Trial Balance', `As of ${asOf}`],
      [],
      ['Code', 'Account', 'Group', 'Debit (₹)', 'Credit (₹)'],
      ...rep.rows.map((r) => [
        r.code,
        r.name,
        r.group,
        r.debitPaise === 0 ? '' : paiseToRupeeString(r.debitPaise),
        r.creditPaise === 0 ? '' : paiseToRupeeString(r.creditPaise),
      ]),
      [],
      ['TOTAL', '', '', paiseToRupeeString(rep.totals.debitPaise), paiseToRupeeString(rep.totals.creditPaise)],
    ];
    downloadCsv(`trial-balance-${asOf}.csv`, rows);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <DateInput label="As of date" value={asOf} onChange={setAsOf} />
        <ShopPicker value={shopId} onChange={setShopId} />
        <div className="sm:col-span-2 flex items-end justify-end gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleCsv} disabled={!rep}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => printSection('tb-print', `Trial Balance ${asOf}`)}
          >
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </FilterRow>

      <section className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <MetricCard
          label="Total debits"
          value={rep ? <Money paise={rep.totals.debitPaise} /> : '—'}
        />
        <MetricCard
          label="Total credits"
          value={rep ? <Money paise={rep.totals.creditPaise} /> : '—'}
        />
        <div
          className={cn(
            'rounded-md border p-4 flex items-center gap-3',
            isBalanced
              ? 'border-success-500/40 bg-success-50/40 text-success-700'
              : 'border-warning-500/40 bg-warning-50/40 text-warning-700',
          )}
        >
          {isBalanced ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <AlertTriangle className="h-5 w-5" />
          )}
          <div>
            <p className="text-eyebrow uppercase">Books</p>
            <p className="text-md font-medium">
              {isBalanced ? 'Balanced' : 'Imbalance detected'}
            </p>
            {!isBalanced && rep && (
              <p className="text-xs">
                Δ <Money paise={Math.abs(rep.totals.debitPaise - rep.totals.creditPaise)} />
              </p>
            )}
          </div>
        </div>
      </section>

      <div id="tb-print" className="rounded-md border border-ink-100 bg-ink-0">
        <header className="px-4 py-3 border-b border-ink-100">
          <p className="text-eyebrow uppercase text-ink-500">As of {asOf}</p>
          <h2 className="text-md font-medium text-ink-900">Trial balance</h2>
        </header>
        {isLoading && <p className="px-4 py-3 text-sm text-ink-500">Loading…</p>}
        {!isLoading && rep && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
                <tr>
                  <th className="text-left px-4 py-2.5 w-20">Code</th>
                  <th className="text-left px-4 py-2.5">Account</th>
                  <th className="text-right px-4 py-2.5">Debit (₹)</th>
                  <th className="text-right px-4 py-2.5">Credit (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {GROUP_ORDER.flatMap((g) => {
                  const items = grouped.get(g) ?? [];
                  if (items.length === 0) return [];
                  return [
                    <tr key={`hdr-${g}`} className="bg-ink-50/60">
                      <td colSpan={4} className="px-4 py-1.5 text-[11px] uppercase tracking-wider text-ink-600 font-semibold">
                        {g}
                      </td>
                    </tr>,
                    ...items.map((r) => (
                      <tr key={r.code} className="hover:bg-ink-25">
                        <td className="px-4 py-2 font-mono text-xs text-ink-500">{r.code}</td>
                        <td className="px-4 py-2 text-ink-900">{r.name}</td>
                        <td className="px-4 py-2 text-right">
                          {r.debitPaise > 0 ? <Money paise={r.debitPaise} /> : <span className="text-ink-300">—</span>}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {r.creditPaise > 0 ? <Money paise={r.creditPaise} /> : <span className="text-ink-300">—</span>}
                        </td>
                      </tr>
                    )),
                  ];
                })}
                <tr className="bg-ink-50 font-semibold">
                  <td colSpan={2} className="px-4 py-2.5 text-right text-ink-900">
                    Total
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Money paise={rep.totals.debitPaise} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Money paise={rep.totals.creditPaise} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rep && (
        <p className="text-xs text-ink-500">
          Net income for the period (Income − Revenue Expenses):{' '}
          <Money paise={rep.meta.netIncomePaise} className="text-ink-900" /> · Capital
          expenditure booked separately:{' '}
          <Money paise={rep.meta.capitalExpensePaise} className="text-ink-900" />
        </p>
      )}
    </div>
  );
}
