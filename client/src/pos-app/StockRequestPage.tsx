// POS stock request — a cashier asks the admin to send stock to this shop.
// Each request line targets a category (main / sub) OR a collection, with a
// quantity. The admin reviews + fulfils it via a stock transfer.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PackagePlus, Plus, Trash2, Layers, Sparkles } from 'lucide-react';
import type { Category, Collection, StockRequestLineInput } from '@goldos/shared/types';
import type { StockRequestStatus } from '@goldos/shared/constants';
import { useGetCategoriesQuery, useGetCollectionsQuery } from '@/features/inventory/inventoryApi';
import {
  useGetStockRequestsQuery,
  useCreateStockRequestMutation,
  useCancelStockRequestMutation,
} from '@/features/stock-requests/stockRequestsApi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';

const fieldCls =
  'w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400';

type DraftLine = {
  kind: 'category' | 'collection';
  mainId: string;
  subId: string;
  collectionId: string;
  quantity: number;
  note: string;
};

const STATUS_TONE: Record<StockRequestStatus, 'warning' | 'success' | 'danger' | 'neutral'> = {
  PENDING: 'warning',
  FULFILLED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

export function StockRequestPage(): JSX.Element {
  const { data: catRes } = useGetCategoriesQuery();
  const { data: colRes } = useGetCollectionsQuery();
  const { data: requestsRes, isLoading } = useGetStockRequestsQuery();
  const [createRequest, { isLoading: submitting }] = useCreateStockRequestMutation();
  const [cancelRequest] = useCancelStockRequestMutation();

  const cats = useMemo(() => catRes?.data ?? [], [catRes?.data]);
  const mains = useMemo<Category[]>(() => cats.filter((c) => !c.parentId), [cats]);
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
  const catName = useMemo(() => new Map(cats.map((c) => [c.id, c.name] as const)), [cats]);
  const colName = useMemo(() => new Map(collections.map((c) => [c.id, c.name] as const)), [collections]);

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [note, setNote] = useState('');

  // Inline draft for the next line.
  const [draft, setDraft] = useState<DraftLine>({
    kind: 'category',
    mainId: '',
    subId: '',
    collectionId: '',
    quantity: 1,
    note: '',
  });

  function addLine(): void {
    if (draft.kind === 'category' && !draft.mainId) return void toast.error('Pick a category');
    if (draft.kind === 'collection' && !draft.collectionId) return void toast.error('Pick a collection');
    setLines((prev) => [...prev, draft]);
    setDraft({ kind: draft.kind, mainId: '', subId: '', collectionId: '', quantity: 1, note: '' });
  }

  function removeLine(idx: number): void {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function describeLine(l: DraftLine): string {
    if (l.kind === 'collection') return colName.get(l.collectionId) ?? 'Collection';
    const main = catName.get(l.mainId) ?? 'Category';
    return l.subId ? `${main} › ${catName.get(l.subId) ?? ''}` : `${main} (all)`;
  }

  async function submit(): Promise<void> {
    if (lines.length === 0) return void toast.error('Add at least one line');
    const payloadLines: StockRequestLineInput[] = lines.map((l) =>
      l.kind === 'collection'
        ? { collectionId: l.collectionId, quantity: l.quantity, note: l.note || null }
        : { categoryId: l.subId || l.mainId, quantity: l.quantity, note: l.note || null },
    );
    try {
      await createRequest({ lines: payloadLines, note: note.trim() || null }).unwrap();
      toast.success('Stock request sent to admin');
      setLines([]);
      setNote('');
    } catch (err) {
      const message =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not send request.';
      toast.error(message);
    }
  }

  const requests = requestsRes?.data ?? [];

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
      <header>
        <p className="text-eyebrow uppercase text-ink-500">Replenishment</p>
        <h2 className="font-display text-display-sm text-ink-900">Stock request</h2>
        <p className="text-sm text-ink-500 mt-1">
          Ask the admin to send stock to your shop. Pick a category / sub-category or a collection and the quantity you
          need.
        </p>
      </header>

      {/* Builder ------------------------------------------------------- */}
      <section className="rounded-lg border border-ink-100 bg-ink-0 p-4 space-y-4">
        <p className="text-eyebrow uppercase text-ink-500">New request</p>

        {/* Kind toggle */}
        <div className="inline-flex rounded-md border border-ink-200 overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, kind: 'category' }))}
            className={`px-3 py-1.5 flex items-center gap-1.5 ${
              draft.kind === 'category' ? 'bg-brand-50 text-brand-700' : 'bg-white text-ink-600'
            }`}
          >
            <Layers className="h-3.5 w-3.5" /> Category
          </button>
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, kind: 'collection' }))}
            className={`px-3 py-1.5 flex items-center gap-1.5 border-l border-ink-200 ${
              draft.kind === 'collection' ? 'bg-brand-50 text-brand-700' : 'bg-white text-ink-600'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" /> Collection
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {draft.kind === 'category' ? (
            <>
              <label className="flex-1 min-w-[150px]">
                <span className="text-[10px] uppercase text-ink-500 block mb-0.5">Main category</span>
                <select
                  value={draft.mainId}
                  onChange={(e) => setDraft((d) => ({ ...d, mainId: e.target.value, subId: '' }))}
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
              <label className="flex-1 min-w-[150px]">
                <span className="text-[10px] uppercase text-ink-500 block mb-0.5">Sub-category</span>
                <select
                  value={draft.subId}
                  onChange={(e) => setDraft((d) => ({ ...d, subId: e.target.value }))}
                  className={fieldCls}
                  disabled={!draft.mainId}
                >
                  <option value="">All in main</option>
                  {(subsByMain.get(draft.mainId) ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label className="flex-1 min-w-[200px]">
              <span className="text-[10px] uppercase text-ink-500 block mb-0.5">Collection</span>
              <select
                value={draft.collectionId}
                onChange={(e) => setDraft((d) => ({ ...d, collectionId: e.target.value }))}
                className={fieldCls}
              >
                <option value="">Select…</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="w-20">
            <span className="text-[10px] uppercase text-ink-500 block mb-0.5">Qty</span>
            <input
              type="number"
              min={1}
              value={draft.quantity}
              onChange={(e) => setDraft((d) => ({ ...d, quantity: Math.max(1, Number(e.target.value) || 1) }))}
              className={fieldCls}
            />
          </label>
          <Button type="button" variant="outline" onClick={addLine}>
            <Plus className="h-4 w-4 mr-1" /> Add line
          </Button>
        </div>

        {/* Added lines */}
        {lines.length > 0 && (
          <ul className="space-y-1.5">
            {lines.map((l, idx) => (
              <li
                key={idx}
                className="flex items-center justify-between gap-3 rounded-md border border-ink-100 bg-ink-25 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {l.kind === 'collection' ? (
                    <Badge tone="info">Collection</Badge>
                  ) : (
                    <Badge tone="neutral">Category</Badge>
                  )}
                  <span className="text-ink-900 truncate">{describeLine(l)}</span>
                  <span className="text-ink-500 font-mono">× {l.quantity}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(idx)}
                  className="text-ink-400 hover:text-danger-600 shrink-0"
                  aria-label="Remove line"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="block">
          <span className="text-[10px] uppercase text-ink-500 block mb-0.5">Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className={fieldCls}
            placeholder="Running low on 22K rings for the festive rush"
          />
        </label>

        <Button onClick={submit} disabled={submitting || lines.length === 0} className="gap-1.5">
          <PackagePlus className="h-4 w-4" />
          {submitting ? 'Sending…' : `Send request (${lines.length} line${lines.length === 1 ? '' : 's'})`}
        </Button>
      </section>

      {/* Past requests ------------------------------------------------- */}
      <section className="space-y-3">
        <p className="text-eyebrow uppercase text-ink-500">Your requests</p>
        {isLoading && <p className="text-sm text-ink-500">Loading…</p>}
        {!isLoading && requests.length === 0 && (
          <EmptyState eyebrow="None" title="No requests yet" body="Build a request above and send it to the admin." />
        )}
        <ul className="space-y-2">
          {requests.map((r) => (
            <li key={r.id} className="rounded-md border border-ink-100 bg-ink-0 p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                  <span className="text-xs text-ink-500">
                    {new Date(r.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
                {r.status === 'PENDING' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await cancelRequest(r.id).unwrap();
                        toast.success('Request cancelled');
                      } catch {
                        toast.error('Could not cancel');
                      }
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
              <ul className="text-sm text-ink-700 space-y-0.5">
                {r.lines.map((l) => (
                  <li key={l.id} className="flex items-center gap-2">
                    <span className="text-ink-400">•</span>
                    <span>
                      {l.collection
                        ? l.collection.name
                        : l.category
                          ? l.category.parent
                            ? `${l.category.parent.name} › ${l.category.name}`
                            : l.category.name
                          : '—'}
                    </span>
                    <span className="text-ink-500 font-mono">× {l.quantity}</span>
                  </li>
                ))}
              </ul>
              {r.reviewNote && <p className="text-xs text-ink-500">Admin note: {r.reviewNote}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
