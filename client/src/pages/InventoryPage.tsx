// Inventory module — full feature surface per Gold OS Module 01 spec.
// Tabbed shell. Each tab is DB-backed via RTK Query; mutations invalidate caches
// so adds/edits flow back to the active view (and to dashboard tiles) immediately.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Plus,
  Boxes,
  Truck,
  Flame,
  FileText,
  Users,
  TrendingDown,
  Coins,
  ScrollText,
  Sliders,
  Upload,
  Tag as TagIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Item } from '@goldos/shared/types';
import {
  useGetItemsQuery,
  useGetCategoriesQuery,
  useCreateItemMutation,
  useRecordWastageMutation,
  useGetValuationQuery,
  useGetLowStockQuery,
  useGetMovementsQuery,
  useGetVendorsQuery,
  useCreateVendorMutation,
  useDeleteVendorMutation,
  useGetPurchaseOrdersQuery,
  useCreatePurchaseOrderMutation,
  useReceivePurchaseOrderMutation,
  useGetAuditLogQuery,
  useUpdateCategoryMakingChargeMutation,
} from '@/features/inventory/inventoryApi';
import { useCreateTransferMutation } from '@/features/transfers/transfersApi';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import { DataTable } from '@/components/data/DataTable';
import { Button } from '@/components/ui/button';
import { Money, Weight, Purity } from '@/components/ui/money';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody } from '@/components/ui/sheet';
import { BarcodePreview } from '@/components/ui/BarcodePreview';
import { PageHeader } from '@/components/ui/PageHeader';
import { TabStrip, type TabStripItem } from '@/components/ui/TabStrip';
import { SectionCard } from '@/components/ui/SectionCard';
import { Toolbar, StatPill } from '@/components/ui/Toolbar';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { BulkImportModal } from '@/features/inventory/BulkImportModal';

type Tab =
  | 'items'
  | 'transfers'
  | 'wastage'
  | 'valuation'
  | 'low-stock'
  | 'vendors'
  | 'purchase-orders'
  | 'audit'
  | 'making-charges';

const TABS: Array<{ id: Tab; label: string; icon: typeof Boxes }> = [
  { id: 'items', label: 'Items', icon: Boxes },
  { id: 'transfers', label: 'Transfers', icon: Truck },
  { id: 'wastage', label: 'Wastage & melting', icon: Flame },
  { id: 'valuation', label: 'Valuation', icon: Coins },
  { id: 'low-stock', label: 'Low stock', icon: TrendingDown },
  { id: 'vendors', label: 'Vendors', icon: Users },
  { id: 'purchase-orders', label: 'Purchase orders', icon: FileText },
  { id: 'making-charges', label: 'Making charges', icon: Sliders },
  { id: 'audit', label: 'Audit trail', icon: ScrollText },
];

export function InventoryPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('items');
  const tabItems: TabStripItem<Tab>[] = TABS.map((t) => ({ id: t.id, label: t.label, icon: t.icon }));
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Module 01"
        title="Stock & inventory"
        description="Live valuation, multi-store sync, vendors, POs, transfers and wastage — all auditable."
        bare
      />

      <TabStrip<Tab> items={tabItems} value={tab} onChange={setTab} />

      {tab === 'items' && <ItemsTab />}
      {tab === 'transfers' && <MovementsTab type="TRANSFER" emptyLabel="No transfers yet." />}
      {tab === 'wastage' && <MovementsTab type="WASTAGE" emptyLabel="No wastage logged." />}
      {tab === 'valuation' && <ValuationTab />}
      {tab === 'low-stock' && <LowStockTab />}
      {tab === 'vendors' && <VendorsTab />}
      {tab === 'purchase-orders' && <PurchaseOrdersTab />}
      {tab === 'making-charges' && <MakingChargesTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Items tab — main list, row click opens detail Sheet with barcode + actions.

function ItemsTab(): JSX.Element {
  const navigate = useNavigate();
  const { data, isLoading } = useGetItemsQuery({});
  const { data: catRes } = useGetCategoriesQuery();
  const { data: shopsRes } = useGetShopsQuery();
  const [selected, setSelected] = useState<Item | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [wastageOpen, setWastageOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [distributeOpen, setDistributeOpen] = useState(false);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of catRes?.data ?? []) map.set(c.id, c.name);
    return map;
  }, [catRes?.data]);

  const shopNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of shopsRes?.data ?? []) map.set(s.id, s.name);
    return map;
  }, [shopsRes?.data]);

  const columns = useMemo<ColumnDef<Item>[]>(
    () => [
      {
        accessorKey: 'sku',
        header: 'SKU',
        cell: (i) => <span className="font-mono text-xs">{String(i.getValue())}</span>,
      },
      {
        accessorKey: 'categoryId',
        header: 'Category',
        cell: (i) => categoryNameById.get(String(i.getValue())) ?? '—',
      },
      {
        accessorKey: 'shopId',
        header: 'Shop',
        cell: (i) => (
          <span className="text-xs text-ink-700">{shopNameById.get(String(i.getValue())) ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'weightMg',
        header: () => <span className="block text-right">Weight</span>,
        cell: (i) => (
          <div className="text-right">
            <Weight mg={Number(i.getValue())} />
          </div>
        ),
      },
      {
        accessorKey: 'purityCaratX100',
        header: 'Purity',
        cell: (i) => <Purity x100={Number(i.getValue())} />,
      },
      {
        accessorKey: 'hallmarkStatus',
        header: 'Hallmark',
        cell: (i) => {
          const v = String(i.getValue());
          const tone =
            v === 'CERTIFIED' ? 'success' : v === 'PENDING' ? 'warning' : v === 'SUBMITTED' ? 'info' : 'neutral';
          return <Badge tone={tone as 'success' | 'warning' | 'info' | 'neutral'}>{v.toLowerCase()}</Badge>;
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: (i) => {
          const v = String(i.getValue());
          const tone =
            v === 'IN_STOCK' ? 'success' : v === 'IN_TRANSIT' ? 'info' : v === 'SOLD' ? 'neutral' : 'warning';
          return <Badge tone={tone as 'success' | 'info' | 'neutral' | 'warning'}>{v.replace('_', ' ').toLowerCase()}</Badge>;
        },
      },
      {
        accessorKey: 'costPricePaise',
        header: () => <span className="block text-right">Cost</span>,
        cell: (i) => (
          <div className="text-right">
            <Money paise={Number(i.getValue())} />
          </div>
        ),
      },
    ],
    [categoryNameById, shopNameById],
  );

  return (
    <>
      <Toolbar
        end={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Import
            </Button>
            <Button variant="outline" onClick={() => setDistributeOpen(true)}>
              <Truck className="h-4 w-4" /> Distribute stock
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const skus = (data?.data ?? []).map((i) => i.sku);
                navigate('/admin/inventory/print-labels', { state: { skus } });
              }}
              disabled={!data || data.data.length === 0}
            >
              <TagIcon className="h-4 w-4" /> Print labels
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add item
            </Button>
          </div>
        }
      >
        {data && (
          <StatPill>
            {data.data.length} item{data.data.length === 1 ? '' : 's'}
          </StatPill>
        )}
      </Toolbar>

      <BulkImportModal open={importOpen} onClose={() => setImportOpen(false)} />

      {isLoading && <TableSkeleton rows={8} columns={8} />}
      {!isLoading && (!data || data.data.length === 0) && (
        <EmptyState
          eyebrow="No items yet"
          title="Your inventory will appear here."
          body="Add your first item or bulk-import from Excel. Hallmarking status, weight, purity, and live valuation update automatically."
          action={<Button onClick={() => setAddOpen(true)}>Add first item</Button>}
        />
      )}
      {data && data.data.length > 0 && (
        <DataTable columns={columns} data={data.data} onRowClick={(r) => setSelected(r)} />
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{selected?.sku}</SheetTitle>
          </SheetHeader>
          {selected && (
            <SheetBody>
              <dl className="space-y-3 text-sm">
                <Row label="Weight">
                  <Weight mg={selected.weightMg} />
                </Row>
                <Row label="Purity">
                  <Purity x100={selected.purityCaratX100} />
                </Row>
                <Row label="Cost price">
                  <Money paise={selected.costPricePaise} />
                </Row>
                <Row label="Stone weight">
                  {selected.stoneWeightMg ? <Weight mg={selected.stoneWeightMg} /> : '—'}
                </Row>
                <Row label="Hallmark">
                  <Badge tone="success">{selected.hallmarkStatus.toLowerCase()}</Badge>
                </Row>
                <Row label="Hallmark ref">
                  <span className="font-mono text-xs">{selected.hallmarkRef ?? '—'}</span>
                </Row>
                <Row label="Status">
                  <Badge tone="info">{selected.status.replace('_', ' ').toLowerCase()}</Badge>
                </Row>
                <Row label="Shop">{shopNameById.get(selected.shopId) ?? selected.shopId}</Row>
                <Row label="Category">{categoryNameById.get(selected.categoryId) ?? selected.categoryId}</Row>
              </dl>

              <div className="mt-6">
                <p className="text-eyebrow uppercase text-ink-500 mb-2">Barcode</p>
                <BarcodePreview value={selected.barcodeData || selected.sku} />
              </div>

              <div className="mt-6 grid grid-cols-2 gap-2">
                <Button variant="outline" disabled={selected.status !== 'IN_STOCK'} onClick={() => setTransferOpen(true)}>
                  <Truck className="h-4 w-4" /> Transfer
                </Button>
                <Button variant="outline" disabled={selected.status !== 'IN_STOCK'} onClick={() => setWastageOpen(true)}>
                  <Flame className="h-4 w-4" /> Wastage
                </Button>
              </div>

              <ItemMovementsList itemId={selected.id} />
            </SheetBody>
          )}
        </SheetContent>
      </Sheet>

      <AddItemDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <DistributeStockDialog open={distributeOpen} onClose={() => setDistributeOpen(false)} />
      {selected && (
        <>
          <TransferDialog
            open={transferOpen}
            onClose={() => setTransferOpen(false)}
            item={selected}
          />
          <WastageDialog
            open={wastageOpen}
            onClose={() => setWastageOpen(false)}
            item={selected}
          />
        </>
      )}
    </>
  );
}

function ItemMovementsList({ itemId }: { itemId: string }): JSX.Element {
  const { data } = useGetMovementsQuery({ itemId });
  const movements = data?.data ?? [];
  return (
    <div className="mt-6">
      <p className="text-eyebrow uppercase text-ink-500 mb-2">Movement history</p>
      {movements.length === 0 ? (
        <p className="text-xs text-ink-400">No movements recorded.</p>
      ) : (
        <ul className="space-y-2 text-xs">
          {movements.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-2 border-b border-ink-100 pb-2">
              <div>
                <p className="text-ink-800 font-medium">{m.type.toLowerCase()}</p>
                {m.reason && <p className="text-ink-500">{m.reason}</p>}
              </div>
              <span className="text-ink-400 font-mono whitespace-nowrap">
                {new Date(m.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Movements tab (Transfers / Wastage shared).

function MovementsTab({
  type,
  emptyLabel,
}: {
  type: 'TRANSFER' | 'WASTAGE';
  emptyLabel: string;
}): JSX.Element {
  const { data, isLoading } = useGetMovementsQuery({ type });
  const { data: shopsRes } = useGetShopsQuery();
  const rows = data?.data ?? [];
  const shopName = (id: string | null | undefined): string =>
    id ? shopsRes?.data.find((s) => s.id === id)?.name ?? id.slice(-6) : '—';
  return (
    <div className="rounded-md border border-ink-100 bg-ink-0">
      {isLoading && <p className="p-5 text-sm text-ink-500">Loading…</p>}
      {!isLoading && rows.length === 0 && <p className="p-5 text-sm text-ink-500">{emptyLabel}</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead className="text-eyebrow uppercase text-ink-500">
            <tr>
              <th className="text-left px-5 py-3">When</th>
              <th className="text-left px-5 py-3">Item</th>
              <th className="text-left px-5 py-3">From</th>
              <th className="text-left px-5 py-3">To</th>
              <th className="text-left px-5 py-3">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="px-5 py-3 text-ink-700 font-mono text-xs">
                  {new Date(m.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </td>
                <td className="px-5 py-3 font-mono text-xs text-ink-900">
                  {m.item?.sku ?? m.itemId.slice(-8)}
                </td>
                <td className="px-5 py-3 text-xs text-ink-700">
                  {m.fromShop?.name ?? shopName(m.fromShopId)}
                </td>
                <td className="px-5 py-3 text-xs text-ink-700">
                  {m.toShop?.name ?? shopName(m.toShopId)}
                </td>
                <td className="px-5 py-3 text-ink-600">{m.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Valuation tab — total + by-shop + by-category breakdown.

function ValuationTab(): JSX.Element {
  const { data, isLoading } = useGetValuationQuery({}, { pollingInterval: 60_000 });
  const { data: shopsRes } = useGetShopsQuery();
  const { data: catRes } = useGetCategoriesQuery();
  const v = data?.data;
  const shopName = (id: string): string =>
    shopsRes?.data.find((s) => s.id === id)?.name ?? id.slice(-6);
  const catName = (id: string): string =>
    catRes?.data.find((c) => c.id === id)?.name ?? id.slice(-6);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-ink-100 bg-ink-0 p-6 h-24" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-md border border-ink-100 bg-ink-0 p-5 h-60" />
          <div className="rounded-md border border-ink-100 bg-ink-0 p-5 h-60" />
        </div>
      </div>
    );
  }
  if (!v) return <p className="text-sm text-ink-500">No valuation data yet.</p>;

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-md border border-brand-200/60 bg-gradient-to-br from-brand-50/60 via-ink-0 to-ink-0 p-5 sm:p-6">
        <div aria-hidden className="absolute inset-0 bg-hairlines opacity-30 pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-700">Total stock value</p>
            <p className="font-mono text-3xl sm:text-4xl text-ink-900 mt-2 tabular-nums font-semibold">
              <Money paise={v.totalPaise} />
            </p>
          </div>
          <div className="sm:text-right text-sm">
            <p className="text-ink-800 font-medium">{v.itemCount} items in stock</p>
            <p className="text-xs text-ink-500 mt-1 font-mono">
              As of {new Date(v.asOf).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · MCX
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard eyebrow="By shop" title="Distribution across locations">
          <ul className="space-y-2 text-sm -mt-1">
            {v.byShop.length === 0 && <li className="text-ink-500">—</li>}
            {v.byShop.map((s) => (
              <li key={s.shopId} className="flex items-center justify-between border-b border-ink-50 pb-2 last:border-0">
                <span className="text-ink-800 font-medium">{shopName(s.shopId)}</span>
                <span className="text-xs text-ink-500 font-mono">{s.itemCount} items</span>
                <Money paise={s.totalPaise} className="font-mono tabular-nums text-ink-900" />
              </li>
            ))}
          </ul>
        </SectionCard>
        <SectionCard eyebrow="By category" title="Breakdown by metal & form">
          <ul className="space-y-2 text-sm -mt-1">
            {v.byCategory.length === 0 && <li className="text-ink-500">—</li>}
            {v.byCategory.map((c) => (
              <li key={c.categoryId} className="flex items-center justify-between border-b border-ink-50 pb-2 last:border-0">
                <span className="text-ink-800 font-medium">{catName(c.categoryId)}</span>
                <span className="text-xs text-ink-500 font-mono">{c.itemCount} items</span>
                <Money paise={c.totalPaise} className="font-mono tabular-nums text-ink-900" />
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Low-stock tab.

function LowStockTab(): JSX.Element {
  const [threshold, setThreshold] = useState(3);
  const { data, isLoading } = useGetLowStockQuery({ threshold });
  const { data: catRes } = useGetCategoriesQuery();
  const { data: shopsRes } = useGetShopsQuery();
  const buckets = data?.data?.rows ?? [];
  const items = data?.data?.items ?? [];

  // Index counts by (shopId, categoryId) so each product row can show "X left
  // in this shop+category" — the operational signal owners care about.
  const countKey = (shopId: string, categoryId: string): string => `${shopId}::${categoryId}`;
  const countByBucket = new Map(buckets.map((b) => [countKey(b.shopId, b.categoryId), b.itemCount]));
  const shopNameById = new Map((shopsRes?.data ?? []).map((s) => [s.id, s.name]));
  const catNameById = new Map((catRes?.data ?? []).map((c) => [c.id, c.name]));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <label className="text-ink-700">Alert threshold (items per category × shop)</label>
        <input
          type="number"
          min={0}
          max={50}
          value={threshold}
          onChange={(e) => setThreshold(Math.max(0, Number(e.target.value) || 0))}
          className="h-9 w-20 px-2 rounded-md border border-ink-200 font-mono text-sm focus:outline-none focus:border-brand-500"
        />
      </div>

      {/* Per-bucket summary — running low buckets with their headline count */}
      {buckets.length > 0 && (
        <div className="rounded-md border border-ink-100 bg-ink-0">
          <header className="px-5 py-3 border-b border-ink-100">
            <p className="text-eyebrow uppercase text-ink-500">Running low</p>
            <h2 className="text-md font-medium text-ink-900">
              {buckets.length} category × shop combination{buckets.length === 1 ? '' : 's'} at or below {threshold}
            </h2>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="text-eyebrow uppercase text-ink-500">
                <tr>
                  <th className="text-left px-5 py-3">Shop</th>
                  <th className="text-left px-5 py-3">Category</th>
                  <th className="text-right px-5 py-3">Items in stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {buckets.map((r, i) => (
                  <tr key={i}>
                    <td className="px-5 py-3 text-ink-800">
                      {shopNameById.get(r.shopId) ?? r.shopId.slice(-6)}
                    </td>
                    <td className="px-5 py-3 text-ink-800">
                      {catNameById.get(r.categoryId) ?? r.categoryId.slice(-6)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums">
                      <Badge tone="warning">{r.itemCount}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actual products in those buckets */}
      <div className="rounded-md border border-ink-100 bg-ink-0">
        <header className="px-5 py-3 border-b border-ink-100">
          <p className="text-eyebrow uppercase text-ink-500">Products to restock</p>
          <h2 className="text-md font-medium text-ink-900">Items in running-low buckets</h2>
        </header>
        {isLoading && <p className="p-5 text-sm text-ink-500">Loading…</p>}
        {!isLoading && items.length === 0 && (
          <p className="p-5 text-sm text-ink-500">
            No category × shop is at or below {threshold} items. Healthy stock.
          </p>
        )}
        {items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="text-eyebrow uppercase text-ink-500">
                <tr>
                  <th className="text-left px-5 py-3">SKU</th>
                  <th className="text-left px-5 py-3">Shop</th>
                  <th className="text-left px-5 py-3">Category</th>
                  <th className="text-right px-5 py-3">Weight</th>
                  <th className="text-left px-5 py-3">Purity</th>
                  <th className="text-left px-5 py-3">Hallmark</th>
                  <th className="text-right px-5 py-3">Cost</th>
                  <th className="text-right px-5 py-3">Bucket size</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {items.map((it) => {
                  const bucketCount = countByBucket.get(countKey(it.shopId, it.categoryId)) ?? 0;
                  const tone =
                    it.hallmarkStatus === 'CERTIFIED'
                      ? 'success'
                      : it.hallmarkStatus === 'PENDING'
                        ? 'warning'
                        : it.hallmarkStatus === 'SUBMITTED'
                          ? 'info'
                          : 'neutral';
                  return (
                    <tr key={it.id}>
                      <td className="px-5 py-3 font-mono text-xs text-ink-900">{it.sku}</td>
                      <td className="px-5 py-3 text-ink-800">
                        {shopNameById.get(it.shopId) ?? it.shopId.slice(-6)}
                      </td>
                      <td className="px-5 py-3 text-ink-800">
                        {catNameById.get(it.categoryId) ?? it.categoryId.slice(-6)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Weight mg={it.weightMg} />
                      </td>
                      <td className="px-5 py-3">
                        <Purity x100={it.purityCaratX100} />
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={tone as 'success' | 'warning' | 'info' | 'neutral'}>
                          {it.hallmarkStatus.toLowerCase()}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Money paise={it.costPricePaise} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Badge tone="warning">{bucketCount}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Vendors tab.

function VendorsTab(): JSX.Element {
  const { data, isLoading } = useGetVendorsQuery();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteVendor] = useDeleteVendorMutation();
  const rows = data?.data ?? [];

  async function handleDelete(id: string, name: string): Promise<void> {
    if (!window.confirm(`Delete vendor "${name}"?`)) return;
    try {
      await deleteVendor(id).unwrap();
      toast.success(`${name} deleted`);
    } catch (err) {
      const message =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ??
        'Cannot delete vendor';
      toast.error(message);
    }
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-sm text-ink-500">{rows.length} vendor{rows.length === 1 ? '' : 's'}</p>
        <Button onClick={() => setAddOpen(true)} className="self-start sm:self-auto">
          <Plus className="h-4 w-4" /> Add vendor
        </Button>
      </div>
      <div className="rounded-md border border-ink-100 bg-ink-0">
        {isLoading && <p className="p-5 text-sm text-ink-500">Loading…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="p-5 text-sm text-ink-500">No vendors yet. Add your first supplier.</p>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="text-eyebrow uppercase text-ink-500">
              <tr>
                <th className="text-left px-5 py-3">Name</th>
                <th className="text-left px-5 py-3">Phone</th>
                <th className="text-left px-5 py-3">GSTIN</th>
                <th className="text-left px-5 py-3">Address</th>
                <th className="text-right px-5 py-3">Outstanding</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((v) => (
                <tr key={v.id}>
                  <td className="px-5 py-3 text-ink-900">{v.name}</td>
                  <td className="px-5 py-3 font-mono text-xs">{v.phone}</td>
                  <td className="px-5 py-3 font-mono text-xs">{v.gstNumber ?? '—'}</td>
                  <td className="px-5 py-3 text-ink-600 text-xs max-w-xs truncate">{v.address}</td>
                  <td className="px-5 py-3 text-right">
                    <Money paise={v.outstandingPaise} className="font-mono tabular-nums" />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => void handleDelete(v.id, v.name)}
                      className="text-xs text-danger-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
      <AddVendorDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}

// ----------------------------------------------------------------------------
// Purchase orders tab.

function PurchaseOrdersTab(): JSX.Element {
  const { data, isLoading } = useGetPurchaseOrdersQuery();
  const { data: shopsRes } = useGetShopsQuery();
  const { data: catsRes } = useGetCategoriesQuery();
  const [receivePO, { isLoading: receiving }] = useReceivePurchaseOrderMutation();
  const [createOpen, setCreateOpen] = useState(false);
  // When multi-shop, we open a Sheet so the user can pick the destination
  // visually. Single-shop tenants auto-receive into their only shop and
  // never see this UI. (Previously this used `window.prompt` which is
  // unstylable and a UX dead-end on tablets.)
  const [receiveTargetPo, setReceiveTargetPo] = useState<string | null>(null);
  const rows = data?.data ?? [];
  const shops = shopsRes?.data ?? [];
  const cats = catsRes?.data ?? [];

  async function performReceive(poId: string, shopId: string): Promise<void> {
    try {
      await receivePO({ id: poId, shopId, categoryId: cats[0]!.id }).unwrap();
      toast.success('PO received — items added to stock');
      setReceiveTargetPo(null);
    } catch (err) {
      const message =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ??
        'Could not receive PO';
      toast.error(message);
    }
  }

  async function handleReceive(poId: string): Promise<void> {
    if (shops.length === 0 || cats.length === 0) {
      toast.error('Add a shop and a category first');
      return;
    }
    if (shops.length === 1) {
      await performReceive(poId, shops[0]!.id);
      return;
    }
    // Multi-shop → open picker.
    setReceiveTargetPo(poId);
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-sm text-ink-500">{rows.length} PO{rows.length === 1 ? '' : 's'}</p>
        <Button onClick={() => setCreateOpen(true)} className="self-start sm:self-auto">
          <Plus className="h-4 w-4" /> Create PO
        </Button>
      </div>
      <div className="rounded-md border border-ink-100 bg-ink-0">
        {isLoading && <p className="p-5 text-sm text-ink-500">Loading…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="p-5 text-sm text-ink-500">No purchase orders yet.</p>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="text-eyebrow uppercase text-ink-500">
              <tr>
                <th className="text-left px-5 py-3">PO #</th>
                <th className="text-left px-5 py-3">Vendor</th>
                <th className="text-left px-5 py-3">Created</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-right px-5 py-3">Lines</th>
                <th className="text-right px-5 py-3">Total</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((po) => (
                <tr key={po.id}>
                  <td className="px-5 py-3 font-mono text-xs">{po.id.slice(-8)}</td>
                  <td className="px-5 py-3 text-ink-900">{po.vendor?.name ?? '—'}</td>
                  <td className="px-5 py-3 font-mono text-xs">
                    {new Date(po.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={po.status === 'DRAFT' ? 'neutral' : po.status === 'RECEIVED' ? 'success' : 'info'}>
                      {po.status.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums">{po.items.length}</td>
                  <td className="px-5 py-3 text-right">
                    <Money paise={po.totalPaise} className="font-mono tabular-nums" />
                  </td>
                  <td className="px-5 py-3 text-right">
                    {po.status !== 'RECEIVED' && po.status !== 'CANCELLED' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={receiving}
                        onClick={() => void handleReceive(po.id)}
                      >
                        Receive
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
      <CreatePODialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <ReceivePoShopPicker
        open={!!receiveTargetPo}
        onClose={() => setReceiveTargetPo(null)}
        shops={shops}
        receiving={receiving}
        onPick={(shopId) => {
          if (receiveTargetPo) void performReceive(receiveTargetPo, shopId);
        }}
      />
    </>
  );
}

// Sheet-based destination-shop picker for "Receive PO" in multi-shop tenants.
// Replaces the old window.prompt — keyboard-friendly, themed, tablet-friendly,
// shows shop status (open/closed) so the user picks the right destination.
function ReceivePoShopPicker({
  open,
  onClose,
  shops,
  receiving,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  shops: { id: string; name: string; isActive: boolean }[];
  receiving: boolean;
  onPick: (shopId: string) => void;
}): JSX.Element {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Receive into which shop?</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <p className="text-sm text-ink-500 mb-4">
            The PO lines will land in this shop&apos;s stock as new items.
          </p>
          <ul className="space-y-1.5">
            {shops.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={receiving}
                  onClick={() => onPick(s.id)}
                  className="w-full text-left flex items-center justify-between gap-3 rounded-md border border-ink-100 px-3 h-12 hover:border-brand-300 hover:bg-brand-50/40 transition-colors duration-fast disabled:opacity-50"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full shrink-0',
                        s.isActive ? 'bg-success-500' : 'bg-ink-300',
                      )}
                    />
                    <span className="text-sm font-medium text-ink-900 truncate">{s.name}</span>
                  </span>
                  <Badge tone={s.isActive ? 'success' : 'neutral'}>
                    {s.isActive ? 'open' : 'closed'}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex justify-end">
            <Button variant="outline" onClick={onClose} disabled={receiving}>
              Cancel
            </Button>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

// ----------------------------------------------------------------------------
// Making-charges config (per category).

function MakingChargesTab(): JSX.Element {
  const { data, isLoading } = useGetCategoriesQuery();
  const [update, { isLoading: saving }] = useUpdateCategoryMakingChargeMutation();
  const [draft, setDraft] = useState<Record<string, number>>({});

  if (isLoading) return <p className="text-sm text-ink-500">Loading…</p>;
  const cats = data?.data ?? [];

  return (
    <div className="rounded-md border border-ink-100 bg-ink-0">
      <p className="px-5 pt-5 text-sm text-ink-600">
        Default making-charge percentage applied at billing time per category. Stored as basis points (1% = 100 bps).
      </p>
      {cats.length === 0 ? (
        <p className="p-5 text-sm text-ink-500">No categories yet. Seed runs the demo set.</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm mt-3 min-w-[640px]">
          <thead className="text-eyebrow uppercase text-ink-500">
            <tr>
              <th className="text-left px-5 py-3">Category</th>
              <th className="text-left px-5 py-3">Metal</th>
              <th className="text-right px-5 py-3">Current (%)</th>
              <th className="text-right px-5 py-3">New (%)</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {cats.map((c) => {
              const currentPct = c.defaultMakingChargeBps / 100;
              const draftPct = draft[c.id] ?? currentPct;
              const dirty = draftPct !== currentPct;
              return (
                <tr key={c.id}>
                  <td className="px-5 py-3 text-ink-900">{c.name}</td>
                  <td className="px-5 py-3 text-xs text-ink-700">{c.metalType}</td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums">{currentPct.toFixed(2)}</td>
                  <td className="px-5 py-3 text-right">
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      max={100}
                      value={draftPct}
                      onChange={(e) =>
                        setDraft({ ...draft, [c.id]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
                      }
                      className="h-9 w-24 px-2 rounded-md border border-ink-200 font-mono text-sm text-right focus:outline-none focus:border-brand-500"
                    />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!dirty || saving}
                      onClick={async () => {
                        try {
                          await update({
                            id: c.id,
                            defaultMakingChargeBps: Math.round(draftPct * 100),
                          }).unwrap();
                          toast.success(`Updated ${c.name}`);
                          setDraft((d) => {
                            const next = { ...d };
                            delete next[c.id];
                            return next;
                          });
                        } catch {
                          toast.error('Could not save');
                        }
                      }}
                    >
                      Save
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Audit log tab.

function AuditTab(): JSX.Element {
  const { data, isLoading } = useGetAuditLogQuery(undefined, { pollingInterval: 30_000 });
  const rows = data?.data ?? [];
  return (
    <div className="rounded-md border border-ink-100 bg-ink-0">
      {isLoading && <p className="p-5 text-sm text-ink-500">Loading…</p>}
      {!isLoading && rows.length === 0 && <p className="p-5 text-sm text-ink-500">No audit events yet.</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="text-eyebrow uppercase text-ink-500">
            <tr>
              <th className="text-left px-5 py-3">When</th>
              <th className="text-left px-5 py-3">Entity</th>
              <th className="text-left px-5 py-3">ID</th>
              <th className="text-left px-5 py-3">Action</th>
              <th className="text-left px-5 py-3">By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="px-5 py-3 font-mono text-xs text-ink-700">
                  {new Date(a.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </td>
                <td className="px-5 py-3 text-ink-800">{a.entityType}</td>
                <td className="px-5 py-3 font-mono text-xs">{a.entityId.slice(-8)}</td>
                <td className="px-5 py-3">
                  <Badge tone={a.action === 'CREATE' ? 'success' : 'info'}>{a.action.toLowerCase()}</Badge>
                </td>
                <td className="px-5 py-3 font-mono text-xs">{a.userId?.slice(-6) ?? 'system'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Add-item dialog.

function AddItemDialog({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const { data: cats } = useGetCategoriesQuery();
  const { data: shops } = useGetShopsQuery();
  const { data: existingItemsRes } = useGetItemsQuery({});
  const [create, { isLoading }] = useCreateItemMutation();
  const [form, setForm] = useState({
    sku: '',
    shopId: '',
    categoryId: '',
    weightG: '',
    purityCarat: '22',
    stoneWeightG: '',
    hallmarkStatus: 'PENDING' as 'PENDING' | 'SUBMITTED' | 'CERTIFIED' | 'EXEMPT',
    hallmarkRef: '',
    costPriceRupees: '',
    makingChargePct: '',
  });

  const existingItems = existingItemsRes?.data ?? [];
  const selectedCat = cats?.data.find((c) => c.id === form.categoryId);
  const metalType = selectedCat?.metalType ?? 'GOLD';

  const handleCategoryChange = (catId: string) => {
    const cat = cats?.data.find((c) => c.id === catId);
    let defaultPurity = '22';
    if (cat) {
      if (cat.metalType === 'SILVER') defaultPurity = '0';
      else if (cat.metalType === 'PLATINUM') defaultPurity = '95';
      else if (cat.metalType === 'OTHER') defaultPurity = '0';
    }
    setForm((f) => ({ ...f, categoryId: catId, purityCarat: defaultPurity }));
  };

  // Pre-fill defaults once data lands.
  if (!form.shopId && shops?.data[0]) setForm((f) => ({ ...f, shopId: shops.data[0]!.id }));
  if (!form.categoryId && cats?.data[0]) {
    const firstCat = cats.data[0]!;
    let defaultPurity = '22';
    if (firstCat.metalType === 'SILVER') defaultPurity = '0';
    else if (firstCat.metalType === 'PLATINUM') defaultPurity = '95';
    else if (firstCat.metalType === 'OTHER') defaultPurity = '0';
    setForm((f) => ({ ...f, categoryId: firstCat.id, purityCarat: defaultPurity }));
  }

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const weightMg = Math.round(parseFloat(form.weightG) * 1000);
    const purityCaratX100 = Math.round(parseFloat(form.purityCarat) * 100);
    const costPricePaise = Math.round(parseFloat(form.costPriceRupees) * 100);
    if (!form.sku.trim()) return void toast.error('SKU is required');
    if (!Number.isFinite(weightMg) || weightMg <= 0) return void toast.error('Weight must be > 0');

    // Validate purity based on metal type
    if (metalType === 'GOLD') {
      if (![1400, 1800, 2200, 2400].includes(purityCaratX100)) {
        return void toast.error('Purity must be 14K, 18K, 22K or 24K for Gold');
      }
    } else if (metalType === 'SILVER') {
      if (purityCaratX100 !== 0) return void toast.error('Purity must be Silver (0) for Silver category');
    } else if (metalType === 'PLATINUM') {
      if (purityCaratX100 !== 9500) return void toast.error('Purity must be Platinum (95K) for Platinum category');
    } else if (metalType === 'OTHER') {
      if (purityCaratX100 !== 0) return void toast.error('Purity must be 0 for Other category');
    }

    if (!Number.isFinite(costPricePaise) || costPricePaise <= 0) return void toast.error('Cost price must be > 0');
    if (!form.shopId || !form.categoryId) return void toast.error('Pick a shop and category');

    try {
      await create({
        sku: form.sku.trim(),
        barcodeData: form.sku.trim(),
        shopId: form.shopId,
        categoryId: form.categoryId,
        images: [],
        weightMg,
        purityCaratX100,
        stoneWeightMg: form.stoneWeightG ? Math.round(parseFloat(form.stoneWeightG) * 1000) : null,
        hallmarkStatus: form.hallmarkStatus,
        hallmarkRef: form.hallmarkRef.trim() || null,
        costPricePaise,
        makingChargeBps: form.makingChargePct ? Math.round(parseFloat(form.makingChargePct) * 100) : null,
      }).unwrap();
      toast.success(`Added ${form.sku}`);
      onClose();
    } catch (err) {
      const message =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not save item.';
      toast.error(message);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="!max-w-lg">
        <SheetHeader>
          <SheetTitle>Add item</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form onSubmit={submit} className="space-y-4 text-sm">
            <Field label="Copy details from existing SKU (optional)">
              <select
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  const it = existingItems.find((i) => i.id === val);
                  if (it) {
                    setForm({
                      sku: it.sku,
                      shopId: it.shopId,
                      categoryId: it.categoryId,
                      weightG: String(it.weightMg / 1000),
                      purityCarat: String(it.purityCaratX100 === 0 ? '0' : it.purityCaratX100 / 100),
                      stoneWeightG: it.stoneWeightMg ? String(it.stoneWeightMg / 1000) : '',
                      hallmarkStatus: it.hallmarkStatus,
                      hallmarkRef: it.hallmarkRef || '',
                      costPriceRupees: String(it.costPricePaise / 100),
                      makingChargePct: it.makingChargeBps ? String(it.makingChargeBps / 100) : '',
                    });
                    toast.success(`Copied details from ${it.sku}`);
                  }
                }}
                className={fieldCls}
                value=""
              >
                <option value="">Choose an existing item to copy details…</option>
                {existingItems.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.sku} - {it.name || it.sku}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="SKU">
              <input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className={fieldCls}
                placeholder="DW-0001"
                required
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Shop">
                <select
                  value={form.shopId}
                  onChange={(e) => setForm({ ...form, shopId: e.target.value })}
                  className={fieldCls}
                  required
                >
                  {(shops?.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Category">
                <select
                  value={form.categoryId}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className={fieldCls}
                  required
                >
                  {(cats?.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Weight (g)">
                <input
                  type="number"
                  step="0.001"
                  value={form.weightG}
                  onChange={(e) => setForm({ ...form, weightG: e.target.value })}
                  className={fieldCls}
                  required
                />
              </Field>
              <Field label="Purity">
                <select
                  value={form.purityCarat}
                  onChange={(e) => setForm({ ...form, purityCarat: e.target.value })}
                  className={fieldCls}
                >
                  {metalType === 'GOLD' && (
                    <>
                      <option value="24">24K</option>
                      <option value="22">22K</option>
                      <option value="18">18K</option>
                      <option value="14">14K</option>
                    </>
                  )}
                  {metalType === 'SILVER' && (
                    <option value="0">Silver</option>
                  )}
                  {metalType === 'PLATINUM' && (
                    <option value="95">Platinum (95% Pt)</option>
                  )}
                  {metalType === 'OTHER' && (
                    <option value="0">Non-precious / Attachment</option>
                  )}
                </select>
              </Field>
              <Field label="Stone wt (g)">
                <input
                  type="number"
                  step="0.001"
                  value={form.stoneWeightG}
                  onChange={(e) => setForm({ ...form, stoneWeightG: e.target.value })}
                  className={fieldCls}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Hallmark">
                <select
                  value={form.hallmarkStatus}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      hallmarkStatus: e.target.value as 'PENDING' | 'SUBMITTED' | 'CERTIFIED' | 'EXEMPT',
                    })
                  }
                  className={fieldCls}
                >
                  <option value="PENDING">Pending</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="CERTIFIED">Certified</option>
                  <option value="EXEMPT">Exempt</option>
                </select>
              </Field>
              <Field label="HUID ref">
                <input
                  value={form.hallmarkRef}
                  onChange={(e) => setForm({ ...form, hallmarkRef: e.target.value })}
                  className={fieldCls}
                  placeholder="optional"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Cost price (₹)">
                <input
                  type="number"
                  step="0.01"
                  value={form.costPriceRupees}
                  onChange={(e) => setForm({ ...form, costPriceRupees: e.target.value })}
                  className={fieldCls}
                  required
                />
              </Field>
              <Field label="Making charge (%) override">
                <input
                  type="number"
                  step="0.1"
                  value={form.makingChargePct}
                  onChange={(e) => setForm({ ...form, makingChargePct: e.target.value })}
                  className={fieldCls}
                  placeholder="uses category default"
                />
              </Field>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" type="button" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isLoading}>
                {isLoading ? 'Saving…' : 'Save item'}
              </Button>
            </div>
          </form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

// ----------------------------------------------------------------------------
// Transfer dialog.

function TransferDialog({
  open,
  onClose,
  item,
}: {
  open: boolean;
  onClose: () => void;
  item: Item;
}): JSX.Element {
  const { data: shops } = useGetShopsQuery();
  const [createTransfer, { isLoading }] = useCreateTransferMutation();
  const others = (shops?.data ?? []).filter((s) => s.id !== item.shopId);
  const [toShopId, setToShopId] = useState<string>('');
  const [reason, setReason] = useState('');

  if (!toShopId && others[0]) setToShopId(others[0].id);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!toShopId) return void toast.error('Pick a destination shop');
    if (!reason.trim()) return void toast.error('Reason is required');
    try {
      await createTransfer({
        fromShopId: item.shopId,
        toShopId,
        itemIds: [item.id],
        reason: reason.trim(),
      }).unwrap();
      toast.success(`Transfer requested for ${item.sku} — awaiting approval`);
      onClose();
    } catch (err) {
      const message =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not request transfer.';
      toast.error(message);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Transfer {item.sku}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form onSubmit={submit} className="space-y-4 text-sm">
            <Field label="Destination shop">
              <select
                value={toShopId}
                onChange={(e) => setToShopId(e.target.value)}
                className={fieldCls}
                required
              >
                {others.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reason">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className={fieldCls}
                placeholder="Customer requested showing at Camp branch"
                required
              />
            </Field>
            <div className="flex gap-2">
              <Button variant="outline" type="button" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isLoading}>
                {isLoading ? 'Submitting…' : 'Request transfer'}
              </Button>
            </div>
          </form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

// ----------------------------------------------------------------------------
// Wastage dialog.

function WastageDialog({
  open,
  onClose,
  item,
}: {
  open: boolean;
  onClose: () => void;
  item: Item;
}): JSX.Element {
  const [record, { isLoading }] = useRecordWastageMutation();
  const [reason, setReason] = useState('');

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!reason.trim()) return void toast.error('Reason is required');
    if (!window.confirm(`Mark ${item.sku} as melted/wasted? This cannot be undone.`)) return;
    try {
      await record({ id: item.id, reason: reason.trim() }).unwrap();
      toast.success(`Recorded wastage for ${item.sku}`);
      onClose();
    } catch (err) {
      const message =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not record.';
      toast.error(message);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Wastage / melting · {item.sku}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form onSubmit={submit} className="space-y-4 text-sm">
            <p className="text-ink-600">
              The piece will be marked <Badge tone="warning">melted</Badge> and removed from in-stock valuation.
              The movement stays on the item's audit trail forever.
            </p>
            <Field label="Reason">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className={fieldCls}
                placeholder="Re-melted into 22K bar — design discontinued"
                required
              />
            </Field>
            <div className="flex gap-2">
              <Button variant="outline" type="button" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isLoading}>
                {isLoading ? 'Recording…' : 'Confirm wastage'}
              </Button>
            </div>
          </form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

// ----------------------------------------------------------------------------
// Add-vendor dialog.

function AddVendorDialog({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const [create, { isLoading }] = useCreateVendorMutation();
  const [form, setForm] = useState({ name: '', phone: '+91', gstNumber: '', address: '' });

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const digits = form.phone.replace(/\D/g, '');
    const local = digits.startsWith('91') ? digits.slice(2) : digits;
    if (form.name.trim().length < 2) return void toast.error('Name is required');
    if (!/^[6-9]\d{9}$/.test(local)) return void toast.error('Phone must be a valid Indian number');
    try {
      await create({
        name: form.name.trim(),
        phone: `+91${local}`,
        gstNumber: form.gstNumber.trim() ? form.gstNumber.trim().toUpperCase() : null,
        address: form.address.trim(),
      }).unwrap();
      toast.success(`Added vendor ${form.name}`);
      setForm({ name: '', phone: '+91', gstNumber: '', address: '' });
      onClose();
    } catch (err) {
      const message =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not save vendor.';
      toast.error(message);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Add vendor</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form onSubmit={submit} className="space-y-4 text-sm">
            <Field label="Name">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={fieldCls} required />
            </Field>
            <Field label="Phone (E.164)">
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={`${fieldCls} font-mono`}
                placeholder="+91XXXXXXXXXX"
                required
              />
            </Field>
            <Field label="GSTIN (optional)">
              <input
                value={form.gstNumber}
                onChange={(e) => setForm({ ...form, gstNumber: e.target.value })}
                className={`${fieldCls} font-mono uppercase`}
                placeholder="27AAAAA0000A1Z5"
              />
            </Field>
            <Field label="Address">
              <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={3} className={fieldCls} />
            </Field>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" type="button" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isLoading}>
                {isLoading ? 'Saving…' : 'Save vendor'}
              </Button>
            </div>
          </form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

// ----------------------------------------------------------------------------
// Create PO dialog.

interface POLine {
  itemSku: string;
  weightG: string;
  purityCarat: string;
  costRupees: string;
}

function CreatePODialog({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const { data: vendors } = useGetVendorsQuery();
  const [create, { isLoading }] = useCreatePurchaseOrderMutation();
  const [vendorId, setVendorId] = useState('');
  const [lines, setLines] = useState<POLine[]>([{ itemSku: '', weightG: '', purityCarat: '22', costRupees: '' }]);

  if (!vendorId && vendors?.data[0]) setVendorId(vendors.data[0].id);

  const total = lines.reduce((s, l) => s + (parseFloat(l.costRupees) || 0), 0);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!vendorId) return void toast.error('Pick a vendor');
    const items = lines.map((l) => ({
      itemSku: l.itemSku.trim(),
      weightMg: Math.round(parseFloat(l.weightG) * 1000),
      purity: Math.round(parseFloat(l.purityCarat) * 100),
      costPaise: Math.round(parseFloat(l.costRupees) * 100),
    }));
    if (items.some((i) => !i.itemSku || !Number.isFinite(i.weightMg) || i.weightMg <= 0 || !Number.isFinite(i.costPaise) || i.costPaise <= 0)) {
      return void toast.error('Each line needs SKU, weight, and cost');
    }
    try {
      await create({ vendorId, items }).unwrap();
      toast.success('Purchase order created');
      onClose();
      setLines([{ itemSku: '', weightG: '', purityCarat: '22', costRupees: '' }]);
    } catch (err) {
      const message =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not create PO.';
      toast.error(message);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="!max-w-2xl">
        <SheetHeader>
          <SheetTitle>Create purchase order</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form onSubmit={submit} className="space-y-4 text-sm">
            <Field label="Vendor">
              <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={fieldCls} required>
                <option value="">Choose vendor…</option>
                {(vendors?.data ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>

            <div>
              <div className="grid grid-cols-[1fr_90px_70px_120px_30px] gap-2 text-eyebrow uppercase text-ink-500 mb-2">
                <span>SKU</span>
                <span className="text-right">Weight (g)</span>
                <span className="text-right">Purity</span>
                <span className="text-right">Cost (₹)</span>
                <span />
              </div>
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_90px_70px_120px_30px] gap-2 mb-2">
                  <input
                    value={l.itemSku}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...next[i]!, itemSku: e.target.value };
                      setLines(next);
                    }}
                    className={fieldCls}
                    placeholder="DW-0050"
                  />
                  <input
                    type="number"
                    step="0.001"
                    value={l.weightG}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...next[i]!, weightG: e.target.value };
                      setLines(next);
                    }}
                    className={`${fieldCls} text-right`}
                  />
                  <select
                    value={l.purityCarat}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...next[i]!, purityCarat: e.target.value };
                      setLines(next);
                    }}
                    className={fieldCls}
                  >
                    <option value="24">24K</option>
                    <option value="22">22K</option>
                    <option value="18">18K</option>
                    <option value="14">14K</option>
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    value={l.costRupees}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...next[i]!, costRupees: e.target.value };
                      setLines(next);
                    }}
                    className={`${fieldCls} text-right`}
                  />
                  <button
                    type="button"
                    onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    disabled={lines.length === 1}
                    className="text-ink-400 hover:text-rose-600 disabled:opacity-30"
                    aria-label="Remove line"
                  >
                    ×
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLines([...lines, { itemSku: '', weightG: '', purityCarat: '22', costRupees: '' }])}
              >
                + Add line
              </Button>
            </div>

            <div className="flex items-center justify-between text-ink-700 border-t border-ink-100 pt-3">
              <span className="text-eyebrow uppercase">Total</span>
              <span className="font-mono text-lg">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" type="button" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isLoading}>
                {isLoading ? 'Creating…' : 'Create PO'}
              </Button>
            </div>
          </form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

// ----------------------------------------------------------------------------
// Small helpers.

const fieldCls =
  'w-full h-10 px-3 rounded-md border border-ink-200 bg-ink-0 text-sm focus:outline-none focus:border-brand-500';

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="block">
      <span className="text-eyebrow uppercase text-ink-500 block mb-1">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between border-b border-ink-100 pb-2 last:border-b-0">
      <dt className="text-ink-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// ----------------------------------------------------------------------------
// DistributeStockDialog.

import { useEffect } from 'react';

function DistributeStockDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const { data: shopsRes } = useGetShopsQuery();
  const { data: catRes } = useGetCategoriesQuery();
  const [createTransfer] = useCreateTransferMutation();

  const shops = shopsRes?.data ?? [];
  const categories = catRes?.data ?? [];

  const [sourceShopId, setSourceShopId] = useState('');
  const [toShopId, setToShopId] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCatId, setSelectedCatId] = useState<string>('ALL');
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState('Bulk stock distribution from warehouse');
  const [distributing, setDistributing] = useState(false);

  // Set default source shop (preferring Warehouse)
  useEffect(() => {
    if (shops.length > 0 && !sourceShopId) {
      const warehouse = shops.find((s) => s.name.toLowerCase().includes('warehouse'));
      setSourceShopId(warehouse ? warehouse.id : (shops[0]?.id ?? ''));
    }
  }, [shops, sourceShopId]);

  // Set default destination shop (different from source)
  const destinationShops = useMemo(() => {
    return shops.filter((s) => s.id !== sourceShopId);
  }, [shops, sourceShopId]);

  useEffect(() => {
    if (destinationShops.length > 0) {
      if (!toShopId || !destinationShops.some((s) => s.id === toShopId)) {
        setToShopId(destinationShops[0]?.id ?? '');
      }
    } else {
      setToShopId('');
    }
  }, [destinationShops, toShopId]);

  // Fetch in-stock items at the source shop
  const { data: sourceItemsRes, isLoading: loadingItems } = useGetItemsQuery(
    { shopId: sourceShopId || undefined },
    { skip: !sourceShopId }
  );

  const sourceItems = useMemo(() => {
    return (sourceItemsRes?.data ?? []).filter((i) => i.status === 'IN_STOCK');
  }, [sourceItemsRes]);

  const filteredItems = useMemo(() => {
    let pool = sourceItems;
    if (selectedCatId !== 'ALL') {
      pool = pool.filter((i) => i.categoryId === selectedCatId);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      pool = pool.filter((i) =>
        [i.sku, i.barcodeData, i.name].some((s) =>
          (s ?? '').toString().toLowerCase().includes(q)
        )
      );
    }
    return pool;
  }, [sourceItems, selectedCatId, search]);

  // Clear selections when source shop changes
  useEffect(() => {
    setSelectedIds({});
  }, [sourceShopId]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedCount = Object.values(selectedIds).filter(Boolean).length;

  const toggleSelectAll = () => {
    const allActiveSelected = filteredItems.length > 0 && filteredItems.every((i) => selectedIds[i.id]);
    const next: Record<string, boolean> = { ...selectedIds };
    for (const i of filteredItems) {
      next[i.id] = !allActiveSelected;
    }
    setSelectedIds(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ids = Object.keys(selectedIds).filter((id) => selectedIds[id]);
    if (ids.length === 0) return void toast.error('Select at least one item to distribute');
    if (!toShopId) return void toast.error('Pick a destination shop');
    if (!reason.trim()) return void toast.error('Reason is required');

    setDistributing(true);
    const toastId = toast.loading(`Submitting transfer for ${ids.length} item(s)…`);

    try {
      await createTransfer({
        fromShopId: sourceShopId,
        toShopId,
        itemIds: ids,
        reason: reason.trim(),
      }).unwrap();
      toast.success(`Transfer requested for ${ids.length} item(s) — awaiting approval`, { id: toastId });
      setSelectedIds({});
      onClose();
    } catch (err) {
      const message =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ??
        'Could not submit transfer.';
      toast.error(message, { id: toastId });
    } finally {
      setDistributing(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="!max-w-2xl">
        <SheetHeader>
          <SheetTitle>Distribute stock</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form onSubmit={submit} className="space-y-4 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Source shop (Distribution Center)">
                <select
                  value={sourceShopId}
                  onChange={(e) => setSourceShopId(e.target.value)}
                  className={fieldCls}
                  required
                >
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Destination branch">
                <select
                  value={toShopId}
                  onChange={(e) => setToShopId(e.target.value)}
                  className={fieldCls}
                  required
                  disabled={destinationShops.length === 0}
                >
                  {destinationShops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="border-t border-ink-100 pt-3">
              <span className="text-eyebrow uppercase text-ink-500 block mb-1">Select items to distribute</span>
              <div className="flex gap-2 items-center my-2">
                <input
                  placeholder="Search SKUs or names..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`${fieldCls} flex-1`}
                />
                <select
                  value={selectedCatId}
                  onChange={(e) => setSelectedCatId(e.target.value)}
                  className={`${fieldCls} w-48`}
                >
                  <option value="ALL">All categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="border border-ink-100 rounded-lg max-h-[250px] overflow-y-auto bg-ink-25">
                {loadingItems ? (
                  <p className="text-xs text-ink-500 text-center py-6">Loading showroom items...</p>
                ) : filteredItems.length === 0 ? (
                  <p className="text-xs text-ink-400 text-center py-6">No in-stock items available.</p>
                ) : (
                  <table className="w-full text-xs text-left">
                    <thead className="sticky top-0 bg-ink-100 border-b border-ink-200">
                      <tr>
                        <th className="p-2 w-10">
                          <input
                            type="checkbox"
                            checked={filteredItems.length > 0 && filteredItems.every((i) => selectedIds[i.id])}
                            onChange={toggleSelectAll}
                            aria-label="Select all"
                          />
                        </th>
                        <th className="p-2">SKU / Name</th>
                        <th className="p-2">Category</th>
                        <th className="p-2 text-right">Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((it) => (
                        <tr key={it.id} className="border-b border-ink-100 hover:bg-ink-50">
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={!!selectedIds[it.id]}
                              onChange={() => toggleSelect(it.id)}
                              aria-label={`Select ${it.sku}`}
                            />
                          </td>
                          <td className="p-2">
                            <p className="font-semibold text-ink-900">{it.sku}</p>
                            {it.name && <p className="text-[10px] text-ink-500 truncate max-w-[200px]">{it.name}</p>}
                          </td>
                          <td className="p-2 text-ink-600">
                            {categories.find((c) => c.id === it.categoryId)?.name ?? '—'}
                          </td>
                          <td className="p-2 text-right font-mono">
                            {(it.weightMg / 1000).toFixed(3)}g
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <Field label="Distribution reason (for audit trail)">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={fieldCls}
                required
              />
            </Field>

            <div className="flex gap-2 pt-2 border-t border-ink-100 mt-4">
              <span className="text-xs text-ink-500 flex-1 flex items-center">
                {selectedCount} item(s) selected
              </span>
              <Button variant="outline" type="button" onClick={onClose} disabled={distributing}>
                Cancel
              </Button>
              <Button type="submit" disabled={distributing || selectedCount === 0} className="px-6">
                {distributing ? 'Distributing...' : 'Confirm distribution'}
              </Button>
            </div>
          </form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
