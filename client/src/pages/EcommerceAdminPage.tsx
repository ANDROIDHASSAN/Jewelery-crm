import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { Money } from '@/components/ui/money';
import { useGetOrdersQuery, useGetAdminProductsQuery } from '@/features/ecommerce/ecommerceApi';

const STATUS_TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  DELIVERED: 'success',
  SHIPPED: 'info',
  CONFIRMED: 'warning',
  PROCESSING: 'warning',
  PENDING: 'neutral',
  CANCELLED: 'neutral',
  RETURNED: 'neutral',
};

export function EcommerceAdminPage(): JSX.Element {
  const { data: orderRes, isLoading: ordersLoading, isError: ordersError } = useGetOrdersQuery(undefined, {
    pollingInterval: 60_000,
  });
  const { data: productRes, isLoading: productsLoading } = useGetAdminProductsQuery(undefined);

  const orders = orderRes?.data ?? [];
  const products = productRes?.data ?? [];

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

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-md border border-ink-100 bg-ink-0 p-5">
          <p className="text-eyebrow uppercase text-ink-500">Published products</p>
          <p className="mt-2 font-mono text-xl text-ink-900">
            {productsLoading ? '…' : products.filter((p) => p.active).length}
          </p>
          <p className="mt-1 text-xs text-ink-500">{products.length} total in catalog</p>
        </div>
        <div className="rounded-md border border-ink-100 bg-ink-0 p-5">
          <p className="text-eyebrow uppercase text-ink-500">Open orders</p>
          <p className="mt-2 font-mono text-xl text-ink-900">
            {ordersLoading
              ? '…'
              : orders.filter((o) => !['DELIVERED', 'CANCELLED', 'RETURNED'].includes(o.status)).length}
          </p>
        </div>
        <div className="rounded-md border border-ink-100 bg-ink-0 p-5">
          <p className="text-eyebrow uppercase text-ink-500">Revenue (this page)</p>
          <p className="mt-2 font-mono text-xl text-ink-900">
            <Money paise={orders.reduce((s, o) => s + o.totalPaise, 0)} />
          </p>
        </div>
      </section>

      <section className="rounded-md border border-ink-100 bg-ink-0 p-5">
        <h2 className="text-md font-medium text-ink-900">Latest orders</h2>
        {ordersError && <p className="mt-3 text-sm text-rose-600">Failed to load orders.</p>}
        <ul className="mt-3 divide-y divide-ink-100 text-sm">
          {ordersLoading && <li className="py-3 text-ink-500">Loading…</li>}
          {!ordersLoading && orders.length === 0 && (
            <li className="py-3 text-ink-500">No orders yet.</li>
          )}
          {orders.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-mono text-xs text-ink-500 truncate">{o.id}</p>
                <p className="text-ink-800 truncate">{o.customerId}</p>
              </div>
              <Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>{o.status.toLowerCase()}</Badge>
              <Money paise={o.totalPaise} className="font-mono tabular-nums text-ink-900" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
