import { Badge } from '@/components/ui/badge';
import { LEAD_STATUSES, type LeadStatus } from '@goldos/shared/constants';

interface Lead {
  id: string;
  name: string;
  phone: string;
  source: string;
  status: LeadStatus;
  interest?: string;
}

const seed: Lead[] = [
  { id: '1', name: 'Mrs. Sharma', phone: '+91 99000 11111', source: 'Instagram', status: 'NEW', interest: '22K bangle' },
  { id: '2', name: 'Mr. Patel', phone: '+91 99000 22222', source: 'Website', status: 'CONTACTED', interest: 'Wedding set' },
  { id: '3', name: 'Ms. Iyer', phone: '+91 99000 33333', source: 'WhatsApp', status: 'INTERESTED', interest: 'Diamond earrings' },
  { id: '4', name: 'Mr. Khan', phone: '+91 99000 44444', source: 'Google Ads', status: 'NEGOTIATION', interest: 'Mangalsutra' },
  { id: '5', name: 'Mrs. Rao', phone: '+91 99000 55555', source: 'Walk-in', status: 'CONVERTED', interest: 'Anniversary gift' },
];

export function CrmPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <header>
        <p className="text-eyebrow uppercase text-ink-500">Lead CRM</p>
        <h1 className="font-display text-display-sm text-ink-900">Pipeline</h1>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {LEAD_STATUSES.map((status) => {
          const items = seed.filter((s) => s.status === status);
          return (
            <div key={status} className="rounded-md border border-ink-100 bg-ink-0">
              <div className="px-3 py-2 border-b border-ink-100 flex items-center justify-between">
                <span className="text-eyebrow uppercase text-ink-500">{status.toLowerCase()}</span>
                <Badge tone="neutral">{items.length}</Badge>
              </div>
              <ul className="p-2 space-y-2">
                {items.map((l) => (
                  <li key={l.id} className="rounded-md border border-ink-100 bg-ink-0 p-2.5 hover:border-brand-400 transition-colors duration-fast cursor-pointer">
                    <p className="text-sm font-medium text-ink-800">{l.name}</p>
                    <p className="text-xs text-ink-500 font-mono">{l.phone}</p>
                    {l.interest && <p className="text-xs text-ink-600 mt-1">{l.interest}</p>}
                    <p className="text-xs text-ink-400 mt-1">via {l.source}</p>
                  </li>
                ))}
                {items.length === 0 && <li className="text-center text-xs text-ink-400 py-4">—</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
