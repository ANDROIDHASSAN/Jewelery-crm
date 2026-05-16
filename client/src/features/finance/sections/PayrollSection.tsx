// Payroll — monthly salary registry for shop staff. Pick a month, see who's
// been paid, add or update a record, mark paid.

import { useState } from 'react';
import { Plus, X, CheckCircle2, Download } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Money } from '@/components/ui/money';
import { MetricCard } from '@/components/ui/MetricCard';
import {
  useGetPayrollQuery,
  useCreatePayrollMutation,
  useMarkPayrollPaidMutation,
  useGetFinanceStaffQuery,
} from '@/features/finance/financeApi';
import { downloadCsv, paiseToRupeeString } from '@/features/finance/lib/export';
import { FilterRow, MonthInput } from '@/features/finance/components/FinanceFilters';
import { hasPermission } from '@/features/auth/authSlice';
import { useAppSelector } from '@/app/hooks';

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function PayrollSection(): JSX.Element {
  const user = useAppSelector((s) => s.auth.user);
  const canWrite = hasPermission(user, 'finance.payroll_write');

  const [month, setMonth] = useState(currentMonth());
  const [addOpen, setAddOpen] = useState(false);
  const { data, isLoading } = useGetPayrollQuery({ month });
  const [markPaid] = useMarkPayrollPaidMutation();
  const rows = data?.data ?? [];

  const totalNet = rows.reduce((a, r) => a + r.netPaise, 0);
  const totalAdvance = rows.reduce((a, r) => a + r.advancePaise, 0);
  const totalCommission = rows.reduce((a, r) => a + r.commissionPaise, 0);
  const paidCount = rows.filter((r) => r.paidAt).length;

  async function handleMarkPaid(id: string): Promise<void> {
    try {
      await markPaid(id).unwrap();
      toast.success('Marked paid');
    } catch {
      toast.error('Could not update');
    }
  }

  function handleCsv(): void {
    const csv: (string | number)[][] = [
      ['Payroll', month],
      [],
      ['Staff', 'Role', 'Base (₹)', 'Commission (₹)', 'Advance (₹)', 'Net (₹)', 'Paid on'],
      ...rows.map((r) => [
        r.userName,
        r.userRole,
        paiseToRupeeString(r.basePaise),
        paiseToRupeeString(r.commissionPaise),
        paiseToRupeeString(r.advancePaise),
        paiseToRupeeString(r.netPaise),
        r.paidAt ? new Date(r.paidAt).toLocaleDateString('en-IN') : 'Pending',
      ]),
    ];
    downloadCsv(`payroll-${month}.csv`, csv);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <FilterRow>
        <MonthInput value={month} onChange={setMonth} />
        <div className="sm:col-span-3 flex items-end justify-end gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          {canWrite && (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add / update payroll
            </Button>
          )}
        </div>
      </FilterRow>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          label="Net payroll"
          value={<Money paise={totalNet} />}
          tone="warning"
          delta={{ value: `${rows.length} staff`, direction: 'flat' }}
        />
        <MetricCard label="Commissions" value={<Money paise={totalCommission} />} />
        <MetricCard label="Advances given" value={<Money paise={totalAdvance} />} />
        <MetricCard
          label="Paid"
          value={`${paidCount} / ${rows.length}`}
          tone={paidCount === rows.length && rows.length > 0 ? 'success' : 'neutral'}
        />
      </section>

      <section className="rounded-md border border-ink-100 bg-ink-0">
        <header className="px-4 py-3 border-b border-ink-100">
          <h2 className="text-md font-medium text-ink-900">Payroll register · {month}</h2>
        </header>
        {isLoading && <p className="px-4 py-3 text-sm text-ink-500">Loading…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink-500">
            No payroll records for this month. {canWrite && 'Click “Add / update payroll” to start.'}
          </p>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
                <tr>
                  <th className="text-left px-4 py-2.5">Staff</th>
                  <th className="text-left px-4 py-2.5">Role</th>
                  <th className="text-right px-4 py-2.5">Base</th>
                  <th className="text-right px-4 py-2.5">Commission</th>
                  <th className="text-right px-4 py-2.5">Advance</th>
                  <th className="text-right px-4 py-2.5">Net</th>
                  <th className="text-right px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-medium text-ink-900">{r.userName}</td>
                    <td className="px-4 py-2 text-ink-600 text-xs">{r.userRole}</td>
                    <td className="px-4 py-2 text-right">
                      <Money paise={r.basePaise} />
                    </td>
                    <td className="px-4 py-2 text-right text-success-700">
                      <Money paise={r.commissionPaise} />
                    </td>
                    <td className="px-4 py-2 text-right text-warning-700">
                      <Money paise={r.advancePaise} />
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">
                      <Money paise={r.netPaise} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      {r.paidAt ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />{' '}
                          {new Date(r.paidAt).toLocaleDateString('en-IN')}
                        </span>
                      ) : canWrite ? (
                        <button
                          type="button"
                          onClick={() => void handleMarkPaid(r.id)}
                          className="text-xs text-brand-700 hover:underline"
                        >
                          Mark paid
                        </button>
                      ) : (
                        <span className="text-xs text-ink-500">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {addOpen && (
        <AddPayrollDialog month={month} onClose={() => setAddOpen(false)} />
      )}
    </div>
  );
}

function AddPayrollDialog({
  month,
  onClose,
}: {
  month: string;
  onClose: () => void;
}): JSX.Element {
  const { data: staffRes } = useGetFinanceStaffQuery();
  const staff = staffRes?.data ?? [];
  const [userId, setUserId] = useState('');
  const [basePaise, setBasePaise] = useState('');
  const [commissionPaise, setCommissionPaise] = useState('0');
  const [advancePaise, setAdvancePaise] = useState('0');
  const [paid, setPaid] = useState(false);
  const [createPayroll, { isLoading }] = useCreatePayrollMutation();

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!userId) {
      toast.error('Select a staff member');
      return;
    }
    try {
      await createPayroll({
        userId,
        month,
        basePaise: Math.round(Number(basePaise) * 100),
        commissionPaise: Math.round(Number(commissionPaise) * 100),
        advancePaise: Math.round(Number(advancePaise) * 100),
        paidAt: paid ? (new Date() as unknown as Date) : null,
      } as never).unwrap();
      toast.success('Payroll saved');
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
              <div>
                <Dialog.Title className="font-display text-[20px] text-ink-900">
                  Payroll · {month}
                </Dialog.Title>
                <p className="text-xs text-ink-500 mt-0.5">
                  Adds new row or updates existing one for the same month.
                </p>
              </div>
              <Dialog.Close className="text-ink-500 hover:text-ink-900 p-1" aria-label="Close">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <label className="block text-sm">
              <span className="text-[11px] uppercase tracking-wider text-ink-500">Staff</span>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="mt-1 w-full h-10 px-3 rounded-md border border-ink-200 text-sm"
                required
              >
                <option value="">Select…</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.role.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  Base (₹)
                </span>
                <Input
                  type="number"
                  value={basePaise}
                  onChange={(e) => setBasePaise(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  Commission (₹)
                </span>
                <Input
                  type="number"
                  value={commissionPaise}
                  onChange={(e) => setCommissionPaise(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  Advance (₹)
                </span>
                <Input
                  type="number"
                  value={advancePaise}
                  onChange={(e) => setAdvancePaise(e.target.value)}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={paid}
                onChange={(e) => setPaid(e.target.checked)}
                className="h-4 w-4"
              />
              <span>Mark as paid today</span>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
