// Add expense modal. Lives in the finance feature folder so every tab that
// needs an "Add expense" CTA shares the same form, validation, vendor +
// bank linking, and classification controls.

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import {
  useCreateExpenseMutation,
  useGetVendorListQuery,
  useGetBankAccountsQuery,
} from '@/features/finance/financeApi';

export const EXPENSE_CATEGORIES = [
  'Rent',
  'Salaries',
  'Electricity',
  'Water',
  'Marketing',
  'Repairs',
  'Insurance',
  'Travel',
  'Vendor payment',
  'Office supplies',
  'GST payment',
  'Machinery',
  'Furniture',
  'Vehicle',
  'Miscellaneous',
];

const CAPITAL_CATEGORIES = new Set(['Machinery', 'Furniture', 'Vehicle']);

export function AddExpenseDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const { data: shopsRes, isLoading: shopsLoading } = useGetShopsQuery();
  const { data: vendorsRes } = useGetVendorListQuery(undefined, { skip: !open });
  const { data: banksRes } = useGetBankAccountsQuery(undefined, { skip: !open });
  const [createExpense, { isLoading }] = useCreateExpenseMutation();

  const shops = shopsRes?.data ?? [];
  const vendors = vendorsRes?.data ?? [];
  const banks = banksRes?.data ?? [];

  const [shopId, setShopId] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]!);
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState<string>('CASH');
  const [vendorId, setVendorId] = useState<string>('');
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [classification, setClassification] = useState<'REVENUE' | 'CAPITAL'>('REVENUE');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState('30');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!shopId && shops[0]) setShopId(shops[0].id);
  }, [shopId, shops]);

  // Auto-flip classification when user picks an obviously-capital category.
  useEffect(() => {
    setClassification(CAPITAL_CATEGORIES.has(category) ? 'CAPITAL' : 'REVENUE');
  }, [category]);

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
        paidAt: new Date(paidAt) as unknown as Date,
        notes: notes.trim() || undefined,
        classification,
        isRecurring,
        recurringIntervalDays: isRecurring ? Number(recurringDays) || 30 : undefined,
        paymentMode: paymentMode as 'CASH',
        vendorId: vendorId || undefined,
        bankAccountId: bankAccountId || undefined,
      } as never).unwrap();
      toast.success('Expense added');
      setAmount('');
      setNotes('');
      setVendorId('');
      setBankAccountId('');
      setIsRecurring(false);
      onClose();
    } catch (err) {
      const message =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ??
        'Could not save expense';
      toast.error(message);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[94vw] max-w-xl bg-ink-0 rounded-lg shadow-xl border border-ink-100 max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <Dialog.Title className="font-display text-[22px] text-ink-900">
                  Record expense
                </Dialog.Title>
                <p className="text-xs text-ink-500 mt-0.5">
                  Auto-classifies as capital for machinery / furniture / vehicle.
                </p>
              </div>
              <Dialog.Close className="text-ink-500 hover:text-ink-900 p-1" aria-label="Close">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Shop</span>
                <select
                  value={shopId}
                  onChange={(e) => setShopId(e.target.value)}
                  className="mt-1 w-full h-10 px-3 rounded-md border border-ink-200 text-sm"
                  required
                  disabled={shopsLoading || shops.length === 0}
                >
                  <option value="">Select…</option>
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Category</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full h-10 px-3 rounded-md border border-ink-200 text-sm"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  Amount (₹)
                </span>
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
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  Payment mode
                </span>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="mt-1 w-full h-10 px-3 rounded-md border border-ink-200 text-sm"
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="CARD">Card</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </label>

              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  Classification
                </span>
                <select
                  value={classification}
                  onChange={(e) => setClassification(e.target.value as 'REVENUE' | 'CAPITAL')}
                  className="mt-1 w-full h-10 px-3 rounded-md border border-ink-200 text-sm"
                >
                  <option value="REVENUE">Revenue (P&amp;L)</option>
                  <option value="CAPITAL">Capital (asset)</option>
                </select>
              </label>

              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  Vendor (optional)
                </span>
                <select
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  className="mt-1 w-full h-10 px-3 rounded-md border border-ink-200 text-sm"
                >
                  <option value="">—</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  Bank account (optional)
                </span>
                <select
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                  className="mt-1 w-full h-10 px-3 rounded-md border border-ink-200 text-sm"
                >
                  <option value="">—</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nickname} ····{b.accountLast4}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm select-none">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="h-4 w-4 rounded border-ink-300"
              />
              <span className="text-ink-700">Recurring expense</span>
              {isRecurring && (
                <span className="ml-3 inline-flex items-center gap-1 text-xs text-ink-500">
                  every
                  <input
                    type="number"
                    value={recurringDays}
                    onChange={(e) => setRecurringDays(e.target.value)}
                    className="h-8 w-16 px-2 rounded-md border border-ink-200 text-sm font-mono"
                  />
                  days
                </span>
              )}
            </label>

            <label className="block text-sm">
              <span className="text-[11px] uppercase tracking-wider text-ink-500">
                Notes (optional)
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full px-3 py-2 rounded-md border border-ink-200 text-sm"
              />
            </label>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving…' : 'Add expense'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
