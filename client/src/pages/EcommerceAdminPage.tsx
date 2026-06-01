import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, X, Pencil, Trash2, ChevronRight, List, Kanban as KanbanIcon, Upload, Link2, Clock, CheckCircle2, Package, Truck, XCircle, RotateCcw, MapPin, FileDown } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import { PageHeader } from '@/components/ui/PageHeader';
import { TabStrip, type TabStripItem } from '@/components/ui/TabStrip';
import { TableToolbar, useTableSearch } from '@/components/data/TableToolbar';
import { uploadImageToCloudinary, isCloudinaryConfigured, cloudinaryThumb } from '@/lib/cloudinary';
import { downloadPdf } from '@/lib/downloadPdf';
import {
  useGetOrdersQuery,
  useGetOrderDetailQuery,
  useGetOrdersLiveCountQuery,
  useGetAdminProductsQuery,
  useCreateAdminProductMutation,
  useUpdateAdminProductMutation,
  useDeleteAdminProductMutation,
  useUpdateOrderMutation,
  type AdminProduct,
  type AdminOrder,
  type OrderPatchPayload,
} from '@/features/ecommerce/ecommerceApi';
import { useGetCategoriesQuery } from '@/features/inventory/inventoryApi';
import { ORDER_STATUSES, type OrderStatus } from '@goldos/shared/constants';

const STATUS_TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  DELIVERED: 'success',
  SHIPPED: 'info',
  PACKED: 'info',
  CONFIRMED: 'warning',
  PENDING: 'neutral',
  CANCELLED: 'neutral',
  RETURNED: 'neutral',
};

// Reservations = storefront orders placed with paymentMethod === 'reserve-at-store'.
// The order itself is the source of truth (a Lead-mirror is best-effort and can
// silently fail), so the Reservations tab reads directly from the orders feed.
const RESERVATION_PAYMENT_METHOD = 'reserve-at-store';

export function EcommerceAdminPage(): JSX.Element {
  const [tab, setTab] = useState<'products' | 'orders' | 'reservations'>('products');
  const [productDialog, setProductDialog] = useState<{ open: boolean; editing?: AdminProduct }>({ open: false });
  const [orderDrawer, setOrderDrawer] = useState<AdminOrder | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  // Orders sub-view: flat list or kanban board (status pipeline).
  const [ordersView, setOrdersView] = useState<'list' | 'board'>('list');

  // Deep-link support — NotificationBell (and any other caller) navigates here
  // with `?orderId=…` to auto-open the drawer for that specific order. We
  // strip the param once the drawer closes so a manual refresh doesn't keep
  // re-opening it.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkOrderId = searchParams.get('orderId');

  // Tighter polling on orders so a freshly placed online order pops in
  // within 10 seconds. live-count is a cheaper aggregate so it can run on
  // the same cadence without adding noticeable DB load.
  const { data: orderRes, isLoading: ordersLoading } = useGetOrdersQuery(
    statusFilter ? { status: statusFilter } : undefined,
    { pollingInterval: 10_000 },
  );
  const { data: liveCountRes } = useGetOrdersLiveCountQuery(undefined, {
    pollingInterval: 10_000,
  });
  const liveCount = liveCountRes?.data;
  const { data: productRes, isLoading: productsLoading } = useGetAdminProductsQuery();

  const orders = orderRes?.data ?? [];
  const products = productRes?.data ?? [];
  const reservations = orders.filter((o) => o.paymentMethod === RESERVATION_PAYMENT_METHOD);
  // All COUNT displays read from liveCount, which is a tenant-wide DB
  // aggregate. The page-array `orders` is paginated (max 50 rows), so any
  // count derived from it diverges from reality once a shop has >50 orders.
  // Keep these aliases readable so the JSX below is easy to scan.
  const pendingCount = liveCount?.byStatus.PENDING ?? 0;
  const openOrdersCount = liveCount?.open ?? 0;
  const reservationsTotalCount = liveCount?.reservationsTotal ?? 0;
  const reservationsOpenCount = liveCount?.reservationsOpen ?? 0;
  const productsTotalCount = liveCount?.productsTotal ?? 0;
  const productsPublishedCount = liveCount?.productsPublished ?? 0;
  const revenuePaise = liveCount?.revenuePaise ?? 0;
  const needsActionCount = liveCount?.needsAction ?? 0;

  // Note: the "new order arrived" toast lives globally in NotificationBell
  // (TopBar) now — fires on every admin page, not just this one. Removing
  // the duplicate here so the user doesn't see two toasts on a fresh order.

  // Fast path: if the deep-linked order is in the current page-array
  // (typical for notification-bell clicks since those show recent orders),
  // we have the full row already and can open the drawer immediately.
  // Slow path: not in the page → fire a one-shot detail fetch and use that.
  const orderInList = deepLinkOrderId ? orders.find((o) => o.id === deepLinkOrderId) : undefined;
  const { data: deepLinkOrderRes } = useGetOrderDetailQuery(deepLinkOrderId ?? '', {
    skip: !deepLinkOrderId || Boolean(orderInList),
  });
  const deepLinkOrder = orderInList ?? deepLinkOrderRes?.data;

  useEffect(() => {
    if (!deepLinkOrderId || !deepLinkOrder) return;
    // Avoid re-opening the drawer if it's already on this order — the user
    // could have closed it manually and we shouldn't yank them back in.
    if (orderDrawer?.id === deepLinkOrderId) return;
    setOrderDrawer(deepLinkOrder);
    setTab('orders');
    // Intentionally not depending on orderDrawer.id — that would re-fire
    // every time the drawer state changes and fight with manual closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkOrderId, deepLinkOrder]);

  // Strip ?orderId= when the drawer closes so a page refresh doesn't
  // re-open it. Manual close + back-button history are both preserved.
  function closeOrderDrawer(): void {
    setOrderDrawer(null);
    if (searchParams.has('orderId')) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('orderId');
          return next;
        },
        { replace: true },
      );
    }
  }

  const ecommerceTabs: TabStripItem<'products' | 'orders' | 'reservations'>[] = [
    { id: 'products', label: 'Products' },
    {
      id: 'orders',
      label: 'Orders',
      count: pendingCount > 0 ? pendingCount : undefined,
      countTone: 'danger',
      countTitle: pendingCount > 0 ? `${pendingCount} pending` : undefined,
    },
    {
      id: 'reservations',
      label: 'Reservations',
      count: reservationsTotalCount > 0 ? reservationsTotalCount : undefined,
      countTone: 'neutral',
      countTitle: reservationsTotalCount > 0 ? `${reservationsTotalCount} total` : undefined,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Module 04 · E-commerce"
        title="Products & orders"
        description="Catalog, online orders, in-store reservations — synced from the storefront and POS on a 10-second cadence."
        actions={
          <Button onClick={() => setProductDialog({ open: true })}>
            <Plus className="h-4 w-4" /> Add product
          </Button>
        }
        bare
      />

      {/* Live banner — every count below also reads from this same
          tenant-wide aggregate (revenuePaise, productsTotal, etc.) so the
          numbers are in sync. Refreshes on the 10s polling tick. */}
      <LiveOrdersBanner liveCount={liveCount} />

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KPI
          label="Published products"
          value={liveCount ? String(productsPublishedCount) : '…'}
          sub={`${productsTotalCount} total in catalog`}
        />
        <KPI
          label="Open orders"
          value={liveCount ? String(openOrdersCount) : '…'}
          sub={
            needsActionCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-danger-700 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-danger-500 animate-pulse" />
                {needsActionCount} sitting &gt;30 min · needs action
              </span>
            ) : pendingCount > 0 ? (
              <span className="text-ink-500">{pendingCount} pending</span>
            ) : undefined
          }
        />
        <KPI
          label="Open reservations"
          value={liveCount ? String(reservationsOpenCount) : '…'}
          sub={`${reservationsTotalCount} total · storefront`}
        />
        <KPI
          label="Total revenue"
          value={liveCount ? <Money paise={revenuePaise} /> : '…'}
          sub={`across ${liveCount?.total ?? 0} orders`}
        />
      </section>

      <TabStrip<'products' | 'orders' | 'reservations'>
        items={ecommerceTabs}
        value={tab}
        onChange={setTab}
      />

      {tab === 'products' && (
        <ProductsTable
          products={products}
          loading={productsLoading}
          onEdit={(p) => setProductDialog({ open: true, editing: p })}
        />
      )}

      {tab === 'orders' && (
        <div className="space-y-3">
          {/* List ↔ Board view toggle. Both render the same `orders` array;
              the board groups by status and supports drag-to-transition. */}
          <div className="flex items-center justify-end">
            <div className="inline-flex rounded-md border border-ink-200 overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setOrdersView('list')}
                className={`px-3 h-9 inline-flex items-center gap-1.5 ${ordersView === 'list' ? 'bg-ink-900 text-ink-0' : 'text-ink-700 hover:bg-ink-50'}`}
              >
                <List className="h-3.5 w-3.5" /> List
              </button>
              <button
                type="button"
                onClick={() => setOrdersView('board')}
                className={`px-3 h-9 inline-flex items-center gap-1.5 ${ordersView === 'board' ? 'bg-ink-900 text-ink-0' : 'text-ink-700 hover:bg-ink-50'}`}
              >
                <KanbanIcon className="h-3.5 w-3.5" /> Board
              </button>
            </div>
          </div>

          {ordersView === 'list' ? (
            <OrdersTable
              orders={orders}
              loading={ordersLoading}
              statusFilter={statusFilter}
              onFilter={setStatusFilter}
              onOpen={setOrderDrawer}
            />
          ) : (
            <OrdersBoard
              orders={orders}
              loading={ordersLoading}
              onOpen={setOrderDrawer}
              liveCount={liveCount}
            />
          )}
        </div>
      )}

      {tab === 'reservations' && (
        <ReservationsTable reservations={reservations} loading={ordersLoading} />
      )}

      <ProductDialog
        open={productDialog.open}
        editing={productDialog.editing}
        onClose={() => setProductDialog({ open: false })}
      />
      <OrderDrawer order={orderDrawer} onClose={closeOrderDrawer} />
    </div>
  );
}

function KPI({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="rounded-md border border-ink-100 bg-ink-0 p-5">
      <p className="text-eyebrow uppercase text-ink-500">{label}</p>
      <p className="mt-2 font-mono text-xl text-ink-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
    </div>
  );
}

// Live banner showing total online activity right now. Each chip pulses
// when its number is non-zero so the cashier can scan the row in 200ms and
// know whether the workshop has anything backed up.
function LiveOrdersBanner({
  liveCount,
}: {
  liveCount: import('@/features/ecommerce/ecommerceApi').OrderLiveCount | undefined;
}): JSX.Element | null {
  if (!liveCount) {
    return (
      <div className="rounded-md border border-ink-100 bg-gradient-to-r from-brand-50 to-ink-25 px-5 py-4">
        <div className="h-4 w-72 bg-ink-100 rounded animate-pulse" />
      </div>
    );
  }
  const chips: Array<{ label: string; value: number; accent: string; pulse?: boolean }> = [
    {
      label: 'New (PENDING)',
      value: liveCount.byStatus.PENDING ?? 0,
      accent: 'bg-warning-500',
      pulse: (liveCount.byStatus.PENDING ?? 0) > 0,
    },
    { label: 'Confirmed', value: liveCount.byStatus.CONFIRMED ?? 0, accent: 'bg-info-500' },
    { label: 'Packed', value: liveCount.byStatus.PACKED ?? 0, accent: 'bg-info-500' },
    {
      label: 'In transit',
      value: liveCount.byStatus.SHIPPED ?? 0,
      accent: 'bg-info-500',
      pulse: liveCount.inTransit > 0,
    },
    { label: 'Delivered', value: liveCount.byStatus.DELIVERED ?? 0, accent: 'bg-success-500' },
  ];
  const updated = new Date(liveCount.asOf);
  return (
    <div className="rounded-md border border-ink-100 bg-gradient-to-r from-brand-50/40 via-ink-0 to-ink-25 p-4 sm:p-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="relative inline-flex h-2.5 w-2.5">
            <span className="absolute inset-0 rounded-full bg-success-400 animate-ping opacity-60" />
            <span className="relative rounded-full bg-success-500 h-2.5 w-2.5" />
          </span>
          <p className="text-eyebrow uppercase text-ink-700 font-semibold">Live · online orders</p>
          <p className="text-[10px] text-ink-400 hidden sm:inline">
            updated {updated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>
        {liveCount.needsAction > 0 && (
          <p className="inline-flex items-center gap-2 text-xs text-danger-700 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-danger-500 animate-pulse" />
            {liveCount.needsAction} order{liveCount.needsAction === 1 ? '' : 's'} sitting in PENDING for &gt;30 min
          </p>
        )}
      </div>
      <ul className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {chips.map((c) => (
          <li
            key={c.label}
            className="rounded-md bg-ink-0 border border-ink-100 px-4 py-3 flex items-center gap-3"
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${c.accent} ${c.pulse ? 'animate-pulse' : ''}`}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-ink-500">{c.label}</p>
              <p className="font-mono tabular-nums text-lg text-ink-900">{c.value}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProductsTable({
  products: allProducts,
  loading,
  onEdit,
}: {
  products: AdminProduct[];
  loading: boolean;
  onEdit: (p: AdminProduct) => void;
}): JSX.Element {
  const [updateProduct] = useUpdateAdminProductMutation();
  const [deleteProduct] = useDeleteAdminProductMutation();
  const [search, setSearch] = useState('');
  const [publishFilter, setPublishFilter] = useState('');
  const preFiltered = useMemo(
    () =>
      publishFilter === ''
        ? allProducts
        : allProducts.filter((p) =>
            publishFilter === 'published' ? p.isPublished : !p.isPublished,
          ),
    [allProducts, publishFilter],
  );
  const products = useTableSearch(
    preFiltered,
    (p) => [p.name, p.slug, p.descriptionMd],
    search,
  );

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
    <>
    <TableToolbar
      query={search}
      onQueryChange={setSearch}
      searchPlaceholder="Search products by name, slug or description…"
      filters={[
        {
          key: 'publish',
          label: 'Published',
          value: publishFilter,
          onChange: setPublishFilter,
          options: [
            { value: '', label: 'All products' },
            { value: 'published', label: 'Published only' },
            { value: 'draft', label: 'Drafts only' },
          ],
        },
      ]}
      count={products.length}
      countLabel={products.length === 1 ? 'product' : 'products'}
    />
    <section className="rounded-md border border-ink-100 bg-ink-0 overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[800px]">
        <thead>
          <tr className="text-left text-eyebrow uppercase text-ink-500 border-b border-ink-100">
            <th className="sticky left-0 z-10 bg-ink-0 px-4 py-3 lg:static lg:bg-transparent">Product</th>
            <th className="px-4 py-3">Slug</th>
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
            <tr key={p.id} className="group hover:bg-ink-25">
              <td className="sticky left-0 z-10 bg-ink-0 px-4 py-3 group-hover:bg-ink-25 lg:static lg:bg-transparent lg:group-hover:bg-transparent">
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
              <td className="px-4 py-3 tabular-nums">
                {p.purityCaratX100 === 0
                  ? 'Silver'
                  : p.purityCaratX100 === 9500
                    ? 'Pt 950'
                    : `${p.purityCaratX100 / 100}K`}
              </td>
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
      </div>
    </section>
    </>
  );
}

function OrdersTable({
  orders: allOrders,
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
  const [search, setSearch] = useState('');
  const orders = useTableSearch(
    allOrders,
    (o) => [
      o.id,
      o.customer?.name,
      o.customer?.phone,
      o.paymentMethod,
      o.status,
    ],
    search,
  );
  const [updateOrder, { isLoading: updating }] = useUpdateOrderMutation();
  // Lifted cancel-reason dialog so the inline status select can fire it when
  // a row is dragged to CANCELLED / RETURNED. The drawer keeps its own dialog
  // for the same purpose; they're independent state lanes.
  const [cancelPrompt, setCancelPrompt] = useState<
    { orderId: string; target: OrderStatus } | null
  >(null);

  async function applyStatus(orderId: string, target: OrderStatus): Promise<void> {
    if (target === 'CANCELLED' || target === 'RETURNED') {
      setCancelPrompt({ orderId, target });
      return;
    }
    try {
      await updateOrder({
        id: orderId,
        patch: { status: target, actorName: 'Admin (list view)' },
      }).unwrap();
      toast.success(`Status → ${target.toLowerCase()}`);
    } catch (err) {
      const msg =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ??
        'Could not update status';
      toast.error(msg);
    }
  }

  return (
    <>
      <TableToolbar
        query={search}
        onQueryChange={setSearch}
        searchPlaceholder="Search orders by ID, customer, phone or payment method…"
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: statusFilter,
            onChange: (v) => onFilter(v as OrderStatus | ''),
            options: [
              { value: '', label: 'All statuses' },
              ...ORDER_STATUSES.map((s) => ({ value: s, label: s })),
            ],
          },
        ]}
        count={orders.length}
        countLabel={orders.length === 1 ? 'order' : 'orders'}
      />
      <section className="rounded-md border border-ink-100 bg-ink-0">
        <ul className="divide-y divide-ink-100 text-sm">
          {loading && <li className="px-4 py-3 text-ink-500">Loading…</li>}
          {!loading && allOrders.length === 0 && (
            <li className="px-4 py-3 text-ink-500">No orders.</li>
          )}
          {!loading && allOrders.length > 0 && orders.length === 0 && (
            <li className="px-4 py-3 text-ink-500">No orders match the search.</li>
          )}
          {orders.map((o) => (
            <li key={o.id} className="flex items-center gap-3 px-4 py-3 hover:bg-ink-25">
              {/* Click region for the drawer — everything left of the status
                  select. Rendered as a button so keyboard focus + enter work,
                  but the status select / chevron sit outside it to keep nested
                  interactive elements out of the button. */}
              <button
                type="button"
                onClick={() => onOpen(o)}
                className="flex-1 min-w-0 text-left -my-3 py-3"
              >
                <p className="font-mono text-xs text-ink-500 truncate">#{o.id.slice(-8).toUpperCase()}</p>
                <p className="text-ink-800 truncate">
                  {o.customer?.name ?? 'Walk-in'}{o.customer?.phone ? ` · ${o.customer.phone}` : ''}
                </p>
                <p className="text-xs text-ink-500 mt-0.5">
                  {o.items?.length ?? 0} item{(o.items?.length ?? 0) === 1 ? '' : 's'} · {o.paymentMethod}
                </p>
              </button>

              <InlineStatusSelect
                value={o.status}
                disabled={updating}
                onChange={(next) => void applyStatus(o.id, next)}
              />

              <Money paise={o.totalPaise} className="font-mono tabular-nums text-ink-900 w-28 text-right shrink-0" />
              <button
                type="button"
                onClick={() => onOpen(o)}
                className="text-ink-400 hover:text-ink-600 shrink-0"
                aria-label="Open order detail"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <CancelReasonDialog
        target={cancelPrompt?.target ?? null}
        onClose={() => setCancelPrompt(null)}
        onSubmit={async (reason) => {
          if (!cancelPrompt) return;
          try {
            await updateOrder({
              id: cancelPrompt.orderId,
              patch: {
                status: cancelPrompt.target,
                cancelReason: reason,
                actorName: 'Admin (list view)',
              },
            }).unwrap();
            toast.success(`Order ${cancelPrompt.target.toLowerCase()}`);
          } catch (err) {
            const msg =
              (err as { data?: { error?: { message?: string } } }).data?.error?.message ??
              'Could not update status';
            toast.error(msg);
          }
          setCancelPrompt(null);
        }}
      />
    </>
  );
}

// Pill-shaped status select that mirrors the colour of the current status.
// Native <select> for cross-platform consistency + keyboard nav; the
// surrounding wrapper supplies the tone styling so the visual matches the
// Badge we used to render here.
const STATUS_SELECT_TONE: Record<string, string> = {
  PENDING:   'bg-warning-50 text-warning-700 border-warning-200',
  CONFIRMED: 'bg-info-50 text-info-700 border-info-200',
  PACKED:    'bg-info-50 text-info-700 border-info-200',
  SHIPPED:   'bg-info-50 text-info-700 border-info-200',
  DELIVERED: 'bg-success-50 text-success-700 border-success-200',
  CANCELLED: 'bg-ink-50 text-ink-600 border-ink-200',
  RETURNED:  'bg-ink-50 text-ink-600 border-ink-200',
};

function InlineStatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: OrderStatus;
  disabled: boolean;
  onChange: (next: OrderStatus) => void;
}): JSX.Element {
  const tone = STATUS_SELECT_TONE[value] ?? 'bg-ink-50 text-ink-700 border-ink-200';
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const next = e.target.value as OrderStatus;
        if (next === value) return;
        onChange(next);
      }}
      // Stop the click from bubbling to the row click region — Safari/Firefox
      // are forgiving here but Chromium will sometimes activate ancestor
      // clickable elements when the user picks an option.
      onClick={(e) => e.stopPropagation()}
      className={`h-7 text-[11px] uppercase tracking-wider px-2.5 pr-7 rounded-full border appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-400/30 transition-colors shrink-0 ${tone} disabled:opacity-60 disabled:cursor-not-allowed`}
      style={{
        // Native select arrow → small chevron via inline svg so the pill
        // shape doesn't get the system-default arrow box.
        backgroundImage:
          "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'%3e%3cpath d='M1 1l4 4 4-4' stroke='%23475569' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3e%3c/svg%3e\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.6rem center',
        backgroundSize: '10px 6px',
      }}
      aria-label="Change order status"
    >
      {ORDER_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.toLowerCase()}
        </option>
      ))}
    </select>
  );
}

// --------------------------------------------------------------------------
// Orders kanban — fulfillment pipeline. Drag a card across columns to
// transition its status; the existing useUpdateOrderMutation persists.
//
// Columns are the fulfillment-forward states. Cancelled / Returned are
// terminal failure states surfaced in a collapsed tray below so they
// don't clutter the active pipeline.
// --------------------------------------------------------------------------

const BOARD_COLUMNS: ReadonlyArray<{
  status: OrderStatus;
  label: string;
  accent: string;
}> = [
  { status: 'PENDING',   label: 'Pending',   accent: 'bg-warning-500' },
  { status: 'CONFIRMED', label: 'Confirmed', accent: 'bg-info-500' },
  { status: 'PACKED',    label: 'Packed',    accent: 'bg-info-500' },
  { status: 'SHIPPED',   label: 'Shipped',   accent: 'bg-info-500' },
  { status: 'DELIVERED', label: 'Delivered', accent: 'bg-success-500' },
];

const TERMINAL_FAIL: ReadonlyArray<OrderStatus> = ['CANCELLED', 'RETURNED'];

function OrdersBoard({
  orders,
  loading,
  onOpen,
  liveCount,
}: {
  orders: AdminOrder[];
  loading: boolean;
  onOpen: (o: AdminOrder) => void;
  /**
   * Tenant-wide DB counts. Used for the column headers (so the number
   * matches the live banner) — the CARDS themselves are still rendered
   * from the paginated `orders` array, so columns can show "PENDING 57"
   * with only the first 50 cards visible. That's an honest distinction:
   * the count is the truth, the cards are the slice we've loaded.
   */
  liveCount: import('@/features/ecommerce/ecommerceApi').OrderLiveCount | undefined;
}): JSX.Element {
  const [updateOrder] = useUpdateOrderMutation();
  // Visual hint for the column being dragged over.
  const [hoverStatus, setHoverStatus] = useState<OrderStatus | null>(null);
  const [showFailed, setShowFailed] = useState(false);

  const byStatus = useMemo(() => {
    const map = new Map<OrderStatus, AdminOrder[]>();
    for (const s of ORDER_STATUSES) map.set(s, []);
    for (const o of orders) map.get(o.status)?.push(o);
    return map;
  }, [orders]);

  async function moveTo(orderId: string, status: OrderStatus): Promise<void> {
    try {
      await updateOrder({ id: orderId, patch: { status } }).unwrap();
      toast.success(`Moved to ${status.toLowerCase()}`);
    } catch {
      toast.error('Could not update status');
    }
  }

  function onDragStart(e: React.DragEvent, orderId: string): void {
    e.dataTransfer.setData('text/plain', orderId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e: React.DragEvent, status: OrderStatus): void {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (hoverStatus !== status) setHoverStatus(status);
  }

  function onDrop(e: React.DragEvent, status: OrderStatus): void {
    e.preventDefault();
    setHoverStatus(null);
    const orderId = e.dataTransfer.getData('text/plain');
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status === status) return;
    void moveTo(orderId, status);
  }

  if (loading) {
    return <p className="px-4 py-8 text-sm text-ink-500">Loading board…</p>;
  }

  const failedOrders = TERMINAL_FAIL.flatMap((s) => byStatus.get(s) ?? []);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        {BOARD_COLUMNS.map((col) => {
          const items = byStatus.get(col.status) ?? [];
          const isHover = hoverStatus === col.status;
          return (
            <section
              key={col.status}
              onDragOver={(e) => onDragOver(e, col.status)}
              onDragLeave={() => setHoverStatus(null)}
              onDrop={(e) => onDrop(e, col.status)}
              className={`rounded-md border bg-ink-25 min-h-[200px] transition-colors ${
                isHover ? 'border-brand-500 bg-brand-50' : 'border-ink-100'
              }`}
            >
              <header className="px-3 py-2.5 border-b border-ink-100 flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${col.accent}`} aria-hidden />
                <span className="text-eyebrow uppercase text-ink-700 font-semibold flex-1">{col.label}</span>
                {/* Header count comes from the tenant-wide DB aggregate so
                    PENDING shows "57" even when only the first 50 cards are
                    loaded into `items`. Falls back to items.length while
                    live-count is still loading. */}
                <span className="text-xs text-ink-500 tabular-nums">
                  {liveCount?.byStatus[col.status] ?? items.length}
                </span>
              </header>
              <div className="p-2 space-y-2">
                {items.length === 0 ? (
                  <p className="text-xs text-ink-400 px-1 py-3 text-center">No orders</p>
                ) : (
                  items.map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      onOpen={onOpen}
                      onDragStart={(e) => onDragStart(e, o.id)}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Failure tray — collapsed by default so it doesn't shout. */}
      {failedOrders.length > 0 && (
        <details
          open={showFailed}
          onToggle={(e) => setShowFailed((e.target as HTMLDetailsElement).open)}
          className="rounded-md border border-danger-500/30 bg-danger-50/30"
        >
          <summary className="cursor-pointer px-4 py-2.5 text-sm flex items-center gap-2 select-none">
            <span className="h-1.5 w-1.5 rounded-full bg-danger-500" aria-hidden />
            <span className="text-eyebrow uppercase text-danger-700 font-semibold">Cancelled &amp; returned</span>
            <span className="text-xs text-ink-500 tabular-nums">{failedOrders.length}</span>
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 px-3 pb-3">
            {failedOrders.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                onOpen={onOpen}
                onDragStart={(e) => onDragStart(e, o.id)}
                muted
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function OrderCard({
  order,
  onOpen,
  onDragStart,
  muted,
}: {
  order: AdminOrder;
  onOpen: (o: AdminOrder) => void;
  onDragStart: (e: React.DragEvent) => void;
  muted?: boolean;
}): JSX.Element {
  const itemCount = order.items?.length ?? 0;
  const ageMin = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60_000);
  const ageLabel =
    ageMin < 60
      ? `${ageMin}m ago`
      : ageMin < 24 * 60
        ? `${Math.floor(ageMin / 60)}h ago`
        : `${Math.floor(ageMin / (24 * 60))}d ago`;
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onClick={() => onOpen(order)}
      className={`group rounded-md border bg-ink-0 px-3 py-2.5 text-left cursor-grab active:cursor-grabbing hover:border-ink-300 transition-colors ${muted ? 'border-ink-100 opacity-80' : 'border-ink-100'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] text-ink-500">#{order.id.slice(-8).toUpperCase()}</p>
        <p className="text-[10px] text-ink-400">{ageLabel}</p>
      </div>
      <p className="mt-1 text-sm text-ink-900 truncate">
        {order.customer?.name ?? 'Walk-in'}
      </p>
      {order.customer?.phone && (
        <p className="text-[11px] text-ink-500 font-mono truncate">{order.customer.phone}</p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-ink-500">
          {itemCount} item{itemCount === 1 ? '' : 's'} · {order.paymentMethod}
        </span>
        <Money paise={order.totalPaise} className="font-mono tabular-nums text-xs text-ink-900" />
      </div>
    </article>
  );
}

interface ProductForm {
  name: string;
  slug: string;
  categoryId: string;
  descriptionMd: string;
  images: string[];
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
    images: [],
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
          images: editing.images,
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
            images: editing.images,
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
    const images = form.images.map((s) => s.trim()).filter(Boolean);
    if (images.length === 0) {
      toast.error('Add at least one product image');
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

            <Field label="Images">
              <ImageUploader
                images={form.images}
                onChange={(images) => setForm({ ...form, images })}
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

// Uploader uses Cloudinary's unsigned-preset flow (see client/src/lib/cloudinary.ts):
// the browser POSTs straight to Cloudinary so the API never proxies image bytes.
// Editors paste-by-URL is still supported for cases like Unsplash links the
// catalog might already use.
function ImageUploader({
  images,
  onChange,
}: {
  images: string[];
  onChange: (next: string[]) => void;
}): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState<{ name: string; progress: number }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [pendingUrl, setPendingUrl] = useState('');
  const cloudinaryReady = isCloudinaryConfigured();

  async function uploadFiles(files: File[]): Promise<void> {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      toast.error('Only image files are supported');
      return;
    }
    const skipped = files.length - imageFiles.length;
    if (skipped > 0) toast.message(`Skipped ${skipped} non-image file${skipped === 1 ? '' : 's'}`);

    // Seed progress slots so the UI shows them all immediately.
    setUploading((prev) => [...prev, ...imageFiles.map((f) => ({ name: f.name, progress: 0 }))]);

    const results = await Promise.allSettled(
      imageFiles.map((file) =>
        uploadImageToCloudinary(file, {
          folder: 'zelora/products',
          onProgress: (pct) => {
            setUploading((prev) =>
              prev.map((u) => (u.name === file.name ? { ...u, progress: pct } : u)),
            );
          },
        }),
      ),
    );

    const newUrls: string[] = [];
    let failures = 0;
    for (const r of results) {
      if (r.status === 'fulfilled') newUrls.push(r.value.secureUrl);
      else failures += 1;
    }
    if (newUrls.length > 0) onChange([...images, ...newUrls]);
    if (failures > 0) toast.error(`${failures} upload${failures === 1 ? '' : 's'} failed`);

    // Drop progress rows for the files we just processed.
    setUploading((prev) => prev.filter((u) => !imageFiles.some((f) => f.name === u.name)));
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) void uploadFiles(files);
  }

  function removeAt(idx: number): void {
    onChange(images.filter((_, i) => i !== idx));
  }

  function addUrl(): void {
    const url = pendingUrl.trim();
    if (!url) return;
    try {
      new URL(url);
    } catch {
      toast.error('Enter a valid URL');
      return;
    }
    if (images.includes(url)) {
      toast.message('That image is already in the list');
      return;
    }
    onChange([...images, url]);
    setPendingUrl('');
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={`flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-md border-2 border-dashed cursor-pointer transition-colors ${
          dragOver ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:border-ink-300 hover:bg-ink-25'
        }`}
      >
        <Upload className="h-6 w-6 text-ink-500" aria-hidden />
        <p className="text-sm text-ink-700">
          <span className="font-medium text-ink-900">Click to upload</span> or drag &amp; drop
        </p>
        <p className="text-xs text-ink-500">PNG, JPG or WebP · up to 8 MB each · multiple allowed</p>
        {!cloudinaryReady && (
          <p className="mt-1 text-xs text-ink-500">
            Using local image storage (dev mode). Configure Cloudinary in client/.env for hosted uploads.
          </p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            if (files.length > 0) void uploadFiles(files);
            // Reset so picking the same file twice still fires onChange.
            e.target.value = '';
          }}
        />
      </div>

      {uploading.length > 0 && (
        <ul className="space-y-1.5">
          {uploading.map((u) => (
            <li key={u.name} className="rounded-md border border-ink-100 bg-ink-25 px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-ink-700 truncate">{u.name}</span>
                <span className="font-mono tabular-nums text-ink-500">{u.progress}%</span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-ink-100 overflow-hidden">
                <div
                  className="h-full bg-brand-500 transition-all"
                  style={{ width: `${u.progress}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {images.length > 0 && (
        <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {images.map((url, idx) => (
            <li key={url + idx} className="relative group rounded-md border border-ink-100 bg-ink-25 overflow-hidden aspect-square">
              <img
                src={cloudinaryThumb(url, 240) ?? url}
                alt={`Image ${idx + 1}`}
                className="h-full w-full object-cover"
                onError={(e) => {
                  // Fall back to the placeholder icon if the URL is broken.
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="absolute top-1 right-1 h-6 w-6 inline-flex items-center justify-center rounded-full bg-ink-900/70 text-ink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                aria-label="Remove image"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              {idx === 0 && (
                <span className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded-full bg-ink-900/70 text-ink-0">
                  Primary
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div>
        {showUrlInput ? (
          <div className="flex gap-2">
            <Input
              value={pendingUrl}
              onChange={(e) => setPendingUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addUrl();
                }
              }}
              placeholder="https://… (paste an external image URL)"
              className="font-mono text-xs"
            />
            <Button type="button" variant="secondary" onClick={addUrl}>Add</Button>
            <Button type="button" variant="outline" onClick={() => { setShowUrlInput(false); setPendingUrl(''); }} aria-label="Cancel URL input">
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowUrlInput(true)}
            className="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1.5"
          >
            <Link2 className="h-3 w-3" /> Or paste an image URL
          </button>
        )}
      </div>
    </div>
  );
}


// Map order status → icon for the timeline. Mirrors the customer track page
// so admin and customer see the same iconography.
const EVENT_ICON: Record<string, typeof Clock> = {
  PENDING: Clock,
  CONFIRMED: CheckCircle2,
  PACKED: Package,
  SHIPPED: Truck,
  DELIVERED: CheckCircle2,
  CANCELLED: XCircle,
  RETURNED: RotateCcw,
};

function OrderDrawer({ order, onClose }: { order: AdminOrder | null; onClose: () => void }): JSX.Element | null {
  // Pull full detail (with events) once a drawer opens. Cheap because the
  // list endpoint already loaded a row per order; the detail call only
  // hydrates events. Skip while closed so we don't issue stray requests.
  const { data: detailRes } = useGetOrderDetailQuery(order?.id ?? '', { skip: !order });
  // Prefer the detailed payload (has events). Fall back to the row from the
  // list while the detail is loading so the drawer never flashes empty.
  const full = detailRes?.data ?? order;

  const [updateOrder, { isLoading: updating }] = useUpdateOrderMutation();
  const [awb, setAwb] = useState(order?.shiprocketAwb ?? '');
  const [note, setNote] = useState('');
  const [location, setLocation] = useState('');
  const [cancelPrompt, setCancelPrompt] = useState<OrderStatus | null>(null);

  // Sync local form state on order change.
  const [lastOrderId, setLastOrderId] = useState<string | null>(order?.id ?? null);
  if (order && order.id !== lastOrderId) {
    setLastOrderId(order.id);
    setAwb(order.shiprocketAwb ?? '');
    setNote('');
    setLocation('');
  }

  const nextStatuses = useMemo(() => {
    if (!order) return [] as OrderStatus[];
    const flow: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'];
    const idx = flow.indexOf(order.status);
    const forward = idx >= 0 && idx < flow.length - 1 ? [flow[idx + 1]!] : [];
    return Array.from(new Set([...forward, 'CANCELLED' as OrderStatus, 'RETURNED' as OrderStatus]));
  }, [order]);

  if (!order) return null;

  async function applyPatch(patch: OrderPatchPayload, successMsg: string): Promise<void> {
    try {
      await updateOrder({ id: order!.id, patch }).unwrap();
      toast.success(successMsg);
      setNote('');
      setLocation('');
    } catch (err) {
      const msg =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ??
        'Could not update order';
      toast.error(msg);
    }
  }

  function setStatus(status: OrderStatus): void {
    // CANCELLED / RETURNED require a reason — open the prompt instead of
    // submitting a bare PATCH (which the server would reject anyway).
    if (status === 'CANCELLED' || status === 'RETURNED') {
      setCancelPrompt(status);
      return;
    }
    void applyPatch(
      {
        status,
        note: note.trim() || undefined,
        location: location.trim() || undefined,
      },
      `Status → ${status.toLowerCase()}`,
    );
  }

  function saveAwb(): void {
    void applyPatch(
      {
        shiprocketAwb: awb.trim() || null,
        note: awb.trim() ? `Tracking AWB attached: ${awb.trim()}` : 'Tracking AWB removed',
      },
      'AWB saved',
    );
  }

  function appendNote(): void {
    if (!note.trim() && !location.trim()) {
      toast.error('Add a note or a location first');
      return;
    }
    void applyPatch(
      { note: note.trim() || undefined, location: location.trim() || undefined },
      'Update posted to customer timeline',
    );
  }

  const events = full?.events ?? [];

  return (
    <>
      <Dialog.Root open={!!order} onOpenChange={(next) => { if (!next) onClose(); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40" />
          <Dialog.Content className="fixed right-0 top-0 z-50 h-full w-[92vw] max-w-lg bg-ink-0 shadow-xl border-l border-ink-100 overflow-y-auto">
            <div className="p-6 space-y-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-eyebrow uppercase text-ink-500">Order</p>
                  <Dialog.Title className="font-display text-[22px] text-ink-900">ZL-{order.id.slice(-6).toUpperCase()}</Dialog.Title>
                  <p className="text-xs text-ink-500 mt-0.5">{new Date(order.createdAt).toLocaleString('en-IN')}</p>
                </div>
                <Dialog.Close className="text-ink-500 hover:text-ink-900 p-1" aria-label="Close">
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>

              <div className="rounded-md border border-ink-100 p-3 space-y-1 text-sm">
                <p className="text-eyebrow uppercase text-ink-500">Customer</p>
                <p className="text-ink-900">{order.customer?.name ?? 'Walk-in'}</p>
                {order.customer?.phone && (
                  <p className="font-mono text-xs text-ink-600">
                    {order.customer.phone}
                    <a
                      href={`https://wa.me/${order.customer.phone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-brand-700 hover:underline"
                    >
                      WhatsApp
                    </a>
                  </p>
                )}
              </div>

              {(full?.shippingLine1 || full?.shippingCity) && (
                <div className="rounded-md border border-ink-100 p-3 space-y-1 text-sm bg-ink-25">
                  <p className="text-eyebrow uppercase text-ink-500">Shipping Address</p>
                  <p className="text-ink-900 font-medium">{full.shippingName ?? full.customer?.name}</p>
                  {full.shippingPhone && <p className="text-xs text-ink-700 font-mono">{full.shippingPhone}</p>}
                  <p className="text-xs text-ink-800 mt-1">
                    {full.shippingLine1}
                    {full.shippingLine2 && `, ${full.shippingLine2}`}
                  </p>
                  <p className="text-xs text-ink-800 font-medium">
                    {full.shippingCity}, {full.shippingState} - {full.shippingPincode}
                  </p>
                </div>
              )}


              <div className="space-y-2">
                <p className="text-eyebrow uppercase text-ink-500">Items</p>
                <ul className="divide-y divide-ink-100 text-sm">
                  {(full?.items ?? order.items ?? []).map((it) => (
                    <li key={it.id} className="py-2.5 flex items-center gap-3">
                      {it.product?.images?.[0] ? (
                        <img
                          src={it.product.images[0]}
                          alt=""
                          className="h-10 w-10 rounded object-cover bg-ink-50 shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-ink-50 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-ink-900 text-sm truncate">
                          {it.product?.name ?? 'Piece'}
                        </p>
                        <p className="text-xs text-ink-500">Qty {it.qty}</p>
                      </div>
                      <Money paise={it.pricePaise * it.qty} className="font-mono tabular-nums shrink-0" />
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

              {order.cancelReason && (
                <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2.5 text-xs text-ink-800">
                  <p className="font-medium text-danger-700">Cancellation reason</p>
                  <p className="mt-0.5">{order.cancelReason}</p>
                </div>
              )}

              <div>
                <p className="text-eyebrow uppercase text-ink-500 mb-2">
                  Status: <Badge tone={STATUS_TONE[order.status] ?? 'neutral'}>{order.status.toLowerCase()}</Badge>
                </p>
                <div className="flex flex-wrap gap-2">
                  {nextStatuses.map((s) => (
                    <Button key={s} variant="secondary" size="sm" onClick={() => setStatus(s)} disabled={updating}>
                      → {s.toLowerCase()}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Optional note + location attached to the next transition (or
                  posted standalone via "Post update"). Customer sees both
                  verbatim on the track page timeline. */}
              <div className="space-y-2">
                <p className="text-eyebrow uppercase text-ink-500">Customer-visible update</p>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note (e.g. Hallmark check passed)"
                  maxLength={280}
                />
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Location (e.g. Mumbai sort hub)"
                  maxLength={120}
                />
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={appendNote} disabled={updating}>
                    Post update
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-eyebrow uppercase text-ink-500 mb-2">Tracking (Shiprocket AWB)</p>
                <div className="flex gap-2">
                  <Input value={awb} onChange={(e) => setAwb(e.target.value)} placeholder="AWB number" />
                  <Button onClick={saveAwb} disabled={updating} variant="secondary">Save</Button>
                </div>
              </div>

              {/* Tax invoice — server renders the same PDF for both POS and
                  e-commerce. Footer text comes from Website CMS → Invoice
                  Layout (falls back to the baked default). Both buttons go
                  through downloadPdf so the Bearer token is attached — a
                  plain <a href> would 401 against the auth middleware. */}
              <div>
                <p className="text-eyebrow uppercase text-ink-500 mb-2">Invoice</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void downloadPdf(`/api/v1/ecommerce/orders/${order.id}/invoice.pdf`, {
                        mode: 'preview',
                      })
                    }
                  >
                    <FileDown className="h-4 w-4 mr-1.5" /> Preview invoice
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      void downloadPdf(
                        `/api/v1/ecommerce/orders/${order.id}/invoice.pdf?download=1`,
                        {
                          mode: 'download',
                          filename: `invoice-${order.id}.pdf`,
                        },
                      )
                    }
                  >
                    <FileDown className="h-4 w-4 mr-1.5" /> Download invoice
                  </Button>
                </div>
              </div>

              {/* Timeline */}
              <div>
                <p className="text-eyebrow uppercase text-ink-500 mb-3">Timeline</p>
                {events.length === 0 ? (
                  <p className="text-xs text-ink-500">No events yet.</p>
                ) : (
                  <ol className="relative space-y-4 pl-7 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-px before:bg-ink-100">
                    {[...events].reverse().map((evt, i) => {
                      const Icon = EVENT_ICON[evt.status] ?? Clock;
                      const isLatest = i === 0;
                      return (
                        <li key={evt.id} className="relative">
                          <span
                            className={`absolute -left-7 top-0 h-6 w-6 rounded-full inline-flex items-center justify-center ${
                              isLatest ? 'bg-ink-900 text-ink-0' : 'bg-ink-100 text-ink-500'
                            }`}
                            aria-hidden
                          >
                            <Icon className="h-3 w-3" />
                          </span>
                          <p className={`text-sm ${isLatest ? 'text-ink-900 font-medium' : 'text-ink-700'}`}>
                            {evt.note ?? evt.status}
                          </p>
                          <p className="text-xs text-ink-500 mt-0.5">
                            {new Date(evt.createdAt).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                          {evt.location && (
                            <p className="text-xs text-ink-600 mt-0.5 flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {evt.location}
                            </p>
                          )}
                          {evt.actorName && (
                            <p className="text-[10px] text-ink-400 mt-0.5 uppercase tracking-wider">
                              via {evt.actorName}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Cancel-reason prompt */}
      <CancelReasonDialog
        target={cancelPrompt}
        onClose={() => setCancelPrompt(null)}
        onSubmit={(reason) => {
          if (!cancelPrompt) return;
          void applyPatch(
            { status: cancelPrompt, cancelReason: reason },
            `Order ${cancelPrompt.toLowerCase()}`,
          );
          setCancelPrompt(null);
        }}
      />
    </>
  );
}

// Tiny modal-on-top-of-modal — fires when the cashier picks CANCELLED or
// RETURNED. The server now requires a reason on these transitions; we
// collect it here so the timeline is never left with a blank cancellation.
function CancelReasonDialog({
  target,
  onClose,
  onSubmit,
}: {
  target: OrderStatus | null;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}): JSX.Element {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!target) setReason('');
  }, [target]);
  const verb = target === 'RETURNED' ? 'Return' : 'Cancel';
  return (
    <Dialog.Root open={!!target} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-ink-900/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-md bg-ink-0 rounded-lg shadow-xl border border-ink-100 p-6 space-y-4">
          <div>
            <Dialog.Title className="font-display text-[20px] text-ink-900">{verb} this order?</Dialog.Title>
            <Dialog.Description className="text-xs text-ink-500 mt-1">
              The reason you type will be shown on the customer&apos;s tracking page. Keep it short and human.
            </Dialog.Description>
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={280}
            placeholder={target === 'RETURNED' ? 'Why is the customer returning this?' : 'Why are we cancelling?'}
            className="w-full px-3 py-2 rounded-md border border-ink-200 text-sm focus:border-brand-500 outline-none"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Keep open</Button>
            <Button
              size="sm"
              variant="danger"
              disabled={reason.trim().length < 3}
              onClick={() => onSubmit(reason.trim())}
            >
              {verb} order
            </Button>
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

function ReservationsTable({
  reservations: allReservations,
  loading,
}: {
  reservations: AdminOrder[];
  loading: boolean;
}): JSX.Element {
  const [updateOrder, { isLoading: updating }] = useUpdateOrderMutation();
  const [search, setSearch] = useState('');
  const reservations = useTableSearch(
    allReservations,
    (o) => [o.id, o.customer?.name, o.customer?.phone, o.status],
    search,
  );

  async function setStatus(id: string, status: OrderStatus, msg: string): Promise<void> {
    try {
      await updateOrder({ id, patch: { status } }).unwrap();
      toast.success(msg);
    } catch {
      toast.error('Could not update reservation');
    }
  }

  return (
    <>
    <TableToolbar
      query={search}
      onQueryChange={setSearch}
      searchPlaceholder="Search reservations by customer, phone or order ID…"
      count={reservations.length}
      countLabel={reservations.length === 1 ? 'reservation' : 'reservations'}
    />
    <section className="rounded-md border border-ink-100 bg-ink-0">
      <header className="px-4 py-3 border-b border-ink-100">
        <h2 className="text-md font-medium text-ink-900">Storefront reservations</h2>
        <p className="text-xs text-ink-500 mt-0.5">
          Every &ldquo;Reserve at store&rdquo; from the public site lands here in real time.
          {allReservations.length > 0 && ` · ${allReservations.length} total`}
        </p>
      </header>
      {loading && <p className="px-4 py-6 text-sm text-ink-500">Loading…</p>}
      {!loading && allReservations.length === 0 && (
        <p className="px-4 py-6 text-sm text-ink-500">
          No reservations yet. Place one from <code className="font-mono">/store</code> to see it appear here within 15 seconds.
        </p>
      )}
      {!loading && allReservations.length > 0 && reservations.length === 0 && (
        <p className="px-4 py-6 text-sm text-ink-500">No reservations match the search.</p>
      )}
      {reservations.length > 0 && (
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="text-eyebrow uppercase text-ink-500">
            <tr>
              <th className="text-left px-4 py-2">When</th>
              <th className="text-left px-4 py-2">Customer</th>
              <th className="text-left px-4 py-2">Order</th>
              <th className="text-right px-4 py-2">Total</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {reservations.map((o) => {
              const phone = o.customer?.phone ?? '';
              const open = !['DELIVERED', 'CANCELLED', 'RETURNED'].includes(o.status);
              return (
                <tr key={o.id} className="hover:bg-ink-25">
                  <td className="px-4 py-3 font-mono text-xs text-ink-700 whitespace-nowrap">
                    {new Date(o.createdAt).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink-900">{o.customer?.name ?? 'Guest'}</p>
                    {phone && <p className="font-mono text-xs text-ink-500">{phone}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs text-ink-700">#{o.id.slice(-8).toUpperCase()}</p>
                    <p className="text-xs text-ink-500">
                      {o.items?.length ?? 0} item{(o.items?.length ?? 0) === 1 ? '' : 's'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money paise={o.totalPaise} className="font-mono tabular-nums text-ink-900" />
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>{o.status.toLowerCase()}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex gap-1">
                      {phone && (
                        <a
                          href={`https://wa.me/${phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-700 hover:underline"
                        >
                          WhatsApp
                        </a>
                      )}
                      {open && (
                        <>
                          {phone && <span className="text-ink-300">·</span>}
                          <button
                            onClick={() => void setStatus(o.id, 'DELIVERED', 'Marked picked up')}
                            disabled={updating}
                            className="text-xs text-success-700 hover:underline"
                          >
                            Picked up
                          </button>
                          <span className="text-ink-300">·</span>
                          <button
                            onClick={() => void setStatus(o.id, 'CANCELLED', 'Marked cancelled')}
                            disabled={updating}
                            className="text-xs text-ink-500 hover:underline"
                          >
                            Cancel
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
        </div>
      )}
    </section>
    </>
  );
}
