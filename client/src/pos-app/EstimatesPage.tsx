// Kachi parchi tab — estimates list. Created from the billing screen via
// "Save as estimate"; this page is the lookup/lifecycle view.

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import { useListEstimatesQuery } from './posFeaturesApi';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/money';
import { cn } from '@/lib/cn';

const STATUSES = ['DRAFT', 'SENT', 'CONVERTED', 'EXPIRED'] as const;

export function EstimatesPage(): JSX.Element {
  const [status, setStatus] = useState<typeof STATUSES[number] | 'ALL'>('ALL');
  const user = useAppSelector((s) => s.auth.user);
  const { data: shopsData } = useGetShopsQuery();
  const shopId = user?.shopId ?? shopsData?.data?.[0]?.id ?? '';
  const { data, isLoading } = useListEstimatesQuery(
    { shopId, status: status === 'ALL' ? undefined : status },
    { skip: !shopId },
  );

  const rows = data?.data ?? [];

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <header className="space-y-1">
        <p className="text-eyebrow uppercase text-ink-500">Quotes</p>
        <h2 className="font-display text-display-sm text-ink-900">Estimates</h2>
        <p className="text-sm text-ink-500">
          Kachi parchi — quotes you hand customers while they think it over. Today's rate is frozen for the
          validity window.
        </p>
      </header>

      <div className="flex gap-1">
        {(['ALL', ...STATUSES] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              'px-3 h-8 rounded-md text-xs uppercase tracking-wider transition-colors',
              status === s ? 'bg-ink-900 text-ink-0' : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-ink-500">Loading…</p>}
      {!isLoading && rows.length === 0 && (
        <EmptyState
          eyebrow="Nothing here"
          title="No estimates"
          body="Save a cart as an estimate from the billing screen to start your kachi parchi book."
        />
      )}

      <ul className="space-y-2">
        {rows.map((e) => {
          const expired = new Date(e.validUntil).getTime() < Date.now();
          return (
            <li key={e.id} className="rounded-md border border-ink-100 bg-ink-0 p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-ink-400" />
                <div>
                  <div className="font-medium text-ink-900">{e.estimateNumber} · {e.customerLabel}</div>
                  <div className="text-xs text-ink-500">
                    {e.customerPhone ?? '—'} · valid until {new Date(e.validUntil).toLocaleDateString('en-IN')}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Money paise={e.totalPaise} className="font-mono text-sm" />
                <Badge tone={
                  e.status === 'CONVERTED' ? 'success' :
                  e.status === 'EXPIRED' || expired ? 'warning' :
                  e.status === 'SENT' ? 'info' : 'neutral'
                }>{e.status}</Badge>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
