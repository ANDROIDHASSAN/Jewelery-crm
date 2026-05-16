// Cash / UPI / Card reconciliation. Day-close workflow:
//   1. Pick a shop + date.
//   2. Backend computes "expected" from bills posted that day.
//   3. Cashier enters counted cash / settled UPI / settled card.
//   4. Variance is auto-computed and saved as a Reconciliation row.

import { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Money } from '@/components/ui/money';
import { MetricCard } from '@/components/ui/MetricCard';
import {
  useGetReconciliationExpectedQuery,
  useCreateReconciliationMutation,
  useGetReconciliationsQuery,
} from '@/features/finance/financeApi';
import {
  FilterRow,
  ShopPicker,
  DateInput,
} from '@/features/finance/components/FinanceFilters';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import { hasPermission } from '@/features/auth/authSlice';
import { useAppSelector } from '@/app/hooks';
import { cn } from '@/lib/cn';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ReconciliationSection(): JSX.Element {
  const user = useAppSelector((s) => s.auth.user);
  const canWrite = hasPermission(user, 'finance.expense_write');

  const { data: shopsRes } = useGetShopsQuery();
  const shops = shopsRes?.data ?? [];

  const [shopId, setShopId] = useState<string | undefined>(undefined);
  const [date, setDate] = useState(today());

  useEffect(() => {
    if (!shopId && shops[0]) setShopId(shops[0].id);
  }, [shopId, shops]);

  const expectedRes = useGetReconciliationExpectedQuery(
    { shopId: shopId ?? '', date: new Date(date).toISOString() },
    { skip: !shopId },
  );
  const expected = expectedRes.data?.data;

  const { data: historyRes } = useGetReconciliationsQuery({ shopId });
  const history = historyRes?.data ?? [];

  const [countedCash, setCountedCash] = useState('');
  const [settledUpi, setSettledUpi] = useState('');
  const [settledCard, setSettledCard] = useState('');
  const [notes, setNotes] = useState('');
  const [createReconciliation, { isLoading }] = useCreateReconciliationMutation();

  useEffect(() => {
    if (expected?.existing) {
      setCountedCash(String(expected.existing.countedCashPaise / 100));
      setSettledUpi(String(expected.existing.settledUpiPaise / 100));
      setSettledCard(String(expected.existing.settledCardPaise / 100));
      setNotes(expected.existing.notes ?? '');
    } else if (expected) {
      // Default counted = expected so cashier only adjusts when there's
      // actual variance.
      setCountedCash(String(expected.expectedCashPaise / 100));
      setSettledUpi(String(expected.expectedUpiPaise / 100));
      setSettledCard(String(expected.expectedCardPaise / 100));
      setNotes('');
    }
  }, [expected]);

  async function handleSave(): Promise<void> {
    if (!shopId) return;
    try {
      await createReconciliation({
        shopId,
        reconciledDate: new Date(date) as unknown as Date,
        countedCashPaise: Math.round(Number(countedCash || '0') * 100),
        settledUpiPaise: Math.round(Number(settledUpi || '0') * 100),
        settledCardPaise: Math.round(Number(settledCard || '0') * 100),
        notes: notes.trim() || undefined,
      } as never).unwrap();
      toast.success('Reconciliation saved');
    } catch {
      toast.error('Could not save reconciliation');
    }
  }

  const varCash = expected
    ? Math.round(Number(countedCash || '0') * 100) - expected.expectedCashPaise
    : 0;
  const varUpi = expected
    ? Math.round(Number(settledUpi || '0') * 100) - expected.expectedUpiPaise
    : 0;
  const varCard = expected
    ? Math.round(Number(settledCard || '0') * 100) - expected.expectedCardPaise
    : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <ShopPicker value={shopId} onChange={setShopId} allowAll={false} />
        <DateInput label="Date" value={date} onChange={setDate} />
      </FilterRow>

      {expected && (
        <>
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
            <ReconcileCard
              mode="Cash"
              expectedPaise={expected.expectedCashPaise}
              counted={countedCash}
              onChange={setCountedCash}
              variancePaise={varCash}
              disabled={!canWrite}
            />
            <ReconcileCard
              mode="UPI"
              expectedPaise={expected.expectedUpiPaise}
              counted={settledUpi}
              onChange={setSettledUpi}
              variancePaise={varUpi}
              disabled={!canWrite}
            />
            <ReconcileCard
              mode="Card"
              expectedPaise={expected.expectedCardPaise}
              counted={settledCard}
              onChange={setSettledCard}
              variancePaise={varCard}
              disabled={!canWrite}
            />
          </section>

          <section className="rounded-md border border-ink-100 bg-ink-0 p-4 space-y-3">
            <label className="block text-sm">
              <span className="text-[11px] uppercase tracking-wider text-ink-500">Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional: variance reason, who counted, etc."
                disabled={!canWrite}
                className="mt-1 w-full px-3 py-2 rounded-md border border-ink-200 text-sm disabled:bg-ink-50"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-ink-500">
                {expected.existing
                  ? `Saved earlier · last update ${new Date().toLocaleDateString()}`
                  : 'No reconciliation saved for this day yet.'}
              </p>
              <Button onClick={() => void handleSave()} disabled={!canWrite || isLoading}>
                {isLoading ? 'Saving…' : expected.existing ? 'Update reconciliation' : 'Save reconciliation'}
              </Button>
            </div>
          </section>
        </>
      )}

      <section className="rounded-md border border-ink-100 bg-ink-0">
        <header className="px-4 py-3 border-b border-ink-100">
          <p className="text-eyebrow uppercase text-ink-500">History</p>
          <h2 className="text-md font-medium text-ink-900">Recent reconciliations</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
              <tr>
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-right px-4 py-2.5">Cash var</th>
                <th className="text-right px-4 py-2.5">UPI var</th>
                <th className="text-right px-4 py-2.5">Card var</th>
                <th className="text-right px-4 py-2.5">Total var</th>
                <th className="text-left px-4 py-2.5">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-ink-500">
                    No reconciliations recorded yet.
                  </td>
                </tr>
              ) : (
                history.map((r) => {
                  const total = r.varianceCashPaise + r.varianceUpiPaise + r.varianceCardPaise;
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-2 font-mono text-xs text-ink-700">
                        {new Date(r.reconciledDate).toLocaleDateString('en-IN')}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-2 text-right',
                          r.varianceCashPaise === 0
                            ? 'text-ink-600'
                            : r.varianceCashPaise > 0
                              ? 'text-success-700'
                              : 'text-danger-700',
                        )}
                      >
                        <Money paise={r.varianceCashPaise} />
                      </td>
                      <td
                        className={cn(
                          'px-4 py-2 text-right',
                          r.varianceUpiPaise === 0
                            ? 'text-ink-600'
                            : r.varianceUpiPaise > 0
                              ? 'text-success-700'
                              : 'text-danger-700',
                        )}
                      >
                        <Money paise={r.varianceUpiPaise} />
                      </td>
                      <td
                        className={cn(
                          'px-4 py-2 text-right',
                          r.varianceCardPaise === 0
                            ? 'text-ink-600'
                            : r.varianceCardPaise > 0
                              ? 'text-success-700'
                              : 'text-danger-700',
                        )}
                      >
                        <Money paise={r.varianceCardPaise} />
                      </td>
                      <td
                        className={cn(
                          'px-4 py-2 text-right font-medium',
                          total === 0
                            ? 'text-success-700'
                            : Math.abs(total) > 100_00
                              ? 'text-danger-700'
                              : 'text-warning-700',
                        )}
                      >
                        <Money paise={total} />
                      </td>
                      <td className="px-4 py-2 text-ink-600 max-w-xs truncate">
                        {r.notes ?? '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {!expected && !shopId && (
        <MetricCard label="Select a shop to begin" value="—" />
      )}
    </div>
  );
}

function ReconcileCard({
  mode,
  expectedPaise,
  counted,
  onChange,
  variancePaise,
  disabled,
}: {
  mode: string;
  expectedPaise: number;
  counted: string;
  onChange: (next: string) => void;
  variancePaise: number;
  disabled: boolean;
}): JSX.Element {
  const matched = variancePaise === 0;
  return (
    <div className="rounded-md border border-ink-100 bg-ink-0 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-eyebrow uppercase text-ink-500">{mode}</p>
        {matched ? (
          <span className="inline-flex items-center gap-1 text-xs text-success-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Matched
          </span>
        ) : (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs',
              Math.abs(variancePaise) > 100_00 ? 'text-danger-700' : 'text-warning-700',
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" /> Variance
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-500">Expected</span>
          <Money paise={expectedPaise} className="text-ink-900" />
        </div>
        <label className="block text-sm">
          <span className="text-[11px] uppercase tracking-wider text-ink-500">
            {mode === 'Cash' ? 'Counted (₹)' : 'Settled (₹)'}
          </span>
          <Input
            type="number"
            value={counted}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
        </label>
        <div className="flex items-center justify-between text-sm pt-1 border-t border-ink-100">
          <span className="text-ink-500">Variance</span>
          <Money
            paise={variancePaise}
            className={cn(
              'font-semibold',
              variancePaise === 0
                ? 'text-success-700'
                : variancePaise > 0
                  ? 'text-success-700'
                  : 'text-danger-700',
            )}
          />
        </div>
      </div>
    </div>
  );
}
