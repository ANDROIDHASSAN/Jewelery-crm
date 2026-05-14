import { useMemo, useState } from 'react';
import { Download, Plus, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { MetricCard } from '@/components/ui/MetricCard';
import { Money } from '@/components/ui/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useGetPlQuery,
  useGetGstSummaryQuery,
  useGetExpensesQuery,
  useCreateExpenseMutation,
} from '@/features/finance/financeApi';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import { ChartCard, CurrencyBarChart, CurrencyDonutChart } from '@/components/ui/charts';

function isoMonthAgo(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { from: from.toISOString(), to: now.toISOString() };
}

function rangeForMonth(offset: number): { from: string; to: string; label: string } {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - offset, 1);
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    label: from.toLocaleDateString('en-IN', { month: 'short' }),
  };
}

export function FinancePage(): JSX.Element {
  const range = monthRange();
  const { data: plRes, isLoading: plLoading } = useGetPlQuery(range, { pollingInterval: 60_000 });
  const lastMonth = isoMonthAgo(1);
  const { data: gstRes, isLoading: gstLoading } = useGetGstSummaryQuery({ month: lastMonth });
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);

  const m0 = useGetPlQuery(rangeForMonth(5));
  const m1 = useGetPlQuery(rangeForMonth(4));
  const m2 = useGetPlQuery(rangeForMonth(3));
  const m3 = useGetPlQuery(rangeForMonth(2));
  const m4 = useGetPlQuery(rangeForMonth(1));
  const m5 = useGetPlQuery(rangeForMonth(0));

  const trendData = useMemo(() => {
    const series = [m0, m1, m2, m3, m4, m5];
    return series.map((q, i) => {
      const r = rangeForMonth(5 - i);
      const d = q.data?.data;
      return {
        label: r.label,
        revenue: d?.revenuePaise ?? 0,
        expense: d?.expensePaise ?? 0,
      };
    });
  }, [m0.data, m1.data, m2.data, m3.data, m4.data, m5.data]);

  const pl = plRes?.data;
  const gst = gstRes?.data;

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
    const fromParam = encodeURIComponent(range.from);
    const toParam = encodeURIComponent(range.to);
    try {
      const res = await fetch(`/api/v1/finance/tally-export?from=${fromParam}&to=${toParam}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tally-${range.from.slice(0, 10)}-to-${range.to.slice(0, 10)}.csv`;
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
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="Revenue (MTD)"
          value={pl ? <Money paise={pl.revenuePaise} /> : plLoading ? '…' : '—'}
        />
        <MetricCard
          label="Expenses (MTD)"
          value={pl ? <Money paise={pl.expensePaise} /> : plLoading ? '…' : '—'}
        />
        <MetricCard
          label="Net"
          value={pl ? <Money paise={pl.netPaise} /> : plLoading ? '…' : '—'}
          tone={pl && pl.netPaise >= 0 ? 'success' : undefined}
        />
        <MetricCard
          label="GST collected (MTD)"
          value={pl ? <Money paise={pl.gstPaise} /> : plLoading ? '…' : '—'}
          delta={{ value: 'Filing due 11th', direction: 'flat' }}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard
          className="lg:col-span-2"
          title="Revenue vs expenses — last 6 months"
          eyebrow="Trend"
        >
          <CurrencyBarChart
            data={trendData}
            series={[
              { key: 'revenue', name: 'Revenue', color: '#C99B2A' },
              { key: 'expense', name: 'Expenses', color: '#6E695F' },
            ]}
            height={260}
          />
        </ChartCard>

        <ChartCard title={`GST split — ${lastMonth}`} eyebrow="Tax">
          {gstLoading ? (
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

      <ExpensesList />

      <AddExpenseDialog open={addExpenseOpen} onClose={() => setAddExpenseOpen(false)} />
    </div>
  );
}

function ExpensesList(): JSX.Element {
  const { data, isLoading } = useGetExpensesQuery({ limit: 30 });
  const rows = data?.data ?? [];
  const { data: shopsRes } = useGetShopsQuery();
  const shopsById = new Map((shopsRes?.data ?? []).map((s) => [s.id, s.name]));

  return (
    <section className="rounded-md border border-ink-100 bg-ink-0">
      <header className="px-4 py-3 border-b border-ink-100">
        <h2 className="text-md font-medium text-ink-900">Recent expenses</h2>
        <p className="text-xs text-ink-500 mt-0.5">{rows.length} most recent</p>
      </header>
      {isLoading && <p className="px-4 py-3 text-sm text-ink-500">Loading…</p>}
      {!isLoading && rows.length === 0 && (
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
  const { data: shopsRes } = useGetShopsQuery();
  const shops = shopsRes?.data ?? [];
  const [shopId, setShopId] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]!);
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [createExpense, { isLoading }] = useCreateExpenseMutation();

  // Default shop to the first one once shops load.
  if (!shopId && shops[0]) {
    setShopId(shops[0].id);
  }

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
                  className="mt-1 w-full h-11 px-3 rounded-md border border-ink-200 text-sm"
                  required
                >
                  <option value="">Select…</option>
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
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
