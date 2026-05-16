// Advances / booking receipts: customer puts money down to lock today's
// rate against a future bridal order.

import { useState } from 'react';
import { toast } from 'sonner';
import { Banknote, Plus, X } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/money';
import { useCreateAdvanceMutation, useListAdvancesQuery, useRefundAdvanceMutation } from './posFeaturesApi';

export function AdvancesPage(): JSX.Element {
  const [opening, setOpening] = useState(false);
  const user = useAppSelector((s) => s.auth.user);
  const { data: shopsData } = useGetShopsQuery();
  const shopId = user?.shopId ?? shopsData?.data?.[0]?.id ?? '';
  const { data, isLoading } = useListAdvancesQuery({ shopId }, { skip: !shopId });
  const [refund] = useRefundAdvanceMutation();

  const rows = data?.data ?? [];

  async function onRefund(id: string): Promise<void> {
    if (!confirm('Refund this advance to the customer?')) return;
    try {
      await refund(id).unwrap();
      toast.success('Advance refunded');
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Refund failed');
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-eyebrow uppercase text-ink-500">Bookings</p>
          <h2 className="font-display text-display-sm text-ink-900">Advances</h2>
          <p className="text-sm text-ink-500 mt-1">Customer paid up front to lock the rate. Apply against a future bill.</p>
        </div>
        <Button onClick={() => setOpening(true)}>
          <Plus className="h-4 w-4 mr-1.5" />New advance
        </Button>
      </header>

      {isLoading && <p className="text-sm text-ink-500">Loading…</p>}
      {!isLoading && rows.length === 0 && (
        <EmptyState eyebrow="None" title="No active advances" body="Use this when a customer puts money down for a future order." />
      )}

      <ul className="space-y-2">
        {rows.map((a) => (
          <li key={a.id} className="rounded-md border border-ink-100 bg-ink-0 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Banknote className="h-5 w-5 text-ink-400" />
              <div>
                <div className="font-medium text-ink-900">{a.receiptNumber}</div>
                <div className="text-xs text-ink-500">
                  Created {new Date(a.createdAt).toLocaleDateString('en-IN')}
                  {a.validUntil ? <> · valid until {new Date(a.validUntil).toLocaleDateString('en-IN')}</> : null}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Money paise={a.amountPaise} className="font-mono text-sm" />
              <Badge tone={a.status === 'CONSUMED' ? 'success' : a.status === 'REFUNDED' ? 'warning' : 'info'}>{a.status}</Badge>
              {a.status === 'ACTIVE' && (
                <Button variant="outline" size="sm" onClick={() => void onRefund(a.id)}>
                  <X className="h-4 w-4 mr-1" />Refund
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <NewAdvanceSheet open={opening} onClose={() => setOpening(false)} shopId={shopId} />
    </div>
  );
}

function NewAdvanceSheet({ open, onClose, shopId }: { open: boolean; onClose: () => void; shopId: string }): JSX.Element {
  const [form, setForm] = useState({
    customerId: '',
    amountRupees: '',
    lockRates: true,
    validDays: 90,
    notes: '',
  });
  const [submit, { isLoading }] = useCreateAdvanceMutation();

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await submit({
        shopId,
        customerId: form.customerId,
        amountPaise: Math.round(Number(form.amountRupees) * 100),
        lockRates: form.lockRates,
        validDays: form.validDays,
        notes: form.notes || null,
      }).unwrap();
      toast.success('Advance receipt created');
      onClose();
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Failed');
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-[440px] sm:max-w-none">
        <SheetHeader><SheetTitle>New advance receipt</SheetTitle></SheetHeader>
        <form onSubmit={save} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-ink-600">Customer ID (paste from the customer lookup)</Label>
            <Input value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-ink-600">Amount (₹)</Label>
            <Input inputMode="numeric" value={form.amountRupees} onChange={(e) => setForm({ ...form, amountRupees: e.target.value })} required />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={form.lockRates}
              onChange={(e) => setForm({ ...form, lockRates: e.target.checked })}
            />
            Lock today's gold rates against this advance
          </label>
          <div className="space-y-1.5">
            <Label className="text-xs text-ink-600">Valid days</Label>
            <Input type="number" min={1} max={365} value={form.validDays} onChange={(e) => setForm({ ...form, validDays: Number(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-ink-600">Notes</Label>
            <Input placeholder="Bridal set for Aanya — Dec wedding" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <Button type="submit" disabled={isLoading} className="w-full">{isLoading ? 'Saving…' : 'Create advance'}</Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
