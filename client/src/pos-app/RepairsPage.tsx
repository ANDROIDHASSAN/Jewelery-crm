// Repairs / job-work counter. Intake form + workshop board.

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Wrench } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money, Weight } from '@/components/ui/money';
import { cn } from '@/lib/cn';
import { useCreateRepairMutation, useListRepairsQuery, useUpdateRepairMutation } from './posFeaturesApi';

const STAGES = ['INTAKE', 'IN_WORKSHOP', 'READY', 'DELIVERED'] as const;
type Stage = (typeof STAGES)[number];

export function RepairsPage(): JSX.Element {
  const [filter, setFilter] = useState<Stage | 'ALL'>('ALL');
  const [opening, setOpening] = useState(false);
  const user = useAppSelector((s) => s.auth.user);
  const { data: shopsData } = useGetShopsQuery();
  const shopId = user?.shopId ?? shopsData?.data?.[0]?.id ?? '';
  const { data, isLoading } = useListRepairsQuery(
    { shopId, status: filter === 'ALL' ? undefined : filter },
    { skip: !shopId },
  );
  const [updateRepair] = useUpdateRepairMutation();

  const rows = data?.data ?? [];

  async function advance(id: string, next: Stage): Promise<void> {
    try {
      await updateRepair({ id, patch: { status: next } }).unwrap();
      toast.success(`Marked ${next.toLowerCase().replace('_', ' ')}`);
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Could not update');
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-eyebrow uppercase text-ink-500">Workshop</p>
          <h2 className="font-display text-display-sm text-ink-900">Repairs & job work</h2>
          <p className="text-sm text-ink-500 mt-1">
            Intake old pieces for re-polish, sizing, soldering. Track weight in/out and ETAs.
          </p>
        </div>
        <Button onClick={() => setOpening(true)}>
          <Plus className="h-4 w-4 mr-1.5" />New intake
        </Button>
      </header>

      <div className="flex gap-1">
        {(['ALL', ...STAGES] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              'px-3 h-8 rounded-md text-xs uppercase tracking-wider transition-colors',
              filter === s ? 'bg-ink-900 text-ink-0' : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
            )}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-ink-500">Loading…</p>}
      {!isLoading && rows.length === 0 && (
        <EmptyState eyebrow="No tickets" title="No repairs in this stage" body="Tap ‘New intake’ when a customer brings something in." />
      )}

      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-md border border-ink-100 bg-ink-0 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <Wrench className="h-5 w-5 text-ink-400 mt-0.5" />
                <div>
                  <div className="font-medium text-ink-900">{r.ticketNumber} · {r.customerName}</div>
                  <div className="text-xs text-ink-500 mt-0.5">{r.itemDescription}</div>
                  <div className="text-xs text-ink-500 mt-1">
                    Weight in <Weight mg={r.weightInMg} /> {r.weightOutMg ? <>· out <Weight mg={r.weightOutMg} /></> : null} ·
                    Est <Money paise={r.estimatedCostPaise} />
                    {r.advancePaise > 0 ? <> · adv <Money paise={r.advancePaise} /></> : null}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge tone={
                  r.status === 'DELIVERED' ? 'success' :
                  r.status === 'READY' ? 'info' :
                  r.status === 'CANCELLED' ? 'danger' : 'neutral'
                }>{r.status.replace('_', ' ')}</Badge>
                <div className="flex gap-1">
                  {nextStages(r.status as Stage).map((s) => (
                    <Button key={s} variant="outline" size="sm" onClick={() => void advance(r.id, s)}>
                      Mark {s.replace('_', ' ').toLowerCase()}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <IntakeSheet open={opening} onClose={() => setOpening(false)} shopId={shopId} />
    </div>
  );
}

function nextStages(current: Stage): Stage[] {
  switch (current) {
    case 'INTAKE': return ['IN_WORKSHOP'];
    case 'IN_WORKSHOP': return ['READY'];
    case 'READY': return ['DELIVERED'];
    default: return [];
  }
}

function IntakeSheet({ open, onClose, shopId }: { open: boolean; onClose: () => void; shopId: string }): JSX.Element {
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    itemDescription: '',
    weightGrams: '',
    purityCaratX100: 2200,
    problem: '',
    estimatedCostRupees: '',
    advanceRupees: '0',
  });
  const [submit, { isLoading }] = useCreateRepairMutation();

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!shopId) {
      toast.error('Pick a shop first');
      return;
    }
    try {
      await submit({
        shopId,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        itemDescription: form.itemDescription,
        weightInMg: Math.round(Number(form.weightGrams) * 1000),
        purityCaratX100: Number(form.purityCaratX100),
        problem: form.problem,
        estimatedCostPaise: Math.round(Number(form.estimatedCostRupees) * 100),
        advancePaise: Math.round(Number(form.advanceRupees) * 100),
      }).unwrap();
      toast.success('Repair intake created');
      onClose();
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Failed to create intake');
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-[480px] sm:max-w-none">
        <SheetHeader>
          <SheetTitle>New repair intake</SheetTitle>
        </SheetHeader>
        <form onSubmit={save} className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormRow label="Customer name">
              <Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} required minLength={2} />
            </FormRow>
            <FormRow label="Phone">
              <Input placeholder="+91…" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} required />
            </FormRow>
          </div>
          <FormRow label="Item description">
            <Input value={form.itemDescription} onChange={(e) => setForm({ ...form, itemDescription: e.target.value })} required />
          </FormRow>
          <div className="grid grid-cols-2 gap-3">
            <FormRow label="Weight (g)">
              <Input inputMode="decimal" value={form.weightGrams} onChange={(e) => setForm({ ...form, weightGrams: e.target.value })} required />
            </FormRow>
            <FormRow label="Purity">
              <select
                className="w-full h-9 rounded-md border border-ink-200 px-3 text-sm bg-ink-0"
                value={form.purityCaratX100}
                onChange={(e) => setForm({ ...form, purityCaratX100: Number(e.target.value) })}
              >
                <option value={2400}>24 carat</option>
                <option value={2200}>22 carat</option>
                <option value={1800}>18 carat</option>
                <option value={1400}>14 carat</option>
                <option value={0}>Silver</option>
              </select>
            </FormRow>
          </div>
          <FormRow label="Problem / job description">
            <Input value={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.value })} required />
          </FormRow>
          <div className="grid grid-cols-2 gap-3">
            <FormRow label="Estimated cost (₹)">
              <Input inputMode="numeric" value={form.estimatedCostRupees} onChange={(e) => setForm({ ...form, estimatedCostRupees: e.target.value })} required />
            </FormRow>
            <FormRow label="Advance taken (₹)">
              <Input inputMode="numeric" value={form.advanceRupees} onChange={(e) => setForm({ ...form, advanceRupees: e.target.value })} />
            </FormRow>
          </div>
          <Button type="submit" disabled={isLoading} className="w-full">{isLoading ? 'Saving…' : 'Create intake'}</Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-ink-600">{label}</Label>
      {children}
    </div>
  );
}
