// Finance & accounting — P&L, GST, expenses.
//
// All KPI data comes from ONE cached endpoint (`GET /finance/summary`)
// instead of the previous 9-query waterfall. Server aggregates everything
// in SQL (no per-row JS sums) and caches the result for 60s per tenant ×
// shop. Target render time: <2s cold, <100ms warm-cache.

import { useEffect, useMemo, useState } from 'react';
import { Download, Plus, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { MetricCard } from '@/components/ui/MetricCard';
import { Money } from '@/components/ui/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useGetFinanceSummaryQuery,
  useCreateExpenseMutation,
  type ExpenseRow,
} from '@/features/finance/financeApi';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import { ChartCard, CurrencyBarChart, CurrencyDonutChart } from '@/components/ui/charts';

export function FinancePage(): JSX.Element {
  // Single cached round trip. Poll every 60s — server has its own 60s cache,
  // so this acts as a heartbeat.
  const { data: summaryRes, isLoading, isError } = useGetFinanceSummaryQuery(undefined, {
    pollingInterval: 60_000,
  });
  const summary = summaryRes?.data;
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);

  const mtd = summary?.mtd;
  const trend = summary?.trend ?? [];
  const gst = summary?.lastMonthGst;
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

  async function handleTallyExport(): Promise<void> {
    if (!mtd) return;
    const fromParam = encodeURIComponent(mtd.from);
    const toParam = encodeURIComponent(mtd.to);
    try {
      const res = await fetch(`/api/v1/finance/tally-export?from=${fromParam}&to=${toParam}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tally-${mtd.from.slice(0, 10)}-to-${mtd.to.slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Tally CSV downloaded');
    } catch {
      toast.error('Export failed');
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-eyebrow uppercase text-ink-500">Finance & accounting</p>
          <h1 className="font-display text-display-sm text-ink-900">P&amp;L</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAddExpenseOpen(true)}>
            <Plus className="h-4 w-4" /> Add expense
          </Button>
          <Button variant="outline" onClick={() => void handleTallyExport()}>
            <Download className="h-4 w-4" /> Tally export
          </Button>
        </div>
      </header>

      {isError && (
        <div className="rounded-md border border-danger-500/40 bg-danger-50/40 px-4 py-3 text-sm text-danger-700">
          Couldn&apos;t load the finance summary. Retrying every minute.
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="Revenue (MTD)"
          value={mtd ? <Money paise={mtd.revenuePaise} /> : isLoading ? '…' : '—'}
          delta={
            mtd
              ? { value: `${mtd.billCount} bill${mtd.billCount === 1 ? '' : 's'}`, direction: 'flat' }
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
          label="Net"
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

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
              centerValue={`₹${(gstTotal / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
            />
          )}
          {gst && (
            <p className="mt-2 text-xs text-ink-500 text-center">
              {gst.billCount} bills · taxable <Money paise={gst.taxableRevenuePaise} />
            </p>
          )}
        </ChartCard>
      </section>

      {expensesByCat.length > 0 && (
        <ChartCard title="Expenses by category — this month" eyebrow="Breakdown">
          <CurrencyDonutChart
            data={expensesByCat.map((c) => ({ label: c.category, value: c.amountPaise }))}
            height={220}
            centerLabel="Total"
            centerValue={`₹${(mtd?.expensePaise ?? 0) / 100}`}
          />
        </ChartCard>
      )}

      <ExpensesList rows={recentExpenses} loading={isLoading} />

      <AddExpenseDialog open={addExpenseOpen} onClose={() => setAddExpenseOpen(false)} />
    </div>
  );
}

function ExpensesList({
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
      <header className="px-4 py-3 border-b border-ink-100">
        <h2 className="text-md font-medium text-ink-900">Recent expenses</h2>
        <p className="text-xs text-ink-500 mt-0.5">{rows.length} most recent</p>
      </header>
      {loading && <p className="px-4 py-3 text-sm text-ink-500">Loading…</p>}
      {!loading && rows.length === 0 && (
        <p className="px-4 py-3 text-sm text-ink-500">No expenses yet. Click <strong>Add expense</strong>.</p>
      )}
      {rows.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-eyebrow uppercase text-ink-500">
            <tr>
              <th className="text-left px-4 py-2">Date</th>
              <th className="text-left px-4 py-2">Category</th>
              <th className="text-left px-4 py-2">Shop</th>
              <th className="text-left px-4 py-2">Notes</th>
              <th className="text-right px-4 py-2">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2 font-mono text-xs text-ink-700">
                  {new Date(e.paidAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                </td>
                <td className="px-4 py-2">{e.category}</td>
                <td className="px-4 py-2 text-ink-700">{shopsById.get(e.shopId) ?? e.shopId.slice(-6)}</td>
                <td className="px-4 py-2 text-ink-600 max-w-xs truncate">{e.notes ?? '—'}</td>
                <td className="px-4 py-2 text-right">
                  <Money paise={e.amountPaise} className="font-mono tabular-nums" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const CATEGORIES = ['Rent', 'Salaries', 'Electricity', 'Marketing', 'Repairs', 'Insurance', 'Travel', 'Misc'];

function AddExpenseDialog({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const { data: shopsRes, isLoading: shopsLoading, isError: shopsError, refetch: refetchShops } = useGetShopsQuery();
  const shops = shopsRes?.data ?? [];
  const [shopId, setShopId] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]!);
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [createExpense, { isLoading }] = useCreateExpenseMutation();

  // Default the shop to the first one as soon as the query resolves. useEffect
  // (not setState during render) avoids React warnings + infinite re-renders.
  useEffect(() => {
    if (!shopId && shops[0]) setShopId(shops[0].id);
  }, [shopId, shops]);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const amountPaise = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountPaise) || amountPaise < 1) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!shopId) {
      toast.error('Select a shop');
      return;
    }
    try {
      await createExpense({
        shopId,
        category,
        amountPaise,
        paidAt: new Date(paidAt).toISOString(),
        notes: notes.trim() || undefined,
      }).unwrap();
      toast.success('Expense added');
      setAmount('');
      setNotes('');
      onClose();
    } catch (err) {
      const message =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ??
        'Could not save expense';
      toast.error(message);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-md bg-ink-0 rounded-lg shadow-xl border border-ink-100">
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <Dialog.Title className="font-display text-[22px] text-ink-900">Add expense</Dialog.Title>
              <Dialog.Close className="text-ink-500 hover:text-ink-900 p-1" aria-label="Close">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Shop</span>
                <select
                  value={shopId}
                  onChange={(e) => setShopId(e.target.value)}
                  className="mt-1 w-full h-11 px-3 rounded-md border border-ink-200 text-sm disabled:opacity-60"
                  required
                  disabled={shopsLoading || shopsError || shops.length === 0}
                >
                  {shopsLoading ? (
                    <option value="">Loading shops…</option>
                  ) : shopsError ? (
                    <option value="">Could not load shops</option>
                  ) : shops.length === 0 ? (
                    <option value="">No shops configured — seed the DB first</option>
                  ) : (
                    <>
                      <option value="">Select…</option>
                      {shops.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </>
                  )}
                </select>
                {shopsError && (
                  <button
                    type="button"
                    onClick={() => refetchShops()}
                    className="mt-1 text-[11px] text-brand-700 hover:text-brand-800 underline decoration-brand-300 underline-offset-2"
                  >
                    Retry
                  </button>
                )}
              </label>

              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Category</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full h-11 px-3 rounded-md border border-ink-200 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Amount (₹)</span>
                <Input
                  type="number"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  autoFocus
                />
              </label>

              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Paid on</span>
                <Input
                  type="date"
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                  required
                />
              </label>

              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Notes (optional)</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full px-3 py-2 rounded-md border border-ink-200 text-sm"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={isLoading}>{isLoading ? 'Saving…' : 'Add expense'}</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
