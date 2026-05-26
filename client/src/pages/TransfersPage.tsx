// Stock transfer workflow — pending requests, approval queue, transit, history.
// Matches the inventory.transfer permission (gated at the route).
//
// State machine (see server/src/modules/transfers/transfers.service.ts):
//   PENDING   -> approve / reject
//   APPROVED  -> complete (mark received at destination)
//   COMPLETED -> read-only
//   REJECTED  -> read-only

import { useMemo, useState } from 'react';
import { Check, X, PackageCheck, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { TransferStatus } from '@goldos/shared/constants';
import {
  useGetTransfersQuery,
  useGetTransferableItemsQuery,
  useCreateTransferMutation,
  useApproveTransferMutation,
  useCompleteTransferMutation,
  useRejectTransferMutation,
  type TransferRow,
} from '@/features/transfers/transfersApi';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import { PageHeader } from '@/components/ui/PageHeader';
import { TabStrip, type TabStripItem } from '@/components/ui/TabStrip';
import { SectionCard } from '@/components/ui/SectionCard';
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
  const shopName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of shopsRes?.data ?? []) m.set(s.id, s.name);
    return m;
  }, [shopsRes?.data]);

  if (isLoading) {
    return (
      <SectionCard>
        <TableSkeleton rows={5} />
      </SectionCard>
    );
  }

  const rows = data?.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        eyebrow="Empty"
        title="No transfers in this state"
        body="Use the 'New transfer' button to send stock from the warehouse to a shop."
      />
    );
  }

  return (
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
              />
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function TransferRowView({
  row,
  fromName,
  toName,
}: {
  row: TransferRow;
  fromName: string;
  toName: string;
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
      <tr className="border-t border-ink-100 hover:bg-ink-25">
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
        <td className="px-4 py-3 text-right">
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

function NewTransferDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const { data: shopsRes } = useGetShopsQuery();
  const shops = useMemo(() => shopsRes?.data ?? [], [shopsRes?.data]);

  // Default source = a warehouse if there is one, otherwise the first shop.
  const initialSource = useMemo(() => {
    const wh = shops.find((s) => s.isWarehouse);
    return wh?.id ?? shops[0]?.id ?? '';
  }, [shops]);

  const [fromShopId, setFromShopId] = useState('');
  const [toShopId, setToShopId] = useState('');
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');

  // Lazily initialise source once shops load. We do this with a derived
  // assignment rather than useEffect to keep the render path simple.
  if (!fromShopId && initialSource) setFromShopId(initialSource);

  const destShops = useMemo(() => shops.filter((s) => s.id !== fromShopId), [shops, fromShopId]);
  if (!toShopId && destShops[0]) setToShopId(destShops[0].id);

  const { data: itemsRes, isLoading: itemsLoading } = useGetTransferableItemsQuery(
    fromShopId ? { shopId: fromShopId } : ({ shopId: '' } as { shopId: string }),
    { skip: !fromShopId },
  );

  const items = useMemo(() => itemsRes?.data ?? [], [itemsRes?.data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      [i.sku, i.name].some((s) => (s ?? '').toLowerCase().includes(q)),
    );
  }, [items, search]);

  const [createTransfer, { isLoading }] = useCreateTransferMutation();

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  function toggleAll(): void {
    const allOn = filtered.length > 0 && filtered.every((i) => selected[i.id]);
    const next = { ...selected };
    for (const i of filtered) next[i.id] = !allOn;
    setSelected(next);
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!fromShopId || !toShopId) return void toast.error('Pick source and destination');
    if (fromShopId === toShopId) return void toast.error('Source and destination must differ');
    if (selectedIds.length === 0) return void toast.error('Select at least one item');
    if (!reason.trim()) return void toast.error('Reason is required');
    try {
      await createTransfer({
        fromShopId,
        toShopId,
        itemIds: selectedIds,
        reason: reason.trim(),
      }).unwrap();
      toast.success(`Transfer requested for ${selectedIds.length} item(s) — awaiting approval`);
      setSelected({});
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
                <span className="text-eyebrow uppercase text-ink-500 block mb-1">From</span>
                <select
                  value={fromShopId}
                  onChange={(e) => {
                    setFromShopId(e.target.value);
                    setSelected({});
                  }}
                  className={fieldCls}
                  required
                >
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.isWarehouse ? ' (warehouse)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-eyebrow uppercase text-ink-500 block mb-1">To</span>
                <select
                  value={toShopId}
                  onChange={(e) => setToShopId(e.target.value)}
                  className={fieldCls}
                  required
                  disabled={destShops.length === 0}
                >
                  {destShops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.isWarehouse ? ' (warehouse)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="border-t border-ink-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-eyebrow uppercase text-ink-500">
                  Select items ({selectedIds.length} selected)
                </span>
                {filtered.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs text-brand-700 hover:underline"
                  >
                    {filtered.every((i) => selected[i.id]) ? 'Clear visible' : 'Select visible'}
                  </button>
                )}
              </div>
              <input
                placeholder="Search SKU or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${fieldCls} mb-2`}
              />
              <div className="border border-ink-100 rounded-lg max-h-[260px] overflow-y-auto bg-ink-25">
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
                        <th className="p-2 text-right">Weight (mg)</th>
                        <th className="p-2 text-right">Purity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((it) => (
                        <tr key={it.id} className="border-b border-ink-100 hover:bg-ink-50">
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={!!selected[it.id]}
                              onChange={() =>
                                setSelected((p) => ({ ...p, [it.id]: !p[it.id] }))
                              }
                              aria-label={`Select ${it.sku}`}
                            />
                          </td>
                          <td className="p-2">
                            <p className="font-semibold text-ink-900">{it.sku}</p>
                            {it.name && (
                              <p className="text-[10px] text-ink-500 truncate max-w-[200px]">{it.name}</p>
                            )}
                          </td>
                          <td className="p-2 text-right font-mono">{it.weightMg.toLocaleString('en-IN')}</td>
                          <td className="p-2 text-right">
                            {it.purityCaratX100 === 0 ? '—' : `${(it.purityCaratX100 / 100).toFixed(0)}K`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
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
              <Button type="submit" className="flex-1" disabled={isLoading || selectedIds.length === 0}>
                {isLoading ? 'Submitting…' : `Request transfer of ${selectedIds.length || ''} item${selectedIds.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
