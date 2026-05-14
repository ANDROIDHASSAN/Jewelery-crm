import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LEAD_STATUSES, type LeadStatus } from '@goldos/shared/constants';
import { useGetLeadsQuery, useUpdateLeadMutation } from '@/features/crm/crmApi';
import type { Lead } from '@goldos/shared/types';

const NEXT_STATUS: Record<LeadStatus, LeadStatus | null> = {
  NEW: 'CONTACTED',
  CONTACTED: 'INTERESTED',
  INTERESTED: 'NEGOTIATION',
  NEGOTIATION: 'CONVERTED',
  CONVERTED: null,
  LOST: null,
};

export function CrmPage(): JSX.Element {
  const { data, isLoading, isError } = useGetLeadsQuery(undefined, { pollingInterval: 30_000 });
  const [updateLead, { isLoading: updating }] = useUpdateLeadMutation();
  const [busyId, setBusyId] = useState<string | null>(null);

  const leads: Lead[] = data?.data ?? [];

  async function advance(lead: Lead): Promise<void> {
    const next = NEXT_STATUS[lead.status];
    if (!next) return;
    try {
      setBusyId(lead.id);
      await updateLead({ id: lead.id, status: next }).unwrap();
      toast.success(`${lead.name} → ${next.toLowerCase()}`);
    } catch {
      toast.error('Could not update lead');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-eyebrow uppercase text-ink-500">Lead CRM</p>
          <h1 className="font-display text-display-sm text-ink-900">Pipeline</h1>
        </div>
        {isLoading && <span className="text-xs text-ink-500">Loading…</span>}
        {isError && <span className="text-xs text-rose-600">Failed to load leads</span>}
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {LEAD_STATUSES.map((status) => {
          const items = leads.filter((s) => s.status === status);
          return (
            <div key={status} className="rounded-md border border-ink-100 bg-ink-0">
              <div className="px-3 py-2 border-b border-ink-100 flex items-center justify-between">
                <span className="text-eyebrow uppercase text-ink-500">{status.toLowerCase()}</span>
                <Badge tone="neutral">{items.length}</Badge>
              </div>
              <ul className="p-2 space-y-2">
                {items.map((l) => {
                  const next = NEXT_STATUS[l.status];
                  return (
                    <li
                      key={l.id}
                      className="rounded-md border border-ink-100 bg-ink-0 p-2.5 hover:border-brand-400 transition-colors duration-fast"
                    >
                      <p className="text-sm font-medium text-ink-800">{l.name}</p>
                      <p className="text-xs text-ink-500 font-mono">{l.phone}</p>
                      {l.interest && <p className="text-xs text-ink-600 mt-1">{l.interest}</p>}
                      <p className="text-xs text-ink-400 mt-1">via {l.source}</p>
                      {next && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 w-full text-xs"
                          disabled={updating && busyId === l.id}
                          onClick={() => void advance(l)}
                        >
                          {busyId === l.id ? '…' : `→ ${next.toLowerCase()}`}
                        </Button>
                      )}
                    </li>
                  );
                })}
                {items.length === 0 && (
                  <li className="text-center text-xs text-ink-400 py-4">—</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
