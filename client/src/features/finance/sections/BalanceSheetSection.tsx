// Balance Sheet — Assets / Liabilities + Equity at a date.

import { useState } from 'react';
import { Download, Printer, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { useGetBalanceSheetQuery } from '@/features/finance/financeApi';
import { downloadCsv, paiseToRupeeString, printSection } from '@/features/finance/lib/export';
import { FilterRow, DateInput } from '@/features/finance/components/FinanceFilters';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function BalanceSheetSection(): JSX.Element {
  const [asOf, setAsOf] = useState(today());
  const { data, isLoading } = useGetBalanceSheetQuery({
    asOf: new Date(`${asOf}T23:59:59.999Z`).toISOString(),
  });
  const bs = data?.data;

  function handleCsv(): void {
    if (!bs) return;
    const rows: (string | number)[][] = [
      ['Balance Sheet', `As of ${asOf}`],
      [],
      ['ASSETS'],
      ['Current assets'],
      ...bs.assets.current.map((r) => ['  ' + r.label, paiseToRupeeString(r.amountPaise)]),
      ['Current assets total', paiseToRupeeString(bs.assets.currentTotal)],
      ['Fixed assets'],
      ...bs.assets.fixed.map((r) => ['  ' + r.label, paiseToRupeeString(r.amountPaise)]),
      ['Fixed assets total', paiseToRupeeString(bs.assets.fixedTotal)],
      ['TOTAL ASSETS', paiseToRupeeString(bs.assets.total)],
      [],
      ['LIABILITIES'],
      ['Current liabilities'],
      ...bs.liabilities.current.map((r) => ['  ' + r.label, paiseToRupeeString(r.amountPaise)]),
      ['Current liabilities total', paiseToRupeeString(bs.liabilities.currentTotal)],
      [],
      ['EQUITY'],
      ...bs.equity.rows.map((r) => ['  ' + r.label, paiseToRupeeString(r.amountPaise)]),
      ['Equity total', paiseToRupeeString(bs.equity.total)],
      [],
      ['LIABILITIES + EQUITY', paiseToRupeeString(bs.liabilitiesPlusEquity)],
    ];
    downloadCsv(`balance-sheet-${asOf}.csv`, rows);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <DateInput label="As of date" value={asOf} onChange={setAsOf} />
        <div className="sm:col-span-3 flex items-end justify-end gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleCsv} disabled={!bs}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => printSection('bs-print', `Balance Sheet ${asOf}`)}
          >
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </FilterRow>

      {bs && (
        <div
          className={
            bs.balanced
              ? 'rounded-md border border-success-500/40 bg-success-50/40 px-4 py-3 text-sm text-success-700 flex items-center gap-2'
              : 'rounded-md border border-warning-500/40 bg-warning-50/40 px-4 py-3 text-sm text-warning-700 flex items-center gap-2'
          }
        >
          {bs.balanced ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {bs.balanced
            ? `Assets equal Liabilities + Equity (${(bs.assets.total / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}).`
            : `Imbalance: Assets ₹${(bs.assets.total / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })} vs L+E ₹${(bs.liabilitiesPlusEquity / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}.`}
        </div>
      )}

      <div id="bs-print" className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <BsCard title="Assets" total={bs?.assets.total ?? 0}>
          {isLoading && <p className="text-sm text-ink-500">Loading…</p>}
          {bs && (
            <>
              <BsSubsection label="Current assets" rows={bs.assets.current} total={bs.assets.currentTotal} />
              <BsSubsection label="Fixed assets" rows={bs.assets.fixed} total={bs.assets.fixedTotal} />
            </>
          )}
        </BsCard>

        <BsCard
          title="Liabilities + Equity"
          total={bs?.liabilitiesPlusEquity ?? 0}
        >
          {isLoading && <p className="text-sm text-ink-500">Loading…</p>}
          {bs && (
            <>
              <BsSubsection
                label="Current liabilities"
                rows={bs.liabilities.current}
                total={bs.liabilities.currentTotal}
              />
              <BsSubsection label="Equity" rows={bs.equity.rows} total={bs.equity.total} />
            </>
          )}
        </BsCard>
      </div>
    </div>
  );
}

function BsCard({
  title,
  total,
  children,
}: {
  title: string;
  total: number;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="rounded-md border border-ink-100 bg-ink-0">
      <header className="px-4 py-3 border-b border-ink-100 flex items-center justify-between">
        <h2 className="text-md font-medium text-ink-900">{title}</h2>
        <Money paise={total} className="text-ink-900 font-semibold" />
      </header>
      <div className="p-4 space-y-4">{children}</div>
    </section>
  );
}

function BsSubsection({
  label,
  rows,
  total,
}: {
  label: string;
  rows: Array<{ label: string; amountPaise: number }>;
  total: number;
}): JSX.Element {
  return (
    <div>
      <p className="text-eyebrow uppercase text-ink-500 mb-1.5">{label}</p>
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-baseline justify-between text-sm">
            <span className="text-ink-700">{r.label}</span>
            <Money
              paise={r.amountPaise}
              className={r.amountPaise < 0 ? 'text-danger-700' : 'text-ink-800'}
            />
          </div>
        ))}
        <div className="flex items-baseline justify-between text-sm pt-1.5 border-t border-ink-100">
          <span className="text-ink-900 font-medium">Subtotal</span>
          <Money paise={total} className="text-ink-900 font-semibold" />
        </div>
      </div>
    </div>
  );
}
