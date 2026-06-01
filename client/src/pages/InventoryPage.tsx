// Inventory module — full feature surface per Gold OS Module 01 spec.
// Tabbed shell. Each tab is DB-backed via RTK Query; mutations invalidate caches
// so adds/edits flow back to the active view (and to dashboard tiles) immediately.

import { useEffect, useMemo, useRef, useState } from 'react';
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
  PackagePlus,
  Pencil,
  X,
  Globe,
} from 'lucide-react';
import { toast } from 'sonner';
import { uploadImageToCloudinary, isCloudinaryConfigured, cloudinaryThumb } from '@/lib/cloudinary';
import type { Item } from '@goldos/shared/types';
import {
  useGetItemsQuery,
  useGetCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useCreateItemMutation,
  useUpdateItemMutation,
  useRecordWastageMutation,
  useAddStockMutation,
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
import { TableToolbar, useTableSearch } from '@/components/data/TableToolbar';
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
  | 'categories'
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
  { id: 'categories', label: 'Categories', icon: TagIcon },
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
      {tab === 'categories' && <CategoriesTab />}
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
  // Cursor-chain pagination — see the comment block above InventoryItemsTable
  // for the rationale. Each entry in `cursorChain` is a cursor that has been
  // fetched; the *active* fetch is the last cursor (or undefined for page 1).
  // Accumulated rows are appended (deduped by id) so the table renders every
  // page that's been loaded so far. Reset to a single fetch when the
  // browser-side filters change, since those operate on the loaded subset.
  const [cursorChain, setCursorChain] = useState<Array<string | undefined>>([undefined]);
  const [allRows, setAllRows] = useState<Item[]>([]);
  const activeCursor = cursorChain[cursorChain.length - 1];
  const { data, isLoading, isFetching } = useGetItemsQuery({
    cursor: activeCursor,
    limit: 50,
  });
  useEffect(() => {
    if (!data?.data) return;
    setAllRows((prev) => {
      const seen = new Set(prev.map((r) => r.id));
      const fresh = data.data.filter((r) => !seen.has(r.id));
      return fresh.length === 0 ? prev : [...prev, ...fresh];
    });
  }, [data]);
  function loadMore(): void {
    const next = data?.page.nextCursor;
    if (!next) return;
    // Guard: don't push the same cursor twice if the user double-clicks.
    if (cursorChain.includes(next)) return;
    setCursorChain((prev) => [...prev, next]);
  }
  const hasMore = data?.page.hasMore ?? false;

  const { data: catRes } = useGetCategoriesQuery();
  const { data: shopsRes } = useGetShopsQuery();
  const [selected, setSelected] = useState<Item | null>(null);
  // editTarget is independent of `selected` so the edit dialog can be opened
  // straight from a row's pencil icon without first popping the detail sheet.
  const [editTarget, setEditTarget] = useState<Item | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [wastageOpen, setWastageOpen] = useState(false);
  const [addStockOpen, setAddStockOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [distributeOpen, setDistributeOpen] = useState(false);
  // Local search + filter state. Lives client-side because the items query
  // already returns up to 100 rows and we sort/filter in-memory elsewhere.
  // Search drops to free-text on SKU / name / barcode; selects narrow by
  // shop / category / status / hallmark.
  const [search, setSearch] = useState('');
  const [shopFilter, setShopFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [hallmarkFilter, setHallmarkFilter] = useState('');

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
      {
        // Per-row inline edit. Stops row-click propagation so the detail Sheet
        // doesn't also open behind the edit dialog. Visible for every row
        // regardless of status — admins occasionally fix the name / image of
        // a SOLD piece for historical accuracy.
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="text-right">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditTarget(row.original);
              }}
              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-500 hover:text-ink-900 hover:bg-ink-50"
              aria-label={`Edit ${row.original.sku}`}
              title="Edit item"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
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
            {allRows.length}
            {hasMore ? '+' : ''} item{allRows.length === 1 ? '' : 's'}
          </StatPill>
        )}
      </Toolbar>

      <BulkImportModal open={importOpen} onClose={() => setImportOpen(false)} />

      <InventoryItemsTable
        rows={allRows}
        isLoading={isLoading && allRows.length === 0}
        columns={columns}
        onRowSelect={setSelected}
        onAddFirst={() => setAddOpen(true)}
        search={search}
        onSearch={setSearch}
        shopFilter={shopFilter}
        onShopFilter={setShopFilter}
        categoryFilter={categoryFilter}
        onCategoryFilter={setCategoryFilter}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        hallmarkFilter={hallmarkFilter}
        onHallmarkFilter={setHallmarkFilter}
        shops={shopsRes?.data ?? []}
        categories={catRes?.data ?? []}
        hasMore={hasMore}
        isFetchingMore={isFetching && allRows.length > 0}
        onLoadMore={loadMore}
      />


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

              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Button variant="outline" onClick={() => setEditTarget(selected)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button variant="outline" disabled={selected.status !== 'IN_STOCK'} onClick={() => setAddStockOpen(true)}>
                  <PackagePlus className="h-4 w-4" /> Add stock
                </Button>
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
      {editTarget && (
        <EditItemDialog
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          item={editTarget}
        />
      )}
      <DistributeStockDialog open={distributeOpen} onClose={() => setDistributeOpen(false)} />
      {selected && (
        <>
          <AddStockDialog
            open={addStockOpen}
            onClose={() => setAddStockOpen(false)}
            item={selected}
          />
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

// Items table extracted so the search + filter wiring + DataTable render
// stay co-located. Keeps ItemsTab readable while adding the new toolbar.
function InventoryItemsTable({
  rows,
  isLoading,
  columns,
  onRowSelect,
  onAddFirst,
  search,
  onSearch,
  shopFilter,
  onShopFilter,
  categoryFilter,
  onCategoryFilter,
  statusFilter,
  onStatusFilter,
  hallmarkFilter,
  onHallmarkFilter,
  shops,
  categories,
  hasMore,
  isFetchingMore,
  onLoadMore,
}: {
  rows: Item[];
  isLoading: boolean;
  columns: ColumnDef<Item>[];
  onRowSelect: (row: Item) => void;
  onAddFirst: () => void;
  search: string;
  onSearch: (next: string) => void;
  shopFilter: string;
  onShopFilter: (next: string) => void;
  categoryFilter: string;
  onCategoryFilter: (next: string) => void;
  statusFilter: string;
  onStatusFilter: (next: string) => void;
  hallmarkFilter: string;
  onHallmarkFilter: (next: string) => void;
  shops: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
  /** True when the server reports a next cursor for the most recent page. */
  hasMore: boolean;
  /** True while a Load-more fetch is in flight (rows are already showing). */
  isFetchingMore: boolean;
  /** Append the next page of items. */
  onLoadMore: () => void;
}): JSX.Element {
  // Selects narrow first (fast equality), then free-text search runs over
  // the smaller pool.
  const preFiltered = useMemo(() => {
    return rows.filter((r) => {
      if (shopFilter && r.shopId !== shopFilter) return false;
      if (categoryFilter && r.categoryId !== categoryFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (hallmarkFilter && r.hallmarkStatus !== hallmarkFilter) return false;
      return true;
    });
  }, [rows, shopFilter, categoryFilter, statusFilter, hallmarkFilter]);
  const filtered = useTableSearch(
    preFiltered,
    (r) => [r.sku, r.name, r.barcodeData, r.hallmarkRef],
    search,
  );

  if (isLoading) return <TableSkeleton rows={8} columns={8} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        eyebrow="No items yet"
        title="Your inventory will appear here."
        body="Add your first item or bulk-import from Excel. Hallmarking status, weight, purity, and live valuation update automatically."
        action={<Button onClick={onAddFirst}>Add first item</Button>}
      />
    );
  }
  return (
    <>
      <TableToolbar
        query={search}
        onQueryChange={onSearch}
        searchPlaceholder="Search SKU, name, barcode or HUID…"
        filters={[
          {
            key: 'shop',
            label: 'Shop',
            value: shopFilter,
            onChange: onShopFilter,
            options: [
              { value: '', label: 'All shops' },
              ...shops.map((s) => ({ value: s.id, label: s.name })),
            ],
          },
          {
            key: 'category',
            label: 'Category',
            value: categoryFilter,
            onChange: onCategoryFilter,
            options: [
              { value: '', label: 'All categories' },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ],
          },
          {
            key: 'status',
            label: 'Status',
            value: statusFilter,
            onChange: onStatusFilter,
            options: [
              { value: '', label: 'Any status' },
              { value: 'IN_STOCK', label: 'In stock' },
              { value: 'IN_TRANSIT', label: 'In transit' },
              { value: 'SOLD', label: 'Sold' },
              { value: 'MELTED', label: 'Melted' },
            ],
          },
          {
            key: 'hallmark',
            label: 'Hallmark',
            value: hallmarkFilter,
            onChange: onHallmarkFilter,
            options: [
              { value: '', label: 'Any hallmark' },
              { value: 'PENDING', label: 'Pending' },
              { value: 'SUBMITTED', label: 'Submitted' },
              { value: 'CERTIFIED', label: 'Certified' },
              { value: 'EXEMPT', label: 'Exempt' },
            ],
          },
        ]}
        count={filtered.length}
        countLabel={filtered.length === 1 ? 'item' : 'items'}
      />
      <DataTable columns={columns} data={filtered} onRowClick={onRowSelect} />
      {/* Pagination footer — visible when the server reports more pages.
          Browser-side filters narrow the loaded subset; if the user has
          filtered everything out but there are more pages on the server,
          the button stays so they can keep loading until a match shows. */}
      {(hasMore || isFetchingMore) && (
        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-ink-500">
          <span>
            Showing {filtered.length} of {rows.length} loaded
            {hasMore ? ' · more on server' : ''}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={!hasMore || isFetchingMore}
          >
            {isFetchingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
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
  const [search, setSearch] = useState('');
  const allRows = data?.data ?? [];
  const shopName = (id: string | null | undefined): string =>
    id ? shopsRes?.data.find((s) => s.id === id)?.name ?? id.slice(-6) : '—';
  const rows = useTableSearch(
    allRows,
    (m) => [m.item?.sku, m.itemId, m.fromShop?.name, m.toShop?.name, m.reason],
    search,
  );
  return (
    <>
      <TableToolbar
        query={search}
        onQueryChange={setSearch}
        searchPlaceholder="Search by SKU, shop or reason…"
        count={rows.length}
        countLabel={rows.length === 1 ? 'movement' : 'movements'}
      />
    <div className="rounded-md border border-ink-100 bg-ink-0">
      {isLoading && <p className="p-5 text-sm text-ink-500">Loading…</p>}
      {!isLoading && allRows.length === 0 && <p className="p-5 text-sm text-ink-500">{emptyLabel}</p>}
      {!isLoading && allRows.length > 0 && rows.length === 0 && <p className="p-5 text-sm text-ink-500">No movements match the search.</p>}
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
    </>
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
  // 30s poll so the restock list catches sale-driven drains without the
  // owner having to refresh — same cadence as the analytics + POS catalogue.
  const [threshold, setThreshold] = useState(3);
  const { data, isLoading } = useGetLowStockQuery({ threshold }, { pollingInterval: 30_000 });
  const { data: catRes } = useGetCategoriesQuery();
  const { data: shopsRes } = useGetShopsQuery();
  // editTarget + addStockTarget reuse the same dialogs the Items tab opens,
  // so the cashier never leaves the Low-stock view to top up a SKU.
  const [editTarget, setEditTarget] = useState<Item | null>(null);
  const [addStockTarget, setAddStockTarget] = useState<Item | null>(null);
  const [search, setSearch] = useState('');
  const buckets = data?.data?.rows ?? [];
  const allItems = data?.data?.items ?? [];
  const items = useTableSearch(
    allItems,
    (i) => [i.sku, i.name],
    search,
  );

  const shopNameById = new Map((shopsRes?.data ?? []).map((s) => [s.id, s.name]));
  const catNameById = new Map((catRes?.data ?? []).map((c) => [c.id, c.name]));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <label className="text-ink-700">Alert threshold (units per SKU)</label>
        <input
          type="number"
          min={0}
          max={50}
          value={threshold}
          onChange={(e) => setThreshold(Math.max(0, Number(e.target.value) || 0))}
          className="h-9 w-20 px-2 rounded-md border border-ink-200 font-mono text-sm focus:outline-none focus:border-brand-500"
        />
        <span className="text-ink-500 text-xs">
          Lot SKUs at or below this count appear here; sold-out (0) items always do.
        </span>
      </div>

      {/* Per-bucket summary — kept as a quick "where am I thin?" header */}
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
                      <Badge tone={r.itemCount === 0 ? 'danger' : 'warning'}>{r.itemCount}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Product-first restock list */}
      <TableToolbar
        query={search}
        onQueryChange={setSearch}
        searchPlaceholder="Search restock list by SKU or product name…"
        count={items.length}
        countLabel={items.length === 1 ? 'product' : 'products'}
      />
      <div className="rounded-md border border-ink-100 bg-ink-0">
        <header className="px-5 py-3 border-b border-ink-100 flex items-center justify-between gap-3">
          <div>
            <p className="text-eyebrow uppercase text-ink-500">Products to restock</p>
            <h2 className="text-md font-medium text-ink-900">
              {items.length} product{items.length === 1 ? '' : 's'} need attention
            </h2>
          </div>
        </header>
        {isLoading && <p className="p-5 text-sm text-ink-500">Loading…</p>}
        {!isLoading && allItems.length === 0 && (
          <p className="p-5 text-sm text-ink-500">
            Every SKU is healthy at or above {threshold} units. Nothing to restock.
          </p>
        )}
        {!isLoading && allItems.length > 0 && items.length === 0 && (
          <p className="p-5 text-sm text-ink-500">No restock items match the search.</p>
        )}
        {items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[920px]">
              <thead className="text-eyebrow uppercase text-ink-500">
                <tr>
                  <th className="text-left px-5 py-3">Product</th>
                  <th className="text-left px-3 py-3">SKU</th>
                  <th className="text-left px-3 py-3">Shop</th>
                  <th className="text-left px-3 py-3">Category</th>
                  <th className="text-right px-3 py-3">Current qty</th>
                  <th className="text-right px-3 py-3">Weight</th>
                  <th className="text-left px-3 py-3">Purity</th>
                  <th className="text-left px-3 py-3">Hallmark</th>
                  <th className="text-right px-3 py-3">Cost</th>
                  <th className="text-right px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {items.map((it) => {
                  const tone =
                    it.hallmarkStatus === 'CERTIFIED'
                      ? 'success'
                      : it.hallmarkStatus === 'PENDING'
                        ? 'warning'
                        : it.hallmarkStatus === 'SUBMITTED'
                          ? 'info'
                          : 'neutral';
                  const isOut = it.status === 'SOLD' || it.quantityOnHand === 0;
                  const qtyTone = isOut ? 'danger' : it.quantityOnHand <= threshold ? 'warning' : 'success';
                  const thumb = it.images?.[0] ?? null;
                  // The detail-sheet dialogs (EditItemDialog + AddStockDialog)
                  // expect a full Item shape. The low-stock projection is a
                  // subset, so we synthesise the missing fields with safe
                  // defaults — the dialogs only read what's in this projection
                  // plus stoneWeight/hallmarkRef/makingChargeBps which Edit
                  // re-fetches at submit time (the patch never reads them).
                  const asItem = {
                    ...it,
                    tenantId: '',
                    barcodeData: it.sku,
                    stoneWeightMg: null,
                    hallmarkRef: null,
                    makingChargeBps: null,
                    createdAt: new Date(),
                  } as unknown as Item;
                  return (
                    <tr key={it.id}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-md bg-ink-50 overflow-hidden flex-shrink-0">
                            {thumb ? (
                              <img
                                src={thumb}
                                alt={it.name ?? it.sku}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="h-full w-full grid place-items-center text-ink-300">
                                <Boxes className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-ink-900 truncate">
                              {it.name ?? it.sku}
                            </p>
                            <p className="text-[11px] text-ink-500">
                              {it.isSerialized ? 'Unique piece' : 'Bulk lot'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-ink-700">{it.sku}</td>
                      <td className="px-3 py-3 text-ink-800">
                        {shopNameById.get(it.shopId) ?? it.shopId.slice(-6)}
                      </td>
                      <td className="px-3 py-3 text-ink-800">
                        {catNameById.get(it.categoryId) ?? it.categoryId.slice(-6)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">
                        {isOut ? (
                          <Badge tone="danger">Sold out</Badge>
                        ) : (
                          <Badge tone={qtyTone as 'success' | 'warning' | 'danger'}>
                            {it.quantityOnHand}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Weight mg={it.weightMg} />
                      </td>
                      <td className="px-3 py-3">
                        <Purity x100={it.purityCaratX100} />
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={tone as 'success' | 'warning' | 'info' | 'neutral'}>
                          {it.hallmarkStatus.toLowerCase()}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Money paise={it.costPricePaise} />
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex gap-1">
                          {it.status === 'IN_STOCK' && (
                            <button
                              type="button"
                              onClick={() => setAddStockTarget(asItem)}
                              className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs text-ink-700 hover:bg-ink-50 hover:text-ink-900"
                              title="Add stock"
                            >
                              <PackagePlus className="h-3.5 w-3.5" /> Restock
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditTarget(asItem)}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-500 hover:bg-ink-50 hover:text-ink-900"
                            title="Edit item"
                            aria-label={`Edit ${it.sku}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editTarget && (
        <EditItemDialog
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          item={editTarget}
        />
      )}
      {addStockTarget && (
        <AddStockDialog
          open={!!addStockTarget}
          onClose={() => setAddStockTarget(null)}
          item={addStockTarget}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Categories tab — manage the Main → Sub category tree.
// Designed for the jewellery flow the user described:
//   "9kt fine gold" (main) → "Bracelet", "Rings", "Earrings" (sub) → individual items.
// Main categories sit at the root (parentId === null). Sub-categories nest
// under a main. Deeper trees are technically allowed by the schema but the
// UI treats anything below depth 2 as still a "sub" for simplicity — most
// jewellery merchants don't need a third tier.

interface CategoryRow {
  id: string;
  name: string;
  parentId: string | null;
  metalType: 'GOLD' | 'SILVER' | 'DIAMOND' | 'PLATINUM' | 'OTHER';
  defaultMakingChargeBps: number;
}

function CategoriesTab(): JSX.Element {
  const { data, isLoading } = useGetCategoriesQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [createUnderParentId, setCreateUnderParentId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<CategoryRow | null>(null);

  const cats = (data?.data ?? []) as CategoryRow[];
  const mains = cats.filter((c) => !c.parentId);
  const subsByParent = new Map<string, CategoryRow[]>();
  for (const c of cats) {
    if (c.parentId) {
      const list = subsByParent.get(c.parentId) ?? [];
      list.push(c);
      subsByParent.set(c.parentId, list);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-sm text-ink-500">
          {mains.length} main categor{mains.length === 1 ? 'y' : 'ies'} ·{' '}
          {cats.length - mains.length} sub-categor
          {cats.length - mains.length === 1 ? 'y' : 'ies'}
        </p>
        <Button
          onClick={() => {
            setCreateUnderParentId(null);
            setCreateOpen(true);
          }}
          className="self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" /> Add main category
        </Button>
      </div>

      {isLoading && <p className="text-sm text-ink-500">Loading…</p>}

      {!isLoading && mains.length === 0 && (
        <EmptyState
          eyebrow="No categories yet"
          title="Create your first category"
          body='Start with a main category like "22kt Fine Gold" or "Silver Bars". You can then add sub-categories (Rings, Bracelets, Coins…) under each.'
          action={
            <Button
              onClick={() => {
                setCreateUnderParentId(null);
                setCreateOpen(true);
              }}
            >
              Add first category
            </Button>
          }
        />
      )}

      {mains.map((main) => {
        const subs = subsByParent.get(main.id) ?? [];
        return (
          <div key={main.id} className="rounded-md border border-ink-100 bg-ink-0">
            <header className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-ink-100">
              <div className="min-w-0">
                <p className="text-eyebrow uppercase text-ink-500">Main category</p>
                <div className="flex items-center gap-2">
                  <h3 className="text-md font-medium text-ink-900 truncate">{main.name}</h3>
                  <Badge tone="neutral">{main.metalType.toLowerCase()}</Badge>
                  <span className="text-xs text-ink-500 font-mono">
                    {(main.defaultMakingChargeBps / 100).toFixed(1)}% making
                  </span>
                </div>
              </div>
              <div className="inline-flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setCreateUnderParentId(main.id);
                    setCreateOpen(true);
                  }}
                  className="inline-flex items-center gap-1 h-8 px-2 rounded-md text-xs text-ink-700 hover:bg-ink-50"
                  title="Add sub-category"
                >
                  <Plus className="h-3.5 w-3.5" /> Sub
                </button>
                <button
                  type="button"
                  onClick={() => setEditTarget(main)}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md text-ink-500 hover:bg-ink-50 hover:text-ink-900"
                  aria-label={`Edit ${main.name}`}
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <DeleteCategoryButton id={main.id} name={main.name} />
              </div>
            </header>
            {subs.length === 0 ? (
              <p className="px-5 py-4 text-xs text-ink-400 italic">
                No sub-categories yet. Click <strong>+ Sub</strong> to add one.
              </p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {subs.map((sub) => (
                  <li key={sub.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-ink-900 truncate">{sub.name}</p>
                      <p className="text-[11px] text-ink-500 font-mono">
                        {(sub.defaultMakingChargeBps / 100).toFixed(1)}% making
                      </p>
                    </div>
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => setEditTarget(sub)}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-500 hover:bg-ink-50 hover:text-ink-900"
                        aria-label={`Edit ${sub.name}`}
                        title="Edit"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <DeleteCategoryButton id={sub.id} name={sub.name} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      <CategoryDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
        defaultParentId={createUnderParentId}
        mains={mains}
      />
      {editTarget && (
        <CategoryDialog
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          mode="edit"
          existing={editTarget}
          mains={mains.filter((m) => m.id !== editTarget.id)}
        />
      )}
    </div>
  );
}

function DeleteCategoryButton({ id, name }: { id: string; name: string }): JSX.Element {
  const [del, { isLoading }] = useDeleteCategoryMutation();
  return (
    <button
      type="button"
      disabled={isLoading}
      onClick={async () => {
        if (!window.confirm(`Delete category "${name}"? This cannot be undone.`)) return;
        try {
          await del(id).unwrap();
          toast.success(`Deleted ${name}`);
        } catch (err) {
          const message =
            (err as { data?: { error?: { message?: string } } }).data?.error?.message ??
            'Cannot delete category';
          toast.error(message);
        }
      }}
      className="inline-flex items-center justify-center h-8 w-8 rounded-md text-ink-500 hover:bg-danger-50 hover:text-danger-700 disabled:opacity-50"
      aria-label={`Delete ${name}`}
      title="Delete"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

function CategoryDialog({
  open,
  onClose,
  mode,
  existing,
  defaultParentId,
  mains,
}: {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  existing?: CategoryRow;
  defaultParentId?: string | null;
  mains: CategoryRow[];
}): JSX.Element {
  const [create, { isLoading: creating }] = useCreateCategoryMutation();
  const [update, { isLoading: updating }] = useUpdateCategoryMutation();
  const isLoading = creating || updating;

  const [form, setForm] = useState({
    name: existing?.name ?? '',
    parentId: existing?.parentId ?? defaultParentId ?? '',
    metalType: existing?.metalType ?? ('GOLD' as 'GOLD' | 'SILVER' | 'DIAMOND' | 'PLATINUM' | 'OTHER'),
    makingPct: existing ? String(existing.defaultMakingChargeBps / 100) : '12',
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: existing?.name ?? '',
      parentId: existing?.parentId ?? defaultParentId ?? '',
      metalType: existing?.metalType ?? 'GOLD',
      makingPct: existing ? String(existing.defaultMakingChargeBps / 100) : '12',
    });
  }, [open, existing?.id]);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (form.name.trim().length < 2) return void toast.error('Name must be at least 2 characters');
    const bps = Math.round(parseFloat(form.makingPct) * 100);
    if (!Number.isFinite(bps) || bps < 0 || bps > 10_000) {
      return void toast.error('Making charge must be between 0 and 100%');
    }
    const parentId = form.parentId ? form.parentId : null;
    try {
      if (mode === 'create') {
        await create({
          name: form.name.trim(),
          parentId,
          metalType: form.metalType,
          defaultMakingChargeBps: bps,
        }).unwrap();
        toast.success(`Added ${form.name.trim()}`);
      } else if (existing) {
        await update({
          id: existing.id,
          patch: {
            name: form.name.trim(),
            parentId,
            metalType: form.metalType,
            defaultMakingChargeBps: bps,
          },
        }).unwrap();
        toast.success(`Updated ${form.name.trim()}`);
      }
      onClose();
    } catch (err) {
      const message =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ??
        'Could not save category.';
      toast.error(message);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{mode === 'create' ? 'Add category' : `Edit ${existing?.name ?? 'category'}`}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form onSubmit={submit} className="space-y-4 text-sm">
            <Field label="Name">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder='e.g. "22kt Fine Gold" or "Rings"'
                className={fieldCls}
                required
              />
            </Field>

            <Field label="Parent category">
              <select
                value={form.parentId}
                onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                className={fieldCls}
              >
                <option value="">— None (main category) —</option>
                {mains.map((m) => (
                  <option key={m.id} value={m.id}>
                    Under {m.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Metal type">
                <select
                  value={form.metalType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      metalType: e.target.value as 'GOLD' | 'SILVER' | 'DIAMOND' | 'PLATINUM' | 'OTHER',
                    })
                  }
                  className={fieldCls}
                >
                  <option value="GOLD">Gold</option>
                  <option value="SILVER">Silver</option>
                  <option value="DIAMOND">Diamond</option>
                  <option value="PLATINUM">Platinum</option>
                  <option value="OTHER">Other</option>
                </select>
              </Field>
              <Field label="Default making charge (%)">
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={form.makingPct}
                  onChange={(e) => setForm({ ...form, makingPct: e.target.value })}
                  className={fieldCls}
                  required
                />
              </Field>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" type="button" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isLoading}>
                {isLoading ? 'Saving…' : mode === 'create' ? 'Create category' : 'Save changes'}
              </Button>
            </div>
          </form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

// ----------------------------------------------------------------------------
// Vendors tab.

function VendorsTab(): JSX.Element {
  const { data, isLoading } = useGetVendorsQuery();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteVendor] = useDeleteVendorMutation();
  const [search, setSearch] = useState('');
  const allRows = data?.data ?? [];
  const rows = useTableSearch(
    allRows,
    (v) => [v.name, v.phone, v.gstNumber, v.address],
    search,
  );

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 mb-1">
        <Button onClick={() => setAddOpen(true)} className="self-start sm:self-auto">
          <Plus className="h-4 w-4" /> Add vendor
        </Button>
      </div>
      <TableToolbar
        query={search}
        onQueryChange={setSearch}
        searchPlaceholder="Search vendors by name, phone, GSTIN or address…"
        count={rows.length}
        countLabel={rows.length === 1 ? 'vendor' : 'vendors'}
      />
      <div className="rounded-md border border-ink-100 bg-ink-0">
        {isLoading && <p className="p-5 text-sm text-ink-500">Loading…</p>}
        {!isLoading && allRows.length === 0 && (
          <p className="p-5 text-sm text-ink-500">No vendors yet. Add your first supplier.</p>
        )}
        {!isLoading && allRows.length > 0 && rows.length === 0 && (
          <p className="p-5 text-sm text-ink-500">No vendors match the search.</p>
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const allRows = data?.data ?? [];
  const shops = shopsRes?.data ?? [];
  const cats = catsRes?.data ?? [];
  const preFiltered = useMemo(
    () => (statusFilter ? allRows.filter((p) => p.status === statusFilter) : allRows),
    [allRows, statusFilter],
  );
  const rows = useTableSearch(
    preFiltered,
    (po) => [po.id, po.vendor?.name, po.status],
    search,
  );

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 mb-1">
        <Button onClick={() => setCreateOpen(true)} className="self-start sm:self-auto">
          <Plus className="h-4 w-4" /> Create PO
        </Button>
      </div>
      <TableToolbar
        query={search}
        onQueryChange={setSearch}
        searchPlaceholder="Search by PO #, vendor or status…"
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: '', label: 'Any status' },
              { value: 'DRAFT', label: 'Draft' },
              { value: 'PLACED', label: 'Placed' },
              { value: 'PARTIAL', label: 'Partial' },
              { value: 'RECEIVED', label: 'Received' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ],
          },
        ]}
        count={rows.length}
        countLabel={rows.length === 1 ? 'PO' : 'POs'}
      />
      <div className="rounded-md border border-ink-100 bg-ink-0">
        {isLoading && <p className="p-5 text-sm text-ink-500">Loading…</p>}
        {!isLoading && allRows.length === 0 && (
          <p className="p-5 text-sm text-ink-500">No purchase orders yet.</p>
        )}
        {!isLoading && allRows.length > 0 && rows.length === 0 && (
          <p className="p-5 text-sm text-ink-500">No POs match the filters.</p>
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
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const allRows = data?.data ?? [];
  const preFiltered = useMemo(
    () =>
      allRows.filter((a) => {
        if (entityFilter && a.entityType !== entityFilter) return false;
        if (actionFilter && a.action !== actionFilter) return false;
        return true;
      }),
    [allRows, entityFilter, actionFilter],
  );
  const rows = useTableSearch(
    preFiltered,
    (a) => [a.entityType, a.entityId, a.action, a.userId],
    search,
  );
  // Unique entity / action sets for the filter selects — driven by data so
  // new entity types appear automatically.
  const entityOptions = useMemo(
    () => Array.from(new Set(allRows.map((a) => a.entityType))).sort(),
    [allRows],
  );
  const actionOptions = useMemo(
    () => Array.from(new Set(allRows.map((a) => a.action))).sort(),
    [allRows],
  );
  return (
    <>
      <TableToolbar
        query={search}
        onQueryChange={setSearch}
        searchPlaceholder="Search by entity, ID, action or user…"
        filters={[
          {
            key: 'entity',
            label: 'Entity',
            value: entityFilter,
            onChange: setEntityFilter,
            options: [
              { value: '', label: 'All entities' },
              ...entityOptions.map((e) => ({ value: e, label: e })),
            ],
          },
          {
            key: 'action',
            label: 'Action',
            value: actionFilter,
            onChange: setActionFilter,
            options: [
              { value: '', label: 'All actions' },
              ...actionOptions.map((a) => ({ value: a, label: a.toLowerCase() })),
            ],
          },
        ]}
        count={rows.length}
        countLabel={rows.length === 1 ? 'event' : 'events'}
      />
    <div className="rounded-md border border-ink-100 bg-ink-0">
      {isLoading && <p className="p-5 text-sm text-ink-500">Loading…</p>}
      {!isLoading && allRows.length === 0 && <p className="p-5 text-sm text-ink-500">No audit events yet.</p>}
      {!isLoading && allRows.length > 0 && rows.length === 0 && <p className="p-5 text-sm text-ink-500">No events match the filters.</p>}
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
    </>
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
    name: '',
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
  // Images and publish-to-website live alongside the form but outside the
  // text/select state object so the upload UI can update images without
  // re-rendering every other input.
  const [images, setImages] = useState<string[]>([]);
  const [publishToWebsite, setPublishToWebsite] = useState(true);
  const [uploading, setUploading] = useState<{ name: string; progress: number }[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cloudinaryReady = isCloudinaryConfigured();
  // Stock model — see schema.prisma Item.isSerialized.
  //   'unique': one row per physical piece (rings, necklaces). Add Stock
  //             clones N new rows with auto-generated SKUs.
  //   'bulk':   one row tracks an interchangeable lot (gold coins, silver
  //             bars). Add Stock bumps quantityOnHand. Initial qty asked
  //             upfront so the cashier doesn't have to add-stock twice.
  const [stockMode, setStockMode] = useState<'unique' | 'bulk'>('unique');
  const [initialQty, setInitialQty] = useState<string>('1');

  async function uploadFiles(files: File[]): Promise<void> {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      toast.error('Only image files are supported');
      return;
    }
    setUploading((prev) => [...prev, ...imageFiles.map((f) => ({ name: f.name, progress: 0 }))]);
    const results = await Promise.allSettled(
      imageFiles.map((file) =>
        uploadImageToCloudinary(file, {
          folder: 'zelora/items',
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
    if (newUrls.length > 0) setImages((prev) => [...prev, ...newUrls]);
    if (failures > 0) toast.error(`${failures} upload${failures === 1 ? '' : 's'} failed`);
    setUploading((prev) => prev.filter((u) => !imageFiles.some((f) => f.name === u.name)));
  }

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
    if (!form.name.trim()) return void toast.error('Item name is required');
    if (!form.sku.trim()) return void toast.error('SKU is required');
    if (!Number.isFinite(weightMg) || weightMg <= 0) return void toast.error('Weight must be > 0');
    if (publishToWebsite && images.length === 0) {
      return void toast.error('Add at least one image to publish on the storefront');
    }

    // Stock mode → isSerialized + quantityOnHand. Unique = 1 piece per row,
    // bulk = N interchangeable units sharing a single row.
    const isSerialized = stockMode === 'unique';
    let quantityOnHand = 1;
    if (!isSerialized) {
      const parsed = parseInt(initialQty, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        return void toast.error('Initial quantity must be at least 1');
      }
      if (parsed > 10_000) {
        return void toast.error('Initial quantity capped at 10,000 — split into multiple rows');
      }
      quantityOnHand = parsed;
    }

    // Validate purity per metal type. Gold accepts any carat from 0 up to
    // 24K — covers every alloy a jeweller might stock (9K rolled gold,
    // 16K, 21K, 23K), low-K novelty pieces, and pure 24K bullion. Silver /
    // Platinum / Other still require their canonical values.
    if (metalType === 'GOLD') {
      if (purityCaratX100 < 0 || purityCaratX100 > 2400) {
        return void toast.error('Purity must be between 0K and 24K for Gold');
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

    // Stone weight is optional. Guard against NaN (empty / non-numeric) and
    // negatives — the schema rejects either and Zod's error path is opaque
    // when a `parseFloat(...) * 1000` slips through with a bad value.
    const stoneRaw = parseFloat(form.stoneWeightG);
    const stoneWeightMg =
      form.stoneWeightG && Number.isFinite(stoneRaw) && stoneRaw > 0
        ? Math.round(stoneRaw * 1000)
        : null;
    const makingRaw = parseFloat(form.makingChargePct);
    const makingChargeBps =
      form.makingChargePct && Number.isFinite(makingRaw) && makingRaw >= 0
        ? Math.round(makingRaw * 100)
        : null;

    try {
      await create({
        name: form.name.trim(),
        sku: form.sku.trim(),
        barcodeData: form.sku.trim(),
        shopId: form.shopId,
        categoryId: form.categoryId,
        images,
        weightMg,
        purityCaratX100,
        stoneWeightMg,
        hallmarkStatus: form.hallmarkStatus,
        hallmarkRef: form.hallmarkRef.trim() || null,
        costPricePaise,
        makingChargeBps,
        // Hybrid stock model — Add Item form lets admins pick between
        // UNIQUE (one piece per row, cloned on add-stock) and BULK (lot
        // tracking N interchangeable pieces with an integer counter).
        isSerialized,
        quantityOnHand,
        publishToWebsite,
      }).unwrap();
      const stockLabel = isSerialized ? '' : ` (${quantityOnHand} in stock)`;
      toast.success(
        publishToWebsite
          ? `Added ${form.name.trim()}${stockLabel} and published to storefront`
          : `Added ${form.name.trim()}${stockLabel}`,
      );
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
                      name: it.name || '',
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
                    setImages(it.images ?? []);
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

            <Field label="Item name">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={fieldCls}
                placeholder="Floral diamond pendant"
                required
              />
            </Field>

            <Field label="Item images">
              <div className="space-y-2">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const files = Array.from(e.dataTransfer.files);
                    if (files.length > 0) void uploadFiles(files);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  className="flex flex-col items-center justify-center gap-1 px-3 py-4 rounded-md border-2 border-dashed border-ink-200 hover:border-ink-300 hover:bg-ink-25 cursor-pointer transition-colors"
                >
                  <Upload className="h-5 w-5 text-ink-500" aria-hidden />
                  <p className="text-xs text-ink-600">
                    <span className="font-medium text-ink-900">Click to upload</span> or drag &amp; drop
                  </p>
                  <p className="text-[11px] text-ink-500">PNG, JPG, WebP · up to 8 MB each</p>
                  {!cloudinaryReady && (
                    <p className="text-[11px] text-ink-500">
                      Dev mode: images stored locally (set VITE_CLOUDINARY_* for hosted)
                    </p>
                  )}
                </div>
                {/* Input lives as a SIBLING of the click target, not a child.
                    When it was nested inside the dropzone the programmatic
                    .click() bubbled back to the parent's onClick and re-fired
                    the picker — opening it twice. */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files ? Array.from(e.target.files) : [];
                    if (files.length > 0) void uploadFiles(files);
                    e.target.value = '';
                  }}
                />
                {uploading.length > 0 && (
                  <ul className="space-y-1">
                    {uploading.map((u) => (
                      <li key={u.name} className="rounded-md border border-ink-100 bg-ink-25 px-2 py-1.5">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-ink-700 truncate">{u.name}</span>
                          <span className="font-mono tabular-nums text-ink-500">{u.progress}%</span>
                        </div>
                        <div className="mt-1 h-0.5 rounded-full bg-ink-100 overflow-hidden">
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
                  <ul className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                    {images.map((url, idx) => (
                      <li key={url + idx} className="relative group rounded-md border border-ink-100 bg-ink-25 overflow-hidden aspect-square">
                        <img
                          src={cloudinaryThumb(url, 200) ?? url}
                          alt={`Item image ${idx + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setImages(images.filter((_, i) => i !== idx))}
                          className="absolute top-0.5 right-0.5 h-5 w-5 inline-flex items-center justify-center rounded-full bg-ink-900/70 text-ink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Remove image"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        {idx === 0 && (
                          <span className="absolute bottom-0.5 left-0.5 text-[9px] px-1 py-0.5 rounded-full bg-ink-900/70 text-ink-0">
                            Primary
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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

            <Field label="Stock type">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStockMode('unique')}
                  className={cn(
                    'rounded-md border px-3 py-2 text-left transition-colors',
                    stockMode === 'unique'
                      ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-400'
                      : 'border-ink-200 hover:border-ink-300',
                  )}
                >
                  <span className="block text-sm font-medium text-ink-900">Unique piece</span>
                  <span className="block text-[11px] text-ink-500">
                    Ring, necklace, bangle — each piece tracked as its own SKU
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setStockMode('bulk')}
                  className={cn(
                    'rounded-md border px-3 py-2 text-left transition-colors',
                    stockMode === 'bulk'
                      ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-400'
                      : 'border-ink-200 hover:border-ink-300',
                  )}
                >
                  <span className="block text-sm font-medium text-ink-900">Bulk lot</span>
                  <span className="block text-[11px] text-ink-500">
                    Gold coin, silver bar — N interchangeable pieces, one counter
                  </span>
                </button>
              </div>
            </Field>

            {stockMode === 'bulk' && (
              <Field label="Initial quantity in stock">
                <input
                  type="number"
                  min={1}
                  max={10_000}
                  step={1}
                  value={initialQty}
                  onChange={(e) => setInitialQty(e.target.value)}
                  className={fieldCls}
                  placeholder="e.g. 50"
                  required
                />
              </Field>
            )}

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
                  <CategoryOptions categories={cats?.data ?? []} />
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
                <PurityPicker
                  value={form.purityCarat}
                  metalType={metalType}
                  onChange={(v) => setForm({ ...form, purityCarat: v })}
                />
              </Field>
              <Field label="Stone wt (g)">
                <input
                  type="number"
                  step="0.001"
                  min={0}
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
                  min={0}
                  value={form.makingChargePct}
                  onChange={(e) => setForm({ ...form, makingChargePct: e.target.value })}
                  className={fieldCls}
                  placeholder="uses category default"
                />
              </Field>
            </div>
            <label className="flex items-start gap-2 pt-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={publishToWebsite}
                onChange={(e) => setPublishToWebsite(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-500 focus:ring-brand-400"
              />
              <span className="flex-1">
                <span className="flex items-center gap-1.5 text-ink-900 font-medium">
                  <Globe className="h-3.5 w-3.5" /> Publish on storefront
                </span>
                <span className="block text-xs text-ink-500">
                  Customers see this piece on the public website. Goes &quot;Sold out&quot; automatically when stock hits 0.
                </span>
              </span>
            </label>
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
// Edit-item dialog. Loads the row's current values, lets the admin change
// every editable field (name, image gallery, weight, purity, stone weight,
// hallmark, cost, making-charge override), then PATCHes via
// useUpdateItemMutation. Stock-shape fields (isSerialized, quantityOnHand)
// are intentionally read-only here — converting a unique row to a lot (or
// vice versa) mid-life would mislead audit trails; use Add Stock / Wastage
// for those flows. SKU is also locked so existing barcode + bill-line FKs
// don't dangle.

function EditItemDialog({
  open,
  onClose,
  item,
}: {
  open: boolean;
  onClose: () => void;
  item: Item;
}): JSX.Element {
  const { data: cats } = useGetCategoriesQuery();
  const { data: shops } = useGetShopsQuery();
  const [update, { isLoading }] = useUpdateItemMutation();
  const [form, setForm] = useState({
    name: item.name ?? '',
    shopId: item.shopId,
    categoryId: item.categoryId,
    weightG: String(item.weightMg / 1000),
    purityCarat: String(item.purityCaratX100 === 0 ? '0' : item.purityCaratX100 / 100),
    stoneWeightG: item.stoneWeightMg ? String(item.stoneWeightMg / 1000) : '',
    hallmarkStatus: item.hallmarkStatus,
    hallmarkRef: item.hallmarkRef ?? '',
    costPriceRupees: String(item.costPricePaise / 100),
    makingChargePct: item.makingChargeBps ? String(item.makingChargeBps / 100) : '',
  });
  const [images, setImages] = useState<string[]>(item.images ?? []);
  const [uploading, setUploading] = useState<{ name: string; progress: number }[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cloudinaryReady = isCloudinaryConfigured();

  // Reset form whenever the dialog is opened against a different item (the
  // mount key already does this, but explicit reset keeps the contract
  // obvious for future callers that reuse a single dialog instance).
  useEffect(() => {
    if (!open) return;
    setForm({
      name: item.name ?? '',
      shopId: item.shopId,
      categoryId: item.categoryId,
      weightG: String(item.weightMg / 1000),
      purityCarat: String(item.purityCaratX100 === 0 ? '0' : item.purityCaratX100 / 100),
      stoneWeightG: item.stoneWeightMg ? String(item.stoneWeightMg / 1000) : '',
      hallmarkStatus: item.hallmarkStatus,
      hallmarkRef: item.hallmarkRef ?? '',
      costPriceRupees: String(item.costPricePaise / 100),
      makingChargePct: item.makingChargeBps ? String(item.makingChargeBps / 100) : '',
    });
    setImages(item.images ?? []);
  }, [open, item.id]);

  const selectedCat = cats?.data.find((c) => c.id === form.categoryId);
  const metalType = selectedCat?.metalType ?? 'GOLD';

  async function uploadFiles(files: File[]): Promise<void> {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      toast.error('Only image files are supported');
      return;
    }
    setUploading((prev) => [...prev, ...imageFiles.map((f) => ({ name: f.name, progress: 0 }))]);
    const results = await Promise.allSettled(
      imageFiles.map((file) =>
        uploadImageToCloudinary(file, {
          folder: 'zelora/items',
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
    if (newUrls.length > 0) setImages((prev) => [...prev, ...newUrls]);
    if (failures > 0) toast.error(`${failures} upload${failures === 1 ? '' : 's'} failed`);
    setUploading((prev) => prev.filter((u) => !imageFiles.some((f) => f.name === u.name)));
  }

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const weightMg = Math.round(parseFloat(form.weightG) * 1000);
    const purityCaratX100 = Math.round(parseFloat(form.purityCarat) * 100);
    const costPricePaise = Math.round(parseFloat(form.costPriceRupees) * 100);
    if (!form.name.trim()) return void toast.error('Item name is required');
    if (!Number.isFinite(weightMg) || weightMg <= 0) return void toast.error('Weight must be > 0');
    if (metalType === 'GOLD' && (purityCaratX100 < 0 || purityCaratX100 > 2400)) {
      return void toast.error('Purity must be between 0K and 24K for Gold');
    }
    if (!Number.isFinite(costPricePaise) || costPricePaise <= 0) {
      return void toast.error('Cost price must be > 0');
    }

    const stoneRaw = parseFloat(form.stoneWeightG);
    const stoneWeightMg =
      form.stoneWeightG && Number.isFinite(stoneRaw) && stoneRaw > 0
        ? Math.round(stoneRaw * 1000)
        : null;
    const makingRaw = parseFloat(form.makingChargePct);
    const makingChargeBps =
      form.makingChargePct && Number.isFinite(makingRaw) && makingRaw >= 0
        ? Math.round(makingRaw * 100)
        : null;

    try {
      await update({
        id: item.id,
        patch: {
          name: form.name.trim(),
          shopId: form.shopId,
          categoryId: form.categoryId,
          images,
          weightMg,
          purityCaratX100,
          stoneWeightMg,
          hallmarkStatus: form.hallmarkStatus,
          hallmarkRef: form.hallmarkRef.trim() || null,
          costPricePaise,
          makingChargeBps,
        },
      }).unwrap();
      toast.success(`Updated ${form.name.trim()}`);
      onClose();
    } catch (err) {
      const message =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not save changes.';
      toast.error(message);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="!max-w-lg">
        <SheetHeader>
          <SheetTitle>Edit item · {item.sku}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form onSubmit={submit} className="space-y-4 text-sm">
            <p className="text-xs text-ink-500">
              SKU + stock type are locked. Change name, photos, weight, hallmark, pricing here;
              use Add Stock / Wastage for stock-level changes.
            </p>

            <Field label="Item name">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={fieldCls}
                required
              />
            </Field>

            <Field label="Item images">
              <div className="space-y-2">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const files = Array.from(e.dataTransfer.files);
                    if (files.length > 0) void uploadFiles(files);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  className="flex flex-col items-center justify-center gap-1 px-3 py-4 rounded-md border-2 border-dashed border-ink-200 hover:border-ink-300 hover:bg-ink-25 cursor-pointer transition-colors"
                >
                  <Upload className="h-5 w-5 text-ink-500" aria-hidden />
                  <p className="text-xs text-ink-600">
                    <span className="font-medium text-ink-900">Click to upload</span> or drag &amp; drop
                  </p>
                  <p className="text-[11px] text-ink-500">PNG, JPG, WebP · up to 8 MB each</p>
                  {!cloudinaryReady && (
                    <p className="text-[11px] text-ink-500">
                      Dev mode: images stored locally (set VITE_CLOUDINARY_* for hosted)
                    </p>
                  )}
                </div>
                {/* Sibling, not child — see AddItemDialog for the rationale.
                    Nesting inside the dropzone re-fired the picker via event
                    bubbling. */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files ? Array.from(e.target.files) : [];
                    if (files.length > 0) void uploadFiles(files);
                    e.target.value = '';
                  }}
                />
                {uploading.length > 0 && (
                  <ul className="space-y-1">
                    {uploading.map((u) => (
                      <li key={u.name} className="rounded-md border border-ink-100 bg-ink-25 px-2 py-1.5">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-ink-700 truncate">{u.name}</span>
                          <span className="font-mono tabular-nums text-ink-500">{u.progress}%</span>
                        </div>
                        <div className="mt-1 h-0.5 rounded-full bg-ink-100 overflow-hidden">
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
                  <ul className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                    {images.map((url, idx) => (
                      <li key={url + idx} className="relative group rounded-md border border-ink-100 bg-ink-25 overflow-hidden aspect-square">
                        <img
                          src={cloudinaryThumb(url, 200) ?? url}
                          alt={`Item image ${idx + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setImages(images.filter((_, i) => i !== idx))}
                          className="absolute top-0.5 right-0.5 h-5 w-5 inline-flex items-center justify-center rounded-full bg-ink-900/70 text-ink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Remove image"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        {idx === 0 && (
                          <span className="absolute bottom-0.5 left-0.5 text-[9px] px-1 py-0.5 rounded-full bg-ink-900/70 text-ink-0">
                            Primary
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  className={fieldCls}
                  required
                >
                  <CategoryOptions categories={cats?.data ?? []} />
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Weight (g)">
                <input
                  type="number"
                  step="0.001"
                  min={0}
                  value={form.weightG}
                  onChange={(e) => setForm({ ...form, weightG: e.target.value })}
                  className={fieldCls}
                  required
                />
              </Field>
              <Field label="Purity">
                <PurityPicker
                  value={form.purityCarat}
                  metalType={metalType}
                  onChange={(v) => setForm({ ...form, purityCarat: v })}
                />
              </Field>
              <Field label="Stone wt (g)">
                <input
                  type="number"
                  step="0.001"
                  min={0}
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
                  min={0}
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
                  min={0}
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
                {isLoading ? 'Saving…' : 'Save changes'}
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
// Add-stock dialog.
//
// Branches on item.isSerialized: serialized creates N new SKU rows cloned
// from this design; lot increments the on-hand count of this row. Server
// authoritative, but we mirror the explanation here so the user knows
// exactly what they're about to do before they click Confirm.

function AddStockDialog({
  open,
  onClose,
  item,
}: {
  open: boolean;
  onClose: () => void;
  item: Item;
}): JSX.Element {
  const [addStock, { isLoading }] = useAddStockMutation();
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState('');
  const [costInr, setCostInr] = useState<string>('');

  const isLot = item.isSerialized === false;
  const currentQty = item.quantityOnHand ?? 1;

  // Reset form when sheet opens against a different item.
  useEffect(() => {
    if (open) {
      setQuantity(1);
      setReason('');
      setCostInr('');
    }
  }, [open, item.id]);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!Number.isInteger(quantity) || quantity < 1) {
      return void toast.error('Quantity must be a positive integer');
    }
    if (quantity > 10_000) return void toast.error('Quantity capped at 10,000');
    let costPricePaise: number | undefined;
    if (costInr.trim()) {
      const inr = Number(costInr);
      if (!Number.isFinite(inr) || inr < 0) {
        return void toast.error('Cost price must be a non-negative number');
      }
      costPricePaise = Math.round(inr * 100);
    }
    try {
      const res = await addStock({
        id: item.id,
        quantity,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(costPricePaise !== undefined ? { costPricePaise } : {}),
      }).unwrap();
      if (res.data.mode === 'serialized') {
        toast.success(
          `Created ${res.data.added} new piece${res.data.added === 1 ? '' : 's'} cloned from ${item.sku}.`,
        );
      } else {
        toast.success(
          `Added ${res.data.added} to ${item.sku} — now ${res.data.newQuantity ?? '—'} on hand.`,
        );
      }
      onClose();
    } catch (err) {
      const message =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ??
        'Could not add stock.';
      toast.error(message);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Add stock · {item.sku}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form onSubmit={submit} className="space-y-4 text-sm">
            <div className="flex items-center gap-2">
              <Badge tone={isLot ? 'info' : 'neutral'}>{isLot ? 'LOT' : 'UNIQUE'}</Badge>
              <span className="text-xs text-ink-500 font-mono">
                On hand: {isLot ? currentQty : 1}
                {!isLot && (
                  <span className="text-ink-400"> (each unique piece is its own row)</span>
                )}
              </span>
            </div>
            <p className="text-ink-600">
              {isLot
                ? `This will increase the on-hand count from ${currentQty} to ${
                    currentQty + (Number.isFinite(quantity) ? quantity : 0)
                  }.`
                : `This will create ${quantity || 0} new piece${
                    quantity === 1 ? '' : 's'
                  } with auto-generated SKUs, cloned from this design.`}
            </p>
            <Field label="Quantity">
              <input
                type="number"
                min={1}
                max={10_000}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className={fieldCls}
                required
              />
            </Field>
            <Field label="Cost price override (₹, optional)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={costInr}
                onChange={(e) => setCostInr(e.target.value)}
                placeholder={isLot ? 'Update lot cost' : 'Apply to all new pieces'}
                className={fieldCls}
              />
            </Field>
            <Field label="Reason (optional)">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={200}
                className={fieldCls}
                placeholder={
                  isLot ? 'Restock from vendor Rajesh — invoice 4421' : 'Re-runs of best-selling design'
                }
              />
            </Field>
            <div className="flex gap-2">
              <Button variant="outline" type="button" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isLoading}>
                {isLoading ? 'Adding…' : 'Confirm add'}
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

// Purity picker — preset chips for the common gold carats (24K / 22K / 18K /
// 14K) plus a "Custom" mode that exposes a number input. Stores the raw
// carat value as a string in `form.purityCarat` (e.g. "21" for 21K) so the
// existing parseFloat(carat) * 100 calculation downstream stays unchanged.
// Used by AddItemDialog and EditItemDialog; the metalType arg gates which
// presets we offer (gold only — silver/platinum/other have one fixed value).
function PurityPicker({
  value,
  metalType,
  onChange,
}: {
  value: string;
  metalType: 'GOLD' | 'SILVER' | 'DIAMOND' | 'PLATINUM' | 'OTHER';
  onChange: (v: string) => void;
}): JSX.Element {
  // Non-gold metals have exactly one valid purity — render a disabled chip
  // so the field reads as deliberately locked, not broken.
  if (metalType === 'SILVER' || metalType === 'OTHER') {
    return (
      <div className={`${fieldCls} flex items-center text-ink-500 italic`}>
        {metalType === 'SILVER' ? 'Silver (fixed)' : 'Non-precious (fixed)'}
      </div>
    );
  }
  if (metalType === 'PLATINUM') {
    return (
      <div className={`${fieldCls} flex items-center text-ink-500 italic`}>
        Platinum 95% (fixed)
      </div>
    );
  }
  // Gold + Diamond paths: chip presets plus custom carat input. Diamond
  // pieces are often set in 14K / 18K white gold so we offer the same gold
  // presets there too.
  const presets = ['24', '22', '18', '14'];
  const isPreset = presets.includes(value);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={cn(
              'h-8 px-2.5 rounded-md text-xs font-medium border transition-colors',
              value === p
                ? 'bg-brand-500 text-ink-0 border-brand-500'
                : 'bg-ink-0 text-ink-700 border-ink-200 hover:border-ink-300',
            )}
          >
            {p}K
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            if (isPreset) onChange('');
          }}
          className={cn(
            'h-8 px-2.5 rounded-md text-xs font-medium border transition-colors',
            !isPreset
              ? 'bg-brand-500 text-ink-0 border-brand-500'
              : 'bg-ink-0 text-ink-700 border-ink-200 hover:border-ink-300',
          )}
        >
          Custom
        </button>
      </div>
      {!isPreset && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.5"
            min={0}
            max={24}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. 9"
            className={`${fieldCls} flex-1`}
          />
          <span className="text-xs text-ink-500 whitespace-nowrap">K (0–24)</span>
        </div>
      )}
    </div>
  );
}

// Renders <option>s grouped by main category. The selected value stays a
// single categoryId (item rows can FK to either main or sub) — this is
// purely a visual hierarchy in the picker. Mains without children appear at
// the top, ungrouped. Mains with children render as <optgroup> whose label
// is the main's name and whose options are the children (the main itself
// is also offered first inside the optgroup so a merchant who wants to
// assign an item to "22kt Fine Gold" directly without a sub still can).
function CategoryOptions({
  categories,
}: {
  categories: Array<{ id: string; name: string; parentId?: string | null }>;
}): JSX.Element {
  const mains = categories.filter((c) => !c.parentId);
  const subsByParent = new Map<string, Array<{ id: string; name: string }>>();
  for (const c of categories) {
    if (c.parentId) {
      const list = subsByParent.get(c.parentId) ?? [];
      list.push({ id: c.id, name: c.name });
      subsByParent.set(c.parentId, list);
    }
  }
  return (
    <>
      {mains.map((m) => {
        const children = subsByParent.get(m.id) ?? [];
        if (children.length === 0) {
          return (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          );
        }
        return (
          <optgroup key={m.id} label={m.name}>
            <option value={m.id}>{m.name} (general)</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
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
  // Per-item quantity to transfer. Missing key OR value <= 0 = not selected.
  // For serialized rows the value is always 1 (UI locks the input). For lot
  // rows it's whatever the admin typed, capped at the source's quantityOnHand.
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
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
    setSelectedQty({});
  }, [sourceShopId]);

  // Toggling a row: if currently unselected, default to qty=1 for serialized
  // rows and qty=quantityOnHand for lot rows (operators typically want to
  // ship the whole bin); if selected, clear it.
  const toggleSelect = (id: string) => {
    setSelectedQty((prev) => {
      if (prev[id] && prev[id]! > 0) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      const it = sourceItems.find((x) => x.id === id);
      const defaultQty = it && it.isSerialized === false
        ? Math.max(1, it.quantityOnHand ?? 1)
        : 1;
      return { ...prev, [id]: defaultQty };
    });
  };

  // Update the qty input for a lot row. Clamped 0..quantityOnHand at the
  // input layer; 0 removes the row from the selection.
  const setRowQty = (id: string, raw: number, max: number) => {
    const v = Math.max(0, Math.min(Math.floor(raw) || 0, max));
    setSelectedQty((prev) => {
      const next = { ...prev };
      if (v <= 0) delete next[id];
      else next[id] = v;
      return next;
    });
  };

  const selectedCount = Object.values(selectedQty).filter((q) => q > 0).length;
  const selectedUnits = Object.values(selectedQty).reduce((sum, q) => sum + (q > 0 ? q : 0), 0);

  const toggleSelectAll = () => {
    const allActiveSelected =
      filteredItems.length > 0 && filteredItems.every((i) => (selectedQty[i.id] ?? 0) > 0);
    setSelectedQty((prev) => {
      const next: Record<string, number> = { ...prev };
      for (const i of filteredItems) {
        if (allActiveSelected) {
          delete next[i.id];
        } else {
          const def = i.isSerialized === false
            ? Math.max(1, i.quantityOnHand ?? 1)
            : 1;
          next[i.id] = def;
        }
      }
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Build the per-line payload. Skip rows whose qty was zeroed; clamp lot
    // qty defensively in case the source's stock was decremented between
    // open and submit (UI input already caps, but a race could slip past).
    const lines: Array<{ itemId: string; quantity: number }> = [];
    for (const it of sourceItems) {
      const qty = selectedQty[it.id] ?? 0;
      if (qty <= 0) continue;
      const onHand = it.isSerialized === false ? Math.max(1, it.quantityOnHand ?? 1) : 1;
      const finalQty = it.isSerialized === false ? Math.min(qty, onHand) : 1;
      lines.push({ itemId: it.id, quantity: finalQty });
    }
    if (lines.length === 0) return void toast.error('Select at least one item to distribute');
    if (!toShopId) return void toast.error('Pick a destination shop');
    if (!reason.trim()) return void toast.error('Reason is required');

    const totalUnits = lines.reduce((s, l) => s + l.quantity, 0);
    setDistributing(true);
    const toastId = toast.loading(
      `Submitting transfer for ${totalUnits} unit${totalUnits === 1 ? '' : 's'}…`,
    );

    try {
      await createTransfer({
        fromShopId: sourceShopId,
        toShopId,
        lines,
        reason: reason.trim(),
      }).unwrap();
      toast.success(
        `Transfer requested for ${totalUnits} unit${totalUnits === 1 ? '' : 's'} across ${lines.length} SKU${lines.length === 1 ? '' : 's'} — awaiting approval`,
        { id: toastId },
      );
      setSelectedQty({});
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
                            checked={
                              filteredItems.length > 0 &&
                              filteredItems.every((i) => (selectedQty[i.id] ?? 0) > 0)
                            }
                            onChange={toggleSelectAll}
                            aria-label="Select all"
                          />
                        </th>
                        <th className="p-2">SKU / Name</th>
                        <th className="p-2">Category</th>
                        <th className="p-2 text-right">Weight</th>
                        <th className="p-2 text-right">On hand</th>
                        <th className="p-2 text-right">Qty to send</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((it) => {
                        const isLot = it.isSerialized === false;
                        const onHand = isLot ? Math.max(1, it.quantityOnHand ?? 1) : 1;
                        const sendQty = selectedQty[it.id] ?? 0;
                        const isSelected = sendQty > 0;
                        return (
                          <tr key={it.id} className="border-b border-ink-100 hover:bg-ink-50">
                            <td className="p-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(it.id)}
                                aria-label={`Select ${it.sku}`}
                              />
                            </td>
                            <td className="p-2">
                              <div className="flex items-center gap-1.5">
                                <p className="font-semibold text-ink-900">{it.sku}</p>
                                <Badge tone={isLot ? 'info' : 'neutral'} className="text-[9px]">
                                  {isLot ? 'LOT' : 'UNIQUE'}
                                </Badge>
                              </div>
                              {it.name && (
                                <p className="text-[10px] text-ink-500 truncate max-w-[200px]">
                                  {it.name}
                                </p>
                              )}
                            </td>
                            <td className="p-2 text-ink-600">
                              {categories.find((c) => c.id === it.categoryId)?.name ?? '—'}
                            </td>
                            <td className="p-2 text-right font-mono">
                              {(it.weightMg / 1000).toFixed(3)}g
                            </td>
                            <td className="p-2 text-right font-mono tabular-nums text-ink-700">
                              {onHand}
                            </td>
                            <td className="p-2 text-right">
                              {isLot ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={onHand}
                                  step={1}
                                  value={sendQty || ''}
                                  onChange={(e) =>
                                    setRowQty(it.id, Number(e.target.value), onHand)
                                  }
                                  placeholder="0"
                                  className="h-7 w-16 px-1.5 rounded border border-ink-200 bg-ink-0 text-xs text-right font-mono tabular-nums focus:outline-none focus:border-brand-500"
                                />
                              ) : (
                                <span className="font-mono tabular-nums text-ink-500">
                                  {isSelected ? 1 : '—'}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
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
                {selectedCount} SKU{selectedCount === 1 ? '' : 's'} ·{' '}
                {selectedUnits} unit{selectedUnits === 1 ? '' : 's'} to transfer
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
