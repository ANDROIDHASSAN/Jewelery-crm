import { useMemo, useState } from 'react';
import { Plus, X, Pencil, Trash2, ChevronRight } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import {
  useGetOrdersQuery,
  useGetAdminProductsQuery,
  useCreateAdminProductMutation,
  useUpdateAdminProductMutation,
  useDeleteAdminProductMutation,
  useUpdateOrderMutation,
  type AdminProduct,
  type AdminOrder,
} from '@/features/ecommerce/ecommerceApi';
import { useGetCategoriesQuery } from '@/features/inventory/inventoryApi';
import { useGetLeadsQuery, useUpdateLeadMutation } from '@/features/crm/crmApi';
import { ORDER_STATUSES, type OrderStatus } from '@goldos/shared/constants';
import type { Lead } from '@goldos/shared/types';

const STATUS_TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  DELIVERED: 'success',
  SHIPPED: 'info',
  PACKED: 'info',
  CONFIRMED: 'warning',
  PENDING: 'neutral',
  CANCELLED: 'neutral',
  RETURNED: 'neutral',
};

// Storefront-sourced lead sources that should surface in the E-Commerce module.
// PDP "Reserve at store" emits `store-reservation`; the footer newsletter emits
// `newsletter`. Anything else (walk-in, instagram, etc.) stays in CRM only.
const STOREFRONT_SOURCES = new Set(['store-reservation', 'newsletter', 'storefront']);

export function EcommerceAdminPage(): JSX.Element {
  const [tab, setTab] = useState<'products' | 'orders' | 'reservations'>('products');
  const [productDialog, setProductDialog] = useState<{ open: boolean; editing?: AdminProduct }>({ open: false });
  const [orderDrawer, setOrderDrawer] = useState<AdminOrder | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');

  const { data: orderRes, isLoading: ordersLoading } = useGetOrdersQuery(
    statusFilter ? { status: statusFilter } : undefined,
    { pollingInterval: 30_000 },
  );
  const { data: productRes, isLoading: productsLoading } = useGetAdminProductsQuery();
  // Poll leads on 15s so a newly-placed reservation appears within a screen blink.
  const { data: leadsRes, isLoading: leadsLoading } = useGetLeadsQuery(undefined, {
    pollingInterval: 15_000,
  });

  const orders = orderRes?.data ?? [];
  const products = productRes?.data ?? [];
  const reservations = (leadsRes?.data ?? []).filter((l) => STOREFRONT_SOURCES.has(l.source));

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-eyebrow uppercase text-ink-500">E-commerce</p>
          <h1 className="font-display text-display-sm text-ink-900">Products &amp; orders</h1>
        </div>
        <Button onClick={() => setProductDialog({ open: true })}>
          <Plus className="h-4 w-4" /> Add product
        </Button>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPI label="Published products" value={productsLoading ? '…' : String(products.filter((p) => p.isPublished).length)}
          sub={`${products.length} total in catalog`} />
        <KPI label="Open orders"
          value={ordersLoading ? '…' : String(orders.filter((o) => !['DELIVERED', 'CANCELLED', 'RETURNED'].includes(o.status)).length)} />
        <KPI label="Open reservations"
          value={leadsLoading ? '…' : String(reservations.filter((l) => !['CONVERTED', 'LOST'].includes(l.status)).length)}
          sub={`${reservations.length} total · storefront`} />
        <KPI label="Revenue (this page)"
          value={<Money paise={orders.reduce((s, o) => s + o.totalPaise, 0)} />} />
      </section>

      <div className="flex gap-1 border-b border-ink-100">
        {([['products', 'Products'], ['orders', 'Orders'], ['reservations', `Reservations${reservations.length ? ` (${reservations.length})` : ''}`]] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-4 h-10 text-sm border-b-2 -mb-px ${tab === k ? 'border-brand-500 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'products' && (
        <ProductsTable
          products={products}
          loading={productsLoading}
          onEdit={(p) => setProductDialog({ open: true, editing: p })}
        />
      )}

      {tab === 'orders' && (
        <OrdersTable
          orders={orders}
          loading={ordersLoading}
          statusFilter={statusFilter}
          onFilter={setStatusFilter}
          onOpen={setOrderDrawer}
        />
      )}

      {tab === 'reservations' && (
        <ReservationsTable reservations={reservations} loading={leadsLoading} />
      )}

      <ProductDialog
        open={productDialog.open}
        editing={productDialog.editing}
        onClose={() => setProductDialog({ open: false })}
      />
      <OrderDrawer order={orderDrawer} onClose={() => setOrderDrawer(null)} />
    </div>
  );
}

function KPI({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }): JSX.Element {
  return (
    <div className="rounded-md border border-ink-100 bg-ink-0 p-5">
      <p className="text-eyebrow uppercase text-ink-500">{label}</p>
      <p className="mt-2 font-mono text-xl text-ink-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
    </div>
  );
}

function ProductsTable({
  products,
  loading,
  onEdit,
}: {
  products: AdminProduct[];
  loading: boolean;
  onEdit: (p: AdminProduct) => void;
}): JSX.Element {
  const [updateProduct] = useUpdateAdminProductMutation();
  const [deleteProduct] = useDeleteAdminProductMutation();

  async function togglePublish(p: AdminProduct): Promise<void> {
    try {
      await updateProduct({ id: p.id, patch: { isPublished: !p.isPublished } }).unwrap();
      toast.success(p.isPublished ? 'Unpublished' : 'Published');
    } catch {
      toast.error('Could not update product');
    }
  }

  async function handleDelete(p: AdminProduct): Promise<void> {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
      await deleteProduct(p.id).unwrap();
      toast.success('Product deleted');
    } catch {
      toast.error('Could not delete product');
    }
  }

  return (
    <section className="rounded-md border border-ink-100 bg-ink-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-eyebrow uppercase text-ink-500 border-b border-ink-100">
            <th className="px-4 py-3">Product</th>
            <th className="px-4 py-3">SKU</th>
            <th className="px-4 py-3">Weight</th>
            <th className="px-4 py-3">Purity</th>
            <th className="px-4 py-3 text-right">Price</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {loading && <tr><td colSpan={7} className="px-4 py-6 text-ink-500">Loading…</td></tr>}
          {!loading && products.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-6 text-ink-500">No products yet. Click <strong>Add product</strong>.</td></tr>
          )}
          {products.map((p) => (
            <tr key={p.id} className="hover:bg-ink-25">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {p.images[0] && (
                    <img src={p.images[0]} alt="" className="h-10 w-10 rounded object-cover" />
                  )}
                  <div>
                    <p className="text-ink-900">{p.name}</p>
                    <p className="text-xs text-ink-500">{p.descriptionMd.slice(0, 60)}…</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-ink-600">{p.slug}</td>
              <td className="px-4 py-3 tabular-nums">{(p.weightMg / 1000).toFixed(2)} g</td>
              <td className="px-4 py-3 tabular-nums">{p.purityCaratX100 < 1000 ? 'Silver' : `${p.purityCaratX100 / 100}K`}</td>
              <td className="px-4 py-3 text-right tabular-nums font-mono">
                <Money paise={p.basePricePaise + p.stoneChargePaise} />
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => void togglePublish(p)}
                  className={`text-xs px-2 py-1 rounded-full ${p.isPublished ? 'bg-success-100 text-success-700' : 'bg-ink-100 text-ink-600'}`}
                >
                  {p.isPublished ? 'Published' : 'Draft'}
                </button>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="inline-flex gap-1">
                  <button onClick={() => onEdit(p)} className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-ink-100" aria-label="Edit">
                    <Pencil className="h-4 w-4 text-ink-600" />
                  </button>
                  <button onClick={() => void handleDelete(p)} className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-danger-50" aria-label="Delete">
                    <Trash2 className="h-4 w-4 text-danger-600" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function OrdersTable({
  orders,
  loading,
  statusFilter,
  onFilter,
  onOpen,
}: {
  orders: AdminOrder[];
  loading: boolean;
  statusFilter: OrderStatus | '';
  onFilter: (s: OrderStatus | '') => void;
  onOpen: (o: AdminOrder) => void;
}): JSX.Element {
  return (
    <section className="rounded-md border border-ink-100 bg-ink-0">
      <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between gap-3">
        <h2 className="text-md font-medium text-ink-900">Orders</h2>
        <select
          value={statusFilter}
          onChange={(e) => onFilter(e.target.value as OrderStatus | '')}
          className="h-9 text-sm border border-ink-200 rounded-md px-2"
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <ul className="divide-y divide-ink-100 text-sm">
        {loading && <li className="px-4 py-3 text-ink-500">Loading…</li>}
        {!loading && orders.length === 0 && (
          <li className="px-4 py-3 text-ink-500">No orders.</li>
        )}
        {orders.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => onOpen(o)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-25 text-left"
            >
              <div className="min-w-0">
                <p className="font-mono text-xs text-ink-500 truncate">#{o.id.slice(-8).toUpperCase()}</p>
                <p className="text-ink-800 truncate">
                  {o.customer?.name ?? 'Walk-in'}{o.customer?.phone ? ` · ${o.customer.phone}` : ''}
                </p>
                <p className="text-xs text-ink-500 mt-0.5">
                  {o.items?.length ?? 0} item{(o.items?.length ?? 0) === 1 ? '' : 's'} · {o.paymentMethod}
                </p>
              </div>
              <Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>{o.status.toLowerCase()}</Badge>
              <Money paise={o.totalPaise} className="font-mono tabular-nums text-ink-900 w-28 text-right" />
              <ChevronRight className="h-4 w-4 text-ink-400" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface ProductForm {
  name: string;
  slug: string;
  categoryId: string;
  descriptionMd: string;
  imageUrls: string;
  weightG: string;
  purityCaratX100: number;
  makingChargeBps: number;
  basePriceRupees: string;
  stoneChargeRupees: string;
  isPublished: boolean;
}

function emptyForm(): ProductForm {
  return {
    name: '',
    slug: '',
    categoryId: '',
    descriptionMd: '',
    imageUrls: '',
    weightG: '',
    purityCaratX100: 2200,
    makingChargeBps: 1200,
    basePriceRupees: '',
    stoneChargeRupees: '0',
    isPublished: true,
  };
}

function ProductDialog({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing?: AdminProduct;
  onClose: () => void;
}): JSX.Element {
  const { data: categoriesRes } = useGetCategoriesQuery();
  const categories = categoriesRes?.data ?? [];
  const [form, setForm] = useState<ProductForm>(() =>
    editing
      ? {
          name: editing.name,
          slug: editing.slug,
          categoryId: editing.categoryId,
          descriptionMd: editing.descriptionMd,
          imageUrls: editing.images.join('\n'),
          weightG: (editing.weightMg / 1000).toString(),
          purityCaratX100: editing.purityCaratX100,
          makingChargeBps: editing.makingChargeBps,
          basePriceRupees: (editing.basePricePaise / 100).toString(),
          stoneChargeRupees: (editing.stoneChargePaise / 100).toString(),
          isPublished: editing.isPublished,
        }
      : emptyForm(),
  );

  // Reset form when modal opens with a different product.
  const editingId = editing?.id;
  const [lastEditingId, setLastEditingId] = useState<string | undefined>(editingId);
  if (open && editingId !== lastEditingId) {
    setLastEditingId(editingId);
    setForm(
      editing
        ? {
            name: editing.name,
            slug: editing.slug,
            categoryId: editing.categoryId,
            descriptionMd: editing.descriptionMd,
            imageUrls: editing.images.join('\n'),
            weightG: (editing.weightMg / 1000).toString(),
            purityCaratX100: editing.purityCaratX100,
            makingChargeBps: editing.makingChargeBps,
            basePriceRupees: (editing.basePricePaise / 100).toString(),
            stoneChargeRupees: (editing.stoneChargePaise / 100).toString(),
            isPublished: editing.isPublished,
          }
        : emptyForm(),
    );
  }

  const [createProduct, { isLoading: creating }] = useCreateAdminProductMutation();
  const [updateProduct, { isLoading: updating }] = useUpdateAdminProductMutation();
  const saving = creating || updating;

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const images = form.imageUrls
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (images.length === 0) {
      toast.error('Add at least one image URL (one per line)');
      return;
    }
    if (!form.categoryId) {
      toast.error('Select a category');
      return;
    }
    const weightMg = Math.round(Number(form.weightG) * 1000);
    const basePricePaise = Math.round(Number(form.basePriceRupees) * 100);
    const stoneChargePaise = Math.round(Number(form.stoneChargeRupees || '0') * 100);
    if (!Number.isFinite(weightMg) || weightMg < 1) {
      toast.error('Weight must be a positive number');
      return;
    }
    if (!Number.isFinite(basePricePaise) || basePricePaise < 1) {
      toast.error('Base price must be a positive number');
      return;
    }
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      categoryId: form.categoryId,
      descriptionMd: form.descriptionMd.trim(),
      images,
      weightMg,
      purityCaratX100: form.purityCaratX100,
      makingChargeBps: form.makingChargeBps,
      basePricePaise,
      stoneChargePaise,
      isPublished: form.isPublished,
    };
    try {
      if (editing) {
        await updateProduct({ id: editing.id, patch: payload }).unwrap();
        toast.success('Product updated');
      } else {
        await createProduct(payload).unwrap();
        toast.success('Product added');
      }
      onClose();
      setLastEditingId(undefined);
    } catch (err) {
      const message =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ??
        'Could not save product';
      toast.error(message);
    }
  }

  // Auto-suggest slug from name when creating new.
  function onNameChange(name: string): void {
    setForm((f) => ({
      ...f,
      name,
      slug: editing ? f.slug : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    }));
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-2xl max-h-[90vh] overflow-y-auto bg-ink-0 rounded-lg shadow-xl border border-ink-100">
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <Dialog.Title className="font-display text-[22px] text-ink-900">
                {editing ? 'Edit product' : 'Add product'}
              </Dialog.Title>
              <Dialog.Close className="text-ink-500 hover:text-ink-900 p-1" aria-label="Close">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Name">
                <Input value={form.name} onChange={(e) => onNameChange(e.target.value)} required />
              </Field>
              <Field label="Slug (URL)">
                <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required pattern="[a-z0-9]+(-[a-z0-9]+)*" />
              </Field>
              <Field label="Category">
                <select
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  className="h-10 w-full px-3 rounded-md border border-ink-200 text-sm"
                  required
                >
                  <option value="">Select…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Purity">
                <select
                  value={form.purityCaratX100}
                  onChange={(e) => setForm({ ...form, purityCaratX100: Number(e.target.value) })}
                  className="h-10 w-full px-3 rounded-md border border-ink-200 text-sm"
                >
                  <option value={2400}>24K (pure)</option>
                  <option value={2200}>22K</option>
                  <option value={1800}>18K</option>
                  <option value={1400}>14K</option>
                  <option value={925}>Silver (92.5)</option>
                </select>
              </Field>
              <Field label="Weight (grams)">
                <Input type="number" step="0.01" value={form.weightG} onChange={(e) => setForm({ ...form, weightG: e.target.value })} required />
              </Field>
              <Field label="Making charge (bps)">
                <Input type="number" min={0} max={10000} value={form.makingChargeBps} onChange={(e) => setForm({ ...form, makingChargeBps: Number(e.target.value) })} />
              </Field>
              <Field label="Base price (₹)">
                <Input type="number" step="1" value={form.basePriceRupees} onChange={(e) => setForm({ ...form, basePriceRupees: e.target.value })} required />
              </Field>
              <Field label="Stone charge (₹)">
                <Input type="number" step="1" value={form.stoneChargeRupees} onChange={(e) => setForm({ ...form, stoneChargeRupees: e.target.value })} />
              </Field>
            </div>

            <Field label="Description (Markdown)">
              <textarea
                value={form.descriptionMd}
                onChange={(e) => setForm({ ...form, descriptionMd: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 rounded-md border border-ink-200 text-sm"
              />
            </Field>

            <Field label="Image URLs (one per line)">
              <textarea
                value={form.imageUrls}
                onChange={(e) => setForm({ ...form, imageUrls: e.target.value })}
                rows={3}
                placeholder="https://…&#10;https://…"
                className="w-full px-3 py-2 rounded-md border border-ink-200 text-sm font-mono"
              />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isPublished}
                onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
              />
              Publish immediately (visible on storefront)
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add product'}</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="block text-sm">
      <span className="text-[11px] uppercase tracking-wider text-ink-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function OrderDrawer({ order, onClose }: { order: AdminOrder | null; onClose: () => void }): JSX.Element | null {
  const [updateOrder, { isLoading: updating }] = useUpdateOrderMutation();
  const [awb, setAwb] = useState(order?.shiprocketAwb ?? '');

  // Sync local AWB state on order change.
  const [lastOrderId, setLastOrderId] = useState<string | null>(order?.id ?? null);
  if (order && order.id !== lastOrderId) {
    setLastOrderId(order.id);
    setAwb(order.shiprocketAwb ?? '');
  }

  const nextStatuses = useMemo(() => {
    if (!order) return [] as OrderStatus[];
    const flow: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'];
    const idx = flow.indexOf(order.status);
    const forward = idx >= 0 && idx < flow.length - 1 ? [flow[idx + 1]!] : [];
    return Array.from(new Set([...forward, 'CANCELLED' as OrderStatus, 'RETURNED' as OrderStatus]));
  }, [order]);

  if (!order) return null;

  async function setStatus(status: OrderStatus): Promise<void> {
    try {
      await updateOrder({ id: order!.id, patch: { status } }).unwrap();
      toast.success(`Status → ${status.toLowerCase()}`);
    } catch {
      toast.error('Could not update status');
    }
  }

  async function saveAwb(): Promise<void> {
    try {
      await updateOrder({ id: order!.id, patch: { shiprocketAwb: awb.trim() || null } }).unwrap();
      toast.success('AWB saved');
    } catch {
      toast.error('Could not save AWB');
    }
  }

  return (
    <Dialog.Root open={!!order} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40" />
        <Dialog.Content className="fixed right-0 top-0 z-50 h-full w-[92vw] max-w-md bg-ink-0 shadow-xl border-l border-ink-100 overflow-y-auto">
          <div className="p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-eyebrow uppercase text-ink-500">Order</p>
                <Dialog.Title className="font-display text-[22px] text-ink-900">#{order.id.slice(-8).toUpperCase()}</Dialog.Title>
                <p className="text-xs text-ink-500 mt-0.5">{new Date(order.createdAt).toLocaleString('en-IN')}</p>
              </div>
              <Dialog.Close className="text-ink-500 hover:text-ink-900 p-1" aria-label="Close">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <div className="rounded-md border border-ink-100 p-3 space-y-1 text-sm">
              <p className="text-eyebrow uppercase text-ink-500">Customer</p>
              <p className="text-ink-900">{order.customer?.name ?? 'Walk-in'}</p>
              {order.customer?.phone && <p className="font-mono text-xs text-ink-600">{order.customer.phone}</p>}
            </div>

            <div className="space-y-2">
              <p className="text-eyebrow uppercase text-ink-500">Items</p>
              <ul className="divide-y divide-ink-100 text-sm">
                {(order.items ?? []).map((it) => (
                  <li key={it.id} className="py-2 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-ink-500 truncate">{it.productId}</p>
                      <p className="text-xs text-ink-500">Qty {it.qty}</p>
                    </div>
                    <Money paise={it.pricePaise * it.qty} className="font-mono tabular-nums" />
                  </li>
                ))}
              </ul>
              <div className="pt-2 border-t border-ink-100 space-y-1 text-sm">
                <Row label="Subtotal"><Money paise={order.subtotalPaise} /></Row>
                <Row label="Shipping"><Money paise={order.shippingPaise} /></Row>
                <Row label="Tax"><Money paise={order.taxPaise} /></Row>
                <div className="flex justify-between pt-1 border-t border-ink-100">
                  <span className="text-ink-900 font-medium">Total</span>
                  <Money paise={order.totalPaise} className="font-mono tabular-nums text-ink-900 font-medium" />
                </div>
              </div>
            </div>

            <div>
              <p className="text-eyebrow uppercase text-ink-500 mb-2">Status: <Badge tone={STATUS_TONE[order.status] ?? 'neutral'}>{order.status.toLowerCase()}</Badge></p>
              <div className="flex flex-wrap gap-2">
                {nextStatuses.map((s) => (
                  <Button key={s} variant="secondary" size="sm" onClick={() => void setStatus(s)} disabled={updating}>
                    → {s.toLowerCase()}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-eyebrow uppercase text-ink-500 mb-2">Tracking (Shiprocket AWB)</p>
              <div className="flex gap-2">
                <Input value={awb} onChange={(e) => setAwb(e.target.value)} placeholder="AWB number" />
                <Button onClick={() => void saveAwb()} disabled={updating} variant="secondary">Save</Button>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-500">{label}</span>
      <span>{children}</span>
    </div>
  );
}

// Storefront reservations live in the `Lead` table with source = 'store-reservation'.
// We parse the freeform `interest` field (formatted by the PDP modal as
// "RESERVE: <name> · <weight/purity> · Size … · Qty … · Total … · Store: … · Visit by: …")
// so each row can show the actual reserved piece, total, and visit date.
function parseReservation(interest: string | null | undefined): {
  product: string;
  details: string;
  totalLabel: string | null;
  store: string | null;
  visitBy: string | null;
} {
  if (!interest) return { product: '—', details: '', totalLabel: null, store: null, visitBy: null };
  const parts = interest.split(' · ').map((p) => p.trim());
  const productPart = parts[0] ?? '';
  const product = productPart.replace(/^RESERVE:\s*/i, '') || productPart;
  const details = parts[1] ?? '';
  const total = parts.find((p) => p.toLowerCase().startsWith('total ')) ?? null;
  const store = parts.find((p) => p.toLowerCase().startsWith('store:'))?.replace(/^store:\s*/i, '') ?? null;
  const visitBy = parts.find((p) => p.toLowerCase().startsWith('visit by:'))?.replace(/^visit by:\s*/i, '') ?? null;
  return { product, details, totalLabel: total, store, visitBy };
}

const LEAD_STATUS_TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  NEW: 'warning',
  CONTACTED: 'info',
  INTERESTED: 'info',
  NEGOTIATION: 'info',
  CONVERTED: 'success',
  LOST: 'neutral',
};

function ReservationsTable({
  reservations,
  loading,
}: {
  reservations: Lead[];
  loading: boolean;
}): JSX.Element {
  const [updateLead, { isLoading: updating }] = useUpdateLeadMutation();

  async function markConverted(id: string): Promise<void> {
    try {
      await updateLead({ id, status: 'CONVERTED' }).unwrap();
      toast.success('Marked converted');
    } catch {
      toast.error('Could not update reservation');
    }
  }

  async function markLost(id: string): Promise<void> {
    try {
      await updateLead({ id, status: 'LOST' }).unwrap();
      toast.success('Marked lost');
    } catch {
      toast.error('Could not update reservation');
    }
  }

  return (
    <section className="rounded-md border border-ink-100 bg-ink-0">
      <header className="px-4 py-3 border-b border-ink-100">
        <h2 className="text-md font-medium text-ink-900">Storefront reservations</h2>
        <p className="text-xs text-ink-500 mt-0.5">
          Every &ldquo;Reserve at store&rdquo; from the public site lands here in real time.
          {reservations.length > 0 && ` · ${reservations.length} total`}
        </p>
      </header>
      {loading && <p className="px-4 py-6 text-sm text-ink-500">Loading…</p>}
      {!loading && reservations.length === 0 && (
        <p className="px-4 py-6 text-sm text-ink-500">
          No reservations yet. Place one from <code className="font-mono">/store</code> to see it appear here within 15 seconds.
        </p>
      )}
      {reservations.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-eyebrow uppercase text-ink-500">
            <tr>
              <th className="text-left px-4 py-2">When</th>
              <th className="text-left px-4 py-2">Customer</th>
              <th className="text-left px-4 py-2">Piece reserved</th>
              <th className="text-left px-4 py-2">Visit by · Store</th>
              <th className="text-right px-4 py-2">Total</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {reservations.map((l) => {
              const p = parseReservation(l.interest);
              return (
                <tr key={l.id} className="hover:bg-ink-25">
                  <td className="px-4 py-3 font-mono text-xs text-ink-700 whitespace-nowrap">
                    {new Date(l.createdAt).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink-900">{l.name}</p>
                    <p className="font-mono text-xs text-ink-500">{l.phone}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink-900">{p.product}</p>
                    {p.details && <p className="text-xs text-ink-500">{p.details}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-600">
                    {p.visitBy && <p>{p.visitBy}</p>}
                    {p.store && <p className="text-ink-500">{p.store}</p>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-900">
                    {p.totalLabel?.replace(/^total\s*/i, '') ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={LEAD_STATUS_TONE[l.status] ?? 'neutral'}>{l.status.toLowerCase()}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex gap-1">
                      <a
                        href={`https://wa.me/${l.phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-brand-700 hover:underline"
                      >
                        WhatsApp
                      </a>
                      {l.status !== 'CONVERTED' && l.status !== 'LOST' && (
                        <>
                          <span className="text-ink-300">·</span>
                          <button
                            onClick={() => void markConverted(l.id)}
                            disabled={updating}
                            className="text-xs text-success-700 hover:underline"
                          >
                            Convert
                          </button>
                          <span className="text-ink-300">·</span>
                          <button
                            onClick={() => void markLost(l.id)}
                            disabled={updating}
                            className="text-xs text-ink-500 hover:underline"
                          >
                            Lost
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
