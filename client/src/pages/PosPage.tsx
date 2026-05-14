// POS — three-pane tablet layout. Cart (left), Search/Scan (center), Customer/Payment (right).
// 44×44 touch targets, mono numbers ≥24px, prominent WhatsApp receipt CTA.

import { useState } from 'react';
import { ScanLine, Search, Trash2, Send, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Money, Weight, Purity } from '@/components/ui/money';
import { Badge } from '@/components/ui/badge';
import { useGetItemsQuery } from '@/features/inventory/inventoryApi';
import { useGetGoldRateQuery } from '@/features/pos/posApi';

interface CartLine {
  id: string;
  sku: string;
  weightMg: number;
  purityCaratX100: number;
  linePaise: number;
}

function rateForPurity(rates: Array<{ purity: number; ratePerGramPaise: number }> | undefined, purity: number): number {
  return rates?.find((r) => r.purity === purity)?.ratePerGramPaise ?? 642_000;
}

function computeGoldValuePaise(weightMg: number, purityCaratX100: number, ratePerGramPaise: number): number {
  // weight (mg) × rate (paise/g) × purity/24K, integer-only.
  return Math.round((weightMg * ratePerGramPaise * purityCaratX100) / (1000 * 2400));
}

export function PosPage(): JSX.Element {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [online] = useState(navigator.onLine);
  const [search, setSearch] = useState('');

  const { data: itemsRes, isLoading: itemsLoading } = useGetItemsQuery({});
  const { data: ratesRes } = useGetGoldRateQuery(undefined, { pollingInterval: 5 * 60_000 });
  const items = itemsRes?.data ?? [];
  const rates = ratesRes?.data;

  const filtered = search.trim()
    ? items.filter((i) =>
        [i.sku, i.barcodeData].some((s) => s.toLowerCase().includes(search.trim().toLowerCase())),
      )
    : items;

  const subtotal = lines.reduce((s, l) => s + l.linePaise, 0);
  const making = Math.round(subtotal * 0.12);
  const gst = Math.round((subtotal + making) * 0.03);
  const total = subtotal + making + gst;

  function addItem(it: (typeof items)[number]): void {
    const linePaise = computeGoldValuePaise(
      it.weightMg,
      it.purityCaratX100,
      rateForPurity(rates, it.purityCaratX100),
    );
    setLines((curr) => [
      ...curr,
      {
        id: `${it.id}-${Date.now()}`,
        sku: it.sku,
        weightMg: it.weightMg,
        purityCaratX100: it.purityCaratX100,
        linePaise,
      },
    ]);
  }

  return (
    <div className="-mx-4 lg:-mx-6 -my-6 h-[calc(100vh-3.5rem)] grid grid-cols-1 lg:grid-cols-[300px_1fr_280px] bg-ink-25">
      {/* Cart pane */}
      <section className="lg:border-r border-ink-100 bg-ink-0 flex flex-col">
        <header className="px-4 h-12 border-b border-ink-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-eyebrow uppercase text-ink-500">Bill</span>
            <Badge tone="neutral">#new</Badge>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            {online ? (
              <><Wifi className="h-3.5 w-3.5 text-success-700" /><span className="text-success-700">Online</span></>
            ) : (
              <><WifiOff className="h-3.5 w-3.5 text-warning-700" /><span className="text-warning-700">Offline · 0 pending</span></>
            )}
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          {lines.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ink-400">Scan or search to add items.</div>
          ) : (
            <ul className="divide-y divide-ink-100">
              {lines.map((l) => (
                <li key={l.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-ink-500">{l.sku}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Weight mg={l.weightMg} />
                      <Purity x100={l.purityCaratX100} />
                    </div>
                  </div>
                  <Money paise={l.linePaise} className="text-base" />
                  <button
                    onClick={() => setLines((curr) => curr.filter((x) => x.id !== l.id))}
                    className="h-9 w-9 -mr-2 -mt-1 inline-flex items-center justify-center text-ink-400 hover:text-danger-700"
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="border-t border-ink-100 px-4 py-3 space-y-2 text-sm">
          <Row label="Subtotal"><Money paise={subtotal} /></Row>
          <Row label="Making (12%)"><Money paise={making} /></Row>
          <Row label="GST (3%)"><Money paise={gst} /></Row>
          <div className="border-t border-ink-100 pt-2 flex items-center justify-between">
            <span className="text-eyebrow uppercase text-ink-500">Total</span>
            <span className="font-mono text-2xl text-ink-900 tabular-nums">
              <Money paise={total} />
            </span>
          </div>
        </footer>
      </section>

      {/* Search / scan pane */}
      <section className="flex flex-col">
        <header className="h-12 px-4 border-b border-ink-100 flex items-center gap-2 bg-ink-0">
          <Search className="h-4 w-4 text-ink-400" />
          <Input
            placeholder="SKU, barcode, or name…"
            className="border-0 focus:ring-0 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button variant="secondary" size="md" className="h-10 px-4">
            <ScanLine className="h-4 w-4" />
            Scan
          </Button>
        </header>
        <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-3 p-4 overflow-y-auto">
          {itemsLoading && <p className="col-span-full text-sm text-ink-500">Loading items…</p>}
          {!itemsLoading && filtered.length === 0 && (
            <p className="col-span-full text-sm text-ink-500">
              {items.length === 0 ? 'No items in stock yet.' : 'No items match this search.'}
            </p>
          )}
          {filtered.slice(0, 24).map((it) => (
            <button
              key={it.id}
              onClick={() => addItem(it)}
              className="aspect-square rounded-md border border-ink-200 bg-ink-0 hover:border-brand-400 hover:bg-brand-50 transition-colors duration-fast p-3 text-left"
            >
              <div className="text-xs font-mono text-ink-500 truncate">{it.sku}</div>
              <div className="mt-2 font-display text-md text-ink-900">
                {(it.weightMg / 1000).toFixed(2)} g
              </div>
              <div className="mt-1 text-xs text-ink-500">
                {it.purityCaratX100 / 100}K · {it.hallmarkStatus.toLowerCase()}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Customer / payment pane */}
      <section className="lg:border-l border-ink-100 bg-ink-0 flex flex-col">
        <header className="px-4 h-12 border-b border-ink-100 flex items-center">
          <span className="text-eyebrow uppercase text-ink-500">Customer</span>
        </header>
        <div className="px-4 py-4 space-y-3">
          <Input placeholder="Search by phone…" inputMode="tel" />
          <Button variant="outline" className="w-full">Walk-in</Button>
        </div>
        <div className="px-4 border-t border-ink-100 py-4 space-y-2">
          <p className="text-eyebrow uppercase text-ink-500">Payment</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" className="h-12">Cash</Button>
            <Button variant="secondary" size="lg" className="h-12">UPI</Button>
            <Button variant="secondary" size="lg" className="h-12">Card</Button>
            <Button variant="secondary" size="lg" className="h-12">Split</Button>
          </div>
        </div>
        <div className="flex-1" />
        <footer className="p-4 border-t border-ink-100 space-y-2">
          <Button size="lg" className="w-full h-14 text-base" disabled={lines.length === 0}>
            <Send className="h-5 w-5" />
            Charge & send WhatsApp
          </Button>
        </footer>
      </section>
    </div>
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
