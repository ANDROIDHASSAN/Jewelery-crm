import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';

export function EcommerceAdminPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-eyebrow uppercase text-ink-500">E-commerce</p>
          <h1 className="font-display text-display-sm text-ink-900">Products & orders</h1>
        </div>
        <Button>
          <Plus className="h-4 w-4" /> Add product
        </Button>
      </header>
      <section className="rounded-md border border-ink-100 bg-ink-0 p-5">
        <h2 className="text-md font-medium text-ink-900">Latest orders</h2>
        <ul className="mt-3 divide-y divide-ink-100 text-sm">
          {[
            { id: 'ORD-2042', name: 'Rhea Iyer', status: 'CONFIRMED', amount: '₹84,500.00' },
            { id: 'ORD-2041', name: 'Mr. Khan', status: 'SHIPPED', amount: '₹1,24,000.00' },
            { id: 'ORD-2040', name: 'Mrs. Rao', status: 'DELIVERED', amount: '₹2,18,000.00' },
          ].map((o) => (
            <li key={o.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-mono text-xs text-ink-500">{o.id}</p>
                <p className="text-ink-800">{o.name}</p>
              </div>
              <Badge tone={o.status === 'DELIVERED' ? 'success' : o.status === 'SHIPPED' ? 'info' : 'warning'}>
                {o.status.toLowerCase()}
              </Badge>
              <span className="font-mono tabular-nums text-ink-900">{o.amount}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
