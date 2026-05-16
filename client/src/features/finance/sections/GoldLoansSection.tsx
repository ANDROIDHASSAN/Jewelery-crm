// Gold loans — pledged jewellery against cash loans. Track principal, due
// date, repayments, outstanding. Loans collapse to CLOSED automatically as
// repayments add up.

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Money, Weight } from '@/components/ui/money';
import { MetricCard } from '@/components/ui/MetricCard';
import {
  useGetGoldLoansQuery,
  useCreateGoldLoanMutation,
  useAddGoldLoanRepaymentMutation,
  type GoldLoanRow,
} from '@/features/finance/financeApi';
import { hasPermission } from '@/features/auth/authSlice';
import { useAppSelector } from '@/app/hooks';
import { cn } from '@/lib/cn';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PARTIALLY_REPAID', label: 'Partial' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'DEFAULTED', label: 'Defaulted' },
] as const;

export function GoldLoansSection(): JSX.Element {
  const user = useAppSelector((s) => s.auth.user);
  const canWrite = hasPermission(user, 'finance.goldloan_write');

  const [status, setStatus] = useState<string>('');
  const { data, isLoading } = useGetGoldLoansQuery(
    status ? ({ status } as { status: 'ACTIVE' }) : undefined,
  );
  const rows = data?.data ?? [];
  const [newOpen, setNewOpen] = useState(false);
  const [repayLoan, setRepayLoan] = useState<GoldLoanRow | null>(null);

  const activePrincipal = rows
    .filter((r) => r.status === 'ACTIVE' || r.status === 'PARTIALLY_REPAID')
    .reduce((a, r) => a + r.principalPaise, 0);
  const outstanding = rows.reduce((a, r) => a + r.outstandingPaise, 0);
  const pledged = rows
    .filter((r) => r.status === 'ACTIVE' || r.status === 'PARTIALLY_REPAID')
    .reduce((a, r) => a + r.pledgedWeightMg, 0);
  const overdue = rows.filter((r) => r.daysToDue < 0 && r.outstandingPaise > 0).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Active principal" value={<Money paise={activePrincipal} />} tone="neutral" />
        <MetricCard
          label="Outstanding"
          value={<Money paise={outstanding} />}
          tone={outstanding > 0 ? 'warning' : 'success'}
        />
        <MetricCard
          label="Pledged weight"
          value={<Weight mg={pledged} />}
          delta={{ value: 'Currently in custody', direction: 'flat' }}
        />
        <MetricCard
          label="Overdue loans"
          value={String(overdue)}
          tone={overdue > 0 ? 'danger' : 'success'}
        />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-ink-200 bg-ink-0 p-0.5 overflow-x-auto">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setStatus(s.value)}
              className={cn(
                'h-8 px-3 text-xs rounded-[5px] whitespace-nowrap',
                status === s.value
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-ink-600 hover:bg-ink-50',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {canWrite && (
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> New gold loan
          </Button>
        )}
      </div>

      <section className="rounded-md border border-ink-100 bg-ink-0">
        <header className="px-4 py-3 border-b border-ink-100">
          <h2 className="text-md font-medium text-ink-900">Gold loan register</h2>
        </header>
        {isLoading && <p className="px-4 py-3 text-sm text-ink-500">Loading…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink-500">No loans yet.</p>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
                <tr>
                  <th className="text-left px-4 py-2.5">Customer</th>
                  <th className="text-right px-4 py-2.5">Principal</th>
                  <th className="text-right px-4 py-2.5">Rate</th>
                  <th className="text-right px-4 py-2.5">Weight</th>
                  <th className="text-right px-4 py-2.5">Repaid</th>
                  <th className="text-right px-4 py-2.5">Outstanding</th>
                  <th className="text-right px-4 py-2.5">Due</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-right px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((r) => {
                  const isOverdue = r.daysToDue < 0 && r.outstandingPaise > 0;
                  return (
                    <tr key={r.id} className={isOverdue ? 'bg-danger-50/30' : ''}>
                      <td className="px-4 py-2">
                        <p className="font-medium text-ink-900">{r.customer.name}</p>
                        <p className="text-xs text-ink-500">{r.customer.phone}</p>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Money paise={r.principalPaise} />
                      </td>
                      <td className="px-4 py-2 text-right text-ink-700 tabular-nums">
                        {(r.interestRateBps / 100).toFixed(2)}%
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Weight mg={r.pledgedWeightMg} />
                      </td>
                      <td className="px-4 py-2 text-right text-success-700">
                        <Money paise={r.repaidPaise} />
                      </td>
                      <td className="px-4 py-2 text-right font-semibold">
                        <Money paise={r.outstandingPaise} />
                      </td>
                      <td
                        className={cn(
                          'px-4 py-2 text-right text-xs font-mono',
                          isOverdue ? 'text-danger-700' : 'text-ink-600',
                        )}
                      >
                        {new Date(r.dueAt).toLocaleDateString('en-IN')}
                        <br />
                        <span className="text-[10px]">
                          {isOverdue
                            ? `${Math.abs(r.daysToDue)}d overdue`
                            : r.outstandingPaise === 0
                              ? 'Closed'
                              : `${r.daysToDue}d`}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <LoanStatusPill status={r.status} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        {canWrite && r.outstandingPaise > 0 && (
                          <button
                            type="button"
                            onClick={() => setRepayLoan(r)}
                            className="text-xs text-brand-700 hover:underline"
                          >
                            Repay
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {newOpen && <NewLoanDialog onClose={() => setNewOpen(false)} />}
      {repayLoan && (
        <RepaymentDialog loan={repayLoan} onClose={() => setRepayLoan(null)} />
      )}
    </div>
  );
}

function LoanStatusPill({ status }: { status: GoldLoanRow['status'] }): JSX.Element {
  const tone =
    status === 'ACTIVE'
      ? 'bg-brand-50 text-brand-700'
      : status === 'PARTIALLY_REPAID'
        ? 'bg-warning-50 text-warning-700'
        : status === 'CLOSED'
          ? 'bg-success-50 text-success-700'
          : 'bg-danger-50 text-danger-700';
  return (
    <span className={cn('inline-block rounded-sm px-1.5 py-0.5 text-[11px] font-medium', tone)}>
      {status.replace('_', ' ')}
    </span>
  );
}

function NewLoanDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [customerId, setCustomerId] = useState('');
  const [principal, setPrincipal] = useState('');
  const [rate, setRate] = useState('1.5');
  const [weight, setWeight] = useState('');
  const [dueAt, setDueAt] = useState(() => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() + 12);
    return d.toISOString().slice(0, 10);
  });
  const [createLoan, { isLoading }] = useCreateGoldLoanMutation();

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await createLoan({
        customerId,
        principalPaise: Math.round(Number(principal) * 100),
        interestRateBps: Math.round(Number(rate) * 100),
        pledgedWeightMg: Math.round(Number(weight) * 1000),
        dueAt: new Date(dueAt) as unknown as Date,
      } as never).unwrap();
      toast.success('Loan recorded');
      onClose();
    } catch (err) {
      const msg = (err as { data?: { error?: { message?: string } } }).data?.error?.message;
      toast.error(msg ?? 'Could not save loan');
    }
  }

  return (
    <Dialog.Root open onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-md bg-ink-0 rounded-lg shadow-xl border border-ink-100">
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <Dialog.Title className="font-display text-[20px] text-ink-900">
                New gold loan
              </Dialog.Title>
              <Dialog.Close className="text-ink-500 hover:text-ink-900 p-1">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <p className="text-xs text-ink-500">
              Use customer ID from the CRM. Future UI will offer a typeahead.
            </p>
            <label className="block text-sm">
              <span className="text-[11px] uppercase tracking-wider text-ink-500">
                Customer ID
              </span>
              <Input
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                placeholder="cust_…"
                required
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  Principal (₹)
                </span>
                <Input
                  type="number"
                  value={principal}
                  onChange={(e) => setPrincipal(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  Rate (% per month)
                </span>
                <Input
                  type="number"
                  step="0.01"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  Pledged weight (g)
                </span>
                <Input
                  type="number"
                  step="0.001"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Due</span>
                <Input
                  type="date"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  required
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving…' : 'Create loan'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RepaymentDialog({
  loan,
  onClose,
}: {
  loan: GoldLoanRow;
  onClose: () => void;
}): JSX.Element {
  const [amount, setAmount] = useState(String(loan.outstandingPaise / 100));
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [addRepayment, { isLoading }] = useAddGoldLoanRepaymentMutation();

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await addRepayment({
        loanId: loan.id,
        amountPaise: Math.round(Number(amount) * 100),
        paidAt: new Date(paidAt) as unknown as Date,
      } as never).unwrap();
      toast.success('Repayment recorded');
      onClose();
    } catch {
      toast.error('Could not save');
    }
  }

  return (
    <Dialog.Root open onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-sm bg-ink-0 rounded-lg shadow-xl border border-ink-100">
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <Dialog.Title className="font-display text-[18px] text-ink-900">
                  Repay loan
                </Dialog.Title>
                <p className="text-xs text-ink-500 mt-0.5">{loan.customer.name}</p>
              </div>
              <Dialog.Close className="text-ink-500 hover:text-ink-900 p-1">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <div className="rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-600">
              Outstanding: <Money paise={loan.outstandingPaise} className="text-ink-900 ml-1" />
            </div>
            <label className="block text-sm">
              <span className="text-[11px] uppercase tracking-wider text-ink-500">Amount (₹)</span>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-[11px] uppercase tracking-wider text-ink-500">Paid on</span>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving…' : 'Record'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
