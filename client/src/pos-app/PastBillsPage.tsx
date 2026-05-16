// Past bills — search by phone / bill number, scroll through today's sales,
// quick void or partial-refund actions.

import { useState } from 'react';
import { toast } from 'sonner';
import { Search, X, ReceiptText } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Money } from '@/components/ui/money';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useGetBillsQuery } from '@/features/pos/posApi';
import { useRefundBillMutation, useVoidBillMutation } from './posFeaturesApi';

export function PastBillsPage(): JSX.Element {
  const user = useAppSelector((s) => s.auth.user);
  const { data: shopsData } = useGetShopsQuery();
  const shopId = user?.shopId ?? shopsData?.data?.[0]?.id ?? '';
  const [q, setQ] = useState('');
  const { data, isLoading } = useGetBillsQuery({ shopId });
  const [voidBill] = useVoidBillMutation();
  const [refundBill] = useRefundBillMutation();

  const bills = (data?.data ?? []).filter((b) =>
    q ? b.billNumber.toLowerCase().includes(q.toLowerCase()) : true,
  );

  async function onVoid(id: string): Promise<void> {
    const reason = prompt('Reason for void? (24-hour window only)');
    if (!reason || reason.trim().length < 3) {
      toast.message('Cancelled — reason is required.');
      return;
    }
    try {
      await voidBill({ id, reason }).unwrap();
      toast.success('Bill voided');
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Void failed');
    }
  }

  async function onRefund(billId: string, totalPaise: number): Promise<void> {
    const rupees = prompt(`Refund amount in ₹ (max ${(totalPaise / 100).toFixed(2)})?`);
    if (!rupees) return;
    const reason = prompt('Reason for refund?');
    if (!reason || reason.trim().length < 3) return;
    try {
      await refundBill({ billId, amountPaise: Math.round(Number(rupees) * 100), reason }).unwrap();
      toast.success('Refund recorded');
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Refund failed');
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <header className="space-y-1">
        <p className="text-eyebrow uppercase text-ink-500">History</p>
        <h2 className="font-display text-display-sm text-ink-900">Past bills</h2>
      </header>

      <div className="relative max-w-sm">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <Input
          placeholder="Search by bill number…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading && <p className="text-sm text-ink-500">Loading…</p>}
      {!isLoading && bills.length === 0 && (
        <EmptyState eyebrow="Nothing here" title="No bills yet" />
      )}

      <ul className="space-y-2">
        {bills.map((b) => (
          <li key={b.id} className="rounded-md border border-ink-100 bg-ink-0 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ReceiptText className="h-5 w-5 text-ink-400" />
              <div>
                <div className="font-medium text-ink-900">{b.billNumber}</div>
                <div className="text-xs text-ink-500">{new Date(b.createdAt).toLocaleString('en-IN')}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Money paise={b.totalPaise} className="font-mono text-sm" />
              <Badge tone={b.paymentStatus === 'PAID' ? 'success' : b.paymentStatus === 'REFUNDED' ? 'warning' : 'neutral'}>
                {b.paymentStatus}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => void onRefund(b.id, b.totalPaise)}>Refund</Button>
              <Button variant="outline" size="sm" onClick={() => void onVoid(b.id)}>
                <X className="h-4 w-4 mr-1" />Void
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
