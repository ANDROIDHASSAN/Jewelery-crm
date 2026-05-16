// Bank accounts + bank transactions. Manual bookkeeping for v1 — the
// table is shaped so a future Razorpay X / Decentro feed can populate
// BankTransaction rows directly.

import { useEffect, useState } from 'react';
import { Plus, X, Building2 } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Money } from '@/components/ui/money';
import { MetricCard } from '@/components/ui/MetricCard';
import {
  useGetBankAccountsQuery,
  useCreateBankAccountMutation,
  useGetBankTransactionsQuery,
  useCreateBankTransactionMutation,
} from '@/features/finance/financeApi';
import { hasPermission } from '@/features/auth/authSlice';
import { useAppSelector } from '@/app/hooks';
import { cn } from '@/lib/cn';

export function BankSection(): JSX.Element {
  const user = useAppSelector((s) => s.auth.user);
  const canWrite = hasPermission(user, 'finance.expense_write');

  const { data, isLoading } = useGetBankAccountsQuery();
  const accounts = data?.data ?? [];
  const [activeId, setActiveId] = useState<string>('');
  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [txnOpen, setTxnOpen] = useState(false);

  useEffect(() => {
    if (!activeId && accounts[0]) setActiveId(accounts[0].id);
  }, [activeId, accounts]);

  const totalBalance = accounts.reduce((a, x) => a + x.balancePaise, 0);
  const totalCredits = accounts.reduce((a, x) => a + x.creditPaise, 0);
  const totalDebits = accounts.reduce((a, x) => a + x.debitPaise, 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          label="Total balance"
          value={<Money paise={totalBalance} />}
          tone="success"
          delta={{ value: `${accounts.length} accounts`, direction: 'flat' }}
        />
        <MetricCard label="Lifetime credits" value={<Money paise={totalCredits} />} />
        <MetricCard label="Lifetime debits" value={<Money paise={totalDebits} />} />
        <div className="rounded-md border border-dashed border-ink-200 bg-ink-0 p-4 flex items-center justify-center">
          {canWrite && (
            <Button variant="outline" size="sm" onClick={() => setNewAccountOpen(true)}>
              <Plus className="h-4 w-4" /> Add bank account
            </Button>
          )}
        </div>
      </section>

      {isLoading && <p className="text-sm text-ink-500">Loading…</p>}
      {!isLoading && accounts.length === 0 && (
        <p className="rounded-md border border-dashed border-ink-200 bg-ink-0 px-4 py-10 text-center text-sm text-ink-500">
          No bank accounts on file. Add one to start tracking deposits and withdrawals.
        </p>
      )}

      {accounts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-3 sm:gap-4">
          <aside className="space-y-2">
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setActiveId(a.id)}
                className={cn(
                  'block w-full text-left rounded-md border p-3 transition-colors duration-fast',
                  activeId === a.id
                    ? 'border-brand-400 bg-brand-50/40'
                    : 'border-ink-100 bg-ink-0 hover:border-ink-200',
                )}
              >
                <div className="flex items-start gap-2">
                  <Building2 className="h-4 w-4 text-brand-700 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-900 truncate">{a.nickname}</p>
                    <p className="text-[11px] text-ink-500 truncate">
                      {a.bankName} ····{a.accountLast4}
                    </p>
                    <p className="mt-2 font-mono text-md tabular-nums text-ink-900">
                      <Money paise={a.balancePaise} />
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </aside>

          <section className="rounded-md border border-ink-100 bg-ink-0">
            <header className="px-4 py-3 border-b border-ink-100 flex items-center justify-between">
              <div>
                <p className="text-eyebrow uppercase text-ink-500">Bank transactions</p>
                <h2 className="text-md font-medium text-ink-900">
                  {accounts.find((a) => a.id === activeId)?.nickname ?? '—'}
                </h2>
              </div>
              {canWrite && activeId && (
                <Button size="sm" variant="outline" onClick={() => setTxnOpen(true)}>
                  <Plus className="h-4 w-4" /> Add txn
                </Button>
              )}
            </header>
            {activeId && <BankTxnsTable accountId={activeId} />}
          </section>
        </div>
      )}

      {newAccountOpen && (
        <AddBankAccountDialog onClose={() => setNewAccountOpen(false)} />
      )}
      {txnOpen && activeId && (
        <AddTxnDialog accountId={activeId} onClose={() => setTxnOpen(false)} />
      )}
    </div>
  );
}

function BankTxnsTable({ accountId }: { accountId: string }): JSX.Element {
  const { data, isLoading } = useGetBankTransactionsQuery({ accountId, limit: 100 });
  const rows = data?.data ?? [];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
          <tr>
            <th className="text-left px-4 py-2.5">Date</th>
            <th className="text-left px-4 py-2.5">Description</th>
            <th className="text-left px-4 py-2.5">Reference</th>
            <th className="text-right px-4 py-2.5">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {isLoading && (
            <tr>
              <td colSpan={4} className="px-4 py-3 text-sm text-ink-500">
                Loading…
              </td>
            </tr>
          )}
          {!isLoading && rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-sm text-ink-500">
                No transactions yet.
              </td>
            </tr>
          )}
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-2 font-mono text-xs text-ink-700">
                {new Date(t.occurredAt).toLocaleDateString('en-IN')}
              </td>
              <td className="px-4 py-2 text-ink-800">{t.description}</td>
              <td className="px-4 py-2 font-mono text-xs text-ink-500">
                {t.referenceId ?? '—'}
              </td>
              <td
                className={cn(
                  'px-4 py-2 text-right font-medium',
                  t.direction === 'CREDIT' ? 'text-success-700' : 'text-danger-700',
                )}
              >
                {t.direction === 'CREDIT' ? '+' : '−'} <Money paise={t.amountPaise} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddBankAccountDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [nickname, setNickname] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountLast4, setAccountLast4] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [type, setType] = useState<'CURRENT' | 'SAVINGS' | 'OD' | 'CC' | 'OTHER'>('CURRENT');
  const [opening, setOpening] = useState('0');
  const [create, { isLoading }] = useCreateBankAccountMutation();

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await create({
        nickname,
        bankName,
        accountLast4,
        ifsc: ifsc || undefined,
        type,
        openingBalancePaise: Math.round(Number(opening) * 100),
      } as never).unwrap();
      toast.success('Bank account added');
      onClose();
    } catch (err) {
      const msg = (err as { data?: { error?: { message?: string } } }).data?.error?.message;
      toast.error(msg ?? 'Could not save');
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
                Add bank account
              </Dialog.Title>
              <Dialog.Close className="text-ink-500 hover:text-ink-900 p-1">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <label className="block text-sm">
              <span className="text-[11px] uppercase tracking-wider text-ink-500">Nickname</span>
              <Input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="e.g. HDFC current — Gurugram main"
                required
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Bank</span>
                <Input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="HDFC Bank"
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  Last 4 digits
                </span>
                <Input
                  value={accountLast4}
                  onChange={(e) => setAccountLast4(e.target.value)}
                  placeholder="1234"
                  maxLength={4}
                  pattern="\d{4}"
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  IFSC (optional)
                </span>
                <Input
                  value={ifsc}
                  onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                  placeholder="HDFC0001234"
                />
              </label>
              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Type</span>
                <select
                  value={type}
                  onChange={(e) =>
                    setType(e.target.value as 'CURRENT' | 'SAVINGS' | 'OD' | 'CC' | 'OTHER')
                  }
                  className="mt-1 w-full h-10 px-3 rounded-md border border-ink-200 text-sm"
                >
                  <option value="CURRENT">Current</option>
                  <option value="SAVINGS">Savings</option>
                  <option value="OD">Overdraft</option>
                  <option value="CC">Cash credit</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label className="block text-sm col-span-2">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  Opening balance (₹)
                </span>
                <Input
                  type="number"
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving…' : 'Add account'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AddTxnDialog({
  accountId,
  onClose,
}: {
  accountId: string;
  onClose: () => void;
}): JSX.Element {
  const [direction, setDirection] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [occurredAt, setOccurredAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [create, { isLoading }] = useCreateBankTransactionMutation();

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await create({
        accountId,
        direction,
        amountPaise: Math.round(Number(amount) * 100),
        description,
        referenceId: referenceId || undefined,
        occurredAt: new Date(occurredAt) as unknown as Date,
      } as never).unwrap();
      toast.success('Transaction added');
      onClose();
    } catch {
      toast.error('Could not save');
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
                New bank transaction
              </Dialog.Title>
              <Dialog.Close className="text-ink-500 hover:text-ink-900 p-1">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <div className="inline-flex rounded-md border border-ink-200 bg-ink-0 p-0.5 w-full">
              {(['CREDIT', 'DEBIT'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className={cn(
                    'h-9 px-3 text-sm rounded-[5px] flex-1',
                    direction === d
                      ? d === 'CREDIT'
                        ? 'bg-success-50 text-success-700 font-medium'
                        : 'bg-danger-50 text-danger-700 font-medium'
                      : 'text-ink-600 hover:bg-ink-50',
                  )}
                >
                  {d === 'CREDIT' ? 'Credit (in)' : 'Debit (out)'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm col-span-2">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  Description
                </span>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Salary transfer, vendor payment, etc."
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  Amount (₹)
                </span>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Date</span>
                <Input
                  type="date"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm col-span-2">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  Reference (UTR / cheque no)
                </span>
                <Input
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving…' : 'Add'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
