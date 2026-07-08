// Inventory module — full feature surface per Gold OS Module 01 spec.
// Tabbed shell. Each tab is DB-backed via RTK Query; mutations invalidate caches
// so adds/edits flow back to the active view (and to dashboard tiles) immediately.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Download,
  Tag as TagIcon,
  PackagePlus,
  Pencil,
  X,
  Globe,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Trash2,
  BadgePercent,
} from 'lucide-react';
import { toast } from 'sonner';
import { uploadImageToCloudinary, isCloudinaryConfigured, cloudinaryThumb } from '@/lib/cloudinary';
import type { Item, Collection } from '@goldos/shared/types';
import {
  DIAMOND_SHAPES,
  DIAMOND_CUTS,
  DIAMOND_CLARITIES,
  DIAMOND_COLORS,
} from '@goldos/shared/constants';
import {
  useGetItemsQuery,
  useGetCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useReorderCategoriesMutation,
  useGetCollectionsQuery,
  useCreateCollectionMutation,
  useUpdateCollectionMutation,
  useDeleteCollectionMutation,
  useListCollectionItemsQuery,
  useAddItemsToCollectionMutation,
  useRemoveItemFromCollectionMutation,
  useGetSaleCampaignsQuery,
  useCreateSaleCampaignMutation,
  useUpdateSaleCampaignMutation,
  useDeleteSaleCampaignMutation,
  useGetSaleCampaignItemsQuery,
  useAddItemsToCampaignMutation,
  useRemoveItemFromCampaignMutation,
  useLazyGetSkuSuggestionQuery,
  useDeleteItemMutation,
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
  useUpdatePurchaseOrderMutation,
  useDeletePurchaseOrderMutation,
  useReceivePurchaseOrderMutation,
  useSetPurchaseOrderGstMutation,
  useGetAuditLogQuery,
  useUpdateCategoryMakingChargeMutation,
  type PurchaseOrderRow,
  type SaleCampaignRow,
  type SaleOfferType,
} from '@/features/inventory/inventoryApi';
import { useCreateTransferMutation } from '@/features/transfers/transfersApi';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  Legend,
  ResponsiveContainer,
} from 'recharts';

type Tab =
  | 'shop-inventory'
  | 'items'
  | 'categories'
  | 'collections'
  | 'sale-items'
  | 'transfers'
  | 'wastage'
  | 'valuation'
  | 'low-stock'
  | 'vendors'
  | 'purchase-orders'
  | 'audit'
  | 'making-charges';

const TABS: Array<{ id: Tab; label: string; icon: typeof Boxes }> = [
  { id: 'shop-inventory', label: 'Shop-wise inventory', icon: Globe },
  { id: 'items', label: 'Items', icon: Boxes },
  { id: 'categories', label: 'Categories', icon: TagIcon },
  { id: 'collections', label: 'Collections', icon: Sparkles },
  { id: 'sale-items', label: 'Season sales', icon: BadgePercent },
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
  const [tab, setTab] = useState<Tab>('shop-inventory');
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

      {tab === 'shop-inventory' && <ShopWiseInventoryTab />}
      {tab === 'items' && <ItemsTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'collections' && <CollectionsManageTab />}
      {tab === 'sale-items' && <SaleItemsManageTab />}
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
      // First page only → the query result IS the full list, so mirror it
      // directly. This is what makes edits / deletes / additions appear
      // immediately after a mutation invalidates the cache. (Previously we
      // only appended unseen ids, so an edited row kept its stale values until
      // a full page reload.)
      if (cursorChain.length === 1) return data.data;
      // Extra pages loaded via "Load more" → update any rows present in the
      // refreshed page and append newly-seen ones, preserving the other pages.
      const incoming = new Map(data.data.map((r) => [r.id, r]));
      const updated = prev.map((r) => incoming.get(r.id) ?? r);
      const seen = new Set(prev.map((r) => r.id));
      const appended = data.data.filter((r) => !seen.has(r.id));
      return [...updated, ...appended];
    });
  }, [data, cursorChain.length]);
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
  const [vendorFilter, setVendorFilter] = useState('');

  // Vendor filter is derived from purchase history: items don't carry a vendor
  // FK, so we map each vendor → the SKUs they were purchased on (every PO line's
  // itemSku becomes the Item's sku on receive). Selecting a vendor then narrows
  // the table to items whose sku appears on one of that vendor's POs.
  const { data: vendorsRes } = useGetVendorsQuery();
  const { data: poRes } = useGetPurchaseOrdersQuery();
  const vendorOptions = useMemo(
    () => (vendorsRes?.data ?? []).map((v) => ({ id: v.id, name: v.name })),
    [vendorsRes?.data],
  );
  const vendorSkuSet = useMemo(() => {
    if (!vendorFilter) return null;
    const skus = new Set<string>();
    for (const po of poRes?.data ?? []) {
      if (po.vendorId !== vendorFilter) continue;
      for (const line of po.items) skus.add(line.itemSku);
    }
    return skus;
  }, [vendorFilter, poRes?.data]);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of catRes?.data ?? []) map.set(c.id, c.name);
    return map;
  }, [catRes?.data]);

  // Effective metal type per category (resolving a sub to its main) so the
  // Purity badge can label non-precious 0-purity items correctly instead of
  // defaulting them to "Silver".
  const categoryMetalById = useMemo(() => {
    const cats = (catRes?.data ?? []) as CategoryRow[];
    const byId = new Map(cats.map((c) => [c.id, c]));
    const map = new Map<string, string>();
    for (const c of cats) {
      const main = c.parentId ? byId.get(c.parentId) : c;
      map.set(c.id, (main ?? c).metalType);
    }
    return map;
  }, [catRes?.data]);

  const shopNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of shopsRes?.data ?? []) map.set(s.id, s.name);
    return map;
  }, [shopsRes?.data]);

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
        onRowSelect={setSelected}
        onEditItem={setEditTarget}
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
        vendorFilter={vendorFilter}
        onVendorFilter={setVendorFilter}
        vendors={vendorOptions}
        vendorSkuSet={vendorSkuSet}
        shops={shopsRes?.data ?? []}
        categories={catRes?.data ?? []}
        shopNameById={shopNameById}
        categoryNameById={categoryNameById}
        categoryMetalById={categoryMetalById}
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
                  <Purity x100={selected.purityCaratX100} metalType={categoryMetalById.get(selected.categoryId)} />
                </Row>
                <Row label="Cost price">
                  <Money paise={selected.costPricePaise} />
                </Row>
                {selected.sellingPricePaise != null && (() => {
                  const metal = categoryMetalById.get(selected.categoryId) ?? 'GOLD';
                  const catName = categoryNameById.get(selected.categoryId) ?? '';
                  const isFixedTone = metal === 'OTHER' || metal === 'STAINLESS_STEEL' || /tone|plated/i.test(catName);
                  const sp = selected.sellingPricePaise;
                  const preGst = Math.round(sp * 10000 / 10300);
                  const gstAmt = sp - preGst;
                  return (
                    <Row label="Selling breakdown">
                      <div className="text-xs font-mono space-y-0.5 text-right">
                        {isFixedTone ? (
                          <>
                            <div className="text-ink-600">Base <Money paise={preGst} /></div>
                            <div className="text-ink-500">GST <Money paise={gstAmt} /></div>
                            <div className="font-semibold text-ink-900">Total <Money paise={sp} /></div>
                          </>
                        ) : metal === 'SILVER' ? (
                          <>
                            <div className="text-ink-600">Selling + Making <Money paise={preGst} /></div>
                            <div className="text-ink-500">GST 3% <Money paise={gstAmt} /></div>
                            <div className="font-semibold text-ink-900">Total <Money paise={sp} /></div>
                          </>
                        ) : (
                          <>
                            <div className="text-ink-600">Gold + Making + Diamond <Money paise={preGst} /></div>
                            <div className="text-ink-500">GST 3% <Money paise={gstAmt} /></div>
                            <div className="font-semibold text-ink-900">Total <Money paise={sp} /></div>
                          </>
                        )}
                      </div>
                    </Row>
                  );
                })()}
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
                <Button variant="outline" disabled={selected.status === 'IN_TRANSIT' || selected.status === 'MELTED'} onClick={() => setAddStockOpen(true)}>
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

// ---- Shared style constants for the grouped table ----
const _TH = 'px-3 py-2.5 text-left text-[10px] font-semibold tracking-[0.14em] text-ink-500 uppercase';
const _TD = 'px-3 py-2 text-ink-800 align-middle';

// Inline storefront publish/unpublish toggle shown in the items table. Reuses
// the same `publishToWebsite` patch the Edit dialog sends — the server creates,
// publishes, or unpublishes the linked storefront Product. Publishing needs at
// least one image, so we guard before firing.
function PublishToggle({ item }: { item: Item }): JSX.Element {
  const [update, { isLoading }] = useUpdateItemMutation();
  const ext = item as Item & { isPublished?: boolean; images?: string[] };
  const published = ext.isPublished ?? false;
  const onToggle = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const next = e.target.checked;
    if (next && (ext.images?.length ?? 0) === 0) {
      toast.error('Add at least one image before publishing on the storefront');
      return;
    }
    try {
      await update({ id: item.id, patch: { publishToWebsite: next } }).unwrap();
      toast.success(next ? `Published ${item.sku} to storefront` : `Unpublished ${item.sku}`);
    } catch (err) {
      const msg =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ??
        'Could not update storefront status.';
      toast.error(msg);
    }
  };
  return (
    <input
      type="checkbox"
      checked={published}
      disabled={isLoading}
      onChange={onToggle}
      onClick={(e) => e.stopPropagation()}
      title={published ? 'Published on storefront — click to unpublish' : 'Not on storefront — click to publish'}
      aria-label={published ? `Unpublish ${item.sku}` : `Publish ${item.sku}`}
      className="h-4 w-4 rounded border-ink-300 text-brand-500 focus:ring-brand-400 cursor-pointer disabled:opacity-50"
    />
  );
}

interface SkuGroup {
  key: string;
  representative: Item;
  shops: Array<{ item: Item; shopName: string }>;
}

function GroupedItemsTable({
  rows,
  shopNameById,
  categoryNameById,
  categoryMetalById,
  onRowClick,
  onEditItem,
}: {
  rows: Item[];
  shopNameById: Map<string, string>;
  categoryNameById: Map<string, string>;
  categoryMetalById: Map<string, string>;
  onRowClick: (item: Item) => void;
  onEditItem: (item: Item) => void;
}): JSX.Element {
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set());

  // Reset expansion when the row set changes (filter / search applied).
  const rowsKey = rows.map((r) => r.id).join(',');
  useEffect(() => { setExpandedSkus(new Set()); }, [rowsKey]);

  const groups = useMemo<SkuGroup[]>(() => {
    const map = new Map<string, Item[]>();
    for (const item of rows) {
      const bucket = map.get(item.sku) ?? [];
      bucket.push(item);
      map.set(item.sku, bucket);
    }
    return Array.from(map.entries()).map(([sku, items]) => ({
      key: sku,
      representative: items[0]!,
      shops: items.map((item) => ({ item, shopName: shopNameById.get(item.shopId) ?? '—' })),
    }));
  }, [rows, shopNameById]);

  const toggle = (sku: string) => {
    setExpandedSkus((prev) => {
      const next = new Set(prev);
      next.has(sku) ? next.delete(sku) : next.add(sku);
      return next;
    });
  };

  if (groups.length === 0) {
    return (
      <div className="rounded-md border border-ink-100 bg-ink-0 overflow-hidden">
        <p className="px-3 py-10 text-center text-ink-400 text-sm">No items match the current filters.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-ink-100 bg-ink-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-ink-25/95 backdrop-blur z-10 border-b border-ink-100">
            <tr>
              <th className={_TH}>SKU</th>
              <th className={_TH}>Category</th>
              <th className={_TH}>Shop</th>
              <th className={cn(_TH, 'text-right')}>Weight</th>
              <th className={_TH}>Purity</th>
              <th className={_TH}>Hallmark</th>
              <th className={_TH}>Status</th>
              <th className={cn(_TH, 'text-right')}>Cost</th>
              <th className={cn(_TH, 'text-center')}>Live</th>
              <th className={_TH}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {groups.flatMap((group) => {
              const { representative: rep, shops } = group;
              const isMulti = shops.length > 1;
              const isExpanded = expandedSkus.has(group.key);
              const metal = categoryMetalById.get(rep.categoryId);
              const catName = categoryNameById.get(rep.categoryId) ?? '—';
              const hTone = (s: string) =>
                s === 'CERTIFIED' ? 'success' : s === 'PENDING' ? 'warning' : s === 'SUBMITTED' ? 'info' : 'neutral';
              const sTone = (s: string) =>
                s === 'IN_STOCK' ? 'success' : s === 'IN_TRANSIT' ? 'info' : s === 'SOLD' ? 'neutral' : 'warning';

              const mainRow = (
                <tr
                  key={group.key}
                  onClick={() => onRowClick(rep)}
                  className="h-10 border-b border-ink-50 last:border-b-0 transition-colors cursor-pointer hover:bg-ink-25 active:bg-ink-50"
                >
                  <td className={_TD}><span className="font-mono text-xs">{rep.sku}</span></td>
                  <td className={_TD}>{catName}</td>
                  <td className={_TD}>
                    {isMulti ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggle(group.key); }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
                        title={shops.map((s) => s.shopName).join(', ')}
                      >
                        {isExpanded
                          ? <ChevronDown className="h-3 w-3 shrink-0" />
                          : <ChevronRight className="h-3 w-3 shrink-0" />}
                        {shops.length} Shop{shops.length > 1 ? 's' : ''}
                      </button>
                    ) : (
                      <span className="text-xs text-ink-700">{shops[0]!.shopName}</span>
                    )}
                  </td>
                  <td className={cn(_TD, 'text-right')}><Weight mg={rep.weightMg} /></td>
                  <td className={_TD}><Purity x100={rep.purityCaratX100} metalType={metal} /></td>
                  <td className={_TD}>
                    <Badge tone={hTone(rep.hallmarkStatus) as 'success' | 'warning' | 'info' | 'neutral'}>
                      {rep.hallmarkStatus.toLowerCase()}
                    </Badge>
                  </td>
                  <td className={_TD}>
                    <Badge tone={sTone(rep.status) as 'success' | 'info' | 'neutral' | 'warning'}>
                      {rep.status.replace('_', ' ').toLowerCase()}
                    </Badge>
                  </td>
                  <td className={cn(_TD, 'text-right')}><Money paise={rep.costPricePaise} /></td>
                  <td className={cn(_TD, 'text-center')} onClick={(e) => e.stopPropagation()}>
                    <PublishToggle item={rep} />
                  </td>
                  <td className={_TD}>
                    <div className="text-right">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onEditItem(rep); }}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-500 hover:text-ink-900 hover:bg-ink-50"
                        aria-label={`Edit ${rep.sku}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );

              const subRows = isMulti && isExpanded
                ? shops.map(({ item, shopName }) => (
                    <tr
                      key={item.id}
                      onClick={(e) => { e.stopPropagation(); onRowClick(item); }}
                      className="h-9 border-b border-ink-50 bg-blue-50/40 hover:bg-blue-50/70 cursor-pointer transition-colors"
                    >
                      <td className={_TD} colSpan={2} />
                      <td className={_TD}>
                        <span className="ml-2 flex items-center gap-1.5 text-xs text-ink-600">
                          <span className="text-ink-300 select-none">└</span>
                          {shopName}
                        </span>
                      </td>
                      <td className={cn(_TD, 'text-right')}><Weight mg={item.weightMg} /></td>
                      <td className={_TD}><Purity x100={item.purityCaratX100} metalType={categoryMetalById.get(item.categoryId)} /></td>
                      <td className={_TD}>
                        <Badge tone={hTone(item.hallmarkStatus) as 'success' | 'warning' | 'info' | 'neutral'}>
                          {item.hallmarkStatus.toLowerCase()}
                        </Badge>
                      </td>
                      <td className={_TD}>
                        <Badge tone={sTone(item.status) as 'success' | 'info' | 'neutral' | 'warning'}>
                          {item.status.replace('_', ' ').toLowerCase()}
                        </Badge>
                      </td>
                      <td className={cn(_TD, 'text-right')}><Money paise={item.costPricePaise} /></td>
                      <td className={cn(_TD, 'text-center')} onClick={(e) => e.stopPropagation()}>
                        <PublishToggle item={item} />
                      </td>
                      <td className={_TD}>
                        <div className="text-right">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onEditItem(item); }}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-500 hover:text-ink-900 hover:bg-ink-50"
                            aria-label={`Edit ${item.sku} — ${shopName}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                : [];

              return [mainRow, ...subRows];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Items table extracted so the search + filter wiring + DataTable render
// stay co-located. Keeps ItemsTab readable while adding the new toolbar.
function InventoryItemsTable({
  rows,
  isLoading,
  onRowSelect,
  onEditItem,
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
  vendorFilter,
  onVendorFilter,
  vendors,
  vendorSkuSet,
  shops,
  categories,
  shopNameById,
  categoryNameById,
  categoryMetalById,
  hasMore,
  isFetchingMore,
  onLoadMore,
}: {
  rows: Item[];
  isLoading: boolean;
  onRowSelect: (row: Item) => void;
  onEditItem: (item: Item) => void;
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
  vendorFilter: string;
  onVendorFilter: (next: string) => void;
  vendors: Array<{ id: string; name: string }>;
  /** SKUs purchased from the selected vendor; null when no vendor is chosen. */
  vendorSkuSet: Set<string> | null;
  shops: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string; parentId?: string | null }>;
  shopNameById: Map<string, string>;
  categoryNameById: Map<string, string>;
  categoryMetalById: Map<string, string>;
  /** True when the server reports a next cursor for the most recent page. */
  hasMore: boolean;
  /** True while a Load-more fetch is in flight (rows are already showing). */
  isFetchingMore: boolean;
  /** Append the next page of items. */
  onLoadMore: () => void;
}): JSX.Element {
  // Selects narrow first (fast equality), then free-text search runs over
  // the smaller pool.
  // Category filter is parent-aware: picking a MAIN category matches items in
  // that main AND any of its sub-categories. Build the set of acceptable
  // category ids for the current filter once.
  const categoryFilterIds = useMemo(() => {
    if (!categoryFilter) return null;
    const childIds = categories.filter((c) => c.parentId === categoryFilter).map((c) => c.id);
    return new Set<string>([categoryFilter, ...childIds]);
  }, [categoryFilter, categories]);
  const preFiltered = useMemo(() => {
    return rows.filter((r) => {
      if (shopFilter && r.shopId !== shopFilter) return false;
      if (categoryFilterIds && !categoryFilterIds.has(r.categoryId)) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (hallmarkFilter && r.hallmarkStatus !== hallmarkFilter) return false;
      if (vendorSkuSet && !vendorSkuSet.has(r.sku)) return false;
      return true;
    });
  }, [rows, shopFilter, categoryFilterIds, statusFilter, hallmarkFilter, vendorSkuSet]);
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
              ...buildCategoryFilterOptions(categories),
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
          {
            key: 'vendor',
            label: 'Vendor',
            value: vendorFilter,
            onChange: onVendorFilter,
            options: [
              { value: '', label: 'Any vendor' },
              ...vendors.map((v) => ({ value: v.id, label: v.name })),
            ],
          },
        ]}
        count={filtered.length}
        countLabel={filtered.length === 1 ? 'item' : 'items'}
      />
      <GroupedItemsTable
        rows={filtered}
        shopNameById={shopNameById}
        categoryNameById={categoryNameById}
        categoryMetalById={categoryMetalById}
        onRowClick={onRowSelect}
        onEditItem={onEditItem}
      />
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
            <p className="text-xs text-ink-500 mt-2 max-w-md">
              Live metal at today’s MCX rate + diamond cost; making charges excluded. This matches the
              “Market value” on Analytics → Inventory value, which also shows cost basis and unrealised
              profit.
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
  // Each one-of-a-kind (serialized) piece is always qty 1 in stock, so listing
  // them individually means every unique piece shows. On by default so the
  // restock list reflects all stock; merchants with large catalogues can turn
  // it off to fall back to the category-level "running low" summary.
  const [includeSerialized, setIncludeSerialized] = useState(true);
  const { data, isLoading } = useGetLowStockQuery(
    { threshold, includeSerialized },
    { pollingInterval: 30_000 },
  );
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
  // Effective metal type per category (sub resolves to its main) for the Purity badge.
  const catMetalById = (() => {
    const cats = (catRes?.data ?? []) as CategoryRow[];
    const byId = new Map(cats.map((c) => [c.id, c]));
    const map = new Map<string, string>();
    for (const c of cats) {
      const main = c.parentId ? byId.get(c.parentId) : c;
      map.set(c.id, (main ?? c).metalType);
    }
    return map;
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <div className="flex items-center gap-3">
          <label className="text-ink-700">Alert threshold (units per SKU)</label>
          <input
            type="number"
            min={0}
            max={50}
            value={threshold}
            onChange={(e) => setThreshold(Math.max(0, Number(e.target.value) || 0))}
            className="h-9 w-20 px-2 rounded-md border border-ink-200 font-mono text-sm focus:outline-none focus:border-brand-500"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-ink-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeSerialized}
            onChange={(e) => setIncludeSerialized(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-brand-500 focus:ring-brand-500"
          />
          Include one-of-a-kind pieces
        </label>
        <span className="text-ink-500 text-xs">
          Bulk lots at or below the threshold appear here; sold-out (0) lots always do. Unique
          pieces (always 1 in stock) are listed only when the toggle is on.
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
                      {r.mainCategoryName ? (
                        <span>
                          <span className="font-medium">{r.mainCategoryName}</span>
                          {r.subCategoryName && (
                            <span className="text-ink-500"> › {r.subCategoryName}</span>
                          )}
                        </span>
                      ) : (
                        catNameById.get(r.categoryId) ?? r.categoryId.slice(-6)
                      )}
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
                        {it.mainCategoryName ? (
                          <span>
                            <span className="font-medium">{it.mainCategoryName}</span>
                            {it.subCategoryName && (
                              <span className="text-ink-500"> › {it.subCategoryName}</span>
                            )}
                          </span>
                        ) : (
                          catNameById.get(it.categoryId) ?? it.categoryId.slice(-6)
                        )}
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
                        <Purity x100={it.purityCaratX100} metalType={catMetalById.get(it.categoryId)} />
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

type MetalTypeLiteral = 'GOLD' | 'SILVER' | 'DIAMOND' | 'PLATINUM' | 'STAINLESS_STEEL' | 'OTHER';

interface CategoryRow {
  id: string;
  name: string;
  parentId: string | null;
  metalType: MetalTypeLiteral;
  defaultMakingChargeBps: number;
  makingChargeMode?: 'PERCENTAGE' | 'PER_GRAM';
  defaultMakingChargePerGramPaise?: number | null;
  sortOrder?: number;
  code?: string | null;
}

// Resolve the item-level making-charge override from the form fields. An empty
// value = no override (inherit the category's mode + rate). Mirrors the
// category form's Percentage / Flat-₹/g toggle.
function resolveItemMakingOverride(
  mode: 'PERCENTAGE' | 'PER_GRAM',
  pct: string,
  perGramRupees: string,
): {
  makingChargeBps: number | null;
  makingChargeMode: 'PERCENTAGE' | 'PER_GRAM' | null;
  makingChargePerGramPaise: number | null;
} {
  if (mode === 'PER_GRAM') {
    const r = parseFloat(perGramRupees);
    if (perGramRupees.trim() && Number.isFinite(r) && r >= 0) {
      return { makingChargeBps: null, makingChargeMode: 'PER_GRAM', makingChargePerGramPaise: Math.round(r * 100) };
    }
    return { makingChargeBps: null, makingChargeMode: null, makingChargePerGramPaise: null };
  }
  const p = parseFloat(pct);
  if (pct.trim() && Number.isFinite(p) && p >= 0) {
    return { makingChargeBps: Math.round(p * 100), makingChargeMode: 'PERCENTAGE', makingChargePerGramPaise: null };
  }
  return { makingChargeBps: null, makingChargeMode: null, makingChargePerGramPaise: null };
}

// Small toggle + input for the item-level making-charge override (Percentage vs
// Flat ₹/g). Leaving the value blank means "use category default".
function MakingChargeOverride({
  mode,
  pct,
  perGram,
  onMode,
  onPct,
  onPerGram,
}: {
  mode: 'PERCENTAGE' | 'PER_GRAM';
  pct: string;
  perGram: string;
  onMode: (m: 'PERCENTAGE' | 'PER_GRAM') => void;
  onPct: (v: string) => void;
  onPerGram: (v: string) => void;
}): JSX.Element {
  return (
    <div className="space-y-2">
      <div className="flex rounded-md border border-ink-200 p-0.5 text-xs">
        <button
          type="button"
          onClick={() => onMode('PERCENTAGE')}
          className={cn('flex-1 h-7 rounded font-medium transition-colors', mode === 'PERCENTAGE' ? 'bg-brand-500 text-ink-0' : 'text-ink-600 hover:bg-ink-50')}
        >
          %
        </button>
        <button
          type="button"
          onClick={() => onMode('PER_GRAM')}
          className={cn('flex-1 h-7 rounded font-medium transition-colors', mode === 'PER_GRAM' ? 'bg-brand-500 text-ink-0' : 'text-ink-600 hover:bg-ink-50')}
        >
          ₹/g
        </button>
      </div>
      {mode === 'PERCENTAGE' ? (
        <input
          type="number" step="0.1" min={0} value={pct}
          onChange={(e) => onPct(e.target.value)}
          className={fieldCls} placeholder="uses category default"
        />
      ) : (
        <input
          type="number" step="0.5" min={0} value={perGram}
          onChange={(e) => onPerGram(e.target.value)}
          className={fieldCls} placeholder="₹/g · uses category default"
        />
      )}
    </div>
  );
}

// Build the category-filter dropdown options: each main category, followed by
// its sub-categories labelled with the parent in brackets so duplicate sub
// names (three "BRACELETS", etc.) are distinguishable —
//   NECKLACES & CHAINS (925 STERLING SILVER). Selecting a main filters that
// main + all its subs (server-side); selecting a sub filters that sub exactly.
function buildCategoryFilterOptions(
  categories: { id: string; name: string; parentId?: string | null }[],
): { value: string; label: string }[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const mains = categories
    .filter((c) => !c.parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const subsByParent = new Map<string, { id: string; name: string; parentId?: string | null }[]>();
  for (const c of categories) {
    if (c.parentId) {
      const list = subsByParent.get(c.parentId) ?? [];
      list.push(c);
      subsByParent.set(c.parentId, list);
    }
  }
  const opts: { value: string; label: string }[] = [];
  for (const m of mains) {
    opts.push({ value: m.id, label: m.name });
    for (const s of subsByParent.get(m.id) ?? []) {
      opts.push({ value: s.id, label: `${s.name} (${m.name})` });
    }
  }
  // Orphan subs whose parent isn't in the list — show them plainly.
  for (const c of categories) {
    if (c.parentId && !byId.has(c.parentId)) opts.push({ value: c.id, label: c.name });
  }
  return opts;
}

// Default purity carat (as a string for the form) for a given metal type.
// Gold defaults to 9K per the client's "9K Fine Gold" line; non-precious
// metals (stainless steel / other) and silver have a single fixed value.
function defaultPurityForMetal(metalType: MetalTypeLiteral | undefined): string {
  switch (metalType) {
    case 'SILVER':
      return '0';
    case 'PLATINUM':
      return '95';
    case 'STAINLESS_STEEL':
    case 'OTHER':
      return '0';
    default:
      return '9'; // GOLD / DIAMOND → 9 carat default
  }
}

// Collections management — create / rename / delete the cross-category groupings
// (Bridal, Festival, …). Items are tagged into these from the item form.
function CollectionsManageTab(): JSX.Element {
  const { data, isLoading } = useGetCollectionsQuery();
  const [create, { isLoading: creating }] = useCreateCollectionMutation();
  const [update] = useUpdateCollectionMutation();
  const [del] = useDeleteCollectionMutation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addItemsOpen, setAddItemsOpen] = useState<string | null>(null);
  const collections = data?.data ?? [];

  const add = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (name.trim().length < 2) return void toast.error('Collection name must be at least 2 characters');
    try {
      await create({ name: name.trim(), description: description.trim() || null }).unwrap();
      toast.success(`Added ${name.trim()}`);
      setName('');
      setDescription('');
    } catch (err) {
      const msg = (err as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not add collection.';
      toast.error(msg);
    }
  };

  const remove = async (id: string, nm: string): Promise<void> => {
    if (!window.confirm(`Delete collection "${nm}"? Items stay in inventory; they just lose this tag.`)) return;
    try {
      await del(id).unwrap();
      toast.success(`Deleted ${nm}`);
    } catch {
      toast.error('Could not delete collection.');
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-500">
        Collections group items across categories &amp; metals — Bridal, Festival, Corporate. Tag items into them from
        the item form. An item can be in several collections but stays a single inventory record.
      </p>

      <form onSubmit={add} className="flex flex-col sm:flex-row gap-2 sm:items-end rounded-md border border-ink-100 bg-ink-0 p-3">
        <Field label="New collection name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bridal Collection" className={fieldCls} />
        </Field>
        <Field label="Description (optional)">
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short tagline" className={fieldCls} />
        </Field>
        <Button type="submit" disabled={creating} className="self-start sm:self-auto">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>

      {isLoading && <p className="text-sm text-ink-500">Loading…</p>}
      {!isLoading && collections.length === 0 && (
        <EmptyState
          eyebrow="No collections yet"
          title="Create your first collection"
          body="Group seasonal or themed pieces (Bridal, Festival) so they're easy to feature and tag."
        />
      )}
      {collections.length > 0 && (
        <ul className="divide-y divide-ink-100 rounded-md border border-ink-100 bg-ink-0">
          {collections.map((c) => (
            <CollectionRow
              key={c.id}
              collection={c}
              isExpanded={expandedId === c.id}
              onExpandChange={(expanded) => setExpandedId(expanded ? c.id : null)}
              onAddItems={() => setAddItemsOpen(c.id)}
              onUpdate={update}
              onDelete={() => void remove(c.id, c.name)}
            />
          ))}
        </ul>
      )}
      {addItemsOpen && <AddItemsModal collectionId={addItemsOpen} onClose={() => setAddItemsOpen(null)} />}
    </div>
  );
}

function CollectionRow({
  collection,
  isExpanded,
  onExpandChange,
  onAddItems,
  onUpdate,
  onDelete,
}: {
  collection: Collection;
  isExpanded: boolean;
  onExpandChange: (expanded: boolean) => void;
  onAddItems: () => void;
  onUpdate: ReturnType<typeof useUpdateCollectionMutation>[0];
  onDelete: () => void;
}): JSX.Element {
  const { data: itemsData, isLoading: itemsLoading } = useListCollectionItemsQuery(collection.id);

  return (
    <>
      <li className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onExpandChange(!isExpanded)}
            className="flex items-center gap-2 flex-1 text-left hover:opacity-75 transition-opacity"
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            <div className="min-w-0 flex-1">
              <input
                defaultValue={collection.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== collection.name) void onUpdate({ id: collection.id, patch: { name: v } }).catch(() => toast.error('Rename failed'));
                }}
                onClick={(e) => e.stopPropagation()}
                className="text-sm text-ink-900 bg-transparent border-0 px-0 focus:ring-0 focus:outline-none focus:border-b focus:border-brand-400"
              />
              {collection.description && <p className="text-[11px] text-ink-500">{collection.description}</p>}
            </div>
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onAddItems()}
              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-500 hover:bg-brand-50 hover:text-brand-600"
              aria-label="Add items"
              title="Add items"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete()}
              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-500 hover:bg-rose-50 hover:text-rose-600"
              aria-label={`Delete ${collection.name}`}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </li>
      {isExpanded && (
        <li className="bg-ink-50 px-4 py-3 border-t border-ink-100">
          {itemsLoading && <p className="text-sm text-ink-500">Loading items…</p>}
          {!itemsLoading && (itemsData?.data ?? []).length === 0 && <p className="text-sm text-ink-400">No items in this collection</p>}
          {!itemsLoading && (itemsData?.data ?? []).length > 0 && (
            <CollectionItemsList collectionId={collection.id} items={itemsData?.data ?? []} />
          )}
        </li>
      )}
    </>
  );
}

function CollectionItemsList({ collectionId, items }: { collectionId: string; items: Item[] }): JSX.Element {
  const [removeItem] = useRemoveItemFromCollectionMutation();

  const handleRemove = async (itemId: string, itemName: string): Promise<void> => {
    if (!window.confirm(`Remove "${itemName}" from this collection?`)) return;
    try {
      await removeItem({ collectionId, itemId }).unwrap();
      toast.success(`Removed item`);
    } catch {
      toast.error('Could not remove item');
    }
  };

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="flex items-center justify-between gap-3 p-2 bg-white rounded border border-ink-100">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink-900 truncate">{item.name ?? 'Unknown'}</p>
            <p className="text-xs text-ink-500">{item.sku}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleRemove(item.id, item.name ?? 'Unknown')}
            className="inline-flex items-center justify-center h-6 w-6 rounded-md text-ink-400 hover:bg-rose-50 hover:text-rose-600"
            aria-label={`Remove ${item.name ?? 'Unknown'}`}
            title="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function AddItemsModal({ collectionId, onClose }: { collectionId: string; onClose: () => void }): JSX.Element {
  const { data: allItems } = useGetItemsQuery({});
  const [addItems, { isLoading: adding }] = useAddItemsToCollectionMutation();
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  const items = (allItems?.data ?? []).filter((item) =>
    (item.name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) || (item.sku ?? '').toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleAddItems = async (): Promise<void> => {
    if (selectedItemIds.size === 0) return void toast.error('Select at least one item');
    try {
      await addItems({ collectionId, itemIds: Array.from(selectedItemIds) }).unwrap();
      toast.success(`Added ${selectedItemIds.size} item(s)`);
      onClose();
    } catch (err) {
      const msg = (err as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not add items';
      toast.error(msg);
    }
  };

  const toggleItem = (itemId: string): void => {
    const newSet = new Set(selectedItemIds);
    if (newSet.has(itemId)) {
      newSet.delete(itemId);
    } else {
      newSet.add(itemId);
    }
    setSelectedItemIds(newSet);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-ink-100">
          <h3 className="text-base font-semibold text-ink-900">Add items to collection</h3>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <input
            type="text"
            placeholder="Search by name or SKU…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={fieldCls}
          />
          {items.length === 0 && <p className="text-sm text-ink-500 text-center py-4">No items found</p>}
          {items.map((item) => (
            <label key={item.id} className="flex items-center gap-3 p-2 hover:bg-ink-50 rounded cursor-pointer">
              <input
                type="checkbox"
                checked={selectedItemIds.has(item.id)}
                onChange={() => toggleItem(item.id)}
                className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink-900 truncate">{item.name ?? 'Unknown'}</p>
                <p className="text-xs text-ink-500">{item.sku ?? 'N/A'}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 p-4 border-t border-ink-100">
          <p className="text-xs text-ink-500">{selectedItemIds.size} selected</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={adding}>
              Cancel
            </Button>
            <Button onClick={() => void handleAddItems()} disabled={adding || selectedItemIds.size === 0}>
              {adding ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Season Sales management — the single tenant-wide pool of items shown in the
// storefront "Season Sales" section. Select items (same picker as Collections)
// and set a per-item % discount, which the storefront applies to the live price.
// Season Sales — multiple simultaneous campaigns, one tab each. Each campaign
// runs its own offer (% / ₹ / BOGO) over its member items; the offer applies on
// the storefront AND at the POS counter.
function SaleItemsManageTab(): JSX.Element {
  const { data, isLoading } = useGetSaleCampaignsQuery();
  const [createCampaign, { isLoading: creating }] = useCreateSaleCampaignMutation();
  const campaigns = data?.data ?? [];
  const [activeId, setActiveId] = useState<string | null>(null);

  // Keep a valid selection as campaigns load / change.
  useEffect(() => {
    if (campaigns.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (!activeId || !campaigns.some((c) => c.id === activeId)) {
      setActiveId(campaigns[0]!.id);
    }
  }, [campaigns, activeId]);

  const active = campaigns.find((c) => c.id === activeId) ?? null;

  const addCampaign = async (): Promise<void> => {
    try {
      const res = await createCampaign({
        name: `Sale ${campaigns.length + 1}`,
        discountType: 'PERCENT',
        discountBps: 1000,
        discountFlatPaise: 0,
        isActive: true,
      }).unwrap();
      setActiveId(res.data.id);
    } catch {
      toast.error('Could not create campaign');
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-500 max-w-2xl">
        Run several sales at once — each tab is its own campaign with its own offer (% off, ₹ off, or Buy 1 Get 1) over
        the items you add to it. Offers apply on the <strong>storefront</strong> and at the <strong>POS counter</strong>.
      </p>

      {/* Campaign tab strip */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 pb-2">
        {campaigns.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiveId(c.id)}
            className={
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ' +
              (c.id === activeId
                ? 'bg-brand-600 text-white'
                : 'bg-ink-50 text-ink-700 hover:bg-ink-100')
            }
          >
            <span className="truncate max-w-[160px]">{c.name}</span>
            <span
              className={
                'rounded-full px-1.5 text-[10px] ' +
                (c.id === activeId ? 'bg-white/25' : 'bg-ink-200/70 text-ink-600')
              }
            >
              {offerLabel(c)}
            </span>
            {!c.isActive && (
              <span className="text-[10px] uppercase tracking-wide opacity-70">paused</span>
            )}
          </button>
        ))}
        <Button variant="outline" size="sm" onClick={() => void addCampaign()} disabled={creating}>
          <Plus className="h-4 w-4" /> New sale
        </Button>
      </div>

      {isLoading && <p className="text-sm text-ink-500">Loading…</p>}
      {!isLoading && campaigns.length === 0 && (
        <EmptyState
          eyebrow="No campaigns yet"
          title="Start a season sale"
          body="Create a campaign, set its offer, then add items — the offer runs on your storefront and POS."
        />
      )}
      {active && <SaleCampaignEditor key={active.id} campaign={active} />}
    </div>
  );
}

// Short human label for a campaign's offer, used on the tab pill.
function offerLabel(c: SaleCampaignRow): string {
  if (c.discountType === 'BOGO') return 'B1G1';
  if (c.discountType === 'FIXED_PRICE') return `@ ₹${Math.round(c.discountFlatPaise / 100)}`;
  if (c.discountType === 'FLAT') return `₹${Math.round(c.discountFlatPaise / 100)} off`;
  return `${(c.discountBps / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}% off`;
}

// Which types use the flat-paise field (₹ off vs a fixed price).
function usesFlatField(t: SaleOfferType): boolean {
  return t === 'FLAT' || t === 'FIXED_PRICE';
}

// The panel for one campaign: offer settings + its member items.
function SaleCampaignEditor({ campaign }: { campaign: SaleCampaignRow }): JSX.Element {
  const { data: itemsRes, isLoading } = useGetSaleCampaignItemsQuery(campaign.id);
  const [updateCampaign, { isLoading: saving }] = useUpdateSaleCampaignMutation();
  const [deleteCampaign] = useDeleteSaleCampaignMutation();
  const [removeItem] = useRemoveItemFromCampaignMutation();
  const [addOpen, setAddOpen] = useState(false);
  const items = itemsRes?.data ?? [];

  const [name, setName] = useState(campaign.name);
  const [type, setType] = useState<SaleOfferType>(campaign.discountType);
  const [amount, setAmount] = useState(
    usesFlatField(campaign.discountType)
      ? String(campaign.discountFlatPaise / 100)
      : String(campaign.discountBps / 100),
  );
  useEffect(() => {
    setName(campaign.name);
    setType(campaign.discountType);
    setAmount(
      usesFlatField(campaign.discountType)
        ? String(campaign.discountFlatPaise / 100)
        : String(campaign.discountBps / 100),
    );
  }, [campaign.id, campaign.name, campaign.discountType, campaign.discountBps, campaign.discountFlatPaise]);

  const toBps = (a: string): number => {
    const n = parseFloat(a);
    return Number.isFinite(n) ? Math.max(0, Math.min(9000, Math.round(n * 100))) : 0;
  };
  const toPaise = (a: string): number => {
    const n = parseFloat(a);
    return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : 0;
  };

  const save = (patch: Partial<{ name: string; discountType: SaleOfferType; discountBps: number; discountFlatPaise: number; isActive: boolean }>): void => {
    updateCampaign({ id: campaign.id, body: patch })
      .unwrap()
      .catch(() => toast.error('Could not update campaign'));
  };

  const commitOffer = (nextType: SaleOfferType, nextAmount: string): void =>
    save({
      discountType: nextType,
      discountBps: nextType === 'PERCENT' ? toBps(nextAmount) : 0,
      discountFlatPaise: usesFlatField(nextType) ? toPaise(nextAmount) : 0,
    });

  const remove = (): void => {
    if (!window.confirm(`Delete the "${campaign.name}" campaign? Its items leave the sale (they're not deleted).`)) return;
    deleteCampaign(campaign.id)
      .unwrap()
      .catch(() => toast.error('Could not delete campaign'));
  };

  const removeMember = (itemId: string, label: string): void => {
    if (!window.confirm(`Remove "${label}" from this sale?`)) return;
    removeItem({ campaignId: campaign.id, itemId })
      .unwrap()
      .catch(() => toast.error('Could not remove item'));
  };

  return (
    <div className="space-y-4">
      {/* Offer settings */}
      <div className="rounded-md border border-ink-100 bg-ink-0 p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name.trim() !== campaign.name && save({ name: name.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="h-9 flex-1 min-w-[160px] rounded-md border border-ink-200 px-2 text-sm font-medium focus:border-brand-400 focus:outline-none"
            aria-label="Campaign name"
            maxLength={60}
          />
          <label className="inline-flex items-center gap-1.5 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={campaign.isActive}
              onChange={(e) => save({ isActive: e.target.checked })}
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
            />
            Active
          </label>
          <button
            type="button"
            onClick={remove}
            className="ml-1 inline-flex items-center gap-1 text-xs text-ink-400 hover:text-red-500"
            aria-label="Delete campaign"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={type}
            onChange={(e) => {
              const next = e.target.value as SaleOfferType;
              setType(next);
              commitOffer(next, amount);
            }}
            className="h-9 rounded-md border border-ink-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
            aria-label="Offer type"
          >
            <option value="PERCENT">% off</option>
            <option value="FLAT">₹ off</option>
            <option value="FIXED_PRICE">Flat price (₹)</option>
            <option value="BOGO">Buy 1 Get 1</option>
          </select>
          {type !== 'BOGO' && (
            <>
              {usesFlatField(type) && <span className="text-sm text-ink-500">₹</span>}
              <input
                type="number"
                min={0}
                step={usesFlatField(type) ? 1 : 0.5}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={() => commitOffer(type, amount)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="h-9 w-28 rounded-md border border-ink-200 px-2 text-right text-sm tabular-nums focus:border-brand-400 focus:outline-none"
                aria-label="Offer amount"
              />
              <span className="text-sm text-ink-500">
                {type === 'PERCENT' ? '% off' : type === 'FIXED_PRICE' ? 'final price' : 'off'}
              </span>
            </>
          )}
          {type === 'FIXED_PRICE' && (
            <span className="text-sm text-ink-500">Every item in this sale sells at this price.</span>
          )}
          {type === 'BOGO' && (
            <span className="text-sm text-ink-500">Buy one, get the cheaper of each pair free.</span>
          )}
          {saving && <span className="ml-1 text-[11px] text-ink-400">saving…</span>}
        </div>
      </div>

      {/* Members */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">{campaign.itemCount} item{campaign.itemCount === 1 ? '' : 's'} in this sale</p>
        <Button onClick={() => setAddOpen(true)} size="sm">
          <Plus className="h-4 w-4" /> Add items
        </Button>
      </div>

      {isLoading && <p className="text-sm text-ink-500">Loading…</p>}
      {!isLoading && items.length === 0 && (
        <EmptyState
          eyebrow="No items yet"
          title="Add items to this sale"
          body="Pick the pieces this offer should apply to. An item can be in one campaign at a time."
        />
      )}
      {items.length > 0 && (
        <ul className="divide-y divide-ink-100 rounded-md border border-ink-100 bg-ink-0">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 px-4 py-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-ink-50">
                {it.images[0] ? (
                  <img src={it.images[0]} alt={it.name ?? it.sku} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-ink-300">
                    <BadgePercent className="h-5 w-5" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink-900">{it.name ?? 'Unnamed item'}</p>
                <p className="text-xs text-ink-500">{it.sku}</p>
              </div>
              <button
                type="button"
                onClick={() => removeMember(it.id, it.name ?? it.sku)}
                className="ml-2 text-ink-400 hover:text-red-500 transition-colors"
                aria-label={`Remove ${it.name ?? it.sku} from sale`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {addOpen && <AddSaleItemsModal campaignId={campaign.id} onClose={() => setAddOpen(false)} />}
    </div>
  );
}

// Item picker — adds the selected items to a specific campaign (moving them from
// any other campaign they were in).
function AddSaleItemsModal({ campaignId, onClose }: { campaignId: string; onClose: () => void }): JSX.Element {
  const { data: allItems } = useGetItemsQuery({});
  const [addItems, { isLoading: adding }] = useAddItemsToCampaignMutation();
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  const items = (allItems?.data ?? []).filter(
    (item) =>
      (item.name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.sku ?? '').toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleAdd = async (): Promise<void> => {
    if (selectedItemIds.size === 0) return void toast.error('Select at least one item');
    try {
      const res = await addItems({ campaignId, itemIds: Array.from(selectedItemIds) }).unwrap();
      const movedNote = res.data.moved > 0 ? ` (${res.data.moved} moved from another sale)` : '';
      toast.success(`Added ${res.data.added + res.data.moved} item(s)${movedNote}`);
      onClose();
    } catch (err) {
      const msg = (err as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not add items';
      toast.error(msg);
    }
  };

  const toggleItem = (itemId: string): void => {
    const next = new Set(selectedItemIds);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    setSelectedItemIds(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-ink-100">
          <h3 className="text-base font-semibold text-ink-900">Add items to sale</h3>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="px-4 pt-3 text-xs text-ink-500">
          This campaign&apos;s offer applies to every item you add. An item already in another sale moves here.
        </p>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <input
            type="text"
            placeholder="Search by name or SKU…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={fieldCls}
          />
          {items.length === 0 && <p className="text-sm text-ink-500 text-center py-4">No items found</p>}
          {items.map((item) => (
            <label key={item.id} className="flex items-center gap-3 p-2 hover:bg-ink-50 rounded cursor-pointer">
              <input
                type="checkbox"
                checked={selectedItemIds.has(item.id)}
                onChange={() => toggleItem(item.id)}
                className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink-900 truncate">{item.name ?? 'Unknown'}</p>
                <p className="text-xs text-ink-500">{item.sku ?? 'N/A'}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 p-4 border-t border-ink-100">
          <p className="text-xs text-ink-500">{selectedItemIds.size} selected</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={adding}>
              Cancel
            </Button>
            <Button onClick={() => void handleAdd()} disabled={adding || selectedItemIds.size === 0}>
              {adding ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoriesTab(): JSX.Element {
  const { data, isLoading } = useGetCategoriesQuery();
  const [reorder, { isLoading: reordering }] = useReorderCategoriesMutation();
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

  // Move a sub-category up/down within its parent and persist the new order.
  // We renumber the whole sibling list (0..n) so a first reorder off the
  // default sortOrder=0 produces a stable, gap-free ordering.
  const moveSub = async (parentId: string, index: number, dir: -1 | 1): Promise<void> => {
    const subs = [...(subsByParent.get(parentId) ?? [])];
    const target = index + dir;
    if (target < 0 || target >= subs.length) return;
    [subs[index], subs[target]] = [subs[target]!, subs[index]!];
    const orders = subs.map((s, i) => ({ id: s.id, sortOrder: i }));
    try {
      await reorder({ orders }).unwrap();
    } catch {
      toast.error('Could not reorder categories.');
    }
  };

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
                  <Badge tone="neutral">{main.metalType.toLowerCase().replace('_', ' ')}</Badge>
                  <span className="text-xs text-ink-500 font-mono">
                    {main.makingChargeMode === 'PER_GRAM' && main.defaultMakingChargePerGramPaise != null
                      ? `₹${(main.defaultMakingChargePerGramPaise / 100).toFixed(2)}/g making`
                      : `${(main.defaultMakingChargeBps / 100).toFixed(1)}% making`}
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
                {subs.map((sub, subIdx) => (
                  <li key={sub.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-ink-900 truncate">{sub.name}</p>
                      <p className="text-[11px] text-ink-500 font-mono">
                        {sub.makingChargeMode === 'PER_GRAM' && sub.defaultMakingChargePerGramPaise != null
                          ? `₹${(sub.defaultMakingChargePerGramPaise / 100).toFixed(2)}/g making`
                          : `${(sub.defaultMakingChargeBps / 100).toFixed(1)}% making`}
                      </p>
                    </div>
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => void moveSub(main.id, subIdx, -1)}
                        disabled={subIdx === 0 || reordering}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-500 hover:bg-ink-50 hover:text-ink-900 disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label={`Move ${sub.name} up`}
                        title="Move up"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void moveSub(main.id, subIdx, 1)}
                        disabled={subIdx === subs.length - 1 || reordering}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-500 hover:bg-ink-50 hover:text-ink-900 disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label={`Move ${sub.name} down`}
                        title="Move down"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
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
    metalType: existing?.metalType ?? ('GOLD' as MetalTypeLiteral),
    code: existing?.code ?? '',
    makingMode: existing?.makingChargeMode ?? ('PERCENTAGE' as 'PERCENTAGE' | 'PER_GRAM'),
    makingPct: existing ? String(existing.defaultMakingChargeBps / 100) : '12',
    makingPerGramRupees:
      existing?.defaultMakingChargePerGramPaise != null
        ? String(existing.defaultMakingChargePerGramPaise / 100)
        : '',
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: existing?.name ?? '',
      parentId: existing?.parentId ?? defaultParentId ?? '',
      metalType: existing?.metalType ?? 'GOLD',
      code: existing?.code ?? '',
      makingMode: existing?.makingChargeMode ?? 'PERCENTAGE',
      makingPct: existing ? String(existing.defaultMakingChargeBps / 100) : '12',
      makingPerGramRupees:
        existing?.defaultMakingChargePerGramPaise != null
          ? String(existing.defaultMakingChargePerGramPaise / 100)
          : '',
    });
  }, [open, existing?.id]);

  // A sub-category inherits its parent's metal type (mirrors the server rule),
  // so the purity picker on items always matches the gold/silver/etc. parent.
  const parentMetalType = form.parentId
    ? mains.find((m) => m.id === form.parentId)?.metalType
    : undefined;
  const effectiveMetalType: MetalTypeLiteral = parentMetalType ?? form.metalType;

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (form.name.trim().length < 2) return void toast.error('Name must be at least 2 characters');
    const bps = Math.round(parseFloat(form.makingPct) * 100);
    if (!Number.isFinite(bps) || bps < 0 || bps > 10_000) {
      return void toast.error('Making charge must be between 0 and 100%');
    }
    // Per-gram rate is optional unless PER_GRAM is the active mode.
    let perGramPaise: number | null = null;
    if (form.makingMode === 'PER_GRAM') {
      const rupees = parseFloat(form.makingPerGramRupees);
      if (!Number.isFinite(rupees) || rupees < 0) {
        return void toast.error('Enter a valid making charge per gram (₹/g)');
      }
      perGramPaise = Math.round(rupees * 100);
    } else if (form.makingPerGramRupees.trim()) {
      // Keep any entered per-gram value even when % is active so toggling back
      // doesn't lose it.
      const rupees = parseFloat(form.makingPerGramRupees);
      if (Number.isFinite(rupees) && rupees >= 0) perGramPaise = Math.round(rupees * 100);
    }
    const parentId = form.parentId ? form.parentId : null;
    const code = form.code.trim().toUpperCase();
    if (code && !/^[A-Z0-9]{1,8}$/.test(code)) {
      return void toast.error('Category code must be 1–8 letters/digits (e.g. RNG)');
    }
    const payload = {
      name: form.name.trim(),
      parentId,
      metalType: effectiveMetalType,
      defaultMakingChargeBps: bps,
      makingChargeMode: form.makingMode,
      defaultMakingChargePerGramPaise: perGramPaise,
      code: code || null,
    };
    try {
      if (mode === 'create') {
        await create(payload).unwrap();
        toast.success(`Added ${form.name.trim()}`);
      } else if (existing) {
        await update({ id: existing.id, patch: payload }).unwrap();
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

            <Field label="Category code (SKU prefix)">
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. RNG, NCK"
                maxLength={8}
                className={fieldCls}
              />
              <p className="mt-1 text-[11px] text-ink-500">
                Used to auto-number SKUs like <span className="font-mono">RNG-00012</span>. Optional.
              </p>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Metal type">
                <select
                  value={effectiveMetalType}
                  disabled={!!form.parentId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      metalType: e.target.value as MetalTypeLiteral,
                    })
                  }
                  className={fieldCls}
                >
                  <option value="GOLD">Gold</option>
                  <option value="SILVER">Silver</option>
                  <option value="DIAMOND">Diamond</option>
                  <option value="PLATINUM">Platinum</option>
                  <option value="STAINLESS_STEEL">Stainless Steel (non-precious)</option>
                  <option value="OTHER">Other</option>
                </select>
                {form.parentId && (
                  <p className="mt-1 text-[11px] text-ink-500">
                    Inherited from parent category.
                  </p>
                )}
              </Field>
              <Field label="Making charge type">
                <div className="flex rounded-md border border-ink-200 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, makingMode: 'PERCENTAGE' })}
                    className={cn(
                      'flex-1 h-8 rounded font-medium transition-colors',
                      form.makingMode === 'PERCENTAGE'
                        ? 'bg-brand-500 text-ink-0'
                        : 'text-ink-600 hover:bg-ink-50',
                    )}
                  >
                    Percentage %
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, makingMode: 'PER_GRAM' })}
                    className={cn(
                      'flex-1 h-8 rounded font-medium transition-colors',
                      form.makingMode === 'PER_GRAM'
                        ? 'bg-brand-500 text-ink-0'
                        : 'text-ink-600 hover:bg-ink-50',
                    )}
                  >
                    Flat ₹/g
                  </button>
                </div>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {form.makingMode === 'PERCENTAGE' ? (
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
              ) : (
                <Field label="Making charge per gram (₹/g)">
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    value={form.makingPerGramRupees}
                    onChange={(e) => setForm({ ...form, makingPerGramRupees: e.target.value })}
                    placeholder="e.g. 2"
                    className={fieldCls}
                    required
                  />
                </Field>
              )}
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
  const navigate = useNavigate();
  const { data, isLoading } = useGetPurchaseOrdersQuery();
  const { data: shopsRes } = useGetShopsQuery();
  const { data: catsRes } = useGetCategoriesQuery();
  const [receivePO, { isLoading: receiving }] = useReceivePurchaseOrderMutation();
  const [deletePO] = useDeletePurchaseOrderMutation();
  const [createOpen, setCreateOpen] = useState(false);
  const [poImportOpen, setPoImportOpen] = useState(false);
  // Id of the PO being edited (reuses the create dialog in edit mode).
  const [editPoId, setEditPoId] = useState<string | null>(null);
  // When multi-shop, we open a Sheet so the user can pick the destination
  // visually. Single-shop tenants auto-receive into their only shop and
  // never see this UI. (Previously this used `window.prompt` which is
  // unstylable and a UX dead-end on tablets.)
  const [receiveTargetPo, setReceiveTargetPo] = useState<string | null>(null);
  // Clicking a PO row opens a detail drawer (line items, destination, GST).
  const [detailPoId, setDetailPoId] = useState<string | null>(null);
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
      const res = await receivePO({ id: poId, shopId, categoryId: cats[0]!.id }).unwrap();
      toast.success('PO received — items added to stock');
      setReceiveTargetPo(null);
      // Mirror the "Add item" flow: now that the PO's pieces have entered stock
      // (same SKUs as the lines), jump straight to the label printer so their
      // tags can be printed immediately, without hunting for them in the list.
      // The receive mutation invalidates Item.LIST, so the print page's own
      // getItems query picks up the freshly-created items.
      const skus = (res.data?.items ?? []).map((i) => i.itemSku).filter(Boolean);
      if (skus.length > 0) {
        navigate('/admin/inventory/print-labels', { state: { skus } });
      }
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

  // Re-derive the open PO from the live list so the drawer reflects fresh data
  // after a GST save or receive (both invalidate the list).
  const detailPo = allRows.find((p) => p.id === detailPoId) ?? null;
  // PO being edited (full row, incl. line-item detail) for the edit dialog.
  const editPo = editPoId ? allRows.find((p) => p.id === editPoId) ?? null : null;

  async function handleDelete(poId: string): Promise<void> {
    if (!window.confirm('Delete this purchase order? This cannot be undone.')) return;
    try {
      await deletePO(poId).unwrap();
      toast.success('Purchase order deleted');
      setDetailPoId(null);
    } catch (err) {
      const message =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ??
        'Could not delete PO';
      toast.error(message);
    }
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 mb-1">
        <Button variant="outline" onClick={() => setPoImportOpen(true)} className="self-start sm:self-auto">
          <Download className="h-4 w-4" /> Import POs
        </Button>
        <Button onClick={() => setCreateOpen(true)} className="self-start sm:self-auto">
          <Plus className="h-4 w-4" /> Create PO
        </Button>
      </div>
      <BulkImportModal
        open={poImportOpen}
        onClose={() => setPoImportOpen(false)}
        variant="purchase-orders"
      />
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
                <tr
                  key={po.id}
                  onClick={() => setDetailPoId(po.id)}
                  className="cursor-pointer hover:bg-ink-25 transition-colors duration-fast"
                >
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
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleReceive(po.id);
                        }}
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
      <CreatePODialog
        open={createOpen || !!editPo}
        editPo={editPo}
        onClose={() => {
          setCreateOpen(false);
          setEditPoId(null);
        }}
      />
      <ReceivePoShopPicker
        open={!!receiveTargetPo}
        onClose={() => setReceiveTargetPo(null)}
        shops={shops}
        receiving={receiving}
        onPick={(shopId) => {
          if (receiveTargetPo) void performReceive(receiveTargetPo, shopId);
        }}
      />
      <PoDetailSheet
        open={!!detailPo}
        po={detailPo}
        shops={shops}
        categories={cats as CategoryRow[]}
        receiving={receiving}
        onClose={() => setDetailPoId(null)}
        onReceive={(poId) => {
          setDetailPoId(null);
          void handleReceive(poId);
        }}
        onEdit={(poId) => {
          setDetailPoId(null);
          setEditPoId(poId);
        }}
        onDelete={(poId) => void handleDelete(poId)}
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
// PO detail drawer — opened by clicking a PO row. Shows the line items, where
// the stock was received into, and a purchase-GST editor (input tax credit).

function PoDetailSheet({
  open,
  po,
  shops,
  categories,
  receiving,
  onClose,
  onReceive,
  onEdit,
  onDelete,
}: {
  open: boolean;
  po: PurchaseOrderRow | null;
  shops: { id: string; name: string; isActive: boolean }[];
  categories: CategoryRow[];
  receiving: boolean;
  onClose: () => void;
  onReceive: (poId: string) => void;
  onEdit: (poId: string) => void;
  onDelete: (poId: string) => void;
}): JSX.Element {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="!max-w-2xl">
        <SheetHeader>
          <SheetTitle>Purchase order {po ? po.id.slice(-8) : ''}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {/* Keyed by id so the GST editor state re-initialises when a
              different PO is opened or the row refetches after a save. */}
          {po && (
            <PoDetailContent
              key={po.id}
              po={po}
              shops={shops}
              categories={categories}
              receiving={receiving}
              onReceive={onReceive}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function PoDetailContent({
  po,
  shops,
  categories,
  receiving,
  onReceive,
  onEdit,
  onDelete,
}: {
  po: PurchaseOrderRow;
  shops: { id: string; name: string; isActive: boolean }[];
  categories: CategoryRow[];
  receiving: boolean;
  onReceive: (poId: string) => void;
  onEdit: (poId: string) => void;
  onDelete: (poId: string) => void;
}): JSX.Element {
  const [setGst, { isLoading: savingGst }] = useSetPurchaseOrderGstMutation();
  const [interState, setInterState] = useState(po.gstInterState);
  const [cgst, setCgst] = useState(po.cgstPaise ? String(po.cgstPaise / 100) : '');
  const [sgst, setSgst] = useState(po.sgstPaise ? String(po.sgstPaise / 100) : '');
  const [igst, setIgst] = useState(po.igstPaise ? String(po.igstPaise / 100) : '');

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const metalOf = (catId: string | null): MetalTypeLiteral | undefined => {
    if (!catId) return undefined;
    const c = catById.get(catId);
    if (!c) return undefined;
    const main = c.parentId ? catById.get(c.parentId) : c;
    return (main ?? c).metalType;
  };
  const catName = (catId: string | null): string => (catId ? catById.get(catId)?.name ?? '—' : '—');

  const toPaise = (v: string): number => Math.round((parseFloat(v) || 0) * 100);
  const gstPreviewPaise = interState ? toPaise(igst) : toPaise(cgst) + toPaise(sgst);
  // Line costs are GST-inclusive, so the GST sits *inside* totalPaise.
  const taxablePaise = po.totalPaise - gstPreviewPaise;
  // Editable/deletable only before the stock has landed (or been cancelled).
  const editable = po.status !== 'RECEIVED' && po.status !== 'CANCELLED';
  const deletable = po.status !== 'RECEIVED';

  const receivedShopName = po.receivedShopId
    ? shops.find((s) => s.id === po.receivedShopId)?.name ?? 'Unknown shop'
    : null;

  async function saveGst(): Promise<void> {
    try {
      await setGst({
        id: po.id,
        interState,
        cgstPaise: interState ? 0 : toPaise(cgst),
        sgstPaise: interState ? 0 : toPaise(sgst),
        igstPaise: interState ? toPaise(igst) : 0,
      }).unwrap();
      toast.success('Purchase GST saved');
    } catch (err) {
      const message =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not save GST.';
      toast.error(message);
    }
  }

  return (
    <div className="space-y-5 text-sm">
      {/* Actions — edit/delete are blocked once the PO is received. */}
      {(editable || deletable) && (
        <div className="flex items-center justify-end gap-2">
          {editable && (
            <Button size="sm" variant="outline" onClick={() => onEdit(po.id)}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          )}
          {deletable && (
            <Button
              size="sm"
              variant="outline"
              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              onClick={() => onDelete(po.id)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
          )}
        </div>
      )}

      {/* Header facts */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-eyebrow uppercase text-ink-500">Vendor</p>
          <p className="text-ink-900">{po.vendor?.name ?? '—'}</p>
        </div>
        <div>
          <p className="text-eyebrow uppercase text-ink-500">Status</p>
          <Badge tone={po.status === 'DRAFT' ? 'neutral' : po.status === 'RECEIVED' ? 'success' : 'info'}>
            {po.status.toLowerCase()}
          </Badge>
        </div>
        <div>
          <p className="text-eyebrow uppercase text-ink-500">Created</p>
          <p className="text-ink-900">
            {new Date(po.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
          </p>
        </div>
        <div>
          <p className="text-eyebrow uppercase text-ink-500">Items total</p>
          <Money paise={po.totalPaise} className="font-mono text-ink-900" />
        </div>
      </div>

      {/* Where they went */}
      <div className="rounded-md border border-ink-100 bg-ink-25 px-4 py-3">
        <p className="text-eyebrow uppercase text-ink-500 mb-1">Where they went</p>
        {po.status === 'RECEIVED' ? (
          receivedShopName ? (
            <p className="text-ink-900">
              Received into <span className="font-medium">{receivedShopName}</span>
              {po.receivedAt
                ? ` on ${new Date(po.receivedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}`
                : ''}
            </p>
          ) : (
            <p className="text-ink-700">Received (destination not recorded for this older PO).</p>
          )
        ) : po.status === 'CANCELLED' ? (
          <p className="text-ink-700">Cancelled — never received into stock.</p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-ink-700">Not received yet — items aren&apos;t in stock.</p>
            <Button size="sm" variant="secondary" disabled={receiving} onClick={() => onReceive(po.id)}>
              Receive
            </Button>
          </div>
        )}
      </div>

      {/* Line items */}
      <div>
        <p className="text-eyebrow uppercase text-ink-500 mb-2">Line items · {po.items.length}</p>
        <div className="overflow-x-auto rounded-md border border-ink-100">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
              <tr>
                <th className="text-left px-3 py-2">SKU</th>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Category</th>
                <th className="text-right px-3 py-2">Weight</th>
                <th className="text-left px-3 py-2">Purity</th>
                <th className="text-right px-3 py-2">Qty</th>
                <th className="text-right px-3 py-2">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {po.items.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2 font-mono text-xs text-ink-900">{it.itemSku}</td>
                  <td className="px-3 py-2 text-ink-700 max-w-[160px] truncate">{it.name ?? '—'}</td>
                  <td className="px-3 py-2 text-ink-700">{catName(it.categoryId)}</td>
                  <td className="px-3 py-2 text-right"><Weight mg={it.weightMg} /></td>
                  <td className="px-3 py-2"><Purity x100={it.purity} metalType={metalOf(it.categoryId)} /></td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{it.quantity ?? 1}</td>
                  <td className="px-3 py-2 text-right"><Money paise={it.costPaise} className="font-mono tabular-nums" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Purchase GST (input tax credit) */}
      <div className="rounded-md border border-ink-100 p-4 space-y-3">
        <div>
          <p className="text-eyebrow uppercase text-ink-500">Purchase GST (input tax credit)</p>
          <p className="text-xs text-ink-500 mt-0.5">
            GST charged on the vendor&apos;s invoice. Counted as ITC in Finance once the PO is received.
          </p>
        </div>

        {/* Intra / inter toggle */}
        <div className="inline-flex rounded-md border border-ink-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setInterState(false)}
            className={cn(
              'px-3 h-9 text-sm transition-colors duration-fast',
              !interState ? 'bg-brand-500 text-white' : 'bg-ink-0 text-ink-700 hover:bg-ink-25',
            )}
          >
            Intra-state (CGST + SGST)
          </button>
          <button
            type="button"
            onClick={() => setInterState(true)}
            className={cn(
              'px-3 h-9 text-sm border-l border-ink-200 transition-colors duration-fast',
              interState ? 'bg-brand-500 text-white' : 'bg-ink-0 text-ink-700 hover:bg-ink-25',
            )}
          >
            Inter-state (IGST)
          </button>
        </div>

        {interState ? (
          <Field label="IGST (₹)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={igst}
              onChange={(e) => setIgst(e.target.value)}
              className={fieldCls}
              placeholder="0.00"
            />
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="CGST (₹)">
              <input
                type="number"
                step="0.01"
                min="0"
                value={cgst}
                onChange={(e) => setCgst(e.target.value)}
                className={fieldCls}
                placeholder="0.00"
              />
            </Field>
            <Field label="SGST (₹)">
              <input
                type="number"
                step="0.01"
                min="0"
                value={sgst}
                onChange={(e) => setSgst(e.target.value)}
                className={fieldCls}
                placeholder="0.00"
              />
            </Field>
          </div>
        )}

        {/* Line costs are GST-inclusive, so the GST is part of the total — show
            the taxable split rather than adding GST on top (which double-counts). */}
        <div className="space-y-1 border-t border-ink-100 pt-3">
          <div className="flex items-center justify-between text-ink-500">
            <span>Taxable value</span>
            <Money paise={taxablePaise} className="font-mono" />
          </div>
          <div className="flex items-center justify-between text-ink-500">
            <span>GST (ITC)</span>
            <Money paise={gstPreviewPaise} className="font-mono" />
          </div>
          <div className="flex items-center justify-between text-ink-900 font-medium">
            <span>Invoice total incl GST</span>
            <Money paise={po.totalPaise} className="font-mono" />
          </div>
        </div>

        <Button type="button" className="w-full" disabled={savingGst} onClick={() => void saveGst()}>
          {savingGst ? 'Saving…' : 'Save GST'}
        </Button>
      </div>
    </div>
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

export function AddItemDialog({
  open,
  onClose,
  redirectToLabelsOnCreate = true,
}: {
  open: boolean;
  onClose: () => void;
  // After a successful create the Inventory flow jumps to the label printer.
  // Callers outside Inventory (e.g. the E-commerce "Add product" button) pass
  // false to stay in context; the catalog refreshes via cache tags instead.
  redirectToLabelsOnCreate?: boolean;
}): JSX.Element {
  const navigate = useNavigate();
  const { data: cats } = useGetCategoriesQuery();
  const { data: shops } = useGetShopsQuery();
  const { data: existingItemsRes } = useGetItemsQuery({});
  const [create, { isLoading }] = useCreateItemMutation();
  const [triggerSku] = useLazyGetSkuSuggestionQuery();
  const [form, setForm] = useState({
    name: '',
    sku: '',
    description: '',
    shopId: '',
    categoryId: '',
    weightG: '',
    purityCarat: '9',
    stoneWeightG: '',
    hallmarkStatus: 'PENDING' as 'PENDING' | 'SUBMITTED' | 'CERTIFIED' | 'EXEMPT',
    hallmarkRef: '',
    costPriceRupees: '',
    sellingPriceRupees: '',
    makingMode: 'PERCENTAGE' as 'PERCENTAGE' | 'PER_GRAM',
    makingChargePct: '',
    makingPerGramRupees: '',
    gender: '' as '' | 'MEN' | 'WOMEN',
    // HSN code + GST rate (%) for tax reporting. Rate defaults to 3% (gold).
    hsnCode: '',
    gstRatePct: '3',
  });
  // Images and publish-to-website live alongside the form but outside the
  // text/select state object so the upload UI can update images without
  // re-rendering every other input.
  const [images, setImages] = useState<string[]>([]);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [diamonds, setDiamonds] = useState<DiamondRow[]>([]);
  const [sizes, setSizes] = useState<SizeRow[]>([]);
  const [specs, setSpecs] = useState<SpecRow[]>([]);
  const [publishToWebsite, setPublishToWebsite] = useState(true);
  const [uploading, setUploading] = useState<{ name: string; progress: number }[]>([]);
  const [calcSellTotal, setCalcSellTotal] = useState(0);
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
    setForm((f) => ({ ...f, categoryId: catId, purityCarat: defaultPurityForMetal(cat?.metalType) }));
    // Prefill the SKU from the category code ([CODE]-[seq]) unless the user has
    // already typed one. They can still edit it before saving.
    triggerSku(catId)
      .unwrap()
      .then((res) => {
        setForm((f) => (f.sku.trim() ? f : { ...f, sku: res.data.sku }));
      })
      .catch(() => {
        /* suggestion is best-effort */
      });
  };

  // Pre-fill defaults once data lands.
  if (!form.shopId && shops?.data[0]) setForm((f) => ({ ...f, shopId: shops.data[0]!.id }));
  if (!form.categoryId && cats?.data[0]) {
    const firstCat = cats.data[0]!;
    setForm((f) => ({ ...f, categoryId: firstCat.id, purityCarat: defaultPurityForMetal(firstCat.metalType) }));
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
    } else if (metalType === 'OTHER' || metalType === 'STAINLESS_STEEL') {
      // Non-precious — no metal purity. Stored as 0.
      if (purityCaratX100 !== 0) return void toast.error('Non-precious items have no purity (0)');
    }

    if (!Number.isFinite(costPricePaise) || costPricePaise <= 0) return void toast.error('Cost price must be > 0');
    if (!form.shopId || !form.categoryId) return void toast.error('Pick a shop and category');

    // Selling price is optional. When given it must be a positive amount — it's
    // the GST-inclusive price the customer pays (overrides the live metal rate).
    let sellingPricePaise: number | null = null;
    if (form.sellingPriceRupees.trim()) {
      const parsed = Math.round(parseFloat(form.sellingPriceRupees) * 100);
      if (!Number.isFinite(parsed) || parsed <= 0) return void toast.error('Selling price must be > 0');
      sellingPricePaise = parsed;
    }

    // Stone weight is optional. Guard against NaN (empty / non-numeric) and
    // negatives — the schema rejects either and Zod's error path is opaque
    // when a `parseFloat(...) * 1000` slips through with a bad value.
    const stoneRaw = parseFloat(form.stoneWeightG);
    const stoneWeightMg =
      form.stoneWeightG && Number.isFinite(stoneRaw) && stoneRaw > 0
        ? Math.round(stoneRaw * 1000)
        : null;
    const making = resolveItemMakingOverride(form.makingMode, form.makingChargePct, form.makingPerGramRupees);

    try {
      await create({
        name: form.name.trim(),
        sku: form.sku.trim(),
        barcodeData: form.sku.trim(),
        description: form.description.trim() || null,
        shopId: form.shopId,
        categoryId: form.categoryId,
        images,
        weightMg,
        purityCaratX100,
        stoneWeightMg,
        hallmarkStatus: form.hallmarkStatus,
        hallmarkRef: form.hallmarkRef.trim() || null,
        costPricePaise,
        sellingPricePaise,
        hsnCode: form.hsnCode.trim() || null,
        gstRateBps: Math.round(parseFloat(form.gstRatePct || '3') * 100),
        makingChargeBps: making.makingChargeBps,
        makingChargeMode: making.makingChargeMode,
        makingChargePerGramPaise: making.makingChargePerGramPaise,
        // Hybrid stock model — Add Item form lets admins pick between
        // UNIQUE (one piece per row, cloned on add-stock) and BULK (lot
        // tracking N interchangeable pieces with an integer counter).
        isSerialized,
        quantityOnHand,
        gender: form.gender || null,
        publishToWebsite,
        collectionIds,
        diamonds: diamondRowsToInput(diamonds),
        sizes: sizeRowsToInput(sizes),
        specs: specRowsToInput(specs),
      }).unwrap();
      const newSku = form.sku.trim();
      const stockLabel = isSerialized ? '' : ` (${quantityOnHand} in stock)`;
      toast.success(
        publishToWebsite
          ? `Added ${form.name.trim()}${stockLabel} and published to storefront`
          : `Added ${form.name.trim()}${stockLabel}`,
      );
      onClose();
      // Jump straight to the label printer for the piece we just added so its
      // tag can be printed immediately, without hunting for it in the list. The
      // print page pre-selects this SKU via router state. Skipped when opened
      // from outside Inventory (the catalog refreshes via cache invalidation).
      if (redirectToLabelsOnCreate) {
        navigate('/admin/inventory/print-labels', { state: { skus: [newSku] } });
      }
    } catch (err) {
      const e = err as {
        status?: number | string;
        data?: { error?: { message?: string; fields?: Record<string, string> }; message?: string };
      };
      const baseMsg = e?.data?.error?.message ?? e?.data?.message ?? 'Could not save item.';
      // Surface the offending field(s) — the server returns them under
      // error.fields on a VALIDATION_ERROR, but the bare "Invalid request"
      // message alone gives the user nothing to act on.
      const fieldDetail = e?.data?.error?.fields
        ? Object.entries(e.data.error.fields).map(([k, v]) => `${k}: ${v}`).join('; ')
        : '';
      toast.error(baseMsg, fieldDetail ? { description: fieldDetail } : undefined);
      // eslint-disable-next-line no-console
      console.error('[inventory] createItem failed:', err);
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
                  const it = existingItems.find((i) => i.id === val) as
                    | (Item & { description?: string | null; gender?: 'MEN' | 'WOMEN' | null })
                    | undefined;
                  if (it) {
                    setForm({
                      name: it.name || '',
                      sku: it.sku,
                      description: it.description ?? '',
                      shopId: it.shopId,
                      categoryId: it.categoryId,
                      weightG: String(it.weightMg / 1000),
                      purityCarat: String(it.purityCaratX100 === 0 ? '0' : it.purityCaratX100 / 100),
                      stoneWeightG: it.stoneWeightMg ? String(it.stoneWeightMg / 1000) : '',
                      hallmarkStatus: it.hallmarkStatus,
                      hallmarkRef: it.hallmarkRef || '',
                      costPriceRupees: String(it.costPricePaise / 100),
                      sellingPriceRupees:
                        it.sellingPricePaise != null ? String(it.sellingPricePaise / 100) : '',
                      makingMode: 'PERCENTAGE',
                      makingChargePct: it.makingChargeBps ? String(it.makingChargeBps / 100) : '',
                      makingPerGramRupees: '',
                      gender: (it.gender ?? '') as '' | 'MEN' | 'WOMEN',
                      hsnCode: it.hsnCode ?? '',
                      gstRatePct: String((it.gstRateBps ?? 300) / 100),
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

            <FieldGroup label="Item images">
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
            </FieldGroup>

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
                {selectedCat && !selectedCat.parentId && (
                  <p className="mt-1 text-[11px] text-amber-600">
                    Tip: pick a sub-category (e.g. Rings) so this item is grouped correctly in reports.
                  </p>
                )}
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
              <Field label="HSN code">
                <input
                  value={form.hsnCode}
                  onChange={(e) => setForm({ ...form, hsnCode: e.target.value })}
                  className={fieldCls}
                  placeholder="e.g. 7113"
                  inputMode="numeric"
                />
                <p className="mt-1 text-[11px] text-ink-500">
                  Shown HSN-wise in GST reports when this piece is sold.
                </p>
              </Field>
              <Field label="GST rate (%)">
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={28}
                  value={form.gstRatePct}
                  onChange={(e) => setForm({ ...form, gstRatePct: e.target.value })}
                  className={fieldCls}
                />
                <p className="mt-1 text-[11px] text-ink-500">Default 3% for gold/silver jewellery.</p>
              </Field>
            </div>
            <Field label="Gender">
              <select
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value as '' | 'MEN' | 'WOMEN' })}
                className={fieldCls}
              >
                <option value="">— Not specified</option>
                <option value="WOMEN">Women</option>
                <option value="MEN">Men</option>
              </select>
            </Field>
            {(metalType === 'GOLD' || metalType === 'SILVER' || metalType === 'OTHER' || metalType === 'STAINLESS_STEEL') && (
              <PriceCalcHelper
                metalType={metalType}
                categoryName={selectedCat?.name ?? ''}
                weightG={form.weightG}
                onUseCost={(v) => setForm((f) => ({ ...f, costPriceRupees: v }))}
                onUseSelling={(v) => setForm((f) => ({ ...f, sellingPriceRupees: v }))}
                onSellCalc={setCalcSellTotal}
              />
            )}

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
                <p className="mt-1 text-[11px] text-ink-500">
                  Internal — drives COGS &amp; analytics. Never shown to customers.
                </p>
              </Field>
              <Field label="Selling price (₹)">
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.sellingPriceRupees}
                  onChange={(e) => setForm({ ...form, sellingPriceRupees: e.target.value })}
                  className={fieldCls}
                  placeholder="optional"
                />
                <p className="mt-1 text-[11px] text-ink-500">
                  Final price the customer pays (incl. GST) in POS &amp; storefront. Blank = price by live metal rate.
                </p>
              </Field>
            </div>

            <Field label="Making charge override">
              <MakingChargeOverride
                mode={form.makingMode}
                pct={form.makingChargePct}
                perGram={form.makingPerGramRupees}
                onMode={(m) => setForm({ ...form, makingMode: m })}
                onPct={(v) => setForm({ ...form, makingChargePct: v })}
                onPerGram={(v) => setForm({ ...form, makingPerGramRupees: v })}
              />
            </Field>

            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="Shown on the storefront, item slips & receipts. Set once here."
                className={`${fieldCls} resize-y`}
              />
            </Field>

            <Field label="Collections">
              <CollectionsMultiSelect selected={collectionIds} onChange={setCollectionIds} />
            </Field>

            <Field label="Diamonds (4 Cs)">
              <DiamondsEditor rows={diamonds} onChange={setDiamonds} />
            </Field>

            <Field label="Sizes (optional)">
              <SizesEditor
                rows={sizes}
                onChange={setSizes}
                baseWeightG={form.weightG}
                baseCostRupees={form.costPriceRupees}
                baseSellRupees={form.sellingPriceRupees}
              />
            </Field>

            <Field label="Details & Dimensions (optional)">
              <SpecsEditor rows={specs} onChange={setSpecs} />
            </Field>

            {calcSellTotal > 0 && diamonds.length > 0 && (() => {
              const diamondSell = diamonds.reduce((s, r) => s + (parseFloat(r.sellingPriceRupees) || 0), 0);
              return diamondSell > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50/40 px-3 py-2 font-mono text-xs space-y-1">
                  <div className="flex justify-between text-ink-500">
                    <span>Metal sell (incl. GST)</span><span>₹{calcSellTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-ink-500">
                    <span>Diamond sell (incl. GST)</span><span>₹{diamondSell.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-ink-900 border-t border-amber-200 pt-1">
                    <span>Grand Total</span><span>₹{(calcSellTotal + diamondSell).toFixed(2)}</span>
                  </div>
                </div>
              ) : null;
            })()}

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

export function EditItemDialog({
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
  const [del, { isLoading: deleting }] = useDeleteItemMutation();

  const handleDelete = async (): Promise<void> => {
    if (item.status === 'SOLD') {
      return void toast.error('Sold items cannot be deleted — they live on a bill.');
    }
    if (item.status === 'MELTED') {
      return void toast.error('This item has already been removed from inventory.');
    }
    const qty = item.isSerialized ? 1 : item.quantityOnHand;
    const stockLine = `Stock on hand: ${qty} ${qty === 1 ? 'piece' : 'pieces'}.`;
    if (
      !window.confirm(
        `Are you sure you want to delete "${item.name ?? item.sku}"?\n\n${stockLine}\nThis permanently removes the item and its stock.`,
      )
    ) {
      return;
    }
    try {
      const res = await del(item.id).unwrap();
      toast.success(
        res.data.hardDeleted
          ? `Deleted ${item.name ?? item.sku}`
          : `Removed ${item.name ?? item.sku} (kept in records — it has sales history)`,
      );
      onClose();
    } catch (err) {
      const msg = (err as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not delete item.';
      toast.error(msg);
    }
  };
  // The list endpoint attaches collectionIds + diamonds to each item; they
  // aren't on the base Item type, so read them through a widened view.
  const itemExt = item as Item & {
    description?: string | null;
    collectionIds?: string[];
    diamonds?: Array<{ shape?: string | null; caratWeightX100?: number; cut?: string | null; clarity?: string | null; color?: string | null; count?: number; costPaise?: number; sellingPricePaise?: number | null; purchaseRatePaise?: number | null; sellRatePaise?: number | null }>;
    sizes?: { label: string; weightMg: number }[] | null;
    specs?: { label: string; value: string }[] | null;
  };
  const [form, setForm] = useState({
    name: item.name ?? '',
    sku: item.sku,
    description: itemExt.description ?? '',
    shopId: item.shopId,
    categoryId: item.categoryId,
    weightG: String(item.weightMg / 1000),
    purityCarat: String(item.purityCaratX100 === 0 ? '0' : item.purityCaratX100 / 100),
    stoneWeightG: item.stoneWeightMg ? String(item.stoneWeightMg / 1000) : '',
    hallmarkStatus: item.hallmarkStatus,
    hallmarkRef: item.hallmarkRef ?? '',
    costPriceRupees: String(item.costPricePaise / 100),
    sellingPriceRupees: item.sellingPricePaise != null ? String(item.sellingPricePaise / 100) : '',
    makingMode: (item.makingChargeMode ?? 'PERCENTAGE') as 'PERCENTAGE' | 'PER_GRAM',
    makingChargePct: item.makingChargeBps ? String(item.makingChargeBps / 100) : '',
    makingPerGramRupees:
      item.makingChargePerGramPaise != null ? String(item.makingChargePerGramPaise / 100) : '',
    gender: ((item.gender as 'MEN' | 'WOMEN' | null) ?? '') as '' | 'MEN' | 'WOMEN',
    hsnCode: (item as Item & { hsnCode?: string | null }).hsnCode ?? '',
    gstRatePct: String(((item as Item & { gstRateBps?: number }).gstRateBps ?? 300) / 100),
  });
  const [images, setImages] = useState<string[]>(item.images ?? []);
  const [collectionIds, setCollectionIds] = useState<string[]>(itemExt.collectionIds ?? []);
  const [diamonds, setDiamonds] = useState<DiamondRow[]>(dbDiamondsToRows(itemExt.diamonds));
  const [sizes, setSizes] = useState<SizeRow[]>(dbSizesToRows(itemExt.sizes));
  const [specs, setSpecs] = useState<SpecRow[]>(dbSpecsToRows(itemExt.specs));
  const [calcSellTotal, setCalcSellTotal] = useState(0);
  const [publishToWebsite, setPublishToWebsite] = useState<boolean>(
    (item as Item & { isPublished?: boolean }).isPublished ?? false,
  );
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
      sku: item.sku,
      description: itemExt.description ?? '',
      shopId: item.shopId,
      categoryId: item.categoryId,
      weightG: String(item.weightMg / 1000),
      purityCarat: String(item.purityCaratX100 === 0 ? '0' : item.purityCaratX100 / 100),
      stoneWeightG: item.stoneWeightMg ? String(item.stoneWeightMg / 1000) : '',
      hallmarkStatus: item.hallmarkStatus,
      hallmarkRef: item.hallmarkRef ?? '',
      costPriceRupees: String(item.costPricePaise / 100),
      sellingPriceRupees: item.sellingPricePaise != null ? String(item.sellingPricePaise / 100) : '',
      makingMode: (item.makingChargeMode ?? 'PERCENTAGE') as 'PERCENTAGE' | 'PER_GRAM',
      makingChargePct: item.makingChargeBps ? String(item.makingChargeBps / 100) : '',
      makingPerGramRupees:
        item.makingChargePerGramPaise != null ? String(item.makingChargePerGramPaise / 100) : '',
      gender: ((item.gender as 'MEN' | 'WOMEN' | null) ?? '') as '' | 'MEN' | 'WOMEN',
      hsnCode: (item as Item & { hsnCode?: string | null }).hsnCode ?? '',
      gstRatePct: String(((item as Item & { gstRateBps?: number }).gstRateBps ?? 300) / 100),
    });
    setImages(item.images ?? []);
    setCollectionIds(itemExt.collectionIds ?? []);
    setDiamonds(dbDiamondsToRows(itemExt.diamonds));
    setSizes(dbSizesToRows(itemExt.sizes));
    setSpecs(dbSpecsToRows(itemExt.specs));
    setPublishToWebsite((item as Item & { isPublished?: boolean }).isPublished ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (form.sku.trim().length < 2) return void toast.error('SKU must be at least 2 characters');
    if (!Number.isFinite(weightMg) || weightMg <= 0) return void toast.error('Weight must be > 0');
    if (metalType === 'GOLD' && (purityCaratX100 < 0 || purityCaratX100 > 2400)) {
      return void toast.error('Purity must be between 0K and 24K for Gold');
    }
    if (!Number.isFinite(costPricePaise) || costPricePaise <= 0) {
      return void toast.error('Cost price must be > 0');
    }

    // Optional GST-inclusive selling price (overrides live metal-rate pricing).
    let sellingPricePaise: number | null = null;
    if (form.sellingPriceRupees.trim()) {
      const parsed = Math.round(parseFloat(form.sellingPriceRupees) * 100);
      if (!Number.isFinite(parsed) || parsed <= 0) return void toast.error('Selling price must be > 0');
      sellingPricePaise = parsed;
    }

    const stoneRaw = parseFloat(form.stoneWeightG);
    const stoneWeightMg =
      form.stoneWeightG && Number.isFinite(stoneRaw) && stoneRaw > 0
        ? Math.round(stoneRaw * 1000)
        : null;
    const making = resolveItemMakingOverride(form.makingMode, form.makingChargePct, form.makingPerGramRupees);

    try {
      await update({
        id: item.id,
        patch: {
          name: form.name.trim(),
          sku: form.sku.trim(),
          description: form.description.trim() || null,
          shopId: form.shopId,
          categoryId: form.categoryId,
          images,
          weightMg,
          purityCaratX100,
          stoneWeightMg,
          hallmarkStatus: form.hallmarkStatus,
          hallmarkRef: form.hallmarkRef.trim() || null,
          costPricePaise,
          sellingPricePaise,
          hsnCode: form.hsnCode.trim() || null,
          gstRateBps: Math.round(parseFloat(form.gstRatePct || '3') * 100),
          makingChargeBps: making.makingChargeBps,
          makingChargeMode: making.makingChargeMode,
          makingChargePerGramPaise: making.makingChargePerGramPaise,
          gender: form.gender || null,
          collectionIds,
          diamonds: diamondRowsToInput(diamonds),
          sizes: sizeRowsToInput(sizes),
          specs: specRowsToInput(specs),
          publishToWebsite,
        },
      }).unwrap();
      toast.success(`Updated ${form.name.trim()}`);
      onClose();
    } catch (err) {
      const e = err as {
        status?: number | string;
        data?: { error?: { message?: string; fields?: Record<string, string> }; message?: string };
      };
      const baseMsg = e?.data?.error?.message ?? e?.data?.message ?? 'Could not save changes.';
      const fieldDetail = e?.data?.error?.fields
        ? Object.entries(e.data.error.fields).map(([k, v]) => `${k}: ${v}`).join('; ')
        : '';
      toast.error(baseMsg, fieldDetail ? { description: fieldDetail } : undefined);
      // eslint-disable-next-line no-console
      console.error('[inventory] updateItem failed:', err);
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
              Stock type is locked. Change the SKU, name, photos, weight, hallmark and pricing here;
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

            <Field label="SKU">
              <input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className={fieldCls}
                placeholder="DW-0001"
                required
              />
              <p className="mt-1 text-[11px] text-ink-500">
                Must be unique within this shop. The scannable barcode updates to match — re-print
                the label after renaming.
              </p>
            </Field>

            <FieldGroup label="Item images">
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
            </FieldGroup>

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
              <Field label="HSN code">
                <input
                  value={form.hsnCode}
                  onChange={(e) => setForm({ ...form, hsnCode: e.target.value })}
                  className={fieldCls}
                  placeholder="e.g. 7113"
                  inputMode="numeric"
                />
                <p className="mt-1 text-[11px] text-ink-500">
                  Shown HSN-wise in GST reports when this piece is sold.
                </p>
              </Field>
              <Field label="GST rate (%)">
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={28}
                  value={form.gstRatePct}
                  onChange={(e) => setForm({ ...form, gstRatePct: e.target.value })}
                  className={fieldCls}
                />
                <p className="mt-1 text-[11px] text-ink-500">Default 3% for gold/silver jewellery.</p>
              </Field>
            </div>
            <Field label="Gender">
              <select
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value as '' | 'MEN' | 'WOMEN' })}
                className={fieldCls}
              >
                <option value="">— Not specified</option>
                <option value="WOMEN">Women</option>
                <option value="MEN">Men</option>
              </select>
            </Field>

            {(metalType === 'GOLD' || metalType === 'SILVER' || metalType === 'OTHER' || metalType === 'STAINLESS_STEEL') && (
              <PriceCalcHelper
                metalType={metalType}
                categoryName={selectedCat?.name ?? ''}
                weightG={form.weightG}
                onUseCost={(v) => setForm((f) => ({ ...f, costPriceRupees: v }))}
                onUseSelling={(v) => setForm((f) => ({ ...f, sellingPriceRupees: v }))}
                onSellCalc={setCalcSellTotal}
              />
            )}

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
                <p className="mt-1 text-[11px] text-ink-500">
                  Internal — drives COGS &amp; analytics. Never shown to customers.
                </p>
              </Field>
              <Field label="Selling price (₹)">
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.sellingPriceRupees}
                  onChange={(e) => setForm({ ...form, sellingPriceRupees: e.target.value })}
                  className={fieldCls}
                  placeholder="optional"
                />
                <p className="mt-1 text-[11px] text-ink-500">
                  Final price the customer pays (incl. GST) in POS &amp; storefront. Blank = price by live metal rate.
                </p>
              </Field>
            </div>

            <Field label="Making charge override">
              <MakingChargeOverride
                mode={form.makingMode}
                pct={form.makingChargePct}
                perGram={form.makingPerGramRupees}
                onMode={(m) => setForm({ ...form, makingMode: m })}
                onPct={(v) => setForm({ ...form, makingChargePct: v })}
                onPerGram={(v) => setForm({ ...form, makingPerGramRupees: v })}
              />
            </Field>

            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="Shown on the storefront, item slips & receipts. Set once here."
                className={`${fieldCls} resize-y`}
              />
            </Field>

            <Field label="Collections">
              <CollectionsMultiSelect selected={collectionIds} onChange={setCollectionIds} />
            </Field>

            <Field label="Diamonds (4 Cs)">
              <DiamondsEditor rows={diamonds} onChange={setDiamonds} />
            </Field>

            <Field label="Sizes (optional)">
              <SizesEditor
                rows={sizes}
                onChange={setSizes}
                baseWeightG={form.weightG}
                baseCostRupees={form.costPriceRupees}
                baseSellRupees={form.sellingPriceRupees}
              />
            </Field>

            <Field label="Details & Dimensions (optional)">
              <SpecsEditor rows={specs} onChange={setSpecs} />
            </Field>

            {calcSellTotal > 0 && diamonds.length > 0 && (() => {
              const diamondSell = diamonds.reduce((s, r) => s + (parseFloat(r.sellingPriceRupees) || 0), 0);
              return diamondSell > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50/40 px-3 py-2 font-mono text-xs space-y-1">
                  <div className="flex justify-between text-ink-500">
                    <span>Metal sell (incl. GST)</span><span>₹{calcSellTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-ink-500">
                    <span>Diamond sell (incl. GST)</span><span>₹{diamondSell.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-ink-900 border-t border-amber-200 pt-1">
                    <span>Grand Total</span><span>₹{(calcSellTotal + diamondSell).toFixed(2)}</span>
                  </div>
                </div>
              ) : null;
            })()}

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

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting || item.status === 'SOLD' || item.status === 'MELTED'}
                title={
                  item.status === 'SOLD'
                    ? 'Sold items cannot be deleted'
                    : item.status === 'MELTED'
                      ? 'Already removed from inventory'
                      : 'Delete item'
                }
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium text-rose-600 border border-rose-200 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="h-4 w-4" /> {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <div className="flex-1" />
              <Button variant="outline" type="button" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
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
  // Restocking a sold-out piece brings it back into stock (see addStock service).
  const wasSold = item.status === 'SOLD';

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
          wasSold
            ? `Restocked ${item.sku} — back in stock${res.data.added > 1 ? ` (+${res.data.added - 1} new)` : ''}.`
            : `Created ${res.data.added} new piece${res.data.added === 1 ? '' : 's'} cloned from ${item.sku}.`,
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
                : wasSold
                  ? `This sold piece will be brought back into stock${
                      quantity > 1
                        ? `, plus ${quantity - 1} new cloned piece${quantity - 1 === 1 ? '' : 's'}`
                        : ''
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
  categoryId: string;
  itemSku: string;
  weightG: string;
  purityCarat: string;
  costRupees: string;
  /** Making-charge override as a percentage (e.g. "6" → 600 bps). Optional. */
  makingPct?: string;
  qty: string;
  /** Fixed selling price in rupees; copied onto the Item on receive. */
  sellingPriceRupees?: string;
  /** HSN code + GST rate (%) captured at PO time; copied onto the Item on receive. */
  hsnCode?: string;
  gstRatePct?: string;
  /** When true, the linked storefront Product is published on receive. */
  publishToStorefront?: boolean;
  /** UI-only: metal purchase rate ₹/g used to auto-compute costRupees. Not sent to server. */
  metalRateRupees?: string;
  /** UI-only: making charge ₹/g used in cost calculator. Not sent to server. */
  makingPerGramCalc?: string;
  /** UI-only: metal sell rate ₹/g used to auto-compute sellingPriceRupees. Not sent to server. */
  sellRateRupees?: string;
  /** UI-only: making charge ₹/g used in the sale calculator. Not sent to server. */
  sellMakingPerGramCalc?: string;
  // ---- Full item-detail fields (optional, for new pieces) ----
  name?: string;
  description?: string;
  images?: string[];
  hallmarkStatus?: string;
  hallmarkRef?: string;
  stoneWeightG?: string;
  makingMode?: 'PERCENTAGE' | 'PER_GRAM';
  makingPerGramRupees?: string;
  isSerialized?: boolean;
  /** Target audience for the new piece ("MEN" / "WOMEN"); copied to the Item on receive. */
  gender?: 'MEN' | 'WOMEN';
  collectionIds?: string[];
  diamonds?: DiamondRow[];
  /** Custom "Details & Dimensions" spec rows; copied onto the Item on receive. */
  specs?: SpecRow[];
}

// Item picker sheet — lets the user pick existing inventory items (by category
// or collection) and adds them as pre-filled PO lines. Cost is left blank since
// the vendor price may differ from the current stock cost.
function ItemPickerSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (lines: POLine[]) => void;
}): JSX.Element {
  const [view, setView] = useState<'category' | 'collection'>('category');
  const [selectedCatId, setSelectedCatId] = useState('');
  const [selectedColId, setSelectedColId] = useState('');
  const [search, setSearch] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const { data: catsRes } = useGetCategoriesQuery();
  const { data: colsRes } = useGetCollectionsQuery();
  const { data: catItems } = useGetItemsQuery(
    { categoryId: selectedCatId || undefined, limit: 200 },
    { skip: view !== 'category' || !selectedCatId },
  );
  const { data: colItems } = useListCollectionItemsQuery(selectedColId, {
    skip: view !== 'collection' || !selectedColId,
  });

  const categories = (catsRes?.data ?? []) as CategoryRow[];
  const collections = colsRes?.data ?? [];
  const rawItems = view === 'category' ? (catItems?.data ?? []) : (colItems?.data ?? []);
  const items = search
    ? rawItems.filter(
        (it) =>
          it.sku.toLowerCase().includes(search.toLowerCase()) ||
          (it.name?.toLowerCase().includes(search.toLowerCase()) ?? false),
      )
    : rawItems;

  const allIds = items.map((it) => it.id);
  const allChecked = allIds.length > 0 && allIds.every((id) => checked.has(id));
  const someChecked = allIds.some((id) => checked.has(id));

  function toggle(id: string): void {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(): void {
    if (allChecked) {
      setChecked(new Set());
    } else {
      setChecked(new Set(allIds));
    }
  }

  function handleAdd(): void {
    const selected = items.filter((it) => checked.has(it.id));
    const lines: POLine[] = selected.map((it) => ({
      categoryId: it.categoryId,
      itemSku: it.sku,
      weightG: (it.weightMg / 1000).toFixed(3),
      purityCarat: (it.purityCaratX100 / 100).toString(),
      costRupees: '',
      makingPct: it.makingChargeBps ? String(it.makingChargeBps / 100) : '',
      qty: '1',
    }));
    onAdd(lines);
    setChecked(new Set());
    onClose();
  }

  function handleClose(): void {
    setChecked(new Set());
    setSearch('');
    onClose();
  }

  const placeholder =
    view === 'category'
      ? !selectedCatId
        ? 'Select a category above to browse items'
        : items.length === 0
          ? 'No items in this category'
          : null
      : !selectedColId
        ? 'Select a collection above to browse items'
        : items.length === 0
          ? 'No items in this collection'
          : null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent className="!max-w-lg">
        <SheetHeader>
          <SheetTitle>Pick items for PO</SheetTitle>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-3">
          {/* View toggle */}
          <div className="flex rounded-md border border-ink-200 overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => { setView('category'); setChecked(new Set()); }}
              className={`flex-1 py-2 font-medium transition-colors ${view === 'category' ? 'bg-brand-600 text-white' : 'bg-ink-0 text-ink-600 hover:bg-ink-50'}`}
            >
              By Category
            </button>
            <button
              type="button"
              onClick={() => { setView('collection'); setChecked(new Set()); }}
              className={`flex-1 py-2 font-medium transition-colors ${view === 'collection' ? 'bg-brand-600 text-white' : 'bg-ink-0 text-ink-600 hover:bg-ink-50'}`}
            >
              By Collection
            </button>
          </div>

          {/* Picker dropdown */}
          {view === 'category' ? (
            <select
              value={selectedCatId}
              onChange={(e) => { setSelectedCatId(e.target.value); setChecked(new Set()); }}
              className={fieldCls}
            >
              <option value="">Choose category…</option>
              {buildCategoryFilterOptions(categories).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <select
              value={selectedColId}
              onChange={(e) => { setSelectedColId(e.target.value); setChecked(new Set()); }}
              className={fieldCls}
            >
              <option value="">Choose collection…</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}

          {/* Search */}
          {(selectedCatId || selectedColId) && rawItems.length > 0 && (
            <input
              type="search"
              placeholder="Search by SKU or name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={fieldCls}
            />
          )}

          {/* Item list */}
          <div className="flex-1 overflow-y-auto rounded-md border border-ink-100 divide-y divide-ink-100 max-h-[420px]">
            {placeholder ? (
              <p className="p-5 text-sm text-ink-500">{placeholder}</p>
            ) : (
              <>
                {/* Select all row */}
                <label className="flex items-center gap-3 px-3 py-2 bg-ink-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-ink-300 accent-brand-600"
                  />
                  <span className="text-xs font-medium text-ink-600 uppercase tracking-wide">
                    Select all ({items.length})
                  </span>
                </label>
                {items.map((it) => (
                  <label
                    key={it.id}
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-ink-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked.has(it.id)}
                      onChange={() => toggle(it.id)}
                      className="h-4 w-4 rounded border-ink-300 accent-brand-600 shrink-0"
                    />
                    {it.images?.[0] && (
                      <img
                        src={cloudinaryThumb(it.images[0], 40) ?? it.images[0]}
                        alt=""
                        className="h-9 w-9 rounded object-cover shrink-0 border border-ink-100"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink-900 truncate">
                        {it.name ?? it.sku}
                      </p>
                      <p className="text-xs text-ink-500 font-mono">{it.sku}</p>
                    </div>
                    <div className="text-right shrink-0 text-xs text-ink-500">
                      <p>{(it.weightMg / 1000).toFixed(3)} g</p>
                      <p>{(it.purityCaratX100 / 100)}K</p>
                    </div>
                  </label>
                ))}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-ink-100">
            <span className="text-sm text-ink-500">
              {checked.size > 0 ? `${checked.size} item${checked.size > 1 ? 's' : ''} selected` : 'None selected'}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={checked.size === 0}
                onClick={handleAdd}
              >
                Add {checked.size > 0 ? checked.size : ''} to PO
              </Button>
            </div>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

// Per-line editor extracted into its own component so it can call hooks
// independently for each line. Has a collapsible "Item Details" section that
// mirrors the Add Item dialog — for new pieces that should be fully described
// at PO-creation time (name, images, diamonds, collections, etc.).
function POLineEditor({
  line,
  index,
  categories,
  onPatch,
  onApplySuggestedSku,
  onRemove,
}: {
  line: POLine;
  index: number;
  categories: CategoryRow[];
  onPatch: (i: number, patch: Partial<POLine>) => void;
  // Applies a server-suggested SKU to this line, but first bumps its numeric
  // suffix so it doesn't collide with SKUs already used by sibling lines in the
  // same PO. suggestSku only sees persisted rows, so without this every same-
  // category line gets the identical suggestion (e.g. all "RING-001") and they
  // merge into one inventory row on receive.
  onApplySuggestedSku: (i: number, suggested: string) => void;
  onRemove: (i: number) => void;
}): JSX.Element {
  const [triggerSku, { data: skuData }] = useLazyGetSkuSuggestionQuery();
  const [expanded, setExpanded] = useState(false);
  const [uploading, setUploading] = useState<{ name: string; progress: number }[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cloudinaryReady = isCloudinaryConfigured();
  const skuPrefix = skuData?.data?.code ?? null;

  const lineCat = categories.find((c) => c.id === line.categoryId);
  const lineMetal: MetalTypeLiteral = lineCat?.metalType ?? 'GOLD';

  function handleCategoryChange(catId: string): void {
    const cat = categories.find((c) => c.id === catId);
    onPatch(index, { categoryId: catId, purityCarat: defaultPurityForMetal(cat?.metalType), itemSku: '' });
    if (catId) {
      void triggerSku(catId).then((res) => {
        const suggested = res.data?.data?.sku;
        if (suggested) onApplySuggestedSku(index, suggested);
      });
    }
  }

  async function uploadFiles(files: File[]): Promise<void> {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) { toast.error('Only image files are supported'); return; }
    setUploading((prev) => [...prev, ...imageFiles.map((f) => ({ name: f.name, progress: 0 }))]);
    const results = await Promise.allSettled(
      imageFiles.map((file) =>
        uploadImageToCloudinary(file, {
          folder: 'zelora/items',
          onProgress: (pct) => {
            setUploading((prev) => prev.map((u) => (u.name === file.name ? { ...u, progress: pct } : u)));
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
    if (newUrls.length > 0) onPatch(index, { images: [...(line.images ?? []), ...newUrls] });
    if (failures > 0) toast.error(`${failures} upload${failures === 1 ? '' : 's'} failed`);
    setUploading((prev) => prev.filter((u) => !imageFiles.some((f) => f.name === u.name)));
  }

  const images = line.images ?? [];

  return (
    <div className="rounded-md border border-ink-200 p-3 space-y-2.5">
      {/* ── Category row ── */}
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">Category</span>
          <select
            value={line.categoryId}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className={fieldCls}
            required
          >
            <option value="">Choose category…</option>
            {buildCategoryFilterOptions(categories).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="mt-6 text-ink-400 hover:text-rose-600 text-lg leading-none"
          aria-label="Remove line"
          title="Remove line"
        >×</button>
      </div>

      {/* ── SKU / Weight / Cost / Qty ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] uppercase tracking-wider text-ink-500">SKU</span>
            {skuPrefix && (
              <span className="text-[10px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded font-mono leading-none">
                {skuPrefix}
              </span>
            )}
          </div>
          <input
            value={line.itemSku}
            onChange={(e) => onPatch(index, { itemSku: e.target.value })}
            className={fieldCls}
            placeholder={skuPrefix ? `${skuPrefix}-001` : 'DW-0050'}
          />
        </div>
        <div>
          <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">Weight (g)</span>
          <input type="number" step="0.001" value={line.weightG}
            onChange={(e) => onPatch(index, { weightG: e.target.value })} className={fieldCls} />
        </div>
        <div>
          <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">Cost (₹)</span>
          <input type="number" step="0.01" value={line.costRupees}
            onChange={(e) => onPatch(index, { costRupees: e.target.value })} className={fieldCls} />
        </div>
        <div>
          <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">Qty</span>
          <input type="number" min="1" step="1" value={line.qty}
            onChange={(e) => onPatch(index, { qty: e.target.value })} className={fieldCls} />
        </div>
      </div>

      {/* ── Purity / Making % / Selling Price ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">Purity</span>
          <PurityPicker value={line.purityCarat} metalType={lineMetal}
            onChange={(v) => onPatch(index, { purityCarat: v })} />
        </div>
        <div>
          <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">Making %</span>
          <input type="number" step="0.01" min="0" value={line.makingPct ?? ''}
            onChange={(e) => onPatch(index, { makingPct: e.target.value })}
            className={fieldCls} placeholder="e.g. 6" />
          <span className="text-[10px] text-ink-400 block mt-1">Optional — blank uses category default.</span>
        </div>
        <div>
          <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">Selling Price (₹)</span>
          <input type="number" step="0.01" min="0" value={line.sellingPriceRupees ?? ''}
            onChange={(e) => onPatch(index, { sellingPriceRupees: e.target.value })}
            className={fieldCls} placeholder="Optional" />
          <span className="text-[10px] text-ink-400 block mt-1">Set on item when PO is received.</span>
        </div>
      </div>

      {/* ── Cost calculator ── */}
      {(lineMetal === 'GOLD' || lineMetal === 'SILVER') && (() => {
        const w = parseFloat(line.weightG) || 0;
        const r = parseFloat(line.metalRateRupees ?? '') || 0;
        const m = parseFloat(line.makingPerGramCalc ?? '') || 0;
        const metal = w * r; const making = w * m;
        const subtotal = metal + making; const gst = subtotal * 0.03;
        const calcTotal = subtotal + gst;
        const label = lineMetal === 'SILVER' ? 'Silver rate (₹/g)' : 'Gold rate (₹/g)';
        return (
          <div className="rounded bg-brand-50/40 border border-brand-200 px-2.5 py-2 space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-brand-700 font-medium">Cost calculator — rate + making + GST</p>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <span className="text-[10px] text-ink-500 block mb-0.5">{label}</span>
                <input type="number" step="0.01" min={0} value={line.metalRateRupees ?? ''}
                  onChange={(e) => {
                    const rr = parseFloat(e.target.value) || 0;
                    const mm = parseFloat(line.makingPerGramCalc ?? '') || 0;
                    const ww = parseFloat(line.weightG) || 0;
                    const tot = (ww * rr + ww * mm) * 1.03;
                    onPatch(index, { metalRateRupees: e.target.value, ...(rr > 0 && ww > 0 ? { costRupees: tot.toFixed(2) } : {}) });
                  }}
                  className={`${fieldCls} text-xs`} placeholder="e.g. 3200" />
              </div>
              <div>
                <span className="text-[10px] text-ink-500 block mb-0.5">Making (₹/g)</span>
                <input type="number" step="0.01" min={0} value={line.makingPerGramCalc ?? ''}
                  onChange={(e) => {
                    const mm = parseFloat(e.target.value) || 0;
                    const rr = parseFloat(line.metalRateRupees ?? '') || 0;
                    const ww = parseFloat(line.weightG) || 0;
                    const tot = (ww * rr + ww * mm) * 1.03;
                    onPatch(index, { makingPerGramCalc: e.target.value, ...(rr > 0 && ww > 0 ? { costRupees: tot.toFixed(2) } : {}) });
                  }}
                  className={`${fieldCls} text-xs`} placeholder="e.g. 150" />
              </div>
            </div>
            {w > 0 && r > 0 && (
              <div className="text-[10px] font-mono text-ink-600 flex flex-wrap gap-x-3 gap-y-0.5">
                <span>Metal ₹{metal.toFixed(2)}</span>
                {making > 0 && <span>Making ₹{making.toFixed(2)}</span>}
                <span>GST ₹{gst.toFixed(2)}</span>
                <span className="font-semibold text-ink-900">Total ₹{calcTotal.toFixed(2)}</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Sale calculator ── mirrors the cost calculator but fills Selling Price. */}
      {(lineMetal === 'GOLD' || lineMetal === 'SILVER') && (() => {
        const w = parseFloat(line.weightG) || 0;
        const r = parseFloat(line.sellRateRupees ?? '') || 0;
        const m = parseFloat(line.sellMakingPerGramCalc ?? '') || 0;
        const metal = w * r; const making = w * m;
        const subtotal = metal + making; const gst = subtotal * 0.03;
        const calcTotal = subtotal + gst;
        const label = lineMetal === 'SILVER' ? 'Silver rate (₹/g)' : 'Gold rate (₹/g)';
        return (
          <div className="rounded bg-emerald-50/50 border border-emerald-200 px-2.5 py-2 space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-medium">Sale calculator — rate + making + GST</p>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <span className="text-[10px] text-ink-500 block mb-0.5">{label}</span>
                <input type="number" step="0.01" min={0} value={line.sellRateRupees ?? ''}
                  onChange={(e) => {
                    const rr = parseFloat(e.target.value) || 0;
                    const mm = parseFloat(line.sellMakingPerGramCalc ?? '') || 0;
                    const ww = parseFloat(line.weightG) || 0;
                    const tot = (ww * rr + ww * mm) * 1.03;
                    onPatch(index, { sellRateRupees: e.target.value, ...(rr > 0 && ww > 0 ? { sellingPriceRupees: tot.toFixed(2) } : {}) });
                  }}
                  className={`${fieldCls} text-xs`} placeholder="e.g. 3500" />
              </div>
              <div>
                <span className="text-[10px] text-ink-500 block mb-0.5">Making (₹/g)</span>
                <input type="number" step="0.01" min={0} value={line.sellMakingPerGramCalc ?? ''}
                  onChange={(e) => {
                    const mm = parseFloat(e.target.value) || 0;
                    const rr = parseFloat(line.sellRateRupees ?? '') || 0;
                    const ww = parseFloat(line.weightG) || 0;
                    const tot = (ww * rr + ww * mm) * 1.03;
                    onPatch(index, { sellMakingPerGramCalc: e.target.value, ...(rr > 0 && ww > 0 ? { sellingPriceRupees: tot.toFixed(2) } : {}) });
                  }}
                  className={`${fieldCls} text-xs`} placeholder="e.g. 200" />
              </div>
            </div>
            {w > 0 && r > 0 && (
              <div className="text-[10px] font-mono text-ink-600 flex flex-wrap gap-x-3 gap-y-0.5">
                <span>Metal ₹{metal.toFixed(2)}</span>
                {making > 0 && <span>Making ₹{making.toFixed(2)}</span>}
                <span>GST ₹{gst.toFixed(2)}</span>
                <span className="font-semibold text-emerald-800">Sell ₹{calcTotal.toFixed(2)}</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Publish toggle ── */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" checked={line.publishToStorefront ?? false}
          onChange={(e) => onPatch(index, { publishToStorefront: e.target.checked })}
          className="h-4 w-4 rounded border-ink-300 accent-brand-600 shrink-0" />
        <span className="text-[11px] text-ink-600">
          Publish to storefront on receive
          <span className="text-ink-400"> — publishes or creates a Product if name + images are filled</span>
        </span>
      </label>

      {/* ── Expandable item-detail section ── */}
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="w-full flex items-center justify-between text-[11px] font-medium text-brand-600 hover:text-brand-700 border-t border-ink-100 pt-2 mt-1"
      >
        <span>{expanded ? '▲ Hide item details' : '▼ Add item details (name, images, diamonds…)'}</span>
        {(line.name || images.length > 0 || (line.diamonds?.length ?? 0) > 0) && !expanded && (
          <span className="text-[10px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded">filled</span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-ink-100 pt-3 space-y-3">
          {/* Item name */}
          <div>
            <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">Item name</span>
            <input
              value={line.name ?? ''}
              onChange={(e) => onPatch(index, { name: e.target.value })}
              className={fieldCls}
              placeholder="e.g. Floral diamond pendant"
            />
          </div>

          {/* Images */}
          <div>
            <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">Item images</span>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const files = Array.from(e.dataTransfer.files); if (files.length > 0) void uploadFiles(files); }}
              role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
              className="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-md border-2 border-dashed border-ink-200 hover:border-ink-300 hover:bg-ink-25 cursor-pointer transition-colors"
            >
              <Upload className="h-4 w-4 text-ink-500" aria-hidden />
              <p className="text-xs text-ink-600">
                <span className="font-medium text-ink-900">Click to upload</span> or drag &amp; drop
              </p>
              {!cloudinaryReady && <p className="text-[10px] text-ink-400">Dev mode: no Cloudinary</p>}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { const files = e.target.files ? Array.from(e.target.files) : []; if (files.length > 0) void uploadFiles(files); e.target.value = ''; }} />
            {uploading.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {uploading.map((u) => (
                  <li key={u.name} className="rounded-md border border-ink-100 bg-ink-25 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-ink-700 truncate">{u.name}</span>
                      <span className="font-mono tabular-nums text-ink-500">{u.progress}%</span>
                    </div>
                    <div className="mt-1 h-0.5 rounded-full bg-ink-100 overflow-hidden">
                      <div className="h-full bg-brand-500 transition-all" style={{ width: `${u.progress}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {images.length > 0 && (
              <ul className="mt-1.5 grid grid-cols-4 gap-2">
                {images.map((url, idx) => (
                  <li key={url + idx} className="relative group rounded-md border border-ink-100 bg-ink-25 overflow-hidden aspect-square">
                    <img src={cloudinaryThumb(url, 160) ?? url} alt={`Image ${idx + 1}`} className="h-full w-full object-cover" />
                    <button type="button"
                      onClick={() => onPatch(index, { images: images.filter((_, i) => i !== idx) })}
                      className="absolute top-0.5 right-0.5 h-5 w-5 inline-flex items-center justify-center rounded-full bg-ink-900/70 text-ink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remove image"><X className="h-3 w-3" /></button>
                    {idx === 0 && <span className="absolute bottom-0.5 left-0.5 text-[9px] px-1 py-0.5 rounded-full bg-ink-900/70 text-ink-0">Primary</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Description */}
          <div>
            <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">Description</span>
            <textarea
              value={line.description ?? ''}
              onChange={(e) => onPatch(index, { description: e.target.value })}
              rows={2}
              placeholder="Shown on storefront, receipts and item slips."
              className={`${fieldCls} h-auto resize-y`}
            />
          </div>

          {/* Stone weight / Hallmark */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">Stone wt (g)</span>
              <input type="number" step="0.001" min={0} value={line.stoneWeightG ?? ''}
                onChange={(e) => onPatch(index, { stoneWeightG: e.target.value })}
                className={fieldCls} placeholder="Optional" />
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">Hallmark</span>
              <select value={line.hallmarkStatus ?? 'PENDING'}
                onChange={(e) => onPatch(index, { hallmarkStatus: e.target.value })}
                className={fieldCls}>
                <option value="PENDING">Pending</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="CERTIFIED">Certified</option>
                <option value="EXEMPT">Exempt</option>
              </select>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">HUID ref</span>
              <input value={line.hallmarkRef ?? ''}
                onChange={(e) => onPatch(index, { hallmarkRef: e.target.value })}
                className={fieldCls} placeholder="6-char alphanumeric" />
            </div>
          </div>

          {/* HSN + GST rate — copied onto the Item on receive; feed the GST report. */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">HSN code</span>
              <input value={line.hsnCode ?? ''}
                onChange={(e) => onPatch(index, { hsnCode: e.target.value })}
                className={fieldCls} placeholder="e.g. 7113" inputMode="numeric" />
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">GST rate (%)</span>
              <input type="number" step="0.01" min="0" max="28" value={line.gstRatePct ?? ''}
                onChange={(e) => onPatch(index, { gstRatePct: e.target.value })}
                className={fieldCls} placeholder="3" />
            </div>
          </div>

          {/* Gender — copied onto the Item on receive; powers the storefront filter. */}
          <div>
            <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">Gender</span>
            <select value={line.gender ?? ''}
              onChange={(e) => onPatch(index, { gender: (e.target.value || undefined) as 'MEN' | 'WOMEN' | undefined })}
              className={fieldCls}>
              <option value="">— Not specified</option>
              <option value="WOMEN">Women</option>
              <option value="MEN">Men</option>
            </select>
          </div>

          {/* Making charge mode */}
          <div>
            <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">Making charge override</span>
            <MakingChargeOverride
              mode={line.makingMode ?? 'PERCENTAGE'}
              pct={line.makingPct ?? ''}
              perGram={line.makingPerGramRupees ?? ''}
              onMode={(m) => onPatch(index, { makingMode: m })}
              onPct={(v) => onPatch(index, { makingPct: v })}
              onPerGram={(v) => onPatch(index, { makingPerGramRupees: v })}
            />
          </div>

          {/* Stock type */}
          <div>
            <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">Stock type</span>
            <div className="grid grid-cols-2 gap-2">
              {([{ val: true, label: 'Unique piece', sub: 'Ring, necklace — each piece is its own SKU' },
                 { val: false, label: 'Bulk lot', sub: 'Gold coin, silver bar — N interchangeable units' }] as const).map(({ val, label, sub }) => (
                <button type="button" key={String(val)}
                  onClick={() => onPatch(index, { isSerialized: val })}
                  className={cn(
                    'rounded-md border px-3 py-2 text-left transition-colors',
                    (line.isSerialized ?? true) === val
                      ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-400'
                      : 'border-ink-200 hover:border-ink-300',
                  )}>
                  <span className="block text-xs font-medium text-ink-900">{label}</span>
                  <span className="block text-[10px] text-ink-500">{sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Collections */}
          <div>
            <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">Collections</span>
            <CollectionsMultiSelect
              selected={line.collectionIds ?? []}
              onChange={(ids) => onPatch(index, { collectionIds: ids })}
            />
          </div>

          {/* Diamonds */}
          <div>
            <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">Diamonds (4 Cs)</span>
            <DiamondsEditor
              rows={line.diamonds ?? []}
              onChange={(rows) => onPatch(index, { diamonds: rows })}
            />
          </div>

          {/* Details & Dimensions */}
          <div>
            <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">Details &amp; Dimensions</span>
            <SpecsEditor
              rows={line.specs ?? []}
              onChange={(rows) => onPatch(index, { specs: rows })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Convert a saved PO row into editable form lines so the Edit dialog pre-fills
// every field (incl. diamonds, images, collections, making overrides).
function poRowToLines(po: PurchaseOrderRow): POLine[] {
  return po.items.map((it) => ({
    categoryId: it.categoryId ?? '',
    itemSku: it.itemSku,
    weightG: String(it.weightMg / 1000),
    purityCarat: String(it.purity / 100),
    costRupees: String(it.costPaise / 100),
    makingPct:
      it.makingChargeMode !== 'PER_GRAM' && it.makingChargeBps != null
        ? String(it.makingChargeBps / 100)
        : '',
    qty: String(it.quantity ?? 1),
    sellingPriceRupees: it.sellingPricePaise != null ? String(it.sellingPricePaise / 100) : '',
    hsnCode: it.hsnCode ?? '',
    gstRatePct: it.gstRateBps != null ? String(it.gstRateBps / 100) : '',
    publishToStorefront: it.publishToStorefront ?? false,
    name: it.name ?? undefined,
    description: it.description ?? undefined,
    images: it.images ?? [],
    hallmarkStatus: it.hallmarkStatus ?? undefined,
    hallmarkRef: it.hallmarkRef ?? undefined,
    stoneWeightG: it.stoneWeightMg != null ? String(it.stoneWeightMg / 1000) : undefined,
    makingMode: it.makingChargeMode ?? undefined,
    makingPerGramRupees:
      it.makingChargePerGramPaise != null ? String(it.makingChargePerGramPaise / 100) : undefined,
    isSerialized: it.isSerialized ?? true,
    gender: it.gender ?? undefined,
    collectionIds: it.collectionIds ?? [],
    diamonds: dbDiamondsToRows(it.diamondsJson),
    specs: dbSpecsToRows(it.specs),
  }));
}

// Create OR edit a PO. When `editPo` is set the form pre-fills and submits an
// update; otherwise it creates. Mounted keyed by PO id so state re-initialises
// when switching between create / different edits.
function CreatePODialog({
  open,
  onClose,
  editPo,
}: {
  open: boolean;
  onClose: () => void;
  editPo?: PurchaseOrderRow | null;
}): JSX.Element {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="!max-w-2xl">
        <SheetHeader>
          <SheetTitle>{editPo ? 'Edit purchase order' : 'Create purchase order'}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {open && <POForm key={editPo?.id ?? 'new'} editPo={editPo ?? null} onClose={onClose} />}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function POForm({ editPo, onClose }: { editPo: PurchaseOrderRow | null; onClose: () => void }): JSX.Element {
  const { data: vendors } = useGetVendorsQuery();
  const { data: catsRes } = useGetCategoriesQuery();
  const [create, { isLoading: creating }] = useCreatePurchaseOrderMutation();
  const [update, { isLoading: updating }] = useUpdatePurchaseOrderMutation();
  const isLoading = creating || updating;
  const [pickerOpen, setPickerOpen] = useState(false);
  const categories = (catsRes?.data ?? []) as CategoryRow[];
  // Default a new line to the first sub-category (falls back to first category)
  // so items land somewhere sensible, and an empty line for the initial state.
  const defaultCatId = categories.find((c) => c.parentId)?.id ?? categories[0]?.id ?? '';

  const [vendorId, setVendorId] = useState(editPo?.vendorId ?? '');
  const [lines, setLines] = useState<POLine[]>(
    editPo
      ? poRowToLines(editPo)
      : [{ categoryId: '', itemSku: '', weightG: '', purityCarat: '22', costRupees: '', qty: '1' }],
  );

  // ── Purchase GST (ITC). Line costs are GST-inclusive, so by default we derive
  // the embedded 3% GST from the total and keep it in sync as lines change.
  // Editing a GST field (or an existing PO) switches to manual; "Auto" re-syncs.
  const [gstInterState, setGstInterState] = useState(editPo?.gstInterState ?? false);
  const [cgst, setCgst] = useState(editPo?.cgstPaise ? String(editPo.cgstPaise / 100) : '');
  const [sgst, setSgst] = useState(editPo?.sgstPaise ? String(editPo.sgstPaise / 100) : '');
  const [igst, setIgst] = useState(editPo?.igstPaise ? String(editPo.igstPaise / 100) : '');
  const [gstAuto, setGstAuto] = useState(!editPo);

  if (!editPo && !vendorId && vendors?.data[0]) setVendorId(vendors.data[0].id);
  // Seed the first line's category once categories load (create mode only).
  if (!editPo && defaultCatId && lines.length === 1 && !lines[0]!.categoryId) {
    setLines((ls) => ls.map((l, i) => (i === 0 && !l.categoryId ? { ...l, categoryId: defaultCatId } : l)));
  }

  const total = lines.reduce((s, l) => s + (parseFloat(l.costRupees) || 0) * (parseInt(l.qty, 10) || 1), 0);

  // Auto-derive the embedded GST whenever the total (or intra/inter) changes.
  useEffect(() => {
    if (!gstAuto) return;
    const gstRupees = total - total / 1.03;
    if (gstInterState) {
      setIgst(gstRupees > 0 ? gstRupees.toFixed(2) : '');
      setCgst('');
      setSgst('');
    } else {
      const half = gstRupees / 2;
      setCgst(gstRupees > 0 ? half.toFixed(2) : '');
      setSgst(gstRupees > 0 ? half.toFixed(2) : '');
      setIgst('');
    }
  }, [total, gstInterState, gstAuto]);

  const gstEntered = gstInterState ? parseFloat(igst) || 0 : (parseFloat(cgst) || 0) + (parseFloat(sgst) || 0);
  const taxable = total - gstEntered;

  const patchLine = (i: number, patch: Partial<POLine>): void =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  // Apply a server-suggested SKU to a line, de-duplicated against the SKUs the
  // other draft lines already hold. suggestSku counts only persisted rows, so
  // several same-category lines get the same suggestion; bump the numeric suffix
  // here until it's unique within the PO so each line becomes a distinct item on
  // receive (fixes "added 5 products, only 1 SKU shows"). Reads the latest lines
  // inside the updater to avoid a stale closure when suggestions resolve async.
  const applySuggestedSku = (i: number, suggested: string): void =>
    setLines((ls) => {
      const used = new Set(
        ls.filter((_, j) => j !== i).map((l) => l.itemSku.trim()).filter(Boolean),
      );
      let sku = suggested;
      const m = /^(.*-)(\d+)$/.exec(suggested);
      if (m) {
        const width = m[2]!.length;
        let n = parseInt(m[2]!, 10);
        while (used.has(sku)) {
          n += 1;
          sku = m[1]! + String(n).padStart(width, '0');
        }
      } else {
        let n = 2;
        while (used.has(sku)) {
          sku = `${suggested}-${n}`;
          n += 1;
        }
      }
      return ls.map((l, j) => (j === i ? { ...l, itemSku: sku } : l));
    });

  // Merge picker-selected lines into the current list, removing the placeholder
  // blank line if it hasn't been touched yet.
  function handlePickerAdd(newLines: POLine[]): void {
    setLines((prev) => {
      const withoutBlank = prev.filter((l) => l.itemSku.trim() || l.costRupees.trim());
      const base = withoutBlank.length > 0 ? withoutBlank : [];
      return [...base, ...newLines];
    });
  }

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!vendorId) return void toast.error('Pick a vendor');
    if (lines.length === 0) return void toast.error('Add at least one line item');
    if (lines.some((l) => !l.categoryId)) return void toast.error('Pick a category for each line');
    const items = lines.map((l) => {
      // Making charge — if makingMode is explicitly set (from expanded form),
      // use the full resolver; otherwise fall back to the basic makingPct field.
      const making = resolveItemMakingOverride(
        l.makingMode ?? 'PERCENTAGE',
        l.makingPct ?? '',
        l.makingPerGramRupees ?? '',
      );
      const stoneRaw = parseFloat(l.stoneWeightG ?? '');
      return {
        itemSku: l.itemSku.trim(),
        categoryId: l.categoryId,
        weightMg: Math.round(parseFloat(l.weightG) * 1000),
        purity: Math.round(parseFloat(l.purityCarat) * 100),
        costPaise: Math.round(parseFloat(l.costRupees) * 100),
        makingChargeBps: making.makingChargeBps ?? undefined,
        makingChargeMode: making.makingChargeMode ?? undefined,
        makingChargePerGramPaise: making.makingChargePerGramPaise ?? undefined,
        sellingPricePaise:
          l.sellingPriceRupees && l.sellingPriceRupees.trim()
            ? Math.round(parseFloat(l.sellingPriceRupees) * 100)
            : undefined,
        hsnCode: l.hsnCode?.trim() || null,
        gstRateBps:
          l.gstRatePct && l.gstRatePct.trim()
            ? Math.round(parseFloat(l.gstRatePct) * 100)
            : undefined,
        publishToStorefront: l.publishToStorefront ?? false,
        quantity: Math.max(1, parseInt(l.qty, 10) || 1),
        // Full item-detail fields
        name: l.name?.trim() || undefined,
        description: l.description?.trim() || undefined,
        images: l.images ?? [],
        hallmarkStatus: (l.hallmarkStatus ?? 'PENDING') as 'PENDING' | 'SUBMITTED' | 'CERTIFIED' | 'EXEMPT',
        hallmarkRef: l.hallmarkRef?.trim() || undefined,
        stoneWeightMg:
          l.stoneWeightG && Number.isFinite(stoneRaw) && stoneRaw > 0
            ? Math.round(stoneRaw * 1000)
            : undefined,
        isSerialized: l.isSerialized ?? true,
        gender: l.gender ?? undefined,
        collectionIds: l.collectionIds ?? [],
        diamonds: l.diamonds ? diamondRowsToInput(l.diamonds) : [],
        specs: l.specs ? specRowsToInput(l.specs) : [],
      };
    });
    if (items.some((i) => !i.itemSku || !Number.isFinite(i.weightMg) || i.weightMg <= 0 || !Number.isFinite(i.costPaise) || i.costPaise <= 0)) {
      return void toast.error('Each line needs a category, SKU, weight, and cost');
    }
    const toPaise = (v: string): number => Math.round((parseFloat(v) || 0) * 100);
    const gstPayload = gstInterState
      ? { gstInterState: true, igstPaise: toPaise(igst), cgstPaise: 0, sgstPaise: 0 }
      : { gstInterState: false, cgstPaise: toPaise(cgst), sgstPaise: toPaise(sgst), igstPaise: 0 };
    try {
      if (editPo) {
        await update({ id: editPo.id, vendorId, items, ...gstPayload }).unwrap();
        toast.success('Purchase order updated');
      } else {
        await create({ vendorId, items, ...gstPayload }).unwrap();
        toast.success('Purchase order created');
      }
      onClose();
    } catch (err) {
      const message =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ??
        (editPo ? 'Could not update PO.' : 'Could not create PO.');
      toast.error(message);
    }
  };

  return (
    <>
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

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-eyebrow uppercase text-ink-500">Line items</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              Browse inventory
            </Button>
          </div>
          {lines.length === 0 && (
            <p className="text-sm text-ink-400 py-3 text-center border border-dashed border-ink-200 rounded-md">
              No lines yet — add manually or browse inventory above.
            </p>
          )}
          {lines.map((l, i) => (
            <POLineEditor
              key={i}
              line={l}
              index={i}
              categories={categories}
              onPatch={patchLine}
              onApplySuggestedSku={applySuggestedSku}
              onRemove={(idx) => setLines(lines.filter((_, j) => j !== idx))}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setLines([
                ...lines,
                { categoryId: defaultCatId, itemSku: '', weightG: '', purityCarat: '22', costRupees: '', qty: '1' },
              ])
            }
          >
            + Add line manually
          </Button>
        </div>

        {/* ── Purchase GST (input tax credit) — auto-derived from the inclusive total ── */}
        <div className="rounded-md border border-ink-100 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-eyebrow uppercase text-ink-500">Purchase GST (input tax credit)</p>
              <p className="text-xs text-ink-500 mt-0.5">
                Auto-derived from the GST-inclusive line costs (3%). Edit if the vendor invoice differs.
              </p>
            </div>
            {!gstAuto && (
              <button
                type="button"
                onClick={() => setGstAuto(true)}
                className="text-[11px] text-brand-600 hover:text-brand-700 whitespace-nowrap shrink-0"
              >
                ↻ Auto from total
              </button>
            )}
          </div>

          <div className="inline-flex rounded-md border border-ink-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setGstInterState(false)}
              className={cn(
                'px-3 h-9 text-sm transition-colors duration-fast',
                !gstInterState ? 'bg-brand-500 text-white' : 'bg-ink-0 text-ink-700 hover:bg-ink-25',
              )}
            >
              Intra-state (CGST + SGST)
            </button>
            <button
              type="button"
              onClick={() => setGstInterState(true)}
              className={cn(
                'px-3 h-9 text-sm border-l border-ink-200 transition-colors duration-fast',
                gstInterState ? 'bg-brand-500 text-white' : 'bg-ink-0 text-ink-700 hover:bg-ink-25',
              )}
            >
              Inter-state (IGST)
            </button>
          </div>

          {gstInterState ? (
            <Field label="IGST (₹)">
              <input
                type="number" step="0.01" min="0" value={igst}
                onChange={(e) => { setGstAuto(false); setIgst(e.target.value); }}
                className={fieldCls} placeholder="0.00"
              />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="CGST (₹)">
                <input
                  type="number" step="0.01" min="0" value={cgst}
                  onChange={(e) => { setGstAuto(false); setCgst(e.target.value); }}
                  className={fieldCls} placeholder="0.00"
                />
              </Field>
              <Field label="SGST (₹)">
                <input
                  type="number" step="0.01" min="0" value={sgst}
                  onChange={(e) => { setGstAuto(false); setSgst(e.target.value); }}
                  className={fieldCls} placeholder="0.00"
                />
              </Field>
            </div>
          )}

          <div className="space-y-1 border-t border-ink-100 pt-3 font-mono text-sm">
            <div className="flex justify-between text-ink-500">
              <span>Taxable value</span>
              <span>₹{taxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-ink-500">
              <span>GST (ITC)</span>
              <span>₹{gstEntered.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-ink-900 font-semibold">
              <span>Invoice total incl GST</span>
              <span>₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" type="button" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={isLoading}>
            {isLoading ? (editPo ? 'Saving…' : 'Creating…') : editPo ? 'Save changes' : 'Create PO'}
          </Button>
        </div>
      </form>

      <ItemPickerSheet open={pickerOpen} onClose={() => setPickerOpen(false)} onAdd={handlePickerAdd} />
    </>
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

// Like Field, but wraps content in a <div> instead of a <label>. Use for fields
// whose body has its own click target (e.g. the image-upload dropzone): inside a
// <label>, a click on the dropzone both fires our onClick AND is forwarded by the
// browser to the contained file <input>, re-opening the picker twice.
function FieldGroup({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="block">
      <span className="text-eyebrow uppercase text-ink-500 block mb-1">{label}</span>
      {children}
    </div>
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
  metalType: MetalTypeLiteral;
  onChange: (v: string) => void;
}): JSX.Element {
  // Non-gold metals have exactly one valid purity — render a disabled chip
  // so the field reads as deliberately locked, not broken. Stainless steel
  // and "other" are non-precious; silver shows its own label.
  if (metalType === 'SILVER' || metalType === 'OTHER' || metalType === 'STAINLESS_STEEL') {
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
  const presets = ['24', '22', '18', '14', '9'];
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

// ----------------------------------------------------------------------------
// Diamond detail editor — a repeatable sub-form. Each row captures one stone
// group (shape + 4 Cs + count + cost). Item value = metal + Σ diamond cost, so
// diamond cost is booked separately from the metal cost. M1 FR#4 / M2 §1.

export interface DiamondRow {
  shape: string;
  caratWeight: string; // carats, e.g. "1.050" (3 decimal places)
  cut: string;
  clarity: string;
  color: string;
  count: string;
  costRupees: string;
  sellingPriceRupees: string;
  /** Purchase rate ₹/ct used to auto-compute costRupees. Persisted so it pre-fills on re-edit. */
  purchaseRateRupees: string;
  /** Selling rate ₹/ct used to auto-compute sellingPriceRupees. Persisted so it pre-fills on re-edit. */
  sellingRateRupees: string;
}

export const emptyDiamondRow = (): DiamondRow => ({
  shape: '',
  caratWeight: '',
  cut: '',
  clarity: '',
  color: '',
  count: '1',
  costRupees: '',
  sellingPriceRupees: '',
  purchaseRateRupees: '',
  sellingRateRupees: '',
});

// Persisted diamond rows (from the API) → editable form rows.
export function dbDiamondsToRows(
  diamonds:
    | Array<{ shape?: string | null; caratWeightX100?: number; cut?: string | null; clarity?: string | null; color?: string | null; count?: number; costPaise?: number; sellingPricePaise?: number | null; purchaseRatePaise?: number | null; sellRatePaise?: number | null }>
    | undefined,
): DiamondRow[] {
  if (!diamonds || diamonds.length === 0) return [];
  return diamonds.map((d) => ({
    shape: d.shape ?? '',
    caratWeight: d.caratWeightX100 ? (d.caratWeightX100 / 100).toFixed(3) : '',
    cut: d.cut ?? '',
    clarity: d.clarity ?? '',
    color: d.color ?? '',
    count: String(d.count ?? 1),
    costRupees: d.costPaise ? String(d.costPaise / 100) : '',
    sellingPriceRupees: d.sellingPricePaise ? String(d.sellingPricePaise / 100) : '',
    purchaseRateRupees: d.purchaseRatePaise ? String(d.purchaseRatePaise / 100) : '',
    sellingRateRupees: d.sellRatePaise ? String(d.sellRatePaise / 100) : '',
  }));
}

// Convert form rows → ItemDiamond input shape for the API. Drops fully-empty rows.
export function diamondRowsToInput(rows: DiamondRow[]) {
  return rows
    .filter((r) => r.caratWeight.trim() || r.costRupees.trim() || r.shape || r.cut || r.clarity || r.color)
    .map((r) => ({
      shape: r.shape || null,
      caratWeightX100: Math.round((parseFloat(r.caratWeight) || 0) * 100),
      cut: r.cut || null,
      clarity: r.clarity || null,
      color: r.color || null,
      count: Math.max(1, parseInt(r.count, 10) || 1),
      costPaise: Math.round((parseFloat(r.costRupees) || 0) * 100),
      sellingPricePaise: r.sellingPriceRupees.trim()
        ? Math.round((parseFloat(r.sellingPriceRupees) || 0) * 100)
        : null,
      purchaseRatePaise: r.purchaseRateRupees.trim()
        ? Math.round((parseFloat(r.purchaseRateRupees) || 0) * 100)
        : null,
      sellRatePaise: r.sellingRateRupees.trim()
        ? Math.round((parseFloat(r.sellingRateRupees) || 0) * 100)
        : null,
    }));
}

// ── Size variants ────────────────────────────────────────────────────────────
// Made-to-order sizes for a single SKU (ring size, bangle / chain length). Each
// row is a {label, weight}; the storefront re-prices every size off the item's
// base cost / sell per-gram by its weight. Form rows carry weight as grams (a
// string) like the rest of the Item form.
export type SizeRow = { label: string; weightG: string };

export function dbSizesToRows(
  sizes: { label: string; weightMg: number }[] | null | undefined,
): SizeRow[] {
  return (sizes ?? []).map((s) => ({ label: s.label, weightG: String(s.weightMg / 1000) }));
}

// Form rows → API shape. Drops rows missing a label or a positive weight.
export function sizeRowsToInput(rows: SizeRow[]): { label: string; weightMg: number }[] {
  return rows
    .map((r) => ({ label: r.label.trim(), weightMg: Math.round((parseFloat(r.weightG) || 0) * 1000) }))
    .filter((r) => r.label.length > 0 && r.weightMg > 0);
}

// Size editor — "Add size" rows of {label, weight}. Shows a live cost & sell
// preview per size, scaled off the item's base weight & prices (per-gram). Used
// by both the Add and Edit Item dialogs.
function SizesEditor({
  rows,
  onChange,
  baseWeightG,
  baseCostRupees,
  baseSellRupees,
}: {
  rows: SizeRow[];
  onChange: (rows: SizeRow[]) => void;
  baseWeightG: string;
  baseCostRupees: string;
  baseSellRupees: string;
}): JSX.Element {
  const set = (i: number, patch: Partial<SizeRow>): void =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const baseW = parseFloat(baseWeightG) || 0;
  const baseCost = parseFloat(baseCostRupees) || 0;
  const baseSell = parseFloat(baseSellRupees) || 0;
  const costPerG = baseW > 0 ? baseCost / baseW : 0;
  const sellPerG = baseW > 0 ? baseSell / baseW : 0;
  const fmt = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-ink-500">
        One SKU, made-to-order. Cost &amp; sell auto-scale off this item&apos;s base weight
        ({baseW > 0 ? `${baseW.toFixed(3)} g` : 'set weight above'}) by each size&apos;s weight.
      </p>
      {rows.length === 0 && (
        <p className="text-[11px] text-ink-400 italic">
          No sizes — single-weight piece. Click “Add size” to offer multiple sizes.
        </p>
      )}
      {rows.map((r, i) => {
        const w = parseFloat(r.weightG) || 0;
        const showCalc = w > 0 && baseW > 0;
        return (
          <div key={i} className="rounded-md border border-ink-200 p-2.5 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                value={r.label}
                onChange={(e) => set(i, { label: e.target.value })}
                placeholder="Size (e.g. 6, M, 18in)"
                className={`${fieldCls} text-xs`}
              />
              <input
                type="number" step="0.001" min={0} value={r.weightG}
                onChange={(e) => set(i, { weightG: e.target.value })}
                placeholder="Weight (g)" className={`${fieldCls} text-xs`}
              />
            </div>
            {showCalc && (
              <div className="rounded bg-amber-50/60 border border-amber-100 px-2.5 py-1.5 text-[11px] font-mono text-ink-700 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span>{w.toFixed(3)} g</span>
                <span>cost <span className="font-semibold text-ink-900">{fmt(costPerG * w)}</span></span>
                <span>
                  sell{' '}
                  {baseSell > 0 ? (
                    <span className="font-semibold text-emerald-700">{fmt(sellPerG * w)}</span>
                  ) : (
                    <span className="text-ink-500">priced live by weight</span>
                  )}
                </span>
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                className="text-[11px] text-ink-500 hover:text-danger-700"
              >
                Remove
              </button>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...rows, { label: '', weightG: '' }])}
        className="inline-flex items-center gap-1.5 text-xs text-brand-700 hover:text-brand-800 hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Add size
      </button>
    </div>
  );
}

// ── Details & Dimensions specs ───────────────────────────────────────────────
// Free-form label/value rows shown on the storefront PDP under "Details &
// Dimensions" (e.g. Closure / Hoopwire, Length / 1.5 cm, Net Quantity / 1 Pair).
// One SKU carries any number. Mirrored onto the linked storefront Product.
export type SpecRow = { label: string; value: string };

export function dbSpecsToRows(
  specs: { label: string; value: string }[] | null | undefined,
): SpecRow[] {
  return (specs ?? []).map((s) => ({ label: s.label, value: s.value }));
}

// Form rows → API shape. Drops rows missing a label or a value.
export function specRowsToInput(rows: SpecRow[]): { label: string; value: string }[] {
  return rows
    .map((r) => ({ label: r.label.trim(), value: r.value.trim() }))
    .filter((r) => r.label.length > 0 && r.value.length > 0);
}

// Spec editor — "Add specification" rows of {label, value}. Used by both the
// Add and Edit Item dialogs.
function SpecsEditor({
  rows,
  onChange,
}: {
  rows: SpecRow[];
  onChange: (rows: SpecRow[]) => void;
}): JSX.Element {
  const set = (i: number, patch: Partial<SpecRow>): void =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-ink-500">
        Shown on the storefront product page under “Details &amp; Dimensions” when the
        item is published. Add any attribute — e.g. Closure / Hoopwire, Length / 1.5 cm,
        Net Quantity / 1 Pair.
      </p>
      {rows.length === 0 && (
        <p className="text-[11px] text-ink-400 italic">
          No specifications yet. Click “Add specification” to add rows.
        </p>
      )}
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
          <input
            value={r.label}
            onChange={(e) => set(i, { label: e.target.value })}
            placeholder="Label (e.g. Closure)"
            className={`${fieldCls} text-xs`}
          />
          <input
            value={r.value}
            onChange={(e) => set(i, { value: e.target.value })}
            placeholder="Value (e.g. Hoopwire)"
            className={`${fieldCls} text-xs`}
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
            className="text-[11px] text-ink-500 hover:text-danger-700 px-1"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { label: '', value: '' }])}
        className="inline-flex items-center gap-1.5 text-xs text-brand-700 hover:text-brand-800 hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Add specification
      </button>
    </div>
  );
}

// ── Price Calculator ─────────────────────────────────────────────────────────
// Helps the admin compute cost price and selling price from components:
//   GOLD / SILVER: weight × rate + making × weight + 3% GST
//   18K Gold Tone / OTHER: fixed rate + 3% GST, no making needed
// "Use as Cost / Selling Price" buttons fill the respective fields.
function PriceCalcHelper({
  metalType,
  categoryName,
  weightG,
  onUseCost,
  onUseSelling,
  onSellCalc,
}: {
  metalType: string;
  categoryName: string;
  weightG: string;
  onUseCost: (rupees: string) => void;
  onUseSelling: (rupees: string) => void;
  onSellCalc?: (rupees: number) => void;
}): JSX.Element {
  const isFixedPrice =
    metalType === 'OTHER' ||
    metalType === 'STAINLESS_STEEL' ||
    /tone|plated/i.test(categoryName);

  const [costRate, setCostRate] = useState('');
  const [costMaking, setCostMaking] = useState('');
  const [sellRate, setSellRate] = useState('');
  const [sellMaking, setSellMaking] = useState('');
  const [fixedCostRate, setFixedCostRate] = useState('');
  const [fixedSellRate, setFixedSellRate] = useState('');

  const weight = parseFloat(weightG) || 0;

  function calcBreakdown(rate: string, making: string) {
    const r = parseFloat(rate) || 0;
    const m = parseFloat(making) || 0;
    const metal = weight * r;
    const makingAmt = weight * m;
    const subtotal = metal + makingAmt;
    const gst = subtotal * 0.03;
    return { metal, making: makingAmt, gst, total: subtotal + gst };
  }

  function calcFixed(rate: string) {
    const r = parseFloat(rate) || 0;
    const gst = r * 0.03;
    return { gst, total: r + gst };
  }

  const metalLabel = metalType === 'SILVER' ? 'Silver rate (₹/g)' : 'Gold rate (₹/g)';

  // Report the active pricing mode's sell total up to the parent (it drives the
  // Grand Total row). This hook MUST run on every render — i.e. BEFORE the
  // `isFixedPrice` early-return below. If it sits after the early return, the
  // hook count changes whenever a category flips between fixed and calculated
  // pricing (e.g. selecting an "…Tone"/"…plated" category, or a non-precious
  // metal), which crashes the whole page with React error #310 ("rendered more
  // hooks than during the previous render"). Reporting the fixed sell total
  // here also fixes the Grand Total never updating in fixed-price mode.
  const sellTotalForParent = isFixedPrice
    ? calcFixed(fixedSellRate).total
    : calcBreakdown(sellRate, sellMaking).total;
  useEffect(() => {
    onSellCalc?.(sellTotalForParent);
  }, [sellTotalForParent, onSellCalc]);

  if (isFixedPrice) {
    const c = calcFixed(fixedCostRate);
    const s = calcFixed(fixedSellRate);
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3 text-sm space-y-3">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-amber-700">
          Fixed price — no making charge (18K Gold Tone)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-ink-600 uppercase">Purchase rate</p>
            <input
              type="number" step="0.01" min={0} value={fixedCostRate}
              onChange={(e) => setFixedCostRate(e.target.value)}
              className={fieldCls} placeholder="₹/piece excl. GST"
            />
            {parseFloat(fixedCostRate) > 0 && (
              <div className="rounded bg-ink-50 px-2.5 py-1.5 text-xs font-mono space-y-0.5">
                <div className="flex justify-between text-ink-500"><span>GST (3%)</span><span>₹{c.gst.toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold text-ink-900 border-t border-ink-200 pt-0.5"><span>Total</span><span>₹{c.total.toFixed(2)}</span></div>
              </div>
            )}
            {c.total > 0 && (
              <button type="button" onClick={() => onUseCost(c.total.toFixed(2))} className="text-[11px] px-2.5 py-1 rounded border border-ink-300 hover:bg-ink-50 w-full text-left">
                → Use as Cost Price
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-ink-600 uppercase">Sale rate</p>
            <input
              type="number" step="0.01" min={0} value={fixedSellRate}
              onChange={(e) => setFixedSellRate(e.target.value)}
              className={fieldCls} placeholder="₹/piece excl. GST"
            />
            {parseFloat(fixedSellRate) > 0 && (
              <div className="rounded bg-ink-50 px-2.5 py-1.5 text-xs font-mono space-y-0.5">
                <div className="flex justify-between text-ink-500"><span>GST (3%)</span><span>₹{s.gst.toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold text-ink-900 border-t border-ink-200 pt-0.5"><span>Total</span><span>₹{s.total.toFixed(2)}</span></div>
              </div>
            )}
            {s.total > 0 && (
              <button type="button" onClick={() => onUseSelling(s.total.toFixed(2))} className="text-[11px] px-2.5 py-1 rounded border border-ink-300 hover:bg-ink-50 w-full text-left">
                → Use as Selling Price
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const cost = calcBreakdown(costRate, costMaking);
  const sell = calcBreakdown(sellRate, sellMaking);
  const hasWeight = weight > 0;

  return (
    <div className="rounded-md border border-brand-200 bg-brand-50/30 p-3 text-sm space-y-3">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-brand-700">
        Price calculator — weight × rate + making + 3% GST
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-ink-600 uppercase">Cost price components</p>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <span className="text-[10px] text-ink-500 block mb-0.5">{metalLabel}</span>
              <input type="number" step="0.01" min={0} value={costRate} onChange={(e) => setCostRate(e.target.value)} className={fieldCls} placeholder="e.g. 3200" />
            </div>
            <div>
              <span className="text-[10px] text-ink-500 block mb-0.5">Making (₹/g)</span>
              <input type="number" step="0.01" min={0} value={costMaking} onChange={(e) => setCostMaking(e.target.value)} className={fieldCls} placeholder="e.g. 150" />
            </div>
          </div>
          {hasWeight && parseFloat(costRate) > 0 && (
            <div className="rounded bg-ink-50 px-2.5 py-1.5 text-xs font-mono space-y-0.5">
              <div className="flex justify-between text-ink-500"><span>Metal ({weight}g × ₹{parseFloat(costRate)||0}/g)</span><span>₹{cost.metal.toFixed(2)}</span></div>
              {cost.making > 0 && <div className="flex justify-between text-ink-500"><span>Making ({weight}g × ₹{parseFloat(costMaking)||0}/g)</span><span>₹{cost.making.toFixed(2)}</span></div>}
              <div className="flex justify-between text-ink-500"><span>GST (3%)</span><span>₹{cost.gst.toFixed(2)}</span></div>
              <div className="flex justify-between font-semibold text-ink-900 border-t border-ink-200 pt-0.5"><span>Total</span><span>₹{cost.total.toFixed(2)}</span></div>
            </div>
          )}
          {cost.total > 0 && hasWeight && (
            <button type="button" onClick={() => onUseCost(cost.total.toFixed(2))} className="text-[11px] px-2.5 py-1 rounded border border-ink-300 hover:bg-ink-50 w-full text-left">
              → Use as Cost Price
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-ink-600 uppercase">Selling price components</p>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <span className="text-[10px] text-ink-500 block mb-0.5">{metalLabel}</span>
              <input type="number" step="0.01" min={0} value={sellRate} onChange={(e) => setSellRate(e.target.value)} className={fieldCls} placeholder="e.g. 3500" />
            </div>
            <div>
              <span className="text-[10px] text-ink-500 block mb-0.5">Making (₹/g)</span>
              <input type="number" step="0.01" min={0} value={sellMaking} onChange={(e) => setSellMaking(e.target.value)} className={fieldCls} placeholder="e.g. 200" />
            </div>
          </div>
          {hasWeight && parseFloat(sellRate) > 0 && (
            <div className="rounded bg-ink-50 px-2.5 py-1.5 text-xs font-mono space-y-0.5">
              <div className="flex justify-between text-ink-500"><span>Metal ({weight}g × ₹{parseFloat(sellRate)||0}/g)</span><span>₹{sell.metal.toFixed(2)}</span></div>
              {sell.making > 0 && <div className="flex justify-between text-ink-500"><span>Making ({weight}g × ₹{parseFloat(sellMaking)||0}/g)</span><span>₹{sell.making.toFixed(2)}</span></div>}
              <div className="flex justify-between text-ink-500"><span>GST (3%)</span><span>₹{sell.gst.toFixed(2)}</span></div>
              <div className="flex justify-between font-semibold text-ink-900 border-t border-ink-200 pt-0.5"><span>Total</span><span>₹{sell.total.toFixed(2)}</span></div>
            </div>
          )}
          {sell.total > 0 && hasWeight && (
            <button type="button" onClick={() => onUseSelling(sell.total.toFixed(2))} className="text-[11px] px-2.5 py-1 rounded border border-ink-300 hover:bg-ink-50 w-full text-left">
              → Use as Selling Price
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DiamondsEditor({
  rows,
  onChange,
}: {
  rows: DiamondRow[];
  onChange: (rows: DiamondRow[]) => void;
}): JSX.Element {
  const set = (i: number, patch: Partial<DiamondRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  // costRupees is the TOTAL cost for all stones in a row (caratWeight × qty × rate + GST).
  // Do NOT multiply by count again here — costPaise already represents the row total.
  const totalCost = rows.reduce((s, r) => s + (parseFloat(r.costRupees) || 0), 0);
  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="text-[11px] text-ink-400 italic">No diamonds added. Click “Add diamond” for stone pieces.</p>
      )}
      {rows.map((r, i) => (
        <div key={i} className="rounded-md border border-ink-200 p-2.5 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <select value={r.shape} onChange={(e) => set(i, { shape: e.target.value })} className={`${fieldCls} text-xs`}>
              <option value="">Shape…</option>
              {DIAMOND_SHAPES.map((s) => (
                <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
              ))}
            </select>
            <input
              type="number" step="0.001" min={0} value={r.caratWeight}
              onChange={(e) => set(i, { caratWeight: e.target.value })}
              placeholder="Carat 0.000" className={`${fieldCls} text-xs`}
            />
            <input
              type="number" min={1} value={r.count}
              onChange={(e) => set(i, { count: e.target.value })}
              placeholder="Count" className={`${fieldCls} text-xs`}
            />
            <select value={r.cut} onChange={(e) => set(i, { cut: e.target.value })} className={`${fieldCls} text-xs`}>
              <option value="">Cut…</option>
              {DIAMOND_CUTS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={r.clarity} onChange={(e) => set(i, { clarity: e.target.value })} className={`${fieldCls} text-xs`}>
              <option value="">Clarity…</option>
              {DIAMOND_CLARITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={r.color} onChange={(e) => set(i, { color: e.target.value })} className={`${fieldCls} text-xs`}>
              <option value="">Colour…</option>
              {DIAMOND_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {/* Diamond rate calculator: weight × purchase rate + 3% GST → auto-fills costRupees */}
          <div className="rounded bg-blue-50/60 border border-blue-100 px-2.5 py-2 space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-blue-600 font-medium">Purchase rate calculator</p>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <span className="text-[10px] text-ink-500 block mb-0.5">Rate (₹/ct)</span>
                <input
                  type="number" step="0.01" min={0} value={r.purchaseRateRupees}
                  onChange={(e) => {
                    const rate = parseFloat(e.target.value) || 0;
                    const ct = parseFloat(r.caratWeight) || 0;
                    const total = ct * rate * 1.03;
                    set(i, { purchaseRateRupees: e.target.value, costRupees: rate > 0 && ct > 0 ? total.toFixed(2) : r.costRupees });
                  }}
                  placeholder="₹/carat" className={`${fieldCls} text-xs`}
                />
              </div>
              {parseFloat(r.purchaseRateRupees) > 0 && parseFloat(r.caratWeight) > 0 && (
                <div className="text-[10px] font-mono text-ink-600 pb-0.5 leading-tight space-y-0.5">
                  <div>{(parseFloat(r.caratWeight)||0).toFixed(3)} ct × ₹{parseFloat(r.purchaseRateRupees)||0}/ct</div>
                  <div className="text-ink-500">+3% GST → <span className="font-semibold text-ink-800">₹{((parseFloat(r.caratWeight)||0)*(parseFloat(r.purchaseRateRupees)||0)*1.03).toFixed(2)}</span></div>
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-ink-500 block mb-0.5">Purchase cost (₹ total)</span>
              <input
                type="number" step="0.01" min={0} value={r.costRupees}
                onChange={(e) => set(i, { costRupees: e.target.value })}
                placeholder="Total cost incl. GST" className={`${fieldCls} text-xs`}
              />
            </div>
            <div>
              <span className="text-[10px] text-ink-500 block mb-0.5">Selling price (₹ total)</span>
              <input
                type="number" step="0.01" min={0} value={r.sellingPriceRupees}
                onChange={(e) => set(i, { sellingPriceRupees: e.target.value })}
                placeholder="Total selling incl. GST" className={`${fieldCls} text-xs`}
              />
            </div>
          </div>
          {/* Selling rate calculator */}
          <div className="rounded bg-emerald-50/60 border border-emerald-100 px-2.5 py-2 space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-medium">Selling rate calculator</p>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <span className="text-[10px] text-ink-500 block mb-0.5">Sell rate (₹/ct)</span>
                <input
                  type="number" step="0.01" min={0} value={r.sellingRateRupees}
                  onChange={(e) => {
                    const rate = parseFloat(e.target.value) || 0;
                    const ct = parseFloat(r.caratWeight) || 0;
                    const total = ct * rate * 1.03;
                    set(i, { sellingRateRupees: e.target.value, sellingPriceRupees: rate > 0 && ct > 0 ? total.toFixed(2) : r.sellingPriceRupees });
                  }}
                  placeholder="₹/carat" className={`${fieldCls} text-xs`}
                />
              </div>
              {parseFloat(r.sellingRateRupees) > 0 && parseFloat(r.caratWeight) > 0 && (
                <div className="text-[10px] font-mono text-ink-600 pb-0.5 leading-tight space-y-0.5">
                  <div>{(parseFloat(r.caratWeight)||0).toFixed(3)} ct × ₹{parseFloat(r.sellingRateRupees)||0}/ct</div>
                  <div className="text-emerald-600">+3% GST → <span className="font-semibold text-emerald-800">₹{((parseFloat(r.caratWeight)||0)*(parseFloat(r.sellingRateRupees)||0)*1.03).toFixed(2)}</span></div>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-ink-500 hover:bg-rose-50 hover:text-rose-600"
              aria-label="Remove diamond"
              title="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onChange([...rows, emptyDiamondRow()])}
          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-medium border border-ink-200 text-ink-700 hover:bg-ink-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add diamond
        </button>
        {rows.length > 0 && (() => {
          const totalSell = rows.reduce((s, r) => s + (parseFloat(r.sellingPriceRupees) || 0), 0);
          return (
            <div className="text-[11px] font-mono space-y-0.5 text-right">
              <div className="text-ink-500">Cost ₹{totalCost.toFixed(2)}</div>
              {totalSell > 0 && <div className="text-emerald-700">Sell ₹{totalSell.toFixed(2)}</div>}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// Collections multi-select — checkbox list of the tenant's collections (Bridal,
// Festival, …). An item can belong to several; membership is one join row each,
// never a stock duplicate. M1 FR#1.
function CollectionsMultiSelect({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}): JSX.Element {
  const { data } = useGetCollectionsQuery();
  const collections = data?.data ?? [];
  if (collections.length === 0) {
    return (
      <p className="text-[11px] text-ink-400 italic">
        No collections yet. Create them in the Collections tab to tag items here.
      </p>
    );
  }
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {collections.map((c) => {
        const on = selected.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => toggle(c.id)}
            className={cn(
              'h-8 px-2.5 rounded-md text-xs font-medium border transition-colors',
              on ? 'bg-brand-500 text-ink-0 border-brand-500' : 'bg-ink-0 text-ink-700 border-ink-200 hover:border-ink-300',
            )}
          >
            {c.name}
          </button>
        );
      })}
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
      // Parent-aware: a main category also matches items in its sub-categories.
      const childIds = categories.filter((c) => c.parentId === selectedCatId).map((c) => c.id);
      const ids = new Set([selectedCatId, ...childIds]);
      pool = pool.filter((i) => ids.has(i.categoryId));
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
  }, [sourceItems, selectedCatId, search, categories]);

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
                  {buildCategoryFilterOptions(categories).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
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

// ----------------------------------------------------------------------------
// Shop-wise inventory tab — hierarchical view by Shop → Main Category → Sub Category → Items.

const SW_CAT_COLORS = ['#d97706', '#b45309', '#92400e', '#78350f', '#f59e0b', '#fbbf24', '#a16207', '#854d0e'];
const SW_STATUS_COLORS: Record<string, string> = {
  IN_STOCK: '#22c55e',
  IN_TRANSIT: '#3b82f6',
  SOLD: '#94a3b8',
  MELTED: '#f97316',
};

type ItemWithCollections = Item & { collectionIds?: string[] };

function ShopWiseInventoryTab(): JSX.Element {
  // Load EVERY item for accurate shop-wide aggregation. listItems caps each page
  // at 100 (MAX_PAGE_LIMIT), so the old single `limit: 500` request silently
  // truncated any shop with >100 rows — the totals here then disagreed with
  // Analytics (which aggregates server-side over the full set). Page through
  // every cursor and accumulate until there are no more. Mirrors ItemsTab's
  // cursor-chain, but advances automatically instead of via a "Load more" button.
  const [cursorChain, setCursorChain] = useState<Array<string | undefined>>([undefined]);
  const [accItems, setAccItems] = useState<ItemWithCollections[]>([]);
  const activeCursor = cursorChain[cursorChain.length - 1];
  const { data: itemsRes, isLoading: itemsLoading } = useGetItemsQuery({ cursor: activeCursor, limit: 100 });
  useEffect(() => {
    if (!itemsRes?.data) return;
    setAccItems((prev) => {
      // First page → mirror it directly so cache invalidations (edits/deletes)
      // refresh in place instead of stacking stale rows.
      if (cursorChain.length === 1) return itemsRes.data as ItemWithCollections[];
      const incoming = new Map(itemsRes.data.map((r) => [r.id, r]));
      const updated = prev.map((r) => (incoming.get(r.id) as ItemWithCollections | undefined) ?? r);
      const seen = new Set(prev.map((r) => r.id));
      const appended = itemsRes.data.filter((r) => !seen.has(r.id)) as ItemWithCollections[];
      return [...updated, ...appended];
    });
  }, [itemsRes, cursorChain.length]);
  useEffect(() => {
    const next = itemsRes?.page.nextCursor;
    if (itemsRes?.page.hasMore && next && !cursorChain.includes(next)) {
      setCursorChain((prev) => [...prev, next]);
    }
  }, [itemsRes, cursorChain]);

  const { data: shopsRes } = useGetShopsQuery();
  const { data: catRes } = useGetCategoriesQuery();
  const { data: collectionsRes } = useGetCollectionsQuery();

  const shops = shopsRes?.data ?? [];
  const allItems = accItems;
  const cats = (catRes?.data ?? []) as CategoryRow[];
  const collections = collectionsRes?.data ?? [];

  const [selectedShopId, setSelectedShopId] = useState<string>('');
  const [expandedMainCats, setExpandedMainCats] = useState<Set<string>>(new Set());
  const [expandedSubCats, setExpandedSubCats] = useState<Set<string>>(new Set());

  // Auto-select first shop once data arrives
  useEffect(() => {
    if (shops.length > 0 && !selectedShopId) {
      setSelectedShopId(shops[0]!.id);
    }
  }, [shops, selectedShopId]);

  const byId = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);

  const categoryMetalById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cats) {
      const main = c.parentId ? byId.get(c.parentId) : c;
      map.set(c.id, (main ?? c).metalType ?? '');
    }
    return map;
  }, [cats, byId]);

  const shopItems = useMemo(
    () => (selectedShopId ? allItems.filter((i) => i.shopId === selectedShopId) : allItems),
    [allItems, selectedShopId],
  );

  // --- Summary stats (piece-basis, in-stock only) ---
  // Everything here counts PIECES, not rows, over IN-STOCK stock only — the same
  // basis Analytics → Inventory value and the Valuation tab use. A lot row of N
  // contributes N: weight, cost and count all scale by units, and cost folds in
  // Σ diamond cost. Previously weight/value summed once per row and dropped stone
  // value, so they disagreed with Analytics (e.g. 341 g vs 3 691 g).
  const unitsOf = (i: ItemWithCollections): number => (i.isSerialized ? 1 : i.quantityOnHand);
  const diamondCostOf = (i: ItemWithCollections): number =>
    ((i as ItemWithCollections & { diamonds?: Array<{ costPaise?: number }> }).diamonds ?? []).reduce(
      (s, d) => s + (d.costPaise ?? 0),
      0,
    );
  const inStockItems = useMemo(() => shopItems.filter((i) => i.status === 'IN_STOCK'), [shopItems]);
  const totalWeightMg = useMemo(
    () => inStockItems.reduce((s, i) => s + i.weightMg * unitsOf(i), 0),
    [inStockItems],
  );
  const totalValuePaise = useMemo(
    () => inStockItems.reduce((s, i) => s + (i.costPricePaise + diamondCostOf(i)) * unitsOf(i), 0),
    [inStockItems],
  );
  const inStockCount = useMemo(() => inStockItems.reduce((s, i) => s + unitsOf(i), 0), [inStockItems]);
  const inTransitCount = useMemo(
    () => shopItems.filter((i) => i.status === 'IN_TRANSIT').reduce((s, i) => s + unitsOf(i), 0),
    [shopItems],
  );

  // --- Chart: items per main category ---
  const categoryChartData = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of shopItems) {
      const itemCat = byId.get(item.categoryId);
      const mainCatId = itemCat?.parentId ?? item.categoryId;
      const name = byId.get(mainCatId)?.name ?? mainCatId.slice(-6);
      m.set(name, (m.get(name) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [shopItems, byId]);

  // --- Chart: status distribution ---
  const statusChartData = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of shopItems) m[i.status] = (m[i.status] ?? 0) + 1;
    const labels: Record<string, string> = { IN_STOCK: 'In Stock', IN_TRANSIT: 'In Transit', SOLD: 'Sold', MELTED: 'Melted' };
    return Object.entries(m).map(([status, value]) => ({ name: labels[status] ?? status, value, status }));
  }, [shopItems]);

  // --- Chart: purity distribution ---
  const purityChartData = useMemo(() => {
    const m = new Map<number, number>();
    for (const i of shopItems) m.set(i.purityCaratX100, (m.get(i.purityCaratX100) ?? 0) + 1);
    const label = (x100: number) => {
      if (x100 === 2400) return '24K';
      if (x100 === 2200) return '22K';
      if (x100 === 1800) return '18K';
      if (x100 === 1400) return '14K';
      if (x100 === 0) return 'Silver';
      if (x100 >= 9000) return `Pt ${x100 / 10}`;
      return `${(x100 / 100).toFixed(1)}K`;
    };
    return Array.from(m.entries())
      .map(([purity, count]) => ({ name: label(purity), count, purity }))
      .sort((a, b) => b.purity - a.purity)
      .slice(0, 6);
  }, [shopItems]);

  // --- Chart: weight per main category ---
  const weightChartData = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of shopItems) {
      const itemCat = byId.get(item.categoryId);
      const mainCatId = itemCat?.parentId ?? item.categoryId;
      const name = byId.get(mainCatId)?.name ?? mainCatId.slice(-6);
      m.set(name, (m.get(name) ?? 0) + item.weightMg);
    }
    return Array.from(m.entries())
      .map(([name, weightMg]) => ({ name, weight: parseFloat((weightMg / 1000).toFixed(3)) }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8);
  }, [shopItems, byId]);

  // --- Chart: qty in stock per main category ---
  const qtyByCategoryData = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of shopItems) {
      if (item.status !== 'IN_STOCK') continue;
      const itemCat = byId.get(item.categoryId);
      const mainCatId = itemCat?.parentId ?? item.categoryId;
      const name = byId.get(mainCatId)?.name ?? mainCatId.slice(-6);
      const qty = item.isSerialized ? 1 : item.quantityOnHand;
      m.set(name, (m.get(name) ?? 0) + qty);
    }
    return Array.from(m.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);
  }, [shopItems, byId]);

  // --- Chart: items per collection (for this shop) ---
  const collectionById = useMemo(() => new Map(collections.map((c) => [c.id, c])), [collections]);
  const collectionChartData = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of shopItems) {
      const ids = item.collectionIds ?? [];
      for (const cid of ids) {
        const name = collectionById.get(cid)?.name ?? cid.slice(-6);
        m.set(name, (m.get(name) ?? 0) + 1);
      }
    }
    return Array.from(m.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [shopItems, collectionById]);

  // Group by Main Category → Sub Category
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, Item[]>>();
    for (const item of shopItems) {
      const itemCat = byId.get(item.categoryId);
      const mainCatId = itemCat?.parentId ?? item.categoryId;
      if (!map.has(mainCatId)) map.set(mainCatId, new Map());
      const bySub = map.get(mainCatId)!;
      if (!bySub.has(item.categoryId)) bySub.set(item.categoryId, []);
      bySub.get(item.categoryId)!.push(item);
    }
    return map;
  }, [shopItems, byId]);

  const toggleMainCat = (id: string) =>
    setExpandedMainCats((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSubCat = (id: string) =>
    setExpandedSubCats((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (itemsLoading) return <TableSkeleton rows={6} columns={5} />;

  if (shops.length === 0) {
    return (
      <EmptyState
        eyebrow="No shops yet"
        title="Add shops to see inventory breakdown"
        body="Create your first shop in Settings before viewing shop-wise inventory."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: shop selector + stats */}
      <Toolbar>
        <div className="flex items-center gap-2">
          <label className="text-sm text-ink-500 whitespace-nowrap">Shop</label>
          <div className="relative">
            <select
              value={selectedShopId}
              onChange={(e) => {
                setSelectedShopId(e.target.value);
                setExpandedMainCats(new Set());
                setExpandedSubCats(new Set());
              }}
              className="h-8 pl-3 pr-8 text-sm border border-ink-200 rounded-md bg-white text-ink-900 focus:outline-none focus:ring-2 focus:ring-gold-400 appearance-none cursor-pointer min-w-[200px]"
            >
              {shops.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatPill>{shopItems.length} item{shopItems.length === 1 ? '' : 's'}</StatPill>
          {shopItems.length > 0 && (
            <StatPill><Weight mg={totalWeightMg} /></StatPill>
          )}
        </div>
      </Toolbar>

      {/* Empty shop */}
      {shopItems.length === 0 && (
        <EmptyState
          eyebrow={shops.find((s) => s.id === selectedShopId)?.name ?? 'This shop'}
          title="No inventory in this shop"
          body="Items added or transferred to this shop will appear here."
        />
      )}

      {shopItems.length > 0 && (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border border-ink-100 rounded-lg p-4 bg-white">
              <p className="text-xs text-ink-400 uppercase tracking-wide font-medium mb-1">Total Items</p>
              <p className="text-2xl font-bold text-ink-900">{shopItems.length}</p>
              <p className="text-xs text-ink-400 mt-0.5">{grouped.size} categor{grouped.size === 1 ? 'y' : 'ies'}</p>
            </div>
            <div className="border border-ink-100 rounded-lg p-4 bg-white">
              <p className="text-xs text-ink-400 uppercase tracking-wide font-medium mb-1">Total Weight</p>
              <p className="text-2xl font-bold text-ink-900"><Weight mg={totalWeightMg} /></p>
              <p className="text-xs text-ink-400 mt-0.5">gross weight</p>
            </div>
            <div className="border border-ink-100 rounded-lg p-4 bg-white">
              <p className="text-xs text-ink-400 uppercase tracking-wide font-medium mb-1">Inventory Value</p>
              <p className="text-2xl font-bold text-ink-900"><Money paise={totalValuePaise} /></p>
              <p className="text-xs text-ink-400 mt-0.5">at cost price</p>
            </div>
            <div className="border border-ink-100 rounded-lg p-4 bg-white">
              <p className="text-xs text-ink-400 uppercase tracking-wide font-medium mb-1">In Stock</p>
              <p className="text-2xl font-bold text-green-600">{inStockCount}</p>
              {inTransitCount > 0 && (
                <p className="text-xs text-blue-500 mt-0.5">{inTransitCount} in transit</p>
              )}
            </div>
          </div>

          {/* Charts row 1: category items + status pie */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {categoryChartData.length > 0 && (
              <div className="border border-ink-100 rounded-lg p-4 bg-white md:col-span-2">
                <p className="text-xs text-ink-500 uppercase tracking-wide font-semibold mb-3">Items by Category</p>
                <ResponsiveContainer width="100%" height={Math.max(160, categoryChartData.length * 32)}>
                  <BarChart data={categoryChartData} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={110}
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}
                      formatter={(value: number) => [value, 'Items']}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                      {categoryChartData.map((_, idx) => (
                        <Cell key={idx} fill={SW_CAT_COLORS[idx % SW_CAT_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {statusChartData.length > 0 && (
              <div className="border border-ink-100 rounded-lg p-4 bg-white">
                <p className="text-xs text-ink-500 uppercase tracking-wide font-semibold mb-3">Status Breakdown</p>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="44%"
                      innerRadius={48}
                      outerRadius={74}
                      dataKey="value"
                      nameKey="name"
                      paddingAngle={2}
                    >
                      {statusChartData.map((entry, idx) => (
                        <Cell key={idx} fill={SW_STATUS_COLORS[entry.status] ?? '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb' }} />
                    <Legend iconSize={9} iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Charts row 2: purity + weight by category */}
          {(purityChartData.length > 1 || weightChartData.length > 1) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {purityChartData.length > 1 && (
                <div className="border border-ink-100 rounded-lg p-4 bg-white">
                  <p className="text-xs text-ink-500 uppercase tracking-wide font-semibold mb-3">Items by Purity</p>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={purityChartData} margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb' }}
                        formatter={(v: number) => [v, 'Items']}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={36}>
                        {purityChartData.map((_, idx) => (
                          <Cell key={idx} fill={SW_CAT_COLORS[idx % SW_CAT_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {weightChartData.length > 1 && (
                <div className="border border-ink-100 rounded-lg p-4 bg-white">
                  <p className="text-xs text-ink-500 uppercase tracking-wide font-semibold mb-3">Weight by Category (g)</p>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={weightChartData} margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb' }}
                        formatter={(v: number) => [`${v} g`, 'Weight']}
                      />
                      <Bar dataKey="weight" radius={[4, 4, 0, 0]} fill="#b45309" maxBarSize={36}>
                        {weightChartData.map((_, idx) => (
                          <Cell key={idx} fill={SW_CAT_COLORS[(idx + 2) % SW_CAT_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Charts row 3: qty in stock + collections */}
          {(qtyByCategoryData.length > 0 || collectionChartData.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {qtyByCategoryData.length > 0 && (
                <div className="border border-ink-100 rounded-lg p-4 bg-white">
                  <p className="text-xs text-ink-500 uppercase tracking-wide font-semibold mb-1">Qty in Stock by Category</p>
                  <p className="text-[11px] text-ink-400 mb-3">Pieces available · serialized = 1 each, lots = stock count</p>
                  <ResponsiveContainer width="100%" height={Math.max(140, qtyByCategoryData.length * 30)}>
                    <BarChart data={qtyByCategoryData} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
                      <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={110}
                        tick={{ fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb' }}
                        formatter={(v: number) => [v, 'Qty in Stock']}
                      />
                      <Bar dataKey="qty" radius={[0, 4, 4, 0]} maxBarSize={20}>
                        {qtyByCategoryData.map((_, idx) => (
                          <Cell key={idx} fill={SW_STATUS_COLORS.IN_STOCK} opacity={0.75 + (idx % 3) * 0.08} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {collectionChartData.length > 0 ? (
                <div className="border border-ink-100 rounded-lg p-4 bg-white">
                  <p className="text-xs text-ink-500 uppercase tracking-wide font-semibold mb-1">Items by Collection</p>
                  <p className="text-[11px] text-ink-400 mb-3">How many pieces in each collection are stocked here</p>
                  <ResponsiveContainer width="100%" height={Math.max(140, collectionChartData.length * 30)}>
                    <BarChart data={collectionChartData} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
                      <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={110}
                        tick={{ fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb' }}
                        formatter={(v: number) => [v, 'Items']}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                        {collectionChartData.map((_, idx) => (
                          <Cell key={idx} fill={SW_CAT_COLORS[idx % SW_CAT_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                qtyByCategoryData.length > 0 && (
                  <div className="border border-ink-100 rounded-lg p-4 bg-white flex items-center justify-center">
                    <p className="text-sm text-ink-400">No collections assigned to items in this shop</p>
                  </div>
                )
              )}
            </div>
          )}
        </>
      )}

      {/* Main Category → Sub Category → Items table */}
      {grouped.size > 0 && (
        <div className="border border-ink-100 rounded-lg overflow-hidden divide-y divide-ink-100">
          {Array.from(grouped.entries()).map(([mainCatId, bySub]) => {
            const mainCat = byId.get(mainCatId);
            const isExpanded = expandedMainCats.has(mainCatId);
            const allInMain = Array.from(bySub.values()).flat();
            const mainWeightMg = allInMain.reduce((s, i) => s + i.weightMg, 0);

            return (
              <div key={mainCatId}>
                {/* Main category header */}
                <button
                  onClick={() => toggleMainCat(mainCatId)}
                  className="w-full px-4 py-3 flex items-center gap-3 bg-ink-25 hover:bg-ink-50 transition-colors text-left"
                >
                  <ChevronRight
                    className={`h-4 w-4 text-ink-400 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                  />
                  <span className="font-semibold text-sm text-ink-800 flex-1">
                    {mainCat?.name ?? mainCatId.slice(-6)}
                  </span>
                  <span className="text-xs text-ink-400 mr-3">
                    {allInMain.length} item{allInMain.length === 1 ? '' : 's'}
                    {' · '}
                    <Weight mg={mainWeightMg} />
                  </span>
                  <Badge tone="neutral">{allInMain.length}</Badge>
                </button>

                {/* Sub-categories */}
                {isExpanded && (
                  <div className="divide-y divide-ink-100">
                    {Array.from(bySub.entries()).map(([subCatId, itemList]) => {
                      const subCat = byId.get(subCatId);
                      const isSubExpanded = expandedSubCats.has(subCatId);
                      const subWeightMg = itemList.reduce((s, i) => s + i.weightMg, 0);
                      const subLabel =
                        subCatId === mainCatId
                          ? (mainCat?.name ?? '—')
                          : (subCat?.name ?? '—');

                      return (
                        <div key={subCatId} className="bg-white">
                          <button
                            onClick={() => toggleSubCat(subCatId)}
                            className="w-full px-6 py-2.5 flex items-center gap-3 hover:bg-ink-25 transition-colors text-left"
                          >
                            <ChevronRight
                              className={`h-3.5 w-3.5 text-ink-300 transition-transform shrink-0 ${isSubExpanded ? 'rotate-90' : ''}`}
                            />
                            <span className="text-sm text-ink-700 flex-1">{subLabel}</span>
                            <span className="text-xs text-ink-400 mr-1">
                              {itemList.length} item{itemList.length === 1 ? '' : 's'}
                              {' · '}
                              <Weight mg={subWeightMg} />
                            </span>
                          </button>

                          {/* Items table */}
                          {isSubExpanded && (
                            <div className="px-6 pb-3 pt-1">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-ink-100">
                                    <th className="pb-1.5 text-left font-medium text-ink-400 uppercase tracking-wide text-[10px]">SKU</th>
                                    <th className="pb-1.5 text-right font-medium text-ink-400 uppercase tracking-wide text-[10px]">Weight</th>
                                    <th className="pb-1.5 text-left font-medium text-ink-400 uppercase tracking-wide text-[10px] pl-4">Purity</th>
                                    <th className="pb-1.5 text-left font-medium text-ink-400 uppercase tracking-wide text-[10px] pl-4">Status</th>
                                    <th className="pb-1.5 text-right font-medium text-ink-400 uppercase tracking-wide text-[10px] pl-4">Qty</th>
                                    <th className="pb-1.5 text-right font-medium text-ink-400 uppercase tracking-wide text-[10px]">Cost</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-ink-50">
                                  {itemList.map((item) => (
                                    <tr key={item.id} className="hover:bg-ink-25 transition-colors">
                                      <td className="py-2 font-mono text-ink-900">
                                        {item.sku}
                                        {item.name && (
                                          <span className="ml-1.5 font-sans text-ink-400 not-italic">{item.name}</span>
                                        )}
                                      </td>
                                      <td className="py-2 text-right text-ink-700 tabular-nums">
                                        <Weight mg={item.weightMg} />
                                      </td>
                                      <td className="py-2 pl-4">
                                        <Purity
                                          x100={item.purityCaratX100}
                                          metalType={categoryMetalById.get(item.categoryId)}
                                        />
                                      </td>
                                      <td className="py-2 pl-4">
                                        <Badge
                                          tone={
                                            item.status === 'IN_STOCK'
                                              ? 'success'
                                              : item.status === 'SOLD'
                                                ? 'neutral'
                                                : 'info'
                                          }
                                        >
                                          {item.status.replace('_', ' ').toLowerCase()}
                                        </Badge>
                                      </td>
                                      <td className="py-2 pl-4 text-right tabular-nums">
                                        <span className={
                                          item.isSerialized
                                            ? 'text-ink-600'
                                            : item.quantityOnHand <= 0
                                              ? 'text-red-500 font-medium'
                                              : item.quantityOnHand <= 2
                                                ? 'text-amber-600 font-medium'
                                                : 'text-ink-700 font-medium'
                                        }>
                                          {item.isSerialized ? 1 : item.quantityOnHand}
                                        </span>
                                      </td>
                                      <td className="py-2 text-right text-ink-700 tabular-nums">
                                        <Money paise={item.costPricePaise} />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
