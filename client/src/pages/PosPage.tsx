// POS — fast touch-optimised billing surface for a tablet/shop counter.
//
// Three panes: Cart (left), Catalog/Search/Scan (center), Customer/Payment (right).
// All money in paise (integer), weight in milligrams. Gold rate pulled from the
// gold-rate worker (Redis-cached) and shown live at the top of the screen.
//
// Hardware barcode scanners (USB HID — Honeywell, Zebra, etc.) emulate a keyboard
// and burst-type characters at ~10ms apart, ending with Enter. We detect that
// pattern at the window level so the cashier never has to focus a specific input.
// Manual SKU search still works via the center input.
//
// Keyboard shortcuts (jewellery shops are keyboard-heavy at the counter):
//   F2     focus search          F4     walk-in customer
//   F9     charge & close bill   Esc    clear search
//
// Payments support split mode: any combination of Cash / UPI / Card / Cheque
// rows whose amounts sum to the bill total. The server stores each row as a
// separate Payment record.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ScanLine, Search, Trash2, Send, Wifi, WifiOff, X, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Money, Weight, Purity } from '@/components/ui/money';
import { Badge } from '@/components/ui/badge';
import { useGetItemsQuery } from '@/features/inventory/inventoryApi';
import {
  useGetGoldRateQuery,
  useLazyFindCustomerQuery,
  useLazyFindItemByBarcodeQuery,
  useCreateBillMutation,
} from '@/features/pos/posApi';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import { pendingCount } from '@/features/pos/offline';
import { printReceipt } from '@/features/pos/printReceipt';
import type { PaymentMode } from '@goldos/shared/constants';
import type { Item } from '@goldos/shared/types';
import { cn } from '@/lib/cn';

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

interface CartLine {
  id: string;
  itemId: string;
  sku: string;
  weightMg: number;
  purityCaratX100: number;
  makingChargeBps: number;
  stoneChargePaise: number;
  ratePerGramPaise: number;
  goldValuePaise: number;
  makingPaise: number;
  linePaise: number;
}

interface CustomerInfo {
  id: string;
  name: string;
  phone: string;
}

interface PaymentRow {
  id: string;
  mode: PaymentMode;
  amountPaise: number;
  reference: string;
}

const GST_BPS = 300; // 3% GST on jewellery (1.5% CGST + 1.5% SGST intra-state).

function rateForPurity(
  rates: Array<{ purity: number; ratePerGramPaise: number; stale: boolean }> | undefined,
  purity: number,
): { paise: number; stale: boolean } {
  const found = rates?.find((r) => r.purity === purity);
  return {
    paise: found?.ratePerGramPaise && found.ratePerGramPaise > 0 ? found.ratePerGramPaise : 642_000,
    stale: found?.stale ?? true,
  };
}

function computeGoldValuePaise(weightMg: number, purityCaratX100: number, ratePerGramPaise: number): number {
  return Math.round((weightMg * ratePerGramPaise * purityCaratX100) / (1000 * 2400));
}

function applyBps(paise: number, bps: number): number {
  return Math.round((paise * bps) / 10_000);
}

function recomputeLine(line: CartLine): CartLine {
  const goldValuePaise = computeGoldValuePaise(line.weightMg, line.purityCaratX100, line.ratePerGramPaise);
  const makingPaise = applyBps(goldValuePaise, line.makingChargeBps);
  return {
    ...line,
    goldValuePaise,
    makingPaise,
    linePaise: goldValuePaise + makingPaise + line.stoneChargePaise,
  };
}

function freshIdempotencyKey(): string {
  // Must match IdempotencyKeySchema (z.string().uuid()). crypto.randomUUID is
  // available in every modern browser and on Node 19+ — fall back to a v4
  // shape if it's missing so old WebViews (KaiOS counter tablets etc.) still
  // generate a valid key.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC 4122 v4 fallback.
  const hex = 'abcdef0123456789';
  const r = (n: number): string => Array.from({ length: n }, () => hex[Math.floor(Math.random() * 16)]).join('');
  return `${r(8)}-${r(4)}-4${r(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${r(3)}-${r(12)}`;
}

function newPaymentRow(mode: PaymentMode, amountPaise = 0): PaymentRow {
  return { id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, mode, amountPaise, reference: '' };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PosPage(): JSX.Element {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [phoneSearch, setPhoneSearch] = useState('');
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([newPaymentRow('CASH')]);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => freshIdempotencyKey());

  // Online/offline mirror. pendingCount is async (Dexie/IndexedDB), so we
  // poll into state instead of reading it synchronously.
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [pending, setPending] = useState<number>(0);
  useEffect(() => {
    const onOnline = (): void => setOnline(true);
    const onOffline = (): void => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const refresh = async (): Promise<void> => setPending(await pendingCount());
    void refresh();
    const t = window.setInterval(() => void refresh(), 5000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.clearInterval(t);
    };
  }, []);

  const { data: itemsRes, isLoading: itemsLoading } = useGetItemsQuery({});
  const { data: shopsRes } = useGetShopsQuery();
  const { data: ratesRes, refetch: refetchRates } = useGetGoldRateQuery(undefined, { pollingInterval: 5 * 60_000 });
  const [findCustomer, { isFetching: lookingUp }] = useLazyFindCustomerQuery();
  const [findItemByBarcode] = useLazyFindItemByBarcodeQuery();
  const [createBill, { isLoading: charging }] = useCreateBillMutation();

  const items = itemsRes?.data ?? [];
  const shops = shopsRes?.data ?? [];
  const rates = ratesRes?.data;

  const [shopId, setShopId] = useState<string>('');
  useEffect(() => {
    if (!shopId && shops[0]) setShopId(shops[0].id);
  }, [shops, shopId]);

  const inStock = items.filter((i) => i.status === 'IN_STOCK');
  const filtered = search.trim()
    ? inStock.filter((i) =>
        [i.sku, i.barcodeData].some((s) => s.toLowerCase().includes(search.trim().toLowerCase())),
      )
    : inStock;

  // Totals — gold + making + stone + 3% GST.
  const subtotal = lines.reduce((s, l) => s + l.goldValuePaise, 0);
  const making = lines.reduce((s, l) => s + l.makingPaise, 0);
  const stone = lines.reduce((s, l) => s + l.stoneChargePaise, 0);
  const taxable = subtotal + making + stone;
  const gst = applyBps(taxable, GST_BPS);
  const total = taxable + gst;
  const paid = payments.reduce((s, p) => s + (Number.isFinite(p.amountPaise) ? p.amountPaise : 0), 0);
  const dueAfterPayments = total - paid;
  const isSplit = payments.length > 1;
  const rateStale = (rates ?? []).some((r) => r.stale);

  // -------------------------------------------------------------------------
  // Add / edit / remove cart lines
  // -------------------------------------------------------------------------

  const addItem = useCallback(
    (it: Item): void => {
      if (lines.some((l) => l.itemId === it.id)) {
        toast.error(`${it.sku} already in bill`);
        return;
      }
      const rate = rateForPurity(rates, it.purityCaratX100);
      const makingBps = it.makingChargeBps ?? 1200;
      const goldValuePaise = computeGoldValuePaise(it.weightMg, it.purityCaratX100, rate.paise);
      const makingPaise = applyBps(goldValuePaise, makingBps);
      const stoneChargePaise = 0;
      setLines((curr) => [
        ...curr,
        {
          id: `${it.id}-${Date.now()}`,
          itemId: it.id,
          sku: it.sku,
          weightMg: it.weightMg,
          purityCaratX100: it.purityCaratX100,
          makingChargeBps: makingBps,
          stoneChargePaise,
          ratePerGramPaise: rate.paise,
          goldValuePaise,
          makingPaise,
          linePaise: goldValuePaise + makingPaise + stoneChargePaise,
        },
      ]);
    },
    [lines, rates],
  );

  function patchLine(id: string, patch: Partial<Pick<CartLine, 'makingChargeBps' | 'stoneChargePaise'>>): void {
    setLines((curr) =>
      curr.map((l) => (l.id === id ? recomputeLine({ ...l, ...patch }) : l)),
    );
  }

  function removeLine(id: string): void {
    setLines((curr) => curr.filter((x) => x.id !== id));
    if (editingLineId === id) setEditingLineId(null);
  }

  // -------------------------------------------------------------------------
  // Hardware barcode scanner — window-level burst keydown detector
  // -------------------------------------------------------------------------

  const scanBuffer = useRef<{ chars: string[]; lastTs: number }>({ chars: [], lastTs: 0 });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      // Skip when typing into a form control — manual entry, not scan.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;
      const now = performance.now();
      const buf = scanBuffer.current;
      const dt = now - buf.lastTs;

      // Reset buffer if too slow (>120ms between chars = human typing).
      if (dt > 120) buf.chars = [];
      buf.lastTs = now;

      if (e.key === 'Enter') {
        if (buf.chars.length >= 4) {
          // Treat as scan completion.
          e.preventDefault();
          const code = buf.chars.join('');
          buf.chars = [];
          void scanCode(code);
          return;
        }
        buf.chars = [];
        return;
      }

      if (e.key.length === 1 && !typing) {
        buf.chars.push(e.key);
      }

      // Keyboard shortcuts — only when not typing in an input.
      if (!typing) {
        if (e.key === 'F2') {
          e.preventDefault();
          document.getElementById('pos-search')?.focus();
        } else if (e.key === 'F4') {
          e.preventDefault();
          setCustomer(null);
          setPhoneSearch('');
          toast.success('Walk-in selected');
        } else if (e.key === 'F9') {
          e.preventDefault();
          void handleCharge();
        } else if (e.key === 'Escape') {
          setSearch('');
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // We want a stable handler — handleCharge reads latest state through the
    // ref chain in createBill; lines/rates are read by the closure here so we
    // intentionally re-attach when those change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, rates, customer, shopId, payments]);

  async function scanCode(code: string): Promise<void> {
    // Fast path: match against already-loaded items.
    const local = inStock.find(
      (i) => i.barcodeData === code || i.sku === code,
    );
    if (local) {
      addItem(local);
      toast.success(`Scanned ${local.sku}`);
      return;
    }
    // Fallback: server lookup (inventory might be paginated).
    try {
      const { data } = await findItemByBarcode({ code }).unwrap();
      addItem(data);
      toast.success(`Scanned ${data.sku}`);
    } catch {
      toast.error(`No in-stock item for code "${code}"`);
    }
  }

  // -------------------------------------------------------------------------
  // Payments — split composer
  // -------------------------------------------------------------------------

  function patchPayment(id: string, patch: Partial<PaymentRow>): void {
    setPayments((curr) => curr.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function addPayment(): void {
    // Pre-fill with the outstanding amount so split is one-click.
    const remaining = Math.max(0, total - paid);
    setPayments((curr) => [...curr, newPaymentRow('UPI', remaining)]);
  }

  function removePayment(id: string): void {
    setPayments((curr) => (curr.length === 1 ? curr : curr.filter((p) => p.id !== id)));
  }

  function autoBalance(): void {
    // Snap the LAST row to absorb whatever's left.
    setPayments((curr) => {
      if (curr.length === 0) return curr;
      const others = curr.slice(0, -1).reduce((s, p) => s + p.amountPaise, 0);
      const last = curr[curr.length - 1]!;
      const remainder = Math.max(0, total - others);
      return [...curr.slice(0, -1), { ...last, amountPaise: remainder }];
    });
  }

  // When the bill total changes and we're on a single payment row, keep it in
  // sync. Split rows the cashier set manually are left alone.
  useEffect(() => {
    if (payments.length === 1 && total >= 0) {
      setPayments([{ ...payments[0]!, amountPaise: total }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  // -------------------------------------------------------------------------
  // Customer
  // -------------------------------------------------------------------------

  async function handlePhoneLookup(): Promise<void> {
    const digits = phoneSearch.replace(/\D/g, '');
    if (digits.length < 10) {
      toast.error('Enter a 10-digit phone number');
      return;
    }
    const phone = digits.startsWith('91') && digits.length === 12 ? `+${digits}` : `+91${digits.slice(-10)}`;
    try {
      const res = await findCustomer({ phone }).unwrap();
      if (res.data) {
        setCustomer({ id: res.data.id, name: res.data.name, phone: res.data.phone });
        toast.success(`Customer: ${res.data.name}`);
      } else {
        toast.message('No customer found for this number', {
          description: 'Bill will be created as walk-in.',
        });
        setCustomer(null);
      }
    } catch {
      toast.error('Lookup failed');
    }
  }

  function setWalkIn(): void {
    setCustomer(null);
    setPhoneSearch('');
  }

  // -------------------------------------------------------------------------
  // Charge
  // -------------------------------------------------------------------------

  async function handleCharge(): Promise<void> {
    if (!shopId) {
      toast.error('Select a shop first');
      return;
    }
    if (lines.length === 0) {
      toast.error('Add at least one item');
      return;
    }
    if (paid !== total) {
      toast.error(
        paid < total
          ? `Short by ₹${((total - paid) / 100).toLocaleString('en-IN')}`
          : `Overpaid by ₹${((paid - total) / 100).toLocaleString('en-IN')}`,
      );
      return;
    }
    // Snapshot the current bill state BEFORE the network round-trip so that
    // (a) the print receipt has stable data, and (b) the optimistic UI reset
    // happens immediately after the toast.
    const snapshotLines = lines;
    const snapshotPayments = payments;
    const snapshotCustomer = customer;
    const snapshotShop = shops.find((s) => s.id === shopId) ?? null;
    const snapshotTotals = {
      subtotalPaise: subtotal,
      makingPaise: making,
      stonePaise: stone,
      cgstPaise: Math.round(gst / 2),
      sgstPaise: gst - Math.round(gst / 2),
      igstPaise: 0,
      discountPaise: 0,
      oldGoldValuePaise: 0,
      totalPaise: total,
    };

    try {
      const res = await createBill({
        shopId,
        customerId: customer?.id ?? null,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          weightMg: l.weightMg,
          purityCaratX100: l.purityCaratX100,
          makingChargeBps: l.makingChargeBps,
          stoneChargePaise: l.stoneChargePaise,
        })),
        discountPaise: 0,
        oldGoldExchange: null,
        payments: payments.map((p) => ({
          mode: p.mode,
          amountPaise: p.amountPaise,
          referenceId: p.reference.trim() || null,
        })),
        idempotencyKey,
      }).unwrap();

      const doPrint = (): void => {
        printReceipt({
          billNumber: res.data.billNumber,
          createdAt: new Date(),
          shop: snapshotShop
            ? { name: snapshotShop.name, address: snapshotShop.address, phone: snapshotShop.phone, gstStateCode: snapshotShop.gstStateCode }
            : { name: 'Showroom' },
          customer: snapshotCustomer,
          lines: snapshotLines.map((l) => ({
            sku: l.sku,
            weightMg: l.weightMg,
            purityCaratX100: l.purityCaratX100,
            ratePerGramPaise: l.ratePerGramPaise,
            makingChargeBps: l.makingChargeBps,
            stoneChargePaise: l.stoneChargePaise,
            goldValuePaise: l.goldValuePaise,
            makingPaise: l.makingPaise,
            linePaise: l.linePaise,
          })),
          totals: snapshotTotals,
          payments: snapshotPayments.map((p) => ({
            mode: p.mode,
            amountPaise: p.amountPaise,
            reference: p.reference.trim() || null,
          })),
        });
      };

      // Fire the print dialog automatically — the cashier's primary expectation.
      doPrint();

      toast.success(`Bill ${res.data.billNumber} created`, {
        description: customer
          ? `WhatsApp receipt queued for ${customer.name}. Print dialog opened.`
          : 'Walk-in receipt — print dialog opened.',
        action: { label: 'Print again', onClick: doPrint },
        duration: 8000,
      });

      // Reset for next bill.
      setLines([]);
      setCustomer(null);
      setPhoneSearch('');
      setPayments([newPaymentRow('CASH')]);
      setIdempotencyKey(freshIdempotencyKey());
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e?.data?.error?.message ?? 'Could not create bill');
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="-mx-3 sm:-mx-4 lg:-mx-6 -my-4 sm:-my-6 min-h-[calc(100vh-3.5rem)] flex flex-col bg-ink-25">
      <RateStrip rates={rates} stale={rateStale} onRefresh={() => void refetchRates()} />

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[260px_1fr] lg:grid-cols-[300px_1fr_320px] min-h-0">
        {/* Cart pane ----------------------------------------------------- */}
        <section className="md:border-r border-ink-100 bg-ink-0 flex flex-col min-h-0">
          <header className="px-4 h-12 border-b border-ink-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-eyebrow uppercase text-ink-500">Bill</span>
              <Badge tone="neutral">#new</Badge>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              {online ? (
                <><Wifi className="h-3.5 w-3.5 text-success-700" /><span className="text-success-700">Online</span></>
              ) : (
                <><WifiOff className="h-3.5 w-3.5 text-warning-700" /><span className="text-warning-700">Offline · {pending} pending</span></>
              )}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto">
            {lines.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-ink-400">
                Scan a barcode or tap an item to start the bill.
                <p className="mt-2 text-[11px] text-ink-400">
                  <kbd className="px-1 rounded bg-ink-100 font-mono">F2</kbd> search ·{' '}
                  <kbd className="px-1 rounded bg-ink-100 font-mono">F9</kbd> charge
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {lines.map((l) => (
                  <CartLineRow
                    key={l.id}
                    line={l}
                    editing={editingLineId === l.id}
                    onToggleEdit={() => setEditingLineId(editingLineId === l.id ? null : l.id)}
                    onPatch={(patch) => patchLine(l.id, patch)}
                    onRemove={() => removeLine(l.id)}
                  />
                ))}
              </ul>
            )}
          </div>

          <footer className="border-t border-ink-100 px-4 py-3 space-y-1.5 text-sm shrink-0">
            <Row label="Gold value"><Money paise={subtotal} /></Row>
            <Row label="Making"><Money paise={making} /></Row>
            {stone > 0 && <Row label="Stone"><Money paise={stone} /></Row>}
            <Row label="GST (3%)"><Money paise={gst} /></Row>
            <div className="border-t border-ink-100 pt-2 flex items-center justify-between">
              <span className="text-eyebrow uppercase text-ink-500">Total</span>
              <Money paise={total} className="font-mono text-2xl text-ink-900 tabular-nums" />
            </div>
            {isSplit && (
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-ink-500">Outstanding</span>
                <span className={cn('font-mono tabular-nums', dueAfterPayments === 0 ? 'text-emerald-700' : 'text-rose-700')}>
                  <Money paise={Math.abs(dueAfterPayments)} />
                  {dueAfterPayments > 0 ? ' short' : dueAfterPayments < 0 ? ' over' : ''}
                </span>
              </div>
            )}
          </footer>
        </section>

        {/* Search / scan pane ------------------------------------------- */}
        <section className="flex flex-col min-h-0">
          <header className="h-12 px-3 sm:px-4 border-b border-ink-100 flex items-center gap-2 bg-ink-0 shrink-0">
            <Search className="h-4 w-4 text-ink-400 shrink-0" />
            <Input
              id="pos-search"
              placeholder="SKU, barcode, or name… (F2)"
              className="border-0 focus:ring-0 h-9 min-w-0"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <Button
              variant="secondary"
              size="md"
              className="h-10 px-3 sm:px-4 shrink-0"
              onClick={() => {
                document.getElementById('pos-search')?.focus();
                toast.message('Scanner ready', { description: 'Scan the barcode now.' });
              }}
            >
              <ScanLine className="h-4 w-4" />
              <span className="hidden sm:inline">Scan</span>
            </Button>
            {shops.length > 1 && (
              <select
                value={shopId}
                onChange={(e) => setShopId(e.target.value)}
                className="h-10 text-sm border border-ink-200 rounded-md px-2 bg-ink-0 shrink-0 max-w-[120px]"
              >
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </header>
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-3 sm:p-4 overflow-y-auto">
            {itemsLoading && <p className="col-span-full text-sm text-ink-500">Loading items…</p>}
            {!itemsLoading && filtered.length === 0 && (
              <p className="col-span-full text-sm text-ink-500">
                {inStock.length === 0 ? 'No items in stock yet.' : 'No items match this search.'}
              </p>
            )}
            {filtered.slice(0, 60).map((it) => (
              <button
                key={it.id}
                onClick={() => addItem(it)}
                className="aspect-square rounded-md border border-ink-200 bg-ink-0 hover:border-brand-400 hover:bg-brand-50 active:bg-brand-100 transition-colors duration-fast p-3 text-left"
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

        {/* Customer / payment pane -------------------------------------- */}
        <section className="md:col-span-2 lg:col-span-1 lg:border-l border-ink-100 bg-ink-0 flex flex-col min-h-0">
          <header className="px-4 h-12 border-b border-ink-100 flex items-center justify-between shrink-0">
            <span className="text-eyebrow uppercase text-ink-500">Customer</span>
            {customer && (
              <button
                onClick={() => setCustomer(null)}
                className="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1"
              >
                Clear <X className="h-3 w-3" />
              </button>
            )}
          </header>
          <div className="px-4 py-4 space-y-3 shrink-0">
            {customer ? (
              <div className="rounded-md border border-brand-200 bg-brand-50 px-3 py-2">
                <p className="font-medium text-ink-900">{customer.name}</p>
                <p className="font-mono text-xs text-ink-600">{customer.phone}</p>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input
                    placeholder="Search by phone…"
                    inputMode="tel"
                    value={phoneSearch}
                    onChange={(e) => setPhoneSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handlePhoneLookup();
                    }}
                  />
                  <Button variant="secondary" onClick={() => void handlePhoneLookup()} disabled={lookingUp} className="px-3">
                    {lookingUp ? '…' : 'Find'}
                  </Button>
                </div>
                <Button variant="outline" className="w-full" onClick={setWalkIn}>
                  Walk-in (F4)
                </Button>
              </>
            )}
          </div>

          <div className="px-4 border-t border-ink-100 py-4 space-y-3 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="text-eyebrow uppercase text-ink-500">Payment</p>
              <button
                type="button"
                onClick={addPayment}
                className="text-xs text-brand-700 hover:text-brand-800 inline-flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add split
              </button>
            </div>
            <ul className="space-y-2">
              {payments.map((p) => (
                <PaymentRowEditor
                  key={p.id}
                  row={p}
                  canRemove={payments.length > 1}
                  onPatch={(patch) => patchPayment(p.id, patch)}
                  onRemove={() => removePayment(p.id)}
                />
              ))}
            </ul>
            {isSplit && (
              <button
                type="button"
                onClick={autoBalance}
                className="w-full text-xs text-ink-600 hover:text-ink-900 inline-flex items-center justify-center gap-1 py-1.5 border border-dashed border-ink-200 rounded-md"
              >
                Auto-balance last row to total
              </button>
            )}
          </div>

          <footer className="p-4 border-t border-ink-100 space-y-2 shrink-0">
            <Button
              size="lg"
              className="w-full h-14 text-base"
              disabled={lines.length === 0 || charging || !shopId || paid !== total}
              onClick={() => void handleCharge()}
            >
              <Send className="h-5 w-5" />
              {charging
                ? 'Charging…'
                : lines.length === 0
                ? 'No items'
                : paid !== total
                ? paid < total
                  ? `Short by ₹${((total - paid) / 100).toLocaleString('en-IN')}`
                  : `Overpaid by ₹${((paid - total) / 100).toLocaleString('en-IN')}`
                : 'Charge & send receipt (F9)'}
            </Button>
          </footer>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RateStrip({
  rates,
  stale,
  onRefresh,
}: {
  rates: Array<{ purity: number; ratePerGramPaise: number; stale: boolean; asOf: string }> | undefined;
  stale: boolean;
  onRefresh: () => void;
}): JSX.Element {
  // 9K is the published gold rate everywhere — dashboard, storefront, POS.
  // Bill lines still price each piece at its own registered purity; this strip
  // is the quoted rate, not the billing rate.
  const g9 = rates?.find((r) => r.purity === 900);
  const silver = rates?.find((r) => r.purity === 0);
  const fmt = (paise: number | undefined): string =>
    paise && paise > 0 ? `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}/g` : '—';
  return (
    <div className={cn(
      'h-10 px-3 sm:px-4 border-b flex items-center justify-between text-xs shrink-0 overflow-x-auto',
      stale ? 'bg-warning-50 border-warning-200 text-warning-800' : 'bg-ink-900 border-ink-900 text-ink-0',
    )}>
      <div className="flex items-center gap-2 sm:gap-4 font-mono tabular-nums whitespace-nowrap">
        <span>9K <strong className={stale ? 'text-warning-800' : 'text-brand-300'}>{fmt(g9?.ratePerGramPaise)}</strong></span>
        <span className={stale ? 'opacity-70' : 'text-ink-300'}>·</span>
        <span>Silver {fmt(silver?.ratePerGramPaise)}</span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 whitespace-nowrap shrink-0 pl-3">
        {stale && <span className="hidden md:inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-warning-500 animate-pulse" /> Rate is stale — refresh before billing</span>}
        <button
          type="button"
          onClick={onRefresh}
          className={cn('inline-flex items-center gap-1 hover:opacity-100', stale ? 'opacity-90' : 'opacity-70 hover:opacity-100')}
          aria-label="Refresh gold rate"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>
    </div>
  );
}

function CartLineRow({
  line,
  editing,
  onToggleEdit,
  onPatch,
  onRemove,
}: {
  line: CartLine;
  editing: boolean;
  onToggleEdit: () => void;
  onPatch: (patch: Partial<Pick<CartLine, 'makingChargeBps' | 'stoneChargePaise'>>) => void;
  onRemove: () => void;
}): JSX.Element {
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggleEdit}
          className="flex-1 min-w-0 text-left"
          aria-expanded={editing}
        >
          <p className="font-mono text-xs text-ink-500">{line.sku}</p>
          <div className="flex items-center gap-2 mt-1">
            <Weight mg={line.weightMg} />
            <Purity x100={line.purityCaratX100} />
          </div>
          <p className="text-[11px] text-ink-500 mt-0.5">
            Making {(line.makingChargeBps / 100).toFixed(1)}%
            {line.stoneChargePaise > 0 && <> · Stone ₹{(line.stoneChargePaise / 100).toLocaleString('en-IN')}</>}
          </p>
        </button>
        <Money paise={line.linePaise} className="text-base" />
        <button
          onClick={onRemove}
          className="h-9 w-9 -mr-2 -mt-1 inline-flex items-center justify-center text-ink-400 hover:text-danger-700"
          aria-label="Remove line"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {editing && (
        <div className="mt-2 p-2 rounded-md bg-ink-25 border border-ink-100 grid grid-cols-2 gap-2 text-xs">
          <label className="block">
            <span className="block text-ink-500 mb-1">Making %</span>
            <input
              type="number"
              min={0}
              max={50}
              step={0.5}
              value={line.makingChargeBps / 100}
              onChange={(e) => {
                const pct = Number(e.target.value);
                if (Number.isFinite(pct) && pct >= 0 && pct <= 50) {
                  onPatch({ makingChargeBps: Math.round(pct * 100) });
                }
              }}
              className="w-full h-9 px-2 rounded border border-ink-200 bg-ink-0 font-mono tabular-nums focus:border-brand-400 outline-none"
            />
          </label>
          <label className="block">
            <span className="block text-ink-500 mb-1">Stone ₹</span>
            <input
              type="number"
              min={0}
              step={1}
              value={line.stoneChargePaise / 100}
              onChange={(e) => {
                const rupees = Number(e.target.value);
                if (Number.isFinite(rupees) && rupees >= 0) {
                  onPatch({ stoneChargePaise: Math.round(rupees * 100) });
                }
              }}
              className="w-full h-9 px-2 rounded border border-ink-200 bg-ink-0 font-mono tabular-nums focus:border-brand-400 outline-none"
            />
          </label>
        </div>
      )}
    </li>
  );
}

const PAYMENT_MODES: ReadonlyArray<{ value: PaymentMode; label: string }> = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CARD', label: 'Card' },
  { value: 'CHEQUE', label: 'Cheque' },
];

function PaymentRowEditor({
  row,
  canRemove,
  onPatch,
  onRemove,
}: {
  row: PaymentRow;
  canRemove: boolean;
  onPatch: (patch: Partial<PaymentRow>) => void;
  onRemove: () => void;
}): JSX.Element {
  const needsRef = row.mode === 'UPI' || row.mode === 'CARD' || row.mode === 'CHEQUE';
  return (
    <li className="rounded-md border border-ink-100 bg-ink-25 p-2 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <select
          value={row.mode}
          onChange={(e) => onPatch({ mode: e.target.value as PaymentMode })}
          className="h-10 rounded-md border border-ink-200 bg-ink-0 text-sm px-2 focus:border-brand-400 outline-none"
        >
          {PAYMENT_MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={1}
          value={row.amountPaise / 100}
          onChange={(e) => {
            const rupees = Number(e.target.value);
            if (Number.isFinite(rupees) && rupees >= 0) {
              onPatch({ amountPaise: Math.round(rupees * 100) });
            }
          }}
          className="h-10 rounded-md border border-ink-200 bg-ink-0 text-sm px-2 font-mono tabular-nums text-right focus:border-brand-400 outline-none"
          placeholder="₹ amount"
        />
      </div>
      {needsRef && (
        <input
          type="text"
          value={row.reference}
          onChange={(e) => onPatch({ reference: e.target.value })}
          placeholder={
            row.mode === 'UPI' ? 'UPI txn id' : row.mode === 'CARD' ? 'Last 4 of card' : 'Cheque number'
          }
          className="w-full h-9 rounded-md border border-ink-200 bg-ink-0 text-xs px-2 font-mono focus:border-brand-400 outline-none"
        />
      )}
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-[11px] text-ink-500 hover:text-rose-700 inline-flex items-center gap-1"
        >
          <X className="h-3 w-3" /> Remove
        </button>
      )}
    </li>
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
