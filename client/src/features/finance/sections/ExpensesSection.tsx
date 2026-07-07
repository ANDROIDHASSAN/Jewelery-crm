// Expenses ledger — categorized, filterable, classified (revenue vs capital).

import { useMemo, useState } from 'react';
import { Download, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { ChartCard, RankedBarChart } from '@/components/ui/charts';
import {
  useGetExpensesQuery,
  useGetExpensesByCategoryQuery,
  useDeleteExpenseMutation,
  useGetExpenseCategoriesQuery,
} from '@/features/finance/financeApi';
import { downloadCsv, paiseToRupeeString } from '@/features/finance/lib/export';
import {
  FilterRow,
  ShopPicker,
  DateInput,
} from '@/features/finance/components/FinanceFilters';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import { AddExpenseDialog } from '@/features/finance/components/AddExpenseDialog';
import { hasPermission } from '@/features/auth/authSlice';
import { useAppSelector } from '@/app/hooks';

function startOfMonth(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExpensesSection(): JSX.Element {
  const user = useAppSelector((s) => s.auth.user);
  const canWrite = hasPermission(user, 'finance.expense_write');

  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [shopId, setShopId] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState<string>('');
  const [classification, setClassification] = useState<'' | 'REVENUE' | 'CAPITAL'>('');
  const [addOpen, setAddOpen] = useState(false);

  const fromIso = new Date(from).toISOString();
  const toIso = new Date(`${to}T23:59:59.999Z`).toISOString();

  const { data: expensesRes, isLoading } = useGetExpensesQuery({
    shopId,
    category: category || undefined,
    classification: classification || undefined,
    from: fromIso,
    to: toIso,
    limit: 100,
  });
  const { data: byCatRes } = useGetExpensesByCategoryQuery({
    from: fromIso,
    to: toIso,
    shopId,
  });
  const [deleteExpense] = useDeleteExpenseMutation();
  const { data: shopsRes } = useGetShopsQuery();
  const { data: ledgersRes } = useGetExpenseCategoriesQuery();
  const ledgers = ledgersRes?.data ?? [];

  const rows = expensesRes?.data ?? [];
  const byCat = byCatRes?.data ?? [];
  const shopName = useMemo(
    () => new Map((shopsRes?.data ?? []).map((s) => [s.id, s.name])),
    [shopsRes],
  );

  const total = rows.reduce((a, e) => a + e.amountPaise, 0);

  function handleCsv(): void {
    const csv: (string | number)[][] = [
      ['Expenses', `${from} → ${to}`],
      [],
      ['Date', 'Shop', 'Category', 'Type', 'Mode', 'Amount (₹)', 'Notes'],
      ...rows.map((e) => [
        new Date(e.paidAt).toISOString().slice(0, 10),
        shopName.get(e.shopId) ?? e.shopId.slice(-6),
        e.category,
        e.classification ?? 'REVENUE',
        e.paymentMode ?? '',
        paiseToRupeeString(e.amountPaise),
        e.notes ?? '',
      ]),
    ];
    downloadCsv(`expenses-${from}-to-${to}.csv`, csv);
  }

  async function handleDelete(id: string): Promise<void> {
    if (!confirm('Delete this expense? This cannot be undone.')) return;
    try {
      await deleteExpense(id).unwrap();
      toast.success('Expense deleted');
    } catch {
      toast.error('Could not delete');
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
        <ShopPicker value={shopId} onChange={setShopId} />
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="text-[11px] uppercase tracking-wider text-ink-500">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full h-10 px-2 rounded-md border border-ink-200 bg-ink-0 text-sm"
            >
              <option value="">All</option>
              {ledgers.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[11px] uppercase tracking-wider text-ink-500">Type</span>
            <select
              value={classification}
              onChange={(e) =>
                setClassification(e.target.value as '' | 'REVENUE' | 'CAPITAL')
              }
              className="mt-1 w-full h-10 px-2 rounded-md border border-ink-200 bg-ink-0 text-sm"
            >
              <option value="">All</option>
              <option value="REVENUE">Revenue</option>
              <option value="CAPITAL">Capital</option>
            </select>
          </label>
        </div>
      </FilterRow>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-eyebrow uppercase text-ink-500">Total</p>
          <p className="text-2xl font-mono tabular-nums text-ink-900">
            <Money paise={total} /> <span className="text-sm text-ink-500">· {rows.length} entries</span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleCsv} disabled={rows.length === 0}>
          <Download className="h-4 w-4" /> CSV
        </Button>
        {canWrite && (
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add expense
          </Button>
        )}
      </div>

      {byCat.length > 0 && (
        <ChartCard title="By category" eyebrow="Breakdown">
          <RankedBarChart
            data={byCat.slice(0, 10).map((c) => ({ label: c.category, value: c.amountPaise }))}
            height={Math.max(160, Math.min(byCat.length, 10) * 32)}
            unit="currency"
          />
        </ChartCard>
      )}

      <section className="rounded-md border border-ink-100 bg-ink-0">
        <header className="px-4 py-3 border-b border-ink-100 flex items-center justify-between">
          <h2 className="text-md font-medium text-ink-900">Expenses ledger</h2>
        </header>
        {isLoading && <p className="px-4 py-3 text-sm text-ink-500">Loading…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink-500">No expenses match this filter.</p>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
                <tr>
                  <th className="text-left px-4 py-2.5">Date</th>
                  <th className="text-left px-4 py-2.5">Shop</th>
                  <th className="text-left px-4 py-2.5">Category</th>
                  <th className="text-left px-4 py-2.5">Type</th>
                  <th className="text-left px-4 py-2.5">Mode</th>
                  <th className="text-left px-4 py-2.5">Notes</th>
                  <th className="text-right px-4 py-2.5">Amount</th>
                  {canWrite && <th className="text-right px-4 py-2.5"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((e) => (
                  <tr key={e.id} className="hover:bg-ink-25">
                    <td className="px-4 py-2 font-mono text-xs text-ink-700">
                      {new Date(e.paidAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                      {e.isRecurring && (
                        <span className="ml-1 text-[10px] text-brand-700">↻</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-ink-700">
                      {shopName.get(e.shopId) ?? e.shopId.slice(-6)}
                    </td>
                    <td className="px-4 py-2 font-medium text-ink-900">{e.category}</td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          e.classification === 'CAPITAL'
                            ? 'inline-block rounded-sm bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-700 font-medium'
                            : 'inline-block rounded-sm bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-600'
                        }
                      >
                        {e.classification ?? 'REVENUE'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-ink-600 text-xs">{e.paymentMode ?? '—'}</td>
                    <td className="px-4 py-2 text-ink-600 max-w-xs truncate">
                      {e.notes ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Money paise={e.amountPaise} />
                    </td>
                    {canWrite && (
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => void handleDelete(e.id)}
                          className="text-ink-400 hover:text-danger-700"
                          aria-label="Delete expense"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AddExpenseDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
