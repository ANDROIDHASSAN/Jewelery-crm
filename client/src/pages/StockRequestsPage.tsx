// Admin "Stock requests" — review replenishment indents filed by POS/shop
// users and fulfil them by creating a pre-filled stock transfer (destination =
// the requesting shop, items auto-added from the requested categories /
// collections). Rejecting closes the request with a note.

import { useMemo, useState } from 'react';
import { Check, X, PackageCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { StockRequestStatus } from '@goldos/shared/constants';
import {
  useGetStockRequestsQuery,
  useRejectStockRequestMutation,
  type StockRequestRow,
} from '@/features/stock-requests/stockRequestsApi';
import { NewTransferDialog, type TransferAutoAdd } from '@/pages/TransfersPage';
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

const TABS: Array<{ id: StockRequestStatus | 'ALL'; label: string }> = [
  { id: 'PENDING', label: 'Pending' },
  { id: 'FULFILLED', label: 'Fulfilled' },
  { id: 'REJECTED', label: 'Rejected' },
  { id: 'ALL', label: 'All' },
];

const STATUS_TONE: Record<StockRequestStatus, 'warning' | 'success' | 'danger' | 'neutral'> = {
  PENDING: 'warning',
  FULFILLED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

function lineLabel(l: StockRequestRow['lines'][number]): string {
  if (l.collection) return l.collection.name;
  if (l.category) return l.category.parent ? `${l.category.parent.name} › ${l.category.name}` : l.category.name;
  return '—';
}

export function StockRequestsPage(): JSX.Element {
  const [tab, setTab] = useState<StockRequestStatus | 'ALL'>('PENDING');
  const tabItems: TabStripItem<StockRequestStatus | 'ALL'>[] = TABS.map((t) => ({ id: t.id, label: t.label }));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Module 01 / Stock"
        title="Stock requests"
        description="Replenishment requests from your shops. Review and fulfil each by sending a stock transfer."
        bare
      />
      <TabStrip<StockRequestStatus | 'ALL'> items={tabItems} value={tab} onChange={setTab} />
      <RequestList status={tab === 'ALL' ? undefined : tab} />
    </div>
  );
}

function RequestList({ status }: { status?: StockRequestStatus }): JSX.Element {
  const { data, isLoading } = useGetStockRequestsQuery(status ? { status } : undefined);
  const [reject] = useRejectStockRequestMutation();
  const [rejectFor, setRejectFor] = useState<StockRequestRow | null>(null);
  // The request being fulfilled — drives the pre-filled transfer composer.
  const [fulfilFor, setFulfilFor] = useState<StockRequestRow | null>(null);

  const rows = data?.data ?? [];

  const autoAdd = useMemo<TransferAutoAdd[]>(
    () =>
      (fulfilFor?.lines ?? []).map((l) => ({
        categoryId: l.categoryId ?? undefined,
        collectionId: l.collectionId ?? undefined,
        quantity: l.quantity,
      })),
    [fulfilFor],
  );

  if (isLoading) {
    return (
      <SectionCard>
        <TableSkeleton rows={5} />
      </SectionCard>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        eyebrow="Empty"
        title="No requests in this state"
        body="Shops raise stock requests from the POS app. They'll appear here for review."
      />
    );
  }

  return (
    <>
      <SectionCard bareBody>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-left">
              <tr className="text-eyebrow uppercase text-ink-500">
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2">Shop</th>
                <th className="px-4 py-2">Requested</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-ink-100 align-top">
                  <td className="px-4 py-3 text-xs text-ink-700 whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-3 text-ink-900">{r.shop?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <ul className="space-y-0.5">
                      {r.lines.map((l) => (
                        <li key={l.id} className="text-ink-700 flex items-center gap-1.5">
                          <Badge tone={l.collection ? 'info' : 'neutral'}>{l.collection ? 'Collection' : 'Category'}</Badge>
                          <span>{lineLabel(l)}</span>
                          <span className="text-ink-500 font-mono">× {l.quantity}</span>
                        </li>
                      ))}
                    </ul>
                    {r.note && <p className="text-xs text-ink-500 mt-1">“{r.note}”</p>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                    {r.reviewNote && <p className="text-[10px] text-ink-500 mt-1">{r.reviewNote}</p>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.status === 'PENDING' && (
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setRejectFor(r)}>
                          <X className="h-3.5 w-3.5" /> Reject
                        </Button>
                        <Button size="sm" onClick={() => setFulfilFor(r)}>
                          <PackageCheck className="h-3.5 w-3.5" /> Fulfil
                        </Button>
                      </div>
                    )}
                    {r.status === 'FULFILLED' && (
                      <span className="inline-flex items-center gap-1 text-xs text-success-700">
                        <Check className="h-3.5 w-3.5" /> Transfer created
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Reject dialog */}
      {rejectFor && (
        <RejectDialog
          onClose={() => setRejectFor(null)}
          onConfirm={async (reviewNote) => {
            try {
              await reject({ id: rejectFor.id, reviewNote }).unwrap();
              toast.success('Request rejected');
              setRejectFor(null);
            } catch (err) {
              const message =
                (err as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not reject.';
              toast.error(message);
            }
          }}
        />
      )}

      {/* Fulfil → pre-filled transfer composer */}
      <NewTransferDialog
        key={fulfilFor?.id ?? 'none'}
        open={Boolean(fulfilFor)}
        onClose={() => setFulfilFor(null)}
        initialToShopId={fulfilFor?.shopId}
        initialStockRequestId={fulfilFor?.id}
        autoAdd={autoAdd}
      />
    </>
  );
}

function RejectDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (reviewNote: string) => Promise<void>;
}): JSX.Element {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Reject stock request</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              await onConfirm(note.trim()).finally(() => setSubmitting(false));
            }}
            className="space-y-4 text-sm"
          >
            <label className="block">
              <span className="text-eyebrow uppercase text-ink-500 block mb-1">Reason (optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className={fieldCls}
                placeholder="Out of stock at the warehouse too — will restock next week."
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
