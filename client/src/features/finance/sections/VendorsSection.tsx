// Vendor ledger — purchases - payments = outstanding. Lets the user record
// a payment against any vendor and immediately see the outstanding move.

import { useMemo, useState } from 'react';
import { Plus, X, Download } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Money } from '@/components/ui/money';
import { MetricCard } from '@/components/ui/MetricCard';
import { RankedBarChart, ChartCard } from '@/components/ui/charts';
import {
  useGetVendorLedgerQuery,
  useGetVendorPaymentsQuery,
  useCreateVendorPaymentMutation,
  useGetBankAccountsQuery,
} from '@/features/finance/financeApi';
import { downloadCsv, paiseToRupeeString } from '@/features/finance/lib/export';
import { hasPermission } from '@/features/auth/authSlice';
import { useAppSelector } from '@/app/hooks';

export function VendorsSection(): JSX.Element {
  const user = useAppSelector((s) => s.auth.user);
  const canWrite = hasPermission(user, 'finance.expense_write');

  const { data, isLoading } = useGetVendorLedgerQuery();
  const vendors = data?.data ?? [];

  const totalOutstanding = vendors.reduce((a, v) => a + v.outstandingPaise, 0);
  const totalPurchased = vendors.reduce((a, v) => a + v.purchasedPaise, 0);
  const totalPaid = vendors.reduce((a, v) => a + v.paidPaise, 0);

  const [payVendor, setPayVendor] = useState<{ id: string; name: string } | null>(null);
  const [drilldownVendor, setDrilldownVendor] = useState<{ id: string; name: string } | null>(null);

  const topVendors = useMemo(
    () => vendors.slice().sort((a, b) => b.outstandingPaise - a.outstandingPaise).slice(0, 8),
    [vendors],
  );

  function handleCsv(): void {
    const rows: (string | number)[][] = [
      ['Vendor ledger'],
      [],
      ['Vendor', 'GSTIN', 'Phone', 'Purchased (₹)', 'Paid (₹)', 'Outstanding (₹)'],
      ...vendors.map((v) => [
        v.name,
        v.gstNumber ?? '—',
        v.phone,
        paiseToRupeeString(v.purchasedPaise),
        paiseToRupeeString(v.paidPaise),
        paiseToRupeeString(v.outstandingPaise),
      ]),
    ];
    downloadCsv(`vendor-ledger.csv`, rows);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <MetricCard
          label="Total outstanding"
          value={<Money paise={totalOutstanding} />}
          tone={totalOutstanding > 0 ? 'warning' : 'success'}
          delta={{ value: `${vendors.length} vendors`, direction: 'flat' }}
        />
        <MetricCard label="Total purchased" value={<Money paise={totalPurchased} />} />
        <MetricCard label="Total paid" value={<Money paise={totalPaid} />} tone="success" />
      </section>

      {topVendors.length > 0 && (
        <ChartCard title="Top outstanding vendors" eyebrow="Dues">
          <RankedBarChart
            data={topVendors.map((v) => ({ label: v.name, value: v.outstandingPaise }))}
            height={Math.max(160, topVendors.length * 32)}
            unit="currency"
            name="Outstanding"
          />
        </ChartCard>
      )}

      <section className="rounded-md border border-ink-100 bg-ink-0">
        <header className="px-4 py-3 border-b border-ink-100 flex items-center justify-between gap-2">
          <h2 className="text-md font-medium text-ink-900">Vendor ledger</h2>
          <Button variant="outline" size="sm" onClick={handleCsv} disabled={vendors.length === 0}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </header>
        {isLoading && <p className="px-4 py-3 text-sm text-ink-500">Loading…</p>}
        {!isLoading && vendors.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink-500">
            No vendors yet. Add vendors from the Inventory module.
          </p>
        )}
        {vendors.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
                <tr>
                  <th className="text-left px-4 py-2.5">Vendor</th>
                  <th className="text-left px-4 py-2.5">GSTIN</th>
                  <th className="text-right px-4 py-2.5">Purchased</th>
                  <th className="text-right px-4 py-2.5">Paid</th>
                  <th className="text-right px-4 py-2.5">Outstanding</th>
                  <th className="text-right px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {vendors.map((v) => (
                  <tr key={v.id} className="hover:bg-ink-25">
                    <td className="px-4 py-2">
                      <p className="font-medium text-ink-900">{v.name}</p>
                      <p className="text-xs text-ink-500">{v.phone}</p>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-ink-600">
                      {v.gstNumber ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Money paise={v.purchasedPaise} />
                    </td>
                    <td className="px-4 py-2 text-right text-success-700">
                      <Money paise={v.paidPaise} />
                    </td>
                    <td
                      className={
                        v.outstandingPaise > 0
                          ? 'px-4 py-2 text-right text-warning-700 font-semibold'
                          : 'px-4 py-2 text-right text-ink-700'
                      }
                    >
                      <Money paise={v.outstandingPaise} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setDrilldownVendor({ id: v.id, name: v.name })
                          }
                          className="text-xs text-brand-700 hover:underline"
                        >
                          History
                        </button>
                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => setPayVendor({ id: v.id, name: v.name })}
                            className="text-xs inline-flex items-center gap-1 rounded-md border border-ink-200 px-2 h-7 hover:bg-ink-50"
                          >
                            <Plus className="h-3 w-3" /> Pay
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {payVendor && (
        <RecordPaymentDialog
          vendor={payVendor}
          onClose={() => setPayVendor(null)}
        />
      )}
      {drilldownVendor && (
        <VendorHistoryDialog
          vendor={drilldownVendor}
          onClose={() => setDrilldownVendor(null)}
        />
      )}
    </div>
  );
}

function RecordPaymentDialog({
  vendor,
  onClose,
}: {
  vendor: { id: string; name: string };
  onClose: () => void;
}): JSX.Element {
  const { data: banksRes } = useGetBankAccountsQuery();
  const banks = banksRes?.data ?? [];
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [referenceId, setReferenceId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [createPayment, { isLoading }] = useCreateVendorPaymentMutation();

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const paise = Math.round(Number(amount) * 100);
    if (paise < 1) {
      toast.error('Enter a valid amount');
      return;
    }
    try {
      await createPayment({
        vendorId: vendor.id,
        amountPaise: paise,
        paymentMode: paymentMode as 'CASH',
        referenceId: referenceId || undefined,
        paidAt: new Date(paidAt) as unknown as Date,
        notes: notes || undefined,
        bankAccountId: bankAccountId || undefined,
      } as never).unwrap();
      toast.success(`Payment recorded for ${vendor.name}`);
      onClose();
    } catch {
      toast.error('Could not save payment');
    }
  }

  return (
    <Dialog.Root open onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-md bg-ink-0 rounded-lg shadow-xl border border-ink-100">
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <Dialog.Title className="font-display text-[20px] text-ink-900">
                  Pay {vendor.name}
                </Dialog.Title>
                <p className="text-xs text-ink-500 mt-0.5">
                  Reduces outstanding balance immediately.
                </p>
              </div>
              <Dialog.Close className="text-ink-500 hover:text-ink-900 p-1" aria-label="Close">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm col-span-2">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  Amount (₹)
                </span>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  autoFocus
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  Paid on
                </span>
                <Input
                  type="date"
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Mode</span>
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
                  Reference
                </span>
                <Input
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                  placeholder="UTR / cheque no"
                />
              </label>
              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  Bank account
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
            <label className="block text-sm">
              <span className="text-[11px] uppercase tracking-wider text-ink-500">Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full px-3 py-2 rounded-md border border-ink-200 text-sm"
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving…' : 'Record payment'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function VendorHistoryDialog({
  vendor,
  onClose,
}: {
  vendor: { id: string; name: string };
  onClose: () => void;
}): JSX.Element {
  const { data } = useGetVendorPaymentsQuery(vendor.id);
  const rows = data?.data ?? [];
  return (
    <Dialog.Root open onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[94vw] max-w-2xl bg-ink-0 rounded-lg shadow-xl border border-ink-100 max-h-[85vh] overflow-y-auto">
          <div className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <Dialog.Title className="font-display text-[20px] text-ink-900">
                {vendor.name} — payment history
              </Dialog.Title>
              <Dialog.Close className="text-ink-500 hover:text-ink-900 p-1" aria-label="Close">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-500">No payments recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
                    <tr>
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-left px-3 py-2">Mode</th>
                      <th className="text-left px-3 py-2">Reference</th>
                      <th className="text-right px-3 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2 font-mono text-xs">
                          {new Date(r.paidAt).toLocaleDateString('en-IN')}
                        </td>
                        <td className="px-3 py-2">{r.paymentMode}</td>
                        <td className="px-3 py-2 font-mono text-xs">{r.referenceId ?? '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <Money paise={r.amountPaise} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
