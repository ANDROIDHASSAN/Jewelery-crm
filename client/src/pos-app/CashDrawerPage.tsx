// Cash drawer page: shows the current open session's running totals + a
// quick pay-in / pay-out / deposit form. Day-close confirmation is the big
// red button at the bottom of the page — it computes expected cash and asks
// the cashier to count.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDownToLine, ArrowUpFromLine, ArrowRightLeft, Lock } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Money } from '@/components/ui/money';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  useCloseRegisterMutation,
  useExpectedCashQuery,
  useGetOpenSessionQuery,
  useRecordCashMovementMutation,
} from './posFeaturesApi';
import { cn } from '@/lib/cn';

export function CashDrawerPage(): JSX.Element {
  const user = useAppSelector((s) => s.auth.user);
  const { data: shopsData } = useGetShopsQuery();
  const shopId = user?.shopId ?? shopsData?.data?.[0]?.id ?? '';
  const { data: sessionData } = useGetOpenSessionQuery(shopId, { skip: !shopId });
  const session = sessionData?.data ?? null;

  if (!session) {
    return (
      <div className="max-w-md mx-auto px-6 py-12">
        <EmptyState eyebrow="No active till" title="Open the register first" body="Go to the Billing tab to count your opening float." />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <header className="space-y-1">
        <p className="text-eyebrow uppercase text-ink-500">Cash drawer</p>
        <h2 className="font-display text-display-sm text-ink-900">Today's till</h2>
        <p className="text-sm text-ink-500">
          Opened at {new Date(session.openedAt).toLocaleString('en-IN')} · float <Money paise={session.openingFloatPaise} />
        </p>
      </header>

      <SessionSummary session={session} />
      <NewMovementCard shopId={shopId} />
      <DayCloseCard sessionId={session.id} />
    </div>
  );
}

function SessionSummary({ session }: { session: { id: string; bills?: { totalPaise: number; payments: { mode: string; amountPaise: number }[] }[]; cashMovements?: { type: string; amountPaise: number }[] } }): JSX.Element {
  const totals = useMemo(() => {
    let cashSales = 0;
    let upiSales = 0;
    let cardSales = 0;
    let other = 0;
    for (const bill of session.bills ?? []) {
      for (const p of bill.payments) {
        if (p.mode === 'CASH') cashSales += p.amountPaise;
        else if (p.mode === 'UPI') upiSales += p.amountPaise;
        else if (p.mode === 'CARD') cardSales += p.amountPaise;
        else other += p.amountPaise;
      }
    }
    let payIn = 0;
    let payOut = 0;
    let deposit = 0;
    for (const m of session.cashMovements ?? []) {
      if (m.type === 'PAY_IN') payIn += m.amountPaise;
      else if (m.type === 'PAY_OUT') payOut += m.amountPaise;
      else if (m.type === 'DEPOSIT') deposit += m.amountPaise;
    }
    return { cashSales, upiSales, cardSales, other, payIn, payOut, deposit };
  }, [session]);

  return (
    <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Stat label="Cash sales" paise={totals.cashSales} />
      <Stat label="UPI sales" paise={totals.upiSales} />
      <Stat label="Card sales" paise={totals.cardSales} />
      <Stat label="Pay-out" paise={totals.payOut} tone="warn" />
    </section>
  );
}

function Stat({ label, paise, tone }: { label: string; paise: number; tone?: 'warn' }): JSX.Element {
  return (
    <div className={cn('rounded-md border border-ink-100 bg-ink-0 p-3', tone === 'warn' && 'border-warning-200 bg-warning-50')}>
      <div className="text-[10px] uppercase tracking-wider text-ink-500">{label}</div>
      <Money paise={paise} className="block mt-1 font-mono text-sm text-ink-900" />
    </div>
  );
}

function NewMovementCard({ shopId }: { shopId: string }): JSX.Element {
  const [type, setType] = useState<'PAY_IN' | 'PAY_OUT' | 'DEPOSIT'>('PAY_OUT');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submit, { isLoading }] = useRecordCashMovementMutation();

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const paise = Math.round(Number(amount) * 100);
    if (!paise || paise < 0) {
      toast.error('Enter an amount in rupees.');
      return;
    }
    try {
      await submit({ shopId, type, amountPaise: paise, reason }).unwrap();
      toast.success('Recorded');
      setAmount('');
      setReason('');
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Failed');
    }
  }

  return (
    <section className="rounded-md border border-ink-100 bg-ink-0 p-4 space-y-4">
      <h3 className="text-sm font-medium text-ink-700">Record a cash movement</h3>
      <div className="flex gap-1">
        {([
          { v: 'PAY_IN', label: 'Pay-in', icon: ArrowDownToLine },
          { v: 'PAY_OUT', label: 'Pay-out', icon: ArrowUpFromLine },
          { v: 'DEPOSIT', label: 'Bank deposit', icon: ArrowRightLeft },
        ] as const).map((t) => (
          <button
            key={t.v}
            onClick={() => setType(t.v)}
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs',
              type === t.v ? 'bg-ink-900 text-ink-0' : 'bg-ink-100 text-ink-700 hover:bg-ink-200',
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>
      <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="space-y-1.5 sm:col-span-1">
          <Label className="text-xs text-ink-600">Amount (₹)</Label>
          <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-ink-600">Reason</Label>
          <Input placeholder={type === 'PAY_OUT' ? 'Tea boy / petrol / staff' : 'Owner top-up / cash from safe'} value={reason} onChange={(e) => setReason(e.target.value)} required />
        </div>
        <Button type="submit" disabled={isLoading} className="sm:col-span-3">{isLoading ? 'Saving…' : 'Record'}</Button>
      </form>
    </section>
  );
}

function DayCloseCard({ sessionId }: { sessionId: string }): JSX.Element {
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const { data: expectedData, refetch } = useExpectedCashQuery(sessionId);
  const [close, { isLoading }] = useCloseRegisterMutation();

  const expectedPaise = expectedData?.data.expectedCashPaise ?? 0;
  const countedPaise = Math.round(Number(counted || '0') * 100);
  const variance = countedPaise - expectedPaise;

  async function onClose(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!confirm('Close the till for today? This locks all bills under this session.')) return;
    try {
      await close({ id: sessionId, countedCashPaise: countedPaise, notes: notes || null }).unwrap();
      toast.success('Till closed. Good night!');
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Failed to close');
    }
  }

  return (
    <section className="rounded-md border border-ink-200 bg-ink-25 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink-700">End-of-day close</h3>
        <button type="button" onClick={() => refetch()} className="text-xs text-ink-500 hover:text-ink-800">Refresh expected</button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Expected cash" paise={expectedPaise} />
        <Stat label="Counted cash" paise={countedPaise} />
        <div className={cn('rounded-md p-3 border', variance === 0 ? 'border-ink-100 bg-ink-0' : variance > 0 ? 'border-info-200 bg-info-50' : 'border-warning-200 bg-warning-50')}>
          <div className="text-[10px] uppercase tracking-wider text-ink-500">Variance</div>
          <Money paise={Math.abs(variance)} className="block mt-1 font-mono text-sm text-ink-900" />
          <div className="text-[10px] mt-0.5 text-ink-500">{variance === 0 ? 'spot on' : variance > 0 ? 'over' : 'short'}</div>
        </div>
      </div>
      <form onSubmit={onClose} className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-ink-600">Counted cash (₹)</Label>
          <Input inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="Count physical notes + coins" required />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-ink-600">Notes (optional)</Label>
          <Input placeholder="₹1,000 deposited to safe; coin tray short" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <Button type="submit" variant="danger" disabled={isLoading} className="w-full">
          <Lock className="h-4 w-4 mr-1.5" />
          {isLoading ? 'Closing…' : 'Close till for today'}
        </Button>
      </form>
    </section>
  );
}
