// Stock transfer workflow — pending requests, approval queue, transit, history.
// Matches the inventory.transfer permission (gated at the route).
//
// State machine (see server/src/modules/transfers/transfers.service.ts):
//   PENDING   -> approve / reject
//   APPROVED  -> complete (mark received at destination)
//   COMPLETED -> read-only
//   REJECTED  -> read-only

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X, PackageCheck, Plus, ArrowRight, ScanLine, Layers, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { TransferStatus } from '@goldos/shared/constants';
import type { Category, Collection } from '@goldos/shared/types';
import {
  useGetTransfersQuery,
  useGetTransferQuery,
  useGetTransferableItemsQuery,
  useCreateTransferMutation,
  useApproveTransferMutation,
  useCompleteTransferMutation,
  useRejectTransferMutation,
  type TransferRow,
  type TransferableItem,
} from '@/features/transfers/transfersApi';
import { useGetCategoriesQuery, useGetCollectionsQuery } from '@/features/inventory/inventoryApi';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import { Money, Weight } from '@/components/ui/money';

// Bulk pre-fill instruction used when the admin fulfils a POS stock request —
// each entry adds every matching item at the source at the requested quantity.
export type TransferAutoAdd = { categoryId?: string | null; collectionId?: string | null; quantity: number };
import { PageHeader } from '@/components/ui/PageHeader';
import { TabStrip, type TabStripItem } from '@/components/ui/TabStrip';
import { SectionCard } from '@/components/ui/SectionCard';
import { TableToolbar, useTableSearch } from '@/components/data/TableToolbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody } from '@/components/ui/sheet';

const fieldCls =
  'w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400';

const TABS: Array<{ id: TransferStatus | 'ALL'; label: string }> = [
  { id: 'PENDING',   label: 'Pending' },
  { id: 'APPROVED', label: 'In transit' },
  { id: 'COMPLETED', label: 'Completed' },
  { id: 'REJECTED', label: 'Rejected' },
  { id: 'ALL',      label: 'All' },
];

function statusBadge(status: TransferStatus): JSX.Element {
  const map: Record<TransferStatus, { tone: 'warning' | 'info' | 'success' | 'danger'; label: string }> = {
    PENDING:   { tone: 'warning', label: 'Pending' },
    APPROVED:  { tone: 'info',    label: 'In transit' },
    COMPLETED: { tone: 'success', label: 'Completed' },
    REJECTED:  { tone: 'danger',  label: 'Rejected' },
  };
  const v = map[status];
  return <Badge tone={v.tone}>{v.label}</Badge>;
}

export function TransfersPage(): JSX.Element {
  const [tab, setTab] = useState<TransferStatus | 'ALL'>('PENDING');
  const [newOpen, setNewOpen] = useState(false);
  const tabItems: TabStripItem<TransferStatus | 'ALL'>[] = TABS.map((t) => ({ id: t.id, label: t.label }));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Module 01 / Stock"
        title="Stock transfers"
        description="Move inventory from the warehouse to a shop, or between shops, with an approval trail."
        actions={
          <Button onClick={() => setNewOpen(true)} className="gap-1">
            <Plus className="h-4 w-4" /> New transfer
          </Button>
        }
        bare
      />

      <TabStrip<TransferStatus | 'ALL'>
        items={tabItems}
        value={tab}
        onChange={setTab}
      />

      <TransferList status={tab === 'ALL' ? undefined : tab} />

      <NewTransferDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

// ----------------------------------------------------------------------------
// List + per-row actions.

function TransferList({ status }: { status?: TransferStatus }): JSX.Element {
  const { data, isLoading } = useGetTransfersQuery(status ? { status } : undefined);
  const { data: shopsRes } = useGetShopsQuery();
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const shopName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of shopsRes?.data ?? []) m.set(s.id, s.name);
    return m;
  }, [shopsRes?.data]);

  const allRows = data?.data ?? [];
  const rows = useTableSearch(
    allRows,
    (t) => [
      t.fromShop?.name ?? shopName.get(t.fromShopId),
      t.toShop?.name ?? shopName.get(t.toShopId),
      t.reason,
      t.status,
      t.id,
    ],
    search,
  );

  if (isLoading) {
    return (
      <SectionCard>
        <TableSkeleton rows={5} />
      </SectionCard>
    );
  }

  if (allRows.length === 0) {
    return (
      <EmptyState
        eyebrow="Empty"
        title="No transfers in this state"
        body="Use the 'New transfer' button to send stock from the warehouse to a shop."
      />
    );
  }

  return (
    <>
    <TableToolbar
      query={search}
      onQueryChange={setSearch}
      searchPlaceholder="Search by from/to shop or reason…"
      count={rows.length}
      countLabel={rows.length === 1 ? 'transfer' : 'transfers'}
    />
    <SectionCard bareBody>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-left">
            <tr className="text-eyebrow uppercase text-ink-500">
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2">From → To</th>
              <th className="px-4 py-2 text-right">Items</th>
              <th className="px-4 py-2">Reason</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <TransferRowView
                key={t.id}
                row={t}
                fromName={t.fromShop?.name ?? shopName.get(t.fromShopId) ?? '—'}
                toName={t.toShop?.name ?? shopName.get(t.toShopId) ?? '—'}
                onOpenDetail={() => setDetailId(t.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
    {detailId && (
      <TransferDetailSheet
        id={detailId}
        shopName={shopName}
        onClose={() => setDetailId(null)}
      />
    )}
    </>
  );
}

function TransferRowView({
  row,
  fromName,
  toName,
  onOpenDetail,
}: {
  row: TransferRow;
  fromName: string;
  toName: string;
  onOpenDetail: () => void;
}): JSX.Element {
  const [approve, approveState] = useApproveTransferMutation();
  const [complete, completeState] = useCompleteTransferMutation();
  const [reject, rejectState] = useRejectTransferMutation();
  const [rejectOpen, setRejectOpen] = useState(false);

  const busy = approveState.isLoading || completeState.isLoading || rejectState.isLoading;

  async function doApprove(): Promise<void> {
    try {
      await approve(row.id).unwrap();
      toast.success('Approved — items now in transit');
    } catch (err) {
      const message = (err as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not approve.';
      toast.error(message);
    }
  }

  async function doComplete(): Promise<void> {
    try {
      await complete(row.id).unwrap();
      toast.success(`Received at ${toName}`);
    } catch (err) {
      const message = (err as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not mark received.';
      toast.error(message);
    }
  }

  return (
    <>
      <tr
        className="border-t border-ink-100 hover:bg-ink-25 cursor-pointer"
        onClick={onOpenDetail}
      >
        <td className="px-4 py-3 text-xs text-ink-700 whitespace-nowrap">
          {new Date(row.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 text-ink-900">
            <span>{fromName}</span>
            <span className="text-ink-400">→</span>
            <span>{toName}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-right font-mono text-ink-900">{row._count?.lines ?? 0}</td>
        <td className="px-4 py-3 text-ink-700 max-w-[280px] truncate">{row.reason}</td>
        <td className="px-4 py-3">{statusBadge(row.status)}</td>
        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-2">
            {row.status === 'PENDING' && (
              <>
                <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)} disabled={busy}>
                  <X className="h-3.5 w-3.5" /> Reject
                </Button>
                <Button size="sm" onClick={doApprove} disabled={busy}>
                  <Check className="h-3.5 w-3.5" /> Approve
                </Button>
              </>
            )}
            {row.status === 'APPROVED' && (
              <Button size="sm" onClick={doComplete} disabled={busy}>
                <PackageCheck className="h-3.5 w-3.5" /> Mark received
              </Button>
            )}
          </div>
        </td>
      </tr>
      {rejectOpen && (
        <RejectDialog
          open={rejectOpen}
          onClose={() => setRejectOpen(false)}
          onConfirm={async (reasonText) => {
            try {
              await reject({ id: row.id, rejectionReason: reasonText }).unwrap();
              toast.success('Transfer rejected');
              setRejectOpen(false);
            } catch (err) {
              const message =
                (err as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not reject.';
              toast.error(message);
            }
          }}
        />
      )}
    </>
  );
}

// ----------------------------------------------------------------------------
// Transfer detail sheet — shows full line-item breakdown on row click.

function TransferDetailSheet({
  id,
  shopName,
  onClose,
}: {
  id: string;
  shopName: Map<string, string>;
  onClose: () => void;
}): JSX.Element {
  const { data, isLoading } = useGetTransferQuery(id);
  const transfer = data?.data;

  const fromName = transfer?.fromShop?.name ?? shopName.get(transfer?.fromShopId ?? '') ?? '—';
  const toName   = transfer?.toShop?.name  ?? shopName.get(transfer?.toShopId   ?? '') ?? '—';

  // Line totals — units, weight, and cost value of everything in the transfer.
  const totals = useMemo(() => {
    const lines = transfer?.lines ?? [];
    return lines.reduce(
      (acc, l) => {
        acc.qty += l.quantity;
        acc.weightMg += l.item.weightMg * l.quantity;
        acc.valuePaise += l.item.costPricePaise * l.quantity;
        return acc;
      },
      { qty: 0, weightMg: 0, valuePaise: 0 },
    );
  }, [transfer?.lines]);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="!max-w-3xl">
        <SheetHeader>
          <SheetTitle>Transfer details</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {isLoading && (
            <div className="py-10 text-center text-sm text-ink-500">Loading…</div>
          )}
          {transfer && (
            <div className="space-y-5 text-sm">
              {/* Route + status */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-eyebrow uppercase text-ink-500 text-[10px] mb-1">Route</p>
                  <div className="flex items-center gap-2 font-medium text-ink-900 text-base">
                    <span>{fromName}</span>
                    <ArrowRight className="h-4 w-4 text-ink-400 shrink-0" />
                    <span>{toName}</span>
                  </div>
                </div>
                <div className="shrink-0">{statusBadge(transfer.status)}</div>
              </div>

              {/* Meta grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-xs border border-ink-100 rounded-lg p-4 bg-ink-25">
                <div>
                  <p className="text-eyebrow uppercase text-ink-400 mb-0.5">Created</p>
                  <p className="text-ink-900">
                    {new Date(transfer.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
                {transfer.approvedAt && (
                  <div>
                    <p className="text-eyebrow uppercase text-ink-400 mb-0.5">Approved</p>
                    <p className="text-ink-900">
                      {new Date(transfer.approvedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                )}
                {transfer.completedAt && (
                  <div>
                    <p className="text-eyebrow uppercase text-ink-400 mb-0.5">Received</p>
                    <p className="text-ink-900">
                      {new Date(transfer.completedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                )}
                {transfer.rejectedAt && (
                  <div>
                    <p className="text-eyebrow uppercase text-ink-400 mb-0.5">Rejected</p>
                    <p className="text-ink-900">
                      {new Date(transfer.rejectedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-eyebrow uppercase text-ink-400 mb-0.5">Reason</p>
                  <p className="text-ink-900">{transfer.reason}</p>
                </div>
                {transfer.rejectionReason && (
                  <div className="col-span-2 sm:col-span-3">
                    <p className="text-eyebrow uppercase text-ink-400 mb-0.5">Rejection reason</p>
                    <p className="text-danger-700">{transfer.rejectionReason}</p>
                  </div>
                )}
                {transfer.notes && (
                  <div className="col-span-2 sm:col-span-3">
                    <p className="text-eyebrow uppercase text-ink-400 mb-0.5">Notes</p>
                    <p className="text-ink-700">{transfer.notes}</p>
                  </div>
                )}
              </div>

              {/* Items table */}
              <div>
                <p className="text-eyebrow uppercase text-ink-500 text-[10px] mb-2">
                  Items transferred ({transfer.lines.length})
                </p>
                <div className="border border-ink-100 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-ink-50 border-b border-ink-100">
                      <tr className="text-eyebrow uppercase text-ink-500">
                        <th className="px-3 py-2 w-10" />
                        <th className="px-3 py-2 text-left">Name / SKU</th>
                        <th className="px-3 py-2 text-left">Category</th>
                        <th className="px-3 py-2 text-center">Type</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Weight</th>
                        <th className="px-3 py-2 text-right">Purity</th>
                        <th className="px-3 py-2 text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transfer.lines.map((line) => {
                        const img = line.item.images?.[0];
                        return (
                          <tr key={line.id} className="border-t border-ink-100 hover:bg-ink-25">
                            <td className="px-3 py-2">
                              {img ? (
                                <img
                                  src={img}
                                  alt={line.item.sku}
                                  className="h-9 w-9 rounded object-cover border border-ink-100"
                                />
                              ) : (
                                <div className="h-9 w-9 rounded bg-ink-100 flex items-center justify-center text-ink-400 text-[10px]">
                                  —
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <p className="font-semibold text-ink-900">{line.item.sku}</p>
                              {line.item.name && (
                                <p className="text-[10px] text-ink-500 truncate max-w-[180px]">{line.item.name}</p>
                              )}
                            </td>
                            <td className="px-3 py-2 text-ink-700">
                              {line.item.category?.name ?? '—'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {line.item.isSerialized ? (
                                <Badge tone="neutral">Unique</Badge>
                              ) : (
                                <Badge tone="info">Lot</Badge>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-ink-900">
                              {line.quantity}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-ink-700">
                              {(line.item.weightMg / 1000).toFixed(3)}g
                            </td>
                            <td className="px-3 py-2 text-right text-ink-700">
                              {line.item.purityCaratX100 === 0
                                ? '—'
                                : `${(line.item.purityCaratX100 / 100).toFixed(0)}K`}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Money paise={line.item.costPricePaise * line.quantity} className="text-ink-900" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-ink-50 border-t border-ink-200 font-medium">
                      <tr>
                        <td className="px-3 py-2 text-left text-ink-500 text-eyebrow uppercase" colSpan={4}>
                          Totals
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-ink-900">{totals.qty}</td>
                        <td className="px-3 py-2 text-right">
                          <Weight mg={totals.weightMg} className="text-ink-900" />
                        </td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2 text-right">
                          <Money paise={totals.valuePaise} className="text-ink-900" />
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

// ----------------------------------------------------------------------------
// Reject dialog.

function RejectDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}): JSX.Element {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Reject transfer</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!reason.trim()) return void toast.error('Reason is required');
              setSubmitting(true);
              await onConfirm(reason.trim()).finally(() => setSubmitting(false));
            }}
            className="space-y-4 text-sm"
          >
            <label className="block">
              <span className="text-eyebrow uppercase text-ink-500 block mb-1">Reason</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className={fieldCls}
                placeholder="Wrong destination, items damaged in source, etc."
                required
              />
            </label>
            <div className="flex gap-2">
              <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={submitting}>
                {submitting ? 'Rejecting…' : 'Confirm reject'}
              </Button>
            </div>
          </form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

// ----------------------------------------------------------------------------
// New transfer dialog — source shop, dest shop, item multi-select, reason.

export function NewTransferDialog({
  open,
  onClose,
  initialToShopId,
  initialStockRequestId,
  autoAdd,
}: {
  open: boolean;
  onClose: () => void;
  // When fulfilling a POS stock request: preset destination + linked request id,
  // and a list of category/collection bulk-add instructions to auto-apply.
  initialToShopId?: string;
  initialStockRequestId?: string;
  autoAdd?: TransferAutoAdd[];
}): JSX.Element {
  // Source can now be ANY shop. The warehouse-only query is kept just to mark
  // warehouses in the dropdown and to pick a sensible default source.
  const { data: warehousesRes } = useGetShopsQuery({ type: 'WAREHOUSE' });
  const { data: shopsAllRes } = useGetShopsQuery();
  const { data: catRes } = useGetCategoriesQuery();
  const { data: colRes } = useGetCollectionsQuery();

  const warehouses = useMemo(() => warehousesRes?.data ?? [], [warehousesRes?.data]);
  const allShops = useMemo(() => shopsAllRes?.data ?? [], [shopsAllRes?.data]);
  const warehouseIds = useMemo(() => new Set(warehouses.map((w) => w.id)), [warehouses]);
  const shopName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of allShops) m.set(s.id, s.name);
    return m;
  }, [allShops]);

  // Category tree — mains (parentId === null) + their sub-categories.
  const cats = useMemo(() => catRes?.data ?? [], [catRes?.data]);
  const mains = useMemo(() => cats.filter((c) => !c.parentId), [cats]);
  const subsByMain = useMemo(() => {
    const m = new Map<string, Category[]>();
    for (const c of cats) {
      if (!c.parentId) continue;
      const list = m.get(c.parentId) ?? [];
      list.push(c);
      m.set(c.parentId, list);
    }
    return m;
  }, [cats]);
  const collections = useMemo<Collection[]>(() => colRes?.data ?? [], [colRes?.data]);

  const [fromShopId, setFromShopId] = useState('');
  const [toShopId, setToShopId] = useState('');
  const [reason, setReason] = useState('');
  // selectedQty maps itemId -> quantity (0 / undefined = not selected).
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  // Set when fulfilling a stock request — links the transfer to that request.
  const [stockRequestId, setStockRequestId] = useState<string | undefined>(undefined);

  // Quick-add controls (category / collection / scan).
  const [qaMain, setQaMain] = useState('');
  const [qaSub, setQaSub] = useState('');
  const [qaCatQty, setQaCatQty] = useState(1);
  const [qaCol, setQaCol] = useState('');
  const [qaColQty, setQaColQty] = useState(1);
  const [scanValue, setScanValue] = useState('');
  const [lastScan, setLastScan] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const autoAddDoneRef = useRef(false);

  // (Re)seed when the sheet opens — destination, linked request, fresh selection.
  useEffect(() => {
    if (!open) {
      autoAddDoneRef.current = false;
      return;
    }
    setToShopId(initialToShopId ?? '');
    setStockRequestId(initialStockRequestId);
    setSelectedQty({});
    setReason(initialStockRequestId ? 'Fulfilling stock request' : '');
    setSearch('');
    setLastScan(null);
    autoAddDoneRef.current = false;
  }, [open, initialToShopId, initialStockRequestId]);

  // Source options = every shop; default to a warehouse (else any shop), never
  // the chosen destination.
  const fromOptions = allShops;
  useEffect(() => {
    if (!open) return;
    if (fromShopId && fromShopId !== toShopId) return;
    const preferred =
      warehouses.find((w) => w.id !== toShopId) ?? allShops.find((s) => s.id !== toShopId);
    if (preferred) setFromShopId(preferred.id);
  }, [open, fromShopId, toShopId, warehouses, allShops]);

  // Destination = any shop except the source.
  const destOptions = useMemo(() => allShops.filter((s) => s.id !== fromShopId), [allShops, fromShopId]);
  useEffect(() => {
    if (!open || toShopId || initialToShopId) return;
    if (destOptions[0]) setToShopId(destOptions[0].id);
  }, [open, toShopId, initialToShopId, destOptions]);

  // Composer loads the FULL eligible set (all=true) so bulk add + scan work.
  const { data: itemsRes, isLoading: itemsLoading } = useGetTransferableItemsQuery(
    fromShopId ? { shopId: fromShopId, all: true } : ({ shopId: '', all: true } as { shopId: string; all: boolean }),
    { skip: !fromShopId },
  );

  const items = useMemo(() => itemsRes?.data ?? [], [itemsRes?.data]);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i] as const)), [items]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      [i.sku, i.name].some((s) => (s ?? '').toLowerCase().includes(q)),
    );
  }, [items, search]);

  const [createTransfer, { isLoading }] = useCreateTransferMutation();

  const selectedLines = useMemo(
    () =>
      Object.entries(selectedQty)
        .filter(([, qty]) => qty > 0)
        .map(([itemId, quantity]) => ({ itemId, quantity })),
    [selectedQty],
  );

  // Running totals across the whole selection (not just the filtered view).
  const totals = useMemo(() => {
    let units = 0;
    let weightMg = 0;
    let valuePaise = 0;
    for (const { itemId, quantity } of selectedLines) {
      const it = itemById.get(itemId);
      if (!it) continue;
      units += quantity;
      weightMg += it.weightMg * quantity;
      valuePaise += it.costPricePaise * quantity;
    }
    return { lines: selectedLines.length, units, weightMg, valuePaise };
  }, [selectedLines, itemById]);

  const capFor = (it: TransferableItem): number => (it.isSerialized ? 1 : it.quantityOnHand);

  // Bulk add — set qty for every item matching `matchFn` (capped per item:
  // serialized → 1, lot → min(qty, on-hand)).
  function bulkAdd(matchFn: (it: TransferableItem) => boolean, qty: number, label: string): void {
    const matches = items.filter(matchFn);
    if (matches.length === 0) {
      toast.error(`No transferable items in ${label} at this source`);
      return;
    }
    setSelectedQty((prev) => {
      const next = { ...prev };
      for (const it of matches) next[it.id] = Math.max(1, Math.min(capFor(it), qty));
      return next;
    });
    const units = matches.reduce((s, it) => s + Math.max(1, Math.min(capFor(it), qty)), 0);
    toast.success(
      `Added ${matches.length} item${matches.length === 1 ? '' : 's'} (${units} unit${units === 1 ? '' : 's'}) — ${label}`,
    );
  }

  function addByCategory(): void {
    if (!qaMain && !qaSub) return void toast.error('Pick a category first');
    const label = qaSub
      ? cats.find((c) => c.id === qaSub)?.name ?? 'sub-category'
      : `${mains.find((c) => c.id === qaMain)?.name ?? 'category'} (all)`;
    bulkAdd(
      (it) => (qaSub ? it.categoryId === qaSub : it.categoryId === qaMain || it.parentCategoryId === qaMain),
      qaCatQty,
      label,
    );
  }

  function addByCollection(): void {
    if (!qaCol) return void toast.error('Pick a collection first');
    const label = collections.find((c) => c.id === qaCol)?.name ?? 'collection';
    bulkAdd((it) => it.collectionIds.includes(qaCol), qaColQty, label);
  }

  // Scan / type a SKU + Enter → add (or increment a lot) the matching item.
  function handleScan(): void {
    const raw = scanValue.trim();
    if (!raw) return;
    const it = items.find((i) => i.sku.toLowerCase() === raw.toLowerCase());
    if (!it) {
      toast.error(`No transferable item "${raw}" at this source`);
      setScanValue('');
      return;
    }
    setSelectedQty((prev) => {
      const curr = prev[it.id] ?? 0;
      const q = it.isSerialized ? 1 : Math.min(it.quantityOnHand, curr + 1);
      return { ...prev, [it.id]: q };
    });
    setLastScan(`${it.sku}${it.name ? ` — ${it.name}` : ''}`);
    setScanValue('');
    scanRef.current?.focus();
  }

  // Admin fulfilling a stock request — apply the bulk instructions once the
  // source items have loaded.
  useEffect(() => {
    if (!open || autoAddDoneRef.current) return;
    if (!autoAdd || autoAdd.length === 0) return;
    if (!fromShopId || items.length === 0) return;
    setSelectedQty((prev) => {
      const next = { ...prev };
      for (const ins of autoAdd) {
        const matches = items.filter((it) => {
          if (ins.collectionId) return it.collectionIds.includes(ins.collectionId);
          if (ins.categoryId) return it.categoryId === ins.categoryId || it.parentCategoryId === ins.categoryId;
          return false;
        });
        for (const it of matches) next[it.id] = Math.max(1, Math.min(capFor(it), ins.quantity));
      }
      return next;
    });
    autoAddDoneRef.current = true;
  }, [open, autoAdd, items, fromShopId]);

  function toggleAll(): void {
    const allOn = filtered.length > 0 && filtered.every((i) => (selectedQty[i.id] ?? 0) > 0);
    setSelectedQty((prev) => {
      const next = { ...prev };
      if (allOn) {
        for (const i of filtered) delete next[i.id];
      } else {
        for (const i of filtered) next[i.id] = Math.max(next[i.id] ?? 0, 1);
      }
      return next;
    });
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!fromShopId || !toShopId) return void toast.error('Pick source and destination');
    if (fromShopId === toShopId) return void toast.error('Source and destination must differ');
    if (selectedLines.length === 0) return void toast.error('Select at least one item');
    if (!reason.trim()) return void toast.error('Reason is required');
    try {
      await createTransfer({
        fromShopId,
        toShopId,
        lines: selectedLines,
        reason: reason.trim(),
        ...(stockRequestId ? { stockRequestId } : {}),
      }).unwrap();
      const totalUnits = selectedLines.reduce((s, l) => s + l.quantity, 0);
      toast.success(
        `Transfer requested: ${selectedLines.length} line${selectedLines.length === 1 ? '' : 's'}, ${totalUnits} unit${
          totalUnits === 1 ? '' : 's'
        } — awaiting approval`,
      );
      setSelectedQty({});
      setReason('');
      setSearch('');
      onClose();
    } catch (err) {
      const message =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not request transfer.';
      toast.error(message);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="!max-w-2xl">
        <SheetHeader>
          <SheetTitle>New stock transfer</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form onSubmit={submit} className="space-y-4 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-eyebrow uppercase text-ink-500 block mb-1">
                  From (source shop)
                </span>
                <select
                  value={fromShopId}
                  onChange={(e) => {
                    setFromShopId(e.target.value);
                    setSelectedQty({});
                    setLastScan(null);
                  }}
                  className={fieldCls}
                  required
                >
                  {fromOptions.length === 0 && <option value="">No shops available</option>}
                  {fromOptions.map((s) => (
                    <option key={s.id} value={s.id} disabled={s.id === toShopId}>
                      {s.name}
                      {warehouseIds.has(s.id) ? ' (warehouse)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-ink-500 mt-1">
                  Any warehouse or shop can be the source.
                </p>
              </label>
              <label className="block">
                <span className="text-eyebrow uppercase text-ink-500 block mb-1">
                  To (destination)
                </span>
                <select
                  value={toShopId}
                  onChange={(e) => setToShopId(e.target.value)}
                  className={fieldCls}
                  required
                  disabled={destOptions.length === 0}
                >
                  {destOptions.length === 0 && <option value="">No destinations available</option>}
                  {destOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {warehouseIds.has(s.id) ? ' (warehouse)' : ''}
                    </option>
                  ))}
                </select>
                {fromShopId && shopName.get(fromShopId) && (
                  <p className="text-[10px] text-ink-500 mt-1">
                    Source: <span className="font-medium">{shopName.get(fromShopId)}</span>
                  </p>
                )}
              </label>
            </div>

            {/* Quick add — bulk by category / collection, or scan a SKU. */}
            <div className="border-t border-ink-100 pt-3 space-y-2.5">
              <span className="text-eyebrow uppercase text-ink-500 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Quick add
              </span>

              {/* By main / sub category */}
              <div className="rounded-lg border border-ink-100 bg-ink-25 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-ink-500 mb-1.5 flex items-center gap-1">
                  <Layers className="h-3 w-3" /> By category
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex-1 min-w-[130px]">
                    <span className="text-[10px] text-ink-500 block mb-0.5">Main category</span>
                    <select
                      value={qaMain}
                      onChange={(e) => {
                        setQaMain(e.target.value);
                        setQaSub('');
                      }}
                      className={fieldCls}
                    >
                      <option value="">Select…</option>
                      {mains.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex-1 min-w-[130px]">
                    <span className="text-[10px] text-ink-500 block mb-0.5">Sub-category</span>
                    <select
                      value={qaSub}
                      onChange={(e) => setQaSub(e.target.value)}
                      className={fieldCls}
                      disabled={!qaMain}
                    >
                      <option value="">All in main</option>
                      {(subsByMain.get(qaMain) ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="w-[72px]">
                    <span className="text-[10px] text-ink-500 block mb-0.5">Qty each</span>
                    <input
                      type="number"
                      min={1}
                      value={qaCatQty}
                      onChange={(e) => setQaCatQty(Math.max(1, Number(e.target.value) || 1))}
                      className={fieldCls}
                    />
                  </label>
                  <Button type="button" size="sm" variant="outline" onClick={addByCategory} disabled={!fromShopId}>
                    Add
                  </Button>
                </div>
              </div>

              {/* By collection */}
              <div className="rounded-lg border border-ink-100 bg-ink-25 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-ink-500 mb-1.5 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> By collection
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex-1 min-w-[160px]">
                    <span className="text-[10px] text-ink-500 block mb-0.5">Collection</span>
                    <select value={qaCol} onChange={(e) => setQaCol(e.target.value)} className={fieldCls}>
                      <option value="">Select…</option>
                      {collections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="w-[72px]">
                    <span className="text-[10px] text-ink-500 block mb-0.5">Qty each</span>
                    <input
                      type="number"
                      min={1}
                      value={qaColQty}
                      onChange={(e) => setQaColQty(Math.max(1, Number(e.target.value) || 1))}
                      className={fieldCls}
                    />
                  </label>
                  <Button type="button" size="sm" variant="outline" onClick={addByCollection} disabled={!fromShopId}>
                    Add
                  </Button>
                </div>
              </div>

              {/* Scan / enter a SKU */}
              <div className="rounded-lg border border-ink-100 bg-ink-25 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-ink-500 mb-1.5 flex items-center gap-1">
                  <ScanLine className="h-3 w-3" /> Scan / enter SKU
                </p>
                <div className="flex items-end gap-2">
                  <input
                    ref={scanRef}
                    value={scanValue}
                    onChange={(e) => setScanValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleScan();
                      }
                    }}
                    placeholder="Scan a barcode or type a SKU, then press Enter"
                    className={`${fieldCls} flex-1`}
                    disabled={!fromShopId}
                  />
                  <Button type="button" size="sm" variant="outline" onClick={handleScan} disabled={!fromShopId}>
                    Add
                  </Button>
                </div>
                {lastScan && <p className="text-[10px] text-brand-700 mt-1">Added: {lastScan}</p>}
              </div>
            </div>

            <div className="border-t border-ink-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-eyebrow uppercase text-ink-500">
                  Select items ({selectedLines.length} line{selectedLines.length === 1 ? '' : 's'})
                </span>
                {filtered.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs text-brand-700 hover:underline"
                  >
                    {filtered.every((i) => (selectedQty[i.id] ?? 0) > 0)
                      ? 'Clear visible'
                      : 'Select visible'}
                  </button>
                )}
              </div>
              <input
                placeholder="Search SKU or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${fieldCls} mb-2`}
              />
              <div className="border border-ink-100 rounded-lg max-h-[300px] overflow-y-auto bg-ink-25">
                {itemsLoading ? (
                  <p className="text-xs text-ink-500 text-center py-6">Loading available items…</p>
                ) : filtered.length === 0 ? (
                  <p className="text-xs text-ink-400 text-center py-6">
                    No transferable items at this source shop. Items already in another active transfer are excluded.
                  </p>
                ) : (
                  <table className="w-full text-xs text-left">
                    <thead className="sticky top-0 bg-ink-100 border-b border-ink-200">
                      <tr>
                        <th className="p-2 w-10" />
                        <th className="p-2">SKU / Name</th>
                        <th className="p-2">Kind</th>
                        <th className="p-2 text-right">Weight (mg)</th>
                        <th className="p-2 text-right">Purity</th>
                        <th className="p-2 text-right w-28">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((it) => {
                        const isChecked = (selectedQty[it.id] ?? 0) > 0;
                        const maxQty = it.isSerialized ? 1 : it.quantityOnHand;
                        return (
                          <tr key={it.id} className="border-b border-ink-100 hover:bg-ink-50">
                            <td className="p-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  setSelectedQty((p) => {
                                    const next = { ...p };
                                    if (e.target.checked) next[it.id] = 1;
                                    else delete next[it.id];
                                    return next;
                                  });
                                }}
                                aria-label={`Select ${it.sku}`}
                              />
                            </td>
                            <td className="p-2">
                              <p className="font-semibold text-ink-900">{it.sku}</p>
                              {it.name && (
                                <p className="text-[10px] text-ink-500 truncate max-w-[200px]">{it.name}</p>
                              )}
                            </td>
                            <td className="p-2">
                              {it.isSerialized ? (
                                <Badge tone="neutral">UNIQUE</Badge>
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  <Badge tone="info">LOT</Badge>
                                  <span className="font-mono text-[10px] text-ink-500">
                                    {it.quantityOnHand} on hand
                                  </span>
                                </span>
                              )}
                            </td>
                            <td className="p-2 text-right font-mono">
                              {it.weightMg.toLocaleString('en-IN')}
                            </td>
                            <td className="p-2 text-right">
                              {it.purityCaratX100 === 0 ? '—' : `${(it.purityCaratX100 / 100).toFixed(0)}K`}
                            </td>
                            <td className="p-2 text-right">
                              <input
                                type="number"
                                min={1}
                                max={maxQty}
                                step={1}
                                value={selectedQty[it.id] ?? ''}
                                placeholder={isChecked ? '' : '—'}
                                disabled={!isChecked || it.isSerialized}
                                onChange={(e) => {
                                  const v = Number(e.target.value);
                                  setSelectedQty((p) => ({
                                    ...p,
                                    [it.id]: Math.max(1, Math.min(maxQty, Number.isFinite(v) ? v : 1)),
                                  }));
                                }}
                                aria-label={`Quantity for ${it.sku}`}
                                className="w-20 rounded border border-ink-200 bg-white px-2 py-1 text-right font-mono text-xs disabled:opacity-50 disabled:bg-ink-50"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Running summary of the whole selection. */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-lg border border-ink-100 bg-ink-25 px-3 py-2 text-xs">
              <span className="text-ink-700">
                <span className="font-semibold text-ink-900">{totals.lines}</span> line
                {totals.lines === 1 ? '' : 's'} ·{' '}
                <span className="font-semibold text-ink-900">{totals.units}</span> unit
                {totals.units === 1 ? '' : 's'}
              </span>
              <span className="flex items-center gap-4 text-ink-600">
                <span>
                  Weight <Weight mg={totals.weightMg} className="text-ink-900" />
                </span>
                <span>
                  Value <Money paise={totals.valuePaise} className="text-ink-900" />
                </span>
              </span>
            </div>

            <label className="block">
              <span className="text-eyebrow uppercase text-ink-500 block mb-1">Reason</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className={fieldCls}
                placeholder="Bulk distribution from warehouse to Camp branch for festive season"
                required
              />
            </label>

            <div className="flex gap-2">
              <Button variant="outline" type="button" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isLoading || selectedLines.length === 0}
              >
                {isLoading
                  ? 'Submitting…'
                  : `Request transfer of ${selectedLines.length} line${selectedLines.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
