// Parked bills: cashier put one customer on hold to ring up the next person.
// Tap a row to resume (handing the draft back to the billing screen via
// session-storage); tap "Abandon" to drop it.

import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Hand, RotateCw, Trash2 } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAbandonParkedMutation, useListParkedQuery, useResumeParkedMutation } from './posFeaturesApi';

const RESUME_KEY = 'zelora.pos.resumeDraft';

export function ParkedBillsPage(): JSX.Element {
  const user = useAppSelector((s) => s.auth.user);
  const { data: shopsData } = useGetShopsQuery();
  const shopId = user?.shopId ?? shopsData?.data?.[0]?.id ?? '';
  const { data, isLoading } = useListParkedQuery(shopId, { skip: !shopId });
  const [resume, { isLoading: resuming }] = useResumeParkedMutation();
  const [abandon] = useAbandonParkedMutation();
  const navigate = useNavigate();

  const parked = data?.data ?? [];

  async function onResume(id: string): Promise<void> {
    try {
      const result = await resume(id).unwrap();
      try {
        window.sessionStorage.setItem(RESUME_KEY, JSON.stringify(result.data));
      } catch {
        /* ignore */
      }
      toast.success('Bill resumed — back to billing.');
      navigate('/pos');
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Could not resume bill');
    }
  }

  async function onAbandon(id: string): Promise<void> {
    if (!confirm('Drop this parked bill? Cart contents are lost.')) return;
    await abandon(id).unwrap();
    toast.success('Parked bill discarded');
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <header className="space-y-1">
        <p className="text-eyebrow uppercase text-ink-500">In-flight</p>
        <h2 className="font-display text-display-sm text-ink-900">Parked bills</h2>
        <p className="text-sm text-ink-500">
          Customers you set aside while ringing up someone else. Tap to bring the cart back.
        </p>
      </header>

      {isLoading && <p className="text-sm text-ink-500">Loading…</p>}
      {!isLoading && parked.length === 0 && (
        <EmptyState
          eyebrow="Empty"
          title="No parked bills"
          body="When you ‘Park’ a bill mid-checkout, it lands here."
        />
      )}

      <ul className="space-y-2">
        {parked.map((p) => (
          <li key={p.id} className="rounded-md border border-ink-100 bg-ink-0 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Hand className="h-5 w-5 text-ink-400" />
              <div>
                <div className="font-medium text-ink-900">{p.customerLabel}</div>
                <div className="text-xs text-ink-500">
                  {p.customerPhone ?? 'No phone'} · parked {new Date(p.createdAt).toLocaleString('en-IN')}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void onAbandon(p.id)}>
                <Trash2 className="h-4 w-4 mr-1.5" />Abandon
              </Button>
              <Button size="sm" onClick={() => void onResume(p.id)} disabled={resuming}>
                <RotateCw className="h-4 w-4 mr-1.5" />Resume
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
