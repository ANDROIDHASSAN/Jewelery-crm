// Gold-OS style POS billing surface.
//
// Layout (lg+):
//   ┌──────────┬───────────────────────┬────────────────┬───────────────┐
//   │ Cat rail │ Search + product grid │ Bill summary   │ Payment panel │
//   │ All      │                       │ + line items   │ + customer    │
//   │ Rings    │ [card][card][card]    │ + totals       │ + modes       │
//   │ ...      │                       │                │ + paid amt    │
//   ├──────────┴───────────────────────┴────────────────┴───────────────┤
//   │ Till Open · Float · Cash in drawer · Print · WhatsApp · Save      │
//   └────────────────────────────────────────────────────────────────────┘
//
// On md the catalog + bill share a column with the payment panel folding
// below; on sm the whole thing stacks. The bottom status strip stays sticky.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Filter,
  Hand,
  ImagePlus,
  Plus,
  Printer,
  Save,
  Search,
  Send,
  Trash2,
  Upload,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import {
  cloudinaryThumb,
  isCloudinaryConfigured,
  uploadImageToCloudinary,
} from '@/lib/cloudinary';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import {
  useGetItemsQuery,
  useGetCategoriesQuery,
  useCreateItemMutation,
} from '@/features/inventory/inventoryApi';
import {
  useGetGoldRateQuery,
  useLazyFindCustomerQuery,
  useCreateBillMutation,
} from '@/features/pos/posApi';
import { useGetOpenSessionQuery, useParkBillMutation } from './posFeaturesApi';
import { OpenRegisterGate } from './OpenRegisterGate';
import { enqueueOffline, isReallyOnline } from '@/features/pos/offline';
import type { Item } from '@goldos/shared/types';
import type { PaymentMode } from '@goldos/shared/constants';
import { computeBillTotals } from '@goldos/shared/bill-math';

// ---------------------------------------------------------------------------
// Types & helpers (mirror PosPage so swapping the surface is risk-free)
// ---------------------------------------------------------------------------

interface CartLine {
  id: string;
  itemId: string;
  sku: string;
  name: string;
  /** First image (Cloudinary URL) if the item has one — shown in the bill thumbnail. */
  imageUrl: string | null;
  categoryId: string;
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
  loyaltyPoints?: number;
}

interface PaymentRow {
  id: string;
  mode: PaymentMode;
  amountPaise: number;
  reference: string;
}

interface OldGoldExchange {
  weightMg: number;
  purityCaratX100: number;
}

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
  // Silver is stored as purity=0 with the silver rate already in paise/g, so
  // we skip the carat-ratio scaling for it (otherwise 0/2400 = 0 and every
  // silver line displays ₹0).
  if (purityCaratX100 === 0) {
    return Math.round((weightMg * ratePerGramPaise) / 1000);
  }
  // weight × rate × (purity/2400) → all integer maths, paise out.
  return Math.round((weightMg * ratePerGramPaise * purityCaratX100) / (1000 * 2400));
}

function applyBps(paise: number, bps: number): number {
  return Math.round((paise * bps) / 10_000);
}

function freshIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const hex = 'abcdef0123456789';
  const r = (n: number): string =>
    Array.from({ length: n }, () => hex[Math.floor(Math.random() * 16)]).join('');
  return `${r(8)}-${r(4)}-4${r(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${r(3)}-${r(12)}`;
}

function newPaymentRow(mode: PaymentMode, amountPaise = 0): PaymentRow {
  return {
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    mode,
    amountPaise,
    reference: '',
  };
}

const PURITY_LABEL: Record<number, string> = {
  2400: '24K',
  2200: '22K',
  1800: '18K',
  1400: '14K',
  0: 'Silver',
  9500: 'Pt',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function PosCounterPage(): JSX.Element {
  // Mounts the billing surface inside an OpenRegisterGate so the cashier
  // can't ring up a single rupee before opening the till.
  return (
    <OpenRegisterGate>
      <PosBillingScreen />
    </OpenRegisterGate>
  );
}

function PosBillingScreen(): JSX.Element {
  const user = useAppSelector((s) => s.auth.user);
  const { data: shopsData } = useGetShopsQuery();
  const shopId = user?.shopId ?? shopsData?.data?.[0]?.id ?? '';
  const shop = shopsData?.data.find((s) => s.id === shopId) ?? null;

  const { data: itemsRes, isLoading: itemsLoading } = useGetItemsQuery({ shopId: shopId || undefined });
  const { data: categoriesRes } = useGetCategoriesQuery();
  const { data: ratesRes } = useGetGoldRateQuery(undefined, { pollingInterval: 60_000 });
  const { data: sessionData } = useGetOpenSessionQuery(shopId, { skip: !shopId });
  const [findCustomer, { isFetching: lookingUp }] = useLazyFindCustomerQuery();
  const [createBill, { isLoading: charging }] = useCreateBillMutation();
  const [parkBill, { isLoading: parking }] = useParkBillMutation();
  const [createItem, { isLoading: addingItem }] = useCreateItemMutation();

  const items = itemsRes?.data ?? [];
  const categories = categoriesRes?.data ?? [];
  const rates = ratesRes?.data;
  const session = sessionData?.data;

  // ── State ─────────────────────────────────────────────────────────────
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [purityFilter, setPurityFilter] = useState<number | 'ALL'>('ALL');

  const [lines, setLines] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [phoneSearch, setPhoneSearch] = useState('');
  const [discountRupees, setDiscountRupees] = useState('');
  const [discountIsPct, setDiscountIsPct] = useState(false);
  const [loyaltyApply, setLoyaltyApply] = useState('');
  const [exchange, setExchange] = useState<OldGoldExchange | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([newPaymentRow('CASH')]);
  const [tab, setTab] = useState<'payment' | 'customer'>('payment');
  const [billNumber] = useState<string>(() => `INV-${(Math.floor(Math.random() * 90_000) + 10_000)}`);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => freshIdempotencyKey());
  const [addItemOpen, setAddItemOpen] = useState(false);



  // Last successfully committed bill — drives the Print + WhatsApp buttons
  // in the status bar. They were `disabled` placeholders for months; now
  // they wire to the server's PDF endpoint and a wa.me deep link.
  const [lastBill, setLastBill] = useState<{
    id: string;
    billNumber: string;
    totalPaise: number;
    customerName: string | null;
    customerPhone: string | null;
  } | null>(null);

  // Mobile / tablet: collapse the right rail into a drawer.
  const [billDrawerOpen, setBillDrawerOpen] = useState(false);

  // ── Item counts per category for the rail ─────────────────────────────
  const inStock = useMemo(() => items.filter((i) => i.status === 'IN_STOCK'), [items]);
  const itemsByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of inStock) {
      map.set(it.categoryId, (map.get(it.categoryId) ?? 0) + 1);
    }
    return map;
  }, [inStock]);

  // ── Filtered catalog ──────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    let pool = inStock;
    if (selectedCategoryId !== 'ALL') {
      pool = pool.filter((i) => i.categoryId === selectedCategoryId);
    }
    if (purityFilter !== 'ALL') {
      pool = pool.filter((i) => i.purityCaratX100 === purityFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      pool = pool.filter((i) =>
        [i.sku, i.barcodeData, (i as Item & { name?: string }).name].some((s) =>
          (s ?? '').toString().toLowerCase().includes(q),
        ),
      );
    }
    return pool;
  }, [inStock, selectedCategoryId, purityFilter, search]);

  // ── Totals ────────────────────────────────────────────────────────────
  // All taxable math goes through the shared `computeBillTotals` helper so
  // the cashier's screen and the server's persisted numbers cannot drift.
  // Previously this surface applied wastage to NEW sales (server didn't)
  // and subtracted discount/loyalty from the taxable base (server doesn't),
  // which meant the customer was sometimes told a different total than the
  // receipt then printed.
  const subtotal = lines.reduce((s, l) => s + l.goldValuePaise, 0);
  const making = lines.reduce((s, l) => s + l.makingPaise, 0);
  const stone = lines.reduce((s, l) => s + l.stoneChargePaise, 0);

  const exchangeRate = exchange ? rateForPurity(rates, exchange.purityCaratX100).paise : 0;

  const subTotalWithCharges = subtotal + making + stone;
  const discountPaise = (() => {
    const num = Number(discountRupees.replace(/,/g, '')) || 0;
    if (discountIsPct) {
      const pct = Math.max(0, Math.min(100, num));
      return applyBps(subTotalWithCharges, pct * 100);
    }
    return Math.round(num * 100);
  })();

  const loyaltyPaise = (() => {
    const pts = Number(loyaltyApply) || 0;
    return pts * 100; // 1 pt = ₹1 (placeholder)
  })();

  const totals = computeBillTotals({
    lines: lines.map((l) => ({
      goldValuePaise: l.goldValuePaise,
      makingPaise: l.makingPaise,
      stoneChargePaise: l.stoneChargePaise,
    })),
    oldGold: exchange && exchange.weightMg > 0
      ? {
          weightMg: exchange.weightMg,
          purityCaratX100: exchange.purityCaratX100,
          ratePerGramPaise: exchangeRate,
        }
      : null,
    discountPaise,
    loyaltyPaise,
    shopStateCode: shop?.gstStateCode ?? '06',
    customerStateCode: null,
  });

  const exchangeValue = totals.oldGoldValuePaise;
  const cgst = totals.cgstPaise;
  const sgst = totals.sgstPaise;
  const igst = totals.igstPaise;
  const grandTotal = totals.totalPaise;
  const paid = payments.reduce((s, p) => s + (Number.isFinite(p.amountPaise) ? p.amountPaise : 0), 0);
  const dueAfterPayments = grandTotal - paid;

  // ── Cart actions ──────────────────────────────────────────────────────
  const addItem = useCallback(
    (it: Item): void => {
      if (lines.some((l) => l.itemId === it.id)) {
        toast.error(`${it.sku} is already in the bill`);
        return;
      }
      const rate = rateForPurity(rates, it.purityCaratX100);
      const makingBps = it.makingChargeBps ?? 1200;
      const goldValue = computeGoldValuePaise(it.weightMg, it.purityCaratX100, rate.paise);
      const makingPaise = applyBps(goldValue, makingBps);
      setLines((curr) => [
        ...curr,
        {
          id: `${it.id}-${Date.now()}`,
          itemId: it.id,
          sku: it.sku,
          name: (it as Item & { name?: string | null }).name?.trim() || it.sku,
          imageUrl: (it as Item & { images?: string[] }).images?.[0] ?? null,
          categoryId: it.categoryId,
          weightMg: it.weightMg,
          purityCaratX100: it.purityCaratX100,
          makingChargeBps: makingBps,
          stoneChargePaise: 0,
          ratePerGramPaise: rate.paise,
          goldValuePaise: goldValue,
          makingPaise,
          linePaise: goldValue + makingPaise,
        },
      ]);
    },
    [lines, rates],
  );

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Resume draft from sessionStorage on load if present.
  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem('zelora.pos.resumeDraft');
      if (stored && items.length > 0) {
        const draft = JSON.parse(stored);
        window.sessionStorage.removeItem('zelora.pos.resumeDraft');

        if (draft.lines && Array.isArray(draft.lines)) {
          const newLines: CartLine[] = [];
          for (const dl of draft.lines) {
            const it = items.find((i) => i.id === dl.itemId);
            if (it) {
              const rate = rateForPurity(rates, it.purityCaratX100);
              const makingBps = dl.makingChargeBps ?? it.makingChargeBps ?? 1200;
              const goldValue = computeGoldValuePaise(it.weightMg, it.purityCaratX100, rate.paise);
              const makingPaise = applyBps(goldValue, makingBps);
              newLines.push({
                id: `${it.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                itemId: it.id,
                sku: it.sku,
                name: (it as Item & { name?: string | null }).name?.trim() || it.sku,
                imageUrl: (it as Item & { images?: string[] }).images?.[0] ?? null,
                categoryId: it.categoryId,
                weightMg: it.weightMg,
                purityCaratX100: it.purityCaratX100,
                makingChargeBps: makingBps,
                stoneChargePaise: dl.stoneChargePaise ?? 0,
                ratePerGramPaise: rate.paise,
                goldValuePaise: goldValue,
                makingPaise,
                linePaise: goldValue + makingPaise + (dl.stoneChargePaise ?? 0),
              });
            }
          }
          setLines(newLines);
        }

        if (draft.discountPaise) {
          setDiscountRupees(String(draft.discountPaise / 100));
          setDiscountIsPct(false);
        }

        if (draft.payments && Array.isArray(draft.payments)) {
          setPayments(draft.payments);
        }

        if (draft.customer) {
          setCustomer(draft.customer);
          setPhoneSearch(draft.customer.phone || '');
        }

        toast.success('Parked bill cart loaded');
      }
    } catch (e) {
      console.error('Failed to restore draft', e);
    }
  }, [items, rates]);

  // Focus search box with F2 key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearchSubmit = useCallback(() => {
    const q = search.trim().toLowerCase();
    if (!q) return;

    // Find an item that has an exact SKU or barcodeData match in stock.
    const exactMatch = inStock.find(
      (it) => it.sku.toLowerCase() === q || it.barcodeData.toLowerCase() === q
    );

    if (exactMatch) {
      addItem(exactMatch);
      setSearch(''); // Clear search input on successful scan/match!
      toast.success(`Scanned and added ${exactMatch.sku}`);
    } else {
      toast.error(`No in-stock item found matching "${search}"`);
    }
  }, [search, inStock, addItem]);

  function removeLine(id: string): void {
    setLines((curr) => curr.filter((l) => l.id !== id));
  }

  function clearCart(): void {
    if (lines.length === 0) return;
    if (!confirm('Clear all items from this bill?')) return;
    setLines([]);
    setCustomer(null);
    setDiscountRupees('');
    setExchange(null);
    setPayments([newPaymentRow('CASH')]);
  }

  // ── Customer lookup ───────────────────────────────────────────────────
  async function doCustomerLookup(): Promise<void> {
    const cleaned = phoneSearch.trim();
    if (!cleaned) {
      toast.error('Enter a phone number first');
      return;
    }
    const normalised = cleaned.startsWith('+91') ? cleaned : `+91${cleaned.replace(/\D/g, '')}`;
    try {
      const res = await findCustomer({ phone: normalised }).unwrap();
      const data = res.data;
      if (!data) {
        toast.message('No customer found — they will be saved as a walk-in.');
        setCustomer(null);
        return;
      }
      setCustomer({
        id: data.id,
        name: data.name,
        phone: data.phone,
        loyaltyPoints: (data as { loyaltyPoints?: number }).loyaltyPoints ?? 0,
      });
      toast.success(`Found ${data.name}`);
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Lookup failed');
    }
  }

  function clearCustomer(): void {
    setCustomer(null);
    setPhoneSearch('');
  }

  // ── Payment helpers ───────────────────────────────────────────────────
  function setSinglePayment(mode: PaymentMode): void {
    setPayments([{ ...newPaymentRow(mode, grandTotal), id: 'p-primary' }]);
  }
  function patchPayment(id: string, patch: Partial<PaymentRow>): void {
    setPayments((curr) => curr.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function addSplit(): void {
    setPayments((curr) => [...curr, newPaymentRow('UPI', Math.max(0, grandTotal - paid))]);
  }
  function removeSplit(id: string): void {
    setPayments((curr) => (curr.length > 1 ? curr.filter((p) => p.id !== id) : curr));
  }

  // ── Charge / park ─────────────────────────────────────────────────────
  async function charge(): Promise<void> {
    if (!shopId) {
      toast.error('No shop assigned');
      return;
    }
    if (lines.length === 0) {
      toast.error('Add at least one item');
      return;
    }
    if (Math.abs(dueAfterPayments) > 100) {
      toast.error(
        dueAfterPayments > 0
          ? `Short ₹${Math.abs(dueAfterPayments / 100).toFixed(2)} of grand total`
          : `Over by ₹${Math.abs(dueAfterPayments / 100).toFixed(2)}`,
      );
      return;
    }
    // Build the bill payload once so we can either send it now or enqueue it
    // for later, byte-identical. The server is idempotent on idempotencyKey,
    // so a queued bill that eventually drains will produce one Bill row even
    // if the cashier re-rings it locally.
    const billPayload = {
      shopId,
      customerId: customer?.id ?? null,
      lines: lines.map((l) => ({
        itemId: l.itemId,
        weightMg: l.weightMg,
        purityCaratX100: l.purityCaratX100,
        makingChargeBps: l.makingChargeBps,
        stoneChargePaise: l.stoneChargePaise,
      })),
      discountPaise,
      oldGoldExchange: exchange,
      payments: payments
        .filter((p) => p.amountPaise > 0)
        .map((p) => ({ mode: p.mode, amountPaise: p.amountPaise, referenceId: p.reference || null })),
      idempotencyKey,
    };

    // Offline-first: if we know we have no real connectivity, persist to
    // IndexedDB and let the background syncer drain when we come back. The
    // cashier sees a clear "queued" toast and the counter resets so the
    // next sale isn't blocked.
    const online = await isReallyOnline();
    if (!online) {
      await enqueueOffline(idempotencyKey, billPayload);
      toast.success(`Bill ${billNumber} saved offline`, {
        description: 'Will sync the moment connection returns.',
      });
      setLines([]);
      setCustomer(null);
      setDiscountRupees('');
      setExchange(null);
      setLoyaltyApply('');
      setPayments([newPaymentRow('CASH')]);
      setIdempotencyKey(freshIdempotencyKey());
      return;
    }

    try {
      const result = await createBill(billPayload as never).unwrap();
      const posted = result.data;
      // Keep a handle on the just-posted bill so the cashier can re-print
      // it or send it on WhatsApp from the status bar even after the form
      // resets for the next customer.
      setLastBill({
        id: posted.id,
        billNumber: posted.billNumber,
        totalPaise: posted.totalPaise,
        customerName: customer?.name ?? null,
        customerPhone: customer?.phone ?? null,
      });
      toast.success(`Bill ${posted.billNumber} posted`);
      // Reset for next bill.
      setLines([]);
      setCustomer(null);
      setDiscountRupees('');
      setExchange(null);
      setLoyaltyApply('');
      setPayments([newPaymentRow('CASH')]);
      setIdempotencyKey(freshIdempotencyKey());
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      // Network errors land here too (fetch threw). Save offline rather than
      // lose the sale — a misconfigured Wi-Fi shouldn't cost a real
      // customer's bill.
      const message = e.data?.error?.message;
      if (!message) {
        await enqueueOffline(idempotencyKey, billPayload);
        toast.warning(`Bill ${billNumber} saved offline (network blip)`, {
          description: 'Will sync the moment connection returns.',
        });
        setLines([]);
        setCustomer(null);
        setDiscountRupees('');
        setExchange(null);
        setLoyaltyApply('');
        setPayments([newPaymentRow('CASH')]);
        setIdempotencyKey(freshIdempotencyKey());
        return;
      }
      toast.error(message);
    }
  }

  async function onPark(): Promise<void> {
    if (lines.length === 0) {
      toast.error('Nothing to park');
      return;
    }
    try {
      await parkBill({
        shopId,
        customerLabel: customer?.name ?? (phoneSearch || 'Walk-in'),
        customerPhone: customer?.phone ?? null,
        draft: {
          lines: lines.map((l) => ({
            itemId: l.itemId,
            weightMg: l.weightMg,
            purityCaratX100: l.purityCaratX100,
            makingChargeBps: l.makingChargeBps,
            stoneChargePaise: l.stoneChargePaise,
          })),
          discountPaise,
          payments,
          customer,
        },
      }).unwrap();
      toast.success('Bill parked — ready for next customer');
      setLines([]);
      setCustomer(null);
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Could not park');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Main billing region ------------------------------------------- */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Categories rail */}
        <CategoryRail
          categories={categories}
          itemsByCategory={itemsByCategory}
          totalCount={inStock.length}
          selected={selectedCategoryId}
          onSelect={setSelectedCategoryId}
        />

        {/* Catalog area */}
        <section className="flex-1 min-w-0 flex flex-col bg-ink-25 border-r border-ink-100">
          <CatalogToolbar
            search={search}
            onSearchChange={setSearch}
            purity={purityFilter}
            onPurityChange={setPurityFilter}
            onAddItem={() => setAddItemOpen(true)}
            onOpenBillDrawer={() => setBillDrawerOpen(true)}
            lineCount={lines.length}
            inputRef={searchInputRef}
            onSearchSubmit={handleSearchSubmit}
          />

          <div className="flex-1 overflow-y-auto px-4 sm:px-5 lg:px-6 py-4 sm:py-5">
            {itemsLoading ? (
              <p className="text-sm text-ink-500 text-center py-8">Loading catalog…</p>
            ) : filteredItems.length === 0 ? (
              <EmptyCatalog onAddItem={() => setAddItemOpen(true)} />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
                {filteredItems.map((it) => (
                  <ProductCard key={it.id} item={it} rates={rates} onAdd={() => addItem(it)} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Bill + payment side panel (desktop only).
            Wider on xl+ so the totals + payment grid breathe, tighter on lg
            so the catalog doesn't collapse below 2 columns. */}
        <aside className="hidden lg:flex flex-col w-[420px] xl:w-[460px] 2xl:w-[500px] shrink-0 bg-ink-0">
          <BillAndPaymentColumn
            billNumber={billNumber}
            lines={lines}
            customer={customer}
            phoneSearch={phoneSearch}
            onPhoneSearchChange={setPhoneSearch}
            onLookupCustomer={doCustomerLookup}
            onClearCustomer={clearCustomer}
            lookingUp={lookingUp}
            removeLine={removeLine}
            clearCart={clearCart}
            onPark={onPark}
            parking={parking}
            subtotal={subtotal}
            making={making}
            stone={stone}
            exchangeValue={exchangeValue}
            discountPaise={discountPaise}
            loyaltyPaise={loyaltyPaise}
            cgst={cgst}
            sgst={sgst}
            igst={igst}
            grandTotal={grandTotal}
            paid={paid}
            tab={tab}
            onTabChange={setTab}
            discountRupees={discountRupees}
            onDiscountChange={setDiscountRupees}
            discountIsPct={discountIsPct}
            onDiscountModeToggle={() => setDiscountIsPct((v) => !v)}
            loyaltyApply={loyaltyApply}
            onLoyaltyChange={setLoyaltyApply}
            exchange={exchange}
            onExchangeChange={setExchange}
            payments={payments}
            onSinglePayment={setSinglePayment}
            patchPayment={patchPayment}
            addSplit={addSplit}
            removeSplit={removeSplit}
            charging={charging}
            onCharge={charge}
          />
        </aside>
      </div>

      {/* Mobile/tablet: bill+payment drawer */}
      <Sheet open={billDrawerOpen} onOpenChange={(v) => { if (!v) setBillDrawerOpen(false); }}>
        <SheetContent side="right" className="w-full sm:max-w-md md:max-w-lg p-0 flex flex-col">
          <BillAndPaymentColumn
            billNumber={billNumber}
            lines={lines}
            customer={customer}
            phoneSearch={phoneSearch}
            onPhoneSearchChange={setPhoneSearch}
            onLookupCustomer={doCustomerLookup}
            onClearCustomer={clearCustomer}
            lookingUp={lookingUp}
            removeLine={removeLine}
            clearCart={clearCart}
            onPark={onPark}
            parking={parking}
            subtotal={subtotal}
            making={making}
            stone={stone}
            exchangeValue={exchangeValue}
            discountPaise={discountPaise}
            loyaltyPaise={loyaltyPaise}
            cgst={cgst}
            sgst={sgst}
            igst={igst}
            grandTotal={grandTotal}
            paid={paid}
            tab={tab}
            onTabChange={setTab}
            discountRupees={discountRupees}
            onDiscountChange={setDiscountRupees}
            discountIsPct={discountIsPct}
            onDiscountModeToggle={() => setDiscountIsPct((v) => !v)}
            loyaltyApply={loyaltyApply}
            onLoyaltyChange={setLoyaltyApply}
            exchange={exchange}
            onExchangeChange={setExchange}
            payments={payments}
            onSinglePayment={setSinglePayment}
            patchPayment={patchPayment}
            addSplit={addSplit}
            removeSplit={removeSplit}
            charging={charging}
            onCharge={charge}
          />
        </SheetContent>
      </Sheet>

      {/* Quick-add inventory modal */}
      <Sheet open={addItemOpen} onOpenChange={(v) => { if (!v) setAddItemOpen(false); }}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <QuickAddInventory
            shopId={shopId}
            categories={categories}
            onClose={() => setAddItemOpen(false)}
            onCreate={async (input) => {
              try {
                await createItem(input as never).unwrap();
                toast.success(`Added ${input.sku} to ${shop?.name ?? 'this shop'}`);
                setAddItemOpen(false);
              } catch (err: unknown) {
                const e = err as { data?: { error?: { message?: string } } };
                toast.error(e.data?.error?.message ?? 'Could not add item');
              }
            }}
            creating={addingItem}
          />
        </SheetContent>
      </Sheet>

      {/* Sticky status bar -------------------------------------------- */}
      <StatusBar
        sessionOpen={!!session}
        openingFloatPaise={session?.openingFloatPaise ?? 0}
        cashInDrawerPaise={session?.openingFloatPaise ?? 0}
        onShowBillDrawer={() => setBillDrawerOpen(true)}
        lineCount={lines.length}
        grandTotal={grandTotal}
        lastBill={lastBill}
        shopName={shop?.name ?? null}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CategoryRail
// ─────────────────────────────────────────────────────────────────────────────

function CategoryRail({
  categories,
  itemsByCategory,
  totalCount,
  selected,
  onSelect,
}: {
  categories: { id: string; name: string }[];
  itemsByCategory: Map<string, number>;
  totalCount: number;
  selected: string | 'ALL';
  onSelect: (id: string | 'ALL') => void;
}): JSX.Element {
  return (
    <aside className="hidden md:flex flex-col w-[200px] xl:w-[220px] shrink-0 bg-ink-0 border-r border-ink-100">
      <div className="px-4 py-3 border-b border-ink-100">
        <h3 className="text-[10px] uppercase tracking-wider text-ink-500 font-medium">Categories</h3>
      </div>
      <nav className="flex-1 overflow-y-auto py-1">
        <button
          type="button"
          onClick={() => onSelect('ALL')}
          className={cn(
            'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors',
            selected === 'ALL'
              ? 'bg-brand-50 text-ink-900 border-l-2 border-brand-500 -ml-[2px] pl-[10px] font-medium'
              : 'text-ink-700 hover:bg-ink-50',
          )}
        >
          <span>All items</span>
          <span className="text-[11px] text-ink-500 tabular-nums">{totalCount}</span>
        </button>
        {categories.map((c) => {
          const count = itemsByCategory.get(c.id) ?? 0;
          const active = selected === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={cn(
                'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors text-left',
                active
                  ? 'bg-brand-50 text-ink-900 border-l-2 border-brand-500 -ml-[2px] pl-[10px] font-medium'
                  : 'text-ink-700 hover:bg-ink-50',
              )}
            >
              <span className="truncate">{c.name}</span>
              <span className="text-[11px] text-ink-500 tabular-nums shrink-0">{count}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CatalogToolbar
// ─────────────────────────────────────────────────────────────────────────────

function CatalogToolbar({
  search,
  onSearchChange,
  purity,
  onPurityChange,
  onAddItem,
  onOpenBillDrawer,
  lineCount,
  inputRef,
  onSearchSubmit,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  purity: number | 'ALL';
  onPurityChange: (v: number | 'ALL') => void;
  onAddItem: () => void;
  onOpenBillDrawer: () => void;
  lineCount: number;
  inputRef?: React.RefObject<HTMLInputElement>;
  onSearchSubmit?: () => void;
}): JSX.Element {
  return (
    <div className="px-3 sm:px-4 py-2.5 border-b border-ink-100 bg-ink-0 flex items-center gap-2">
      <div className="relative flex-1 min-w-0">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
        <Input
          ref={inputRef}
          placeholder="Search by SKU, barcode, or name (F2)"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSearchSubmit?.();
            }
          }}
          className="pl-9 h-10"
        />
      </div>
      <select
        className="hidden sm:block h-10 rounded-md border border-ink-200 bg-ink-0 px-3 text-sm"
        value={purity}
        onChange={(e) => onPurityChange(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
        aria-label="Filter by purity"
      >
        <option value="ALL">All purity</option>
        <option value={2400}>24K</option>
        <option value={2200}>22K</option>
        <option value={1800}>18K</option>
        <option value={1400}>14K</option>
        <option value={0}>Silver</option>
      </select>
      <Button variant="outline" size="sm" onClick={onAddItem} className="hidden sm:inline-flex">
        <Plus className="h-4 w-4 mr-1" />New item
      </Button>
      <Button variant="outline" size="sm" onClick={onAddItem} className="sm:hidden h-10 w-10 p-0" aria-label="Add item">
        <Plus className="h-4 w-4" />
      </Button>
      {/* Bill peek button — only on screens without the right rail */}
      <button
        type="button"
        onClick={onOpenBillDrawer}
        className="lg:hidden relative inline-flex items-center gap-1.5 h-10 px-3 rounded-md bg-brand-500 text-ink-0 text-sm font-medium hover:bg-brand-600"
        aria-label="Open bill"
      >
        Bill
        {lineCount > 0 && (
          <span className="bg-ink-0 text-brand-700 rounded-full h-5 min-w-[20px] px-1 text-[10px] inline-flex items-center justify-center font-bold tabular-nums">
            {lineCount}
          </span>
        )}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Product card
// ─────────────────────────────────────────────────────────────────────────────

function ProductCard({
  item,
  rates,
  onAdd,
}: {
  item: Item & { name?: string | null; images?: string[] };
  rates: Array<{ purity: number; ratePerGramPaise: number; stale: boolean }> | undefined;
  onAdd: () => void;
}): JSX.Element {
  const rate = rateForPurity(rates, item.purityCaratX100);
  const goldValue = computeGoldValuePaise(item.weightMg, item.purityCaratX100, rate.paise);
  const making = applyBps(goldValue, item.makingChargeBps ?? 1200);
  const indicative = goldValue + making;
  const purityLabel = PURITY_LABEL[item.purityCaratX100] ?? `${item.purityCaratX100 / 100}c`;
  const heroImage = cloudinaryThumb(item.images?.[0] ?? null, 360);
  const displayName = item.name?.trim() || item.sku;
  return (
    <button
      type="button"
      onClick={onAdd}
      className="group relative bg-ink-0 border border-ink-100 rounded-xl text-left hover:border-brand-300 hover:shadow-md transition-all overflow-hidden flex flex-col"
    >
      {/* Image area */}
      <div className="relative aspect-square bg-gradient-to-br from-brand-50/60 via-ink-50 to-brand-50/30">
        {/* Always render the placeholder behind — if <img> fails to load
            we hide the broken icon and the placeholder shows through. */}
        <div className="absolute inset-0 flex items-center justify-center text-3xl text-brand-300/60 font-display">
          ✦
        </div>
        {heroImage && (
          <img
            src={heroImage}
            alt={displayName}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => {
              // Broken Unsplash / Cloudinary URL — drop the <img> so the
              // gold-on-cream placeholder shows instead of the browser's
              // alt-text "broken image" glyph.
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
        <span className="absolute top-2 left-2 bg-brand-100/95 backdrop-blur text-brand-800 text-[10px] font-semibold rounded px-1.5 py-0.5">
          {purityLabel}
        </span>
        {/* Always-visible Add chip — touch screens never see hover, and
            even on desktop the cashier shouldn't have to fish for it.
            More prominent on hover for desktop discoverability. */}
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 bg-brand-500 text-ink-0 text-[10px] font-medium rounded-full px-2 py-1 shadow-sm group-hover:bg-brand-600 transition-colors">
          <Plus className="h-3 w-3" /> Add
        </span>
      </div>
      {/* Body — allow 2-line names so "Niya Bridal Haar (Kundan + Pearl)"
          doesn't truncate to a useless "Niya Bridal Haar (Kund..." */}
      <div className="p-3 space-y-0.5 min-h-[82px] flex flex-col">
        <div className="text-sm font-medium text-ink-900 line-clamp-2 leading-snug">
          {displayName}
        </div>
        <div className="text-[11px] text-ink-500 truncate tabular-nums mt-auto">
          {item.sku} · {(item.weightMg / 1000).toFixed(2)} g
        </div>
        <div className="text-sm font-mono font-semibold text-ink-900 mt-1">
          ₹{Math.round(indicative / 100).toLocaleString('en-IN')}
        </div>
      </div>
    </button>
  );
}

function EmptyCatalog({ onAddItem }: { onAddItem: () => void }): JSX.Element {
  return (
    <div className="text-center py-16 px-4">
      <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-brand-50 text-brand-300 mb-3">
        <ImagePlus className="h-8 w-8" />
      </div>
      <h3 className="text-sm font-medium text-ink-700">Nothing in this category yet</h3>
      <p className="text-xs text-ink-500 mt-1 mb-4 max-w-xs mx-auto">
        Pick a different category or add a new item to this shop. New items appear here immediately.
      </p>
      <Button size="sm" variant="outline" onClick={onAddItem}>
        <Plus className="h-4 w-4 mr-1" />Add item to shop
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bill + Payment column
// ─────────────────────────────────────────────────────────────────────────────

interface BillColumnProps {
  billNumber: string;
  lines: CartLine[];
  customer: CustomerInfo | null;
  phoneSearch: string;
  onPhoneSearchChange: (v: string) => void;
  onLookupCustomer: () => void;
  onClearCustomer: () => void;
  lookingUp: boolean;
  removeLine: (id: string) => void;
  clearCart: () => void;
  onPark: () => void;
  parking: boolean;
  subtotal: number;
  making: number;
  stone: number;
  exchangeValue: number;
  discountPaise: number;
  loyaltyPaise: number;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
  paid: number;
  tab: 'payment' | 'customer';
  onTabChange: (t: 'payment' | 'customer') => void;
  discountRupees: string;
  onDiscountChange: (v: string) => void;
  discountIsPct: boolean;
  onDiscountModeToggle: () => void;
  loyaltyApply: string;
  onLoyaltyChange: (v: string) => void;
  exchange: OldGoldExchange | null;
  onExchangeChange: (e: OldGoldExchange | null) => void;
  payments: PaymentRow[];
  onSinglePayment: (m: PaymentMode) => void;
  patchPayment: (id: string, patch: Partial<PaymentRow>) => void;
  addSplit: () => void;
  removeSplit: (id: string) => void;
  charging: boolean;
  onCharge: () => void;
}

function BillAndPaymentColumn(props: BillColumnProps): JSX.Element {
  const {
    billNumber, lines, customer, removeLine, clearCart, onPark, parking,
    subtotal, making, stone, exchangeValue, discountPaise, loyaltyPaise,
    cgst, sgst, igst, grandTotal,
    tab, onTabChange,
  } = props;
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Bill header */}
      <div className="px-4 sm:px-5 py-3 border-b border-ink-100 flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-ink-900">Bill #{billNumber}</div>
          <div className="text-[11px] text-ink-500">{customer ? customer.name : 'Walk-in customer'}</div>
        </div>
        {lines.length > 0 && (
          <button
            type="button"
            onClick={clearCart}
            className="text-xs text-ink-500 hover:text-danger-700 inline-flex items-center gap-1"
          >
            <Trash2 className="h-3.5 w-3.5" />Clear
          </button>
        )}
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3 space-y-2">
        {lines.length === 0 ? (
          <div className="text-center text-sm text-ink-500 py-10">
            <div className="text-3xl text-ink-300 mb-2">+</div>
            Scan a barcode or tap an item to start the bill.
          </div>
        ) : (
          lines.map((l) => <BillLineRow key={l.id} line={l} onRemove={() => removeLine(l.id)} />)
        )}
      </div>

      {/* Action row + totals */}
      {lines.length > 0 && (
        <div className="px-4 sm:px-5 pb-3 pt-2 border-t border-ink-50">
          <Button variant="outline" size="sm" onClick={onPark} disabled={parking} className="w-full">
            <Hand className="h-4 w-4 mr-1.5" />{parking ? 'Parking the bill…' : 'Park this bill for now'}
          </Button>
        </div>
      )}

      <div className="px-4 sm:px-5 py-3 border-t border-ink-100 space-y-1 text-sm bg-ink-25/50">
        <TotalsRow label="Gold value" paise={subtotal} />
        <TotalsRow label="Making" paise={making} />
        {stone > 0 && <TotalsRow label="Stone" paise={stone} />}
        {exchangeValue > 0 && <TotalsRow label="Old-gold exchange" paise={-exchangeValue} tone="success" />}
        {cgst > 0 && <TotalsRow label="CGST (1.5%)" paise={cgst} />}
        {sgst > 0 && <TotalsRow label="SGST (1.5%)" paise={sgst} />}
        {igst > 0 && <TotalsRow label="IGST (3%)" paise={igst} />}
        {discountPaise > 0 && <TotalsRow label="Discount" paise={-discountPaise} tone="success" />}
        {loyaltyPaise > 0 && <TotalsRow label="Loyalty" paise={-loyaltyPaise} tone="success" />}
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-ink-100">
          <span className="text-sm font-medium text-ink-700">Grand total</span>
          <Money paise={grandTotal} className="font-mono text-lg sm:text-xl font-semibold text-brand-700" />
        </div>
      </div>

      {/* Payment / Customer tabs */}
      <div className="border-t border-ink-100">
        <div className="flex border-b border-ink-100">
          <TabButton active={tab === 'payment'} onClick={() => onTabChange('payment')}>Payment</TabButton>
          <TabButton active={tab === 'customer'} onClick={() => onTabChange('customer')}>Customer</TabButton>
        </div>
        {tab === 'payment' ? <PaymentTab {...props} /> : <CustomerTab {...props} />}
      </div>
    </div>
  );
}

function BillLineRow({ line, onRemove }: { line: CartLine; onRemove: () => void }): JSX.Element {
  const purityLabel = PURITY_LABEL[line.purityCaratX100] ?? `${line.purityCaratX100 / 100}c`;
  const thumb = cloudinaryThumb(line.imageUrl, 96);
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-ink-50 last:border-b-0">
      <div className="relative h-14 w-14 rounded-md overflow-hidden bg-gradient-to-br from-brand-50 to-ink-50 shrink-0">
        <span className="absolute inset-0 flex items-center justify-center text-brand-300 text-lg font-display">✦</span>
        {thumb && (
          <img
            src={thumb}
            alt={line.name || line.sku || 'Product'}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink-900 line-clamp-1">{line.name || line.sku}</div>
        {/* Two-line metadata so SKU + weight + rate don't collide with
            the price column. */}
        <div className="text-[11px] text-ink-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-ink-600">{line.sku}</span>
          <span className="text-ink-300">·</span>
          <span className="text-brand-700 font-medium">{purityLabel}</span>
          <span className="text-ink-300">·</span>
          <span className="tabular-nums">{(line.weightMg / 1000).toFixed(2)} g</span>
        </div>
        <div className="text-[11px] text-ink-400 mt-0.5 tabular-nums">
          @ ₹{Math.round(line.ratePerGramPaise / 100).toLocaleString('en-IN')}/g
        </div>
      </div>
      <div className="text-right shrink-0">
        <Money paise={line.linePaise} className="text-sm font-mono font-semibold text-ink-900" />
        <button
          type="button"
          onClick={onRemove}
          className="text-[11px] text-ink-400 hover:text-danger-600 inline-flex items-center gap-0.5 mt-1"
          aria-label="Remove"
        >
          <X className="h-3 w-3" />remove
        </button>
      </div>
    </div>
  );
}

function TotalsRow({ label, paise, tone }: { label: string; paise: number; tone?: 'success' }): JSX.Element {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-600">{label}</span>
      <span className={cn('font-mono tabular-nums', tone === 'success' ? 'text-success-700' : 'text-ink-800')}>
        {paise < 0 ? '-' : ''}
        ₹{Math.abs(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 py-2.5 text-sm border-b-2 -mb-px transition-colors',
        active ? 'border-brand-500 text-ink-900 font-medium' : 'border-transparent text-ink-500 hover:text-ink-800',
      )}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment tab
// ─────────────────────────────────────────────────────────────────────────────

const PAYMENT_MODES: Array<{ mode: PaymentMode; label: string; emoji: string }> = [
  { mode: 'CASH', label: 'Cash', emoji: '💵' },
  { mode: 'UPI', label: 'UPI', emoji: '📱' },
  { mode: 'CARD', label: 'Card', emoji: '💳' },
  { mode: 'CHEQUE', label: 'Cheque', emoji: '📝' },
];

function PaymentTab(p: BillColumnProps): JSX.Element {
  const {
    grandTotal, paid, payments, onSinglePayment, patchPayment, addSplit, removeSplit,
    onCharge, charging, discountRupees, onDiscountChange, discountIsPct, onDiscountModeToggle,
    loyaltyApply, onLoyaltyChange, exchange, onExchangeChange, customer,
  } = p;
  const due = grandTotal - paid;
  // Two-region layout: scrollable middle (discount / exchange / payment
  // grid / splits) and a sticky footer carrying the always-visible Pay
  // button + paid/due indicator. Earlier the Pay button lived INSIDE the
  // scrollable region with `max-h-[55vh]` and disappeared below the fold
  // on common viewports — that's the "only shows on hover" report.
  return (
    <div className="flex flex-col">
      {/* Scrollable middle */}
      <div className="px-4 sm:px-5 py-3 space-y-3 overflow-y-auto max-h-[40vh]">
      {/* Total payable hero */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-500 uppercase tracking-wider">Total payable</span>
        <Money paise={grandTotal} className="font-mono text-xl font-semibold text-ink-900" />
      </div>

      {/* Loyalty */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-ink-600">Loyalty points</Label>
          <span className="text-[11px] text-ink-500">
            {customer ? `${customer.loyaltyPoints ?? 0} pts available` : 'Lookup a customer'}
          </span>
        </div>
        <div className="flex gap-2">
          <Input
            value={loyaltyApply}
            onChange={(e) => onLoyaltyChange(e.target.value.replace(/\D/g, ''))}
            placeholder="0"
            disabled={!customer}
            className="h-9 flex-1"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!customer}
            onClick={() => onLoyaltyChange(String(customer?.loyaltyPoints ?? 0))}
          >
            Apply
          </Button>
        </div>
      </div>

      {/* Discount */}
      <div className="space-y-1.5">
        <Label className="text-xs text-ink-600">Discount</Label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onDiscountModeToggle}
            className={cn(
              'h-9 px-3 rounded-md text-sm border',
              !discountIsPct ? 'bg-brand-500 text-ink-0 border-brand-500' : 'bg-ink-0 text-ink-600 border-ink-200',
            )}
          >
            ₹
          </button>
          <button
            type="button"
            onClick={onDiscountModeToggle}
            className={cn(
              'h-9 px-3 rounded-md text-sm border',
              discountIsPct ? 'bg-brand-500 text-ink-0 border-brand-500' : 'bg-ink-0 text-ink-600 border-ink-200',
            )}
          >
            %
          </button>
          <Input
            value={discountRupees}
            onChange={(e) => onDiscountChange(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            className="h-9 flex-1"
          />
        </div>
      </div>

      {/* Exchange */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-ink-600">Exchange old gold</Label>
          {exchange ? (
            <button
              type="button"
              onClick={() => onExchangeChange(null)}
              className="text-[11px] text-danger-600 hover:text-danger-700"
            >
              Remove
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onExchangeChange({ weightMg: 0, purityCaratX100: 2200 })}
              className="text-[11px] text-brand-600 hover:text-brand-700 inline-flex items-center gap-0.5"
            >
              <Plus className="h-3 w-3" />Add exchange
            </button>
          )}
        </div>
        {exchange && (
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              step="0.01"
              placeholder="Weight (g)"
              value={exchange.weightMg ? (exchange.weightMg / 1000).toString() : ''}
              onChange={(e) => onExchangeChange({ ...exchange, weightMg: Math.round(Number(e.target.value) * 1000) })}
              className="h-9"
            />
            <select
              className="h-9 rounded-md border border-ink-200 bg-ink-0 px-3 text-sm"
              value={exchange.purityCaratX100}
              onChange={(e) => onExchangeChange({ ...exchange, purityCaratX100: Number(e.target.value) })}
            >
              <option value={2400}>24K</option>
              <option value={2200}>22K</option>
              <option value={1800}>18K</option>
              <option value={1400}>14K</option>
              <option value={0}>Silver</option>
            </select>
          </div>
        )}
      </div>

      {/* Payment modes grid */}
      <div className="space-y-1.5">
        <Label className="text-xs text-ink-600">Payment mode</Label>
        <div className="grid grid-cols-4 gap-2">
          {PAYMENT_MODES.map((m) => {
            const isActive = payments.length === 1 && payments[0]?.mode === m.mode;
            return (
              <button
                key={m.mode}
                type="button"
                onClick={() => onSinglePayment(m.mode)}
                className={cn(
                  'rounded-md border py-2.5 flex flex-col items-center gap-0.5 text-xs transition-colors',
                  isActive
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-ink-200 text-ink-700 hover:border-brand-300 hover:bg-brand-50/40',
                )}
              >
                <span className="text-lg leading-none">{m.emoji}</span>
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Splits */}
      {payments.map((p, idx) => (
        <div key={p.id} className="flex gap-2 items-center">
          <select
            className="h-9 rounded-md border border-ink-200 bg-ink-0 px-2 text-xs"
            value={p.mode}
            onChange={(e) => patchPayment(p.id, { mode: e.target.value as PaymentMode })}
          >
            {PAYMENT_MODES.map((m) => <option key={m.mode} value={m.mode}>{m.label}</option>)}
          </select>
          <Input
            type="number"
            step="0.01"
            value={p.amountPaise ? (p.amountPaise / 100).toString() : ''}
            onChange={(e) => patchPayment(p.id, { amountPaise: Math.round(Number(e.target.value) * 100) })}
            placeholder="0.00"
            className="h-9 flex-1"
          />
          {payments.length > 1 ? (
            <button
              type="button"
              onClick={() => removeSplit(p.id)}
              className="text-ink-400 hover:text-danger-600"
              aria-label="Remove split"
            >
              <X className="h-4 w-4" />
            </button>
          ) : idx === 0 ? (
            <button
              type="button"
              onClick={addSplit}
              className="text-xs text-brand-600 hover:text-brand-700"
            >
              + Split
            </button>
          ) : null}
        </div>
      ))}

      </div>

      {/* Sticky pay footer — always visible regardless of payment-tab
          scroll. The "Pay" button is the primary action; it cannot be
          allowed to fall off the fold. */}
      <div className="px-4 sm:px-5 py-3 border-t border-ink-100 bg-ink-0 space-y-2 shrink-0">
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-500">Paid {paid > 0 && <>· <Money paise={paid} className="font-mono" /></>}</span>
          <span className={cn('font-mono tabular-nums', due === 0 ? 'text-success-700' : due > 0 ? 'text-danger-700' : 'text-info-700')}>
            {due === 0 ? '✓ Settled' : due > 0 ? `Due ₹${(due / 100).toFixed(2)}` : `Change ₹${(Math.abs(due) / 100).toFixed(2)}`}
          </span>
        </div>
        <Button
          size="lg"
          onClick={onCharge}
          disabled={charging || p.lines.length === 0}
          className="w-full h-12 text-base bg-success-600 hover:bg-success-700 text-ink-0"
        >
          {charging ? 'Charging…' : <>Pay <Money paise={grandTotal} className="ml-1.5 font-mono font-semibold" /></>}
        </Button>
        <p className="text-[11px] text-ink-500 text-center">Press F9 to charge</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer tab
// ─────────────────────────────────────────────────────────────────────────────

function CustomerTab(p: BillColumnProps): JSX.Element {
  const { customer, phoneSearch, onPhoneSearchChange, onLookupCustomer, onClearCustomer, lookingUp } = p;
  return (
    <div className="px-4 sm:px-5 py-3 space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-ink-600">Customer phone</Label>
        <div className="flex gap-2">
          <Input
            value={phoneSearch}
            onChange={(e) => onPhoneSearchChange(e.target.value)}
            placeholder="98XXXXXXXX"
            inputMode="numeric"
            className="h-9 flex-1"
          />
          <Button type="button" size="sm" variant="outline" onClick={onLookupCustomer} disabled={lookingUp}>
            {lookingUp ? '…' : 'Lookup'}
          </Button>
        </div>
      </div>
      {customer ? (
        <div className="rounded-md border border-ink-100 bg-ink-25 p-3 space-y-1">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-ink-900">{customer.name}</div>
            <button
              type="button"
              onClick={onClearCustomer}
              className="text-xs text-ink-500 hover:text-danger-700"
            >
              Clear
            </button>
          </div>
          <div className="text-xs text-ink-500">{customer.phone}</div>
          <div className="text-xs text-brand-700 mt-1">
            <Badge tone="brand">{customer.loyaltyPoints ?? 0} loyalty pts</Badge>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-ink-200 p-4 text-center">
          <UserIcon className="h-5 w-5 mx-auto mb-1.5 text-ink-300" />
          <div className="text-xs text-ink-500">No customer · this will save as Walk-in</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusBar — sticky footer with till info + actions
// ─────────────────────────────────────────────────────────────────────────────

interface LastBill {
  id: string;
  billNumber: string;
  totalPaise: number;
  customerName: string | null;
  customerPhone: string | null;
}

function StatusBar({
  sessionOpen,
  openingFloatPaise,
  cashInDrawerPaise,
  onShowBillDrawer,
  lineCount,
  grandTotal,
  lastBill,
  shopName,
}: {
  sessionOpen: boolean;
  openingFloatPaise: number;
  cashInDrawerPaise: number;
  onShowBillDrawer: () => void;
  lineCount: number;
  grandTotal: number;
  lastBill: LastBill | null;
  shopName: string | null;
}): JSX.Element {
  function printLastBill(): void {
    if (!lastBill) return;
    // PDF endpoint streams the bytes inline so the browser shows a print
    // preview; the cashier can paper-print from there or just save.
    window.open(`/api/v1/pos/bills/${lastBill.id}/receipt.pdf`, '_blank', 'noopener');
  }

  function whatsAppLastBill(): void {
    if (!lastBill || !lastBill.customerPhone) return;
    // Build a deep-link to WhatsApp Web / app. The receipt URL is also
    // surfaced — if the cashier wants to share the PDF rather than a text
    // summary they paste the link. The link points at the API origin so it
    // requires an authenticated session to actually open — that's fine for
    // the cashier's customer who'll only need the text summary anyway.
    const phone = lastBill.customerPhone.replace(/\D/g, '');
    const total = `₹${(lastBill.totalPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    const greeting = lastBill.customerName ? `Hi ${lastBill.customerName.split(' ')[0]},` : 'Hi,';
    const summary =
      `${greeting}\nThank you for your purchase at ${shopName ?? 'our store'}.\n` +
      `Bill ${lastBill.billNumber} · Total ${total}.\n` +
      `We've kept a copy of your invoice. Reply here if you have any questions.`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(summary)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <footer className="bg-ink-0 border-t border-ink-100 px-3 sm:px-4 lg:px-6 py-2 flex items-center gap-3 flex-wrap shrink-0">
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-ink-500">Till status:</span>
        <span className={cn('font-medium', sessionOpen ? 'text-success-700' : 'text-warning-700')}>
          {sessionOpen ? 'Open' : 'Closed'}
        </span>
      </div>
      <span className="hidden sm:inline text-ink-200">·</span>
      <div className="hidden sm:flex items-center gap-1.5 text-xs">
        <span className="text-ink-500">Opening float:</span>
        <Money paise={openingFloatPaise} className="font-mono text-ink-800" />
      </div>
      <span className="hidden md:inline text-ink-200">·</span>
      <div className="hidden md:flex items-center gap-1.5 text-xs">
        <span className="text-ink-500">Cash in drawer:</span>
        <Money paise={cashInDrawerPaise} className="font-mono text-ink-800" />
      </div>
      {lastBill && (
        <>
          <span className="hidden lg:inline text-ink-200">·</span>
          <div className="hidden lg:flex items-center gap-1.5 text-xs">
            <span className="text-ink-500">Last bill:</span>
            <span className="font-mono text-ink-800">{lastBill.billNumber}</span>
          </div>
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={printLastBill}
          disabled={!lastBill}
          className="hidden sm:inline-flex"
          title={lastBill ? `Reprint ${lastBill.billNumber}` : 'Charge a bill first'}
        >
          <Printer className="h-3.5 w-3.5 mr-1.5" />Print receipt
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={whatsAppLastBill}
          disabled={!lastBill || !lastBill.customerPhone}
          className="hidden md:inline-flex"
          title={
            !lastBill
              ? 'Charge a bill first'
              : !lastBill.customerPhone
                ? 'Bill has no customer phone — lookup customer next time'
                : `Send to ${lastBill.customerPhone}`
          }
        >
          <Send className="h-3.5 w-3.5 mr-1.5" />Send on WhatsApp
        </Button>
        <Button variant="outline" size="sm" disabled>
          <Save className="h-3.5 w-3.5 mr-1.5" />Save as draft
        </Button>
        {/* Phone-only floating bill button echo (in case toolbar is scrolled away) */}
        {lineCount > 0 && (
          <button
            type="button"
            onClick={onShowBillDrawer}
            className="lg:hidden inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-brand-500 text-ink-0 text-xs"
          >
            View bill · <Money paise={grandTotal} className="font-mono font-semibold" />
          </button>
        )}
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick-add inventory drawer
// ─────────────────────────────────────────────────────────────────────────────

interface QuickAddProps {
  shopId: string;
  categories: { id: string; name: string }[];
  onClose: () => void;
  onCreate: (input: {
    shopId: string;
    categoryId: string;
    sku: string;
    barcodeData: string;
    name?: string;
    images?: string[];
    weightMg: number;
    purityCaratX100: number;
    hallmarkStatus: 'PENDING' | 'SUBMITTED' | 'CERTIFIED' | 'EXEMPT';
    costPricePaise: number;
    makingChargeBps?: number;
  }) => Promise<void>;
  creating: boolean;
}

function QuickAddInventory({ shopId, categories, onClose, onCreate, creating }: QuickAddProps): JSX.Element {
  const [form, setForm] = useState({
    name: '',
    sku: '',
    categoryId: categories[0]?.id ?? '',
    weightGrams: '',
    purityCaratX100: 2200,
    costRupees: '',
    makingPct: '12',
    hallmark: 'CERTIFIED' as 'PENDING' | 'SUBMITTED' | 'CERTIFIED' | 'EXEMPT',
  });
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cloudinaryReady = isCloudinaryConfigured();

  // Default categoryId once categories arrive.
  useEffect(() => {
    if (!form.categoryId && categories[0]) {
      setForm((f) => ({ ...f, categoryId: categories[0]!.id }));
    }
  }, [categories, form.categoryId]);

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadPct(0);
    try {
      const result = await uploadImageToCloudinary(file, {
        folder: 'zelora/items',
        onProgress: setUploadPct,
      });
      setImages((curr) => [...curr, result.secureUrl]);
      toast.success('Image uploaded');
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Image upload failed');
    } finally {
      setUploading(false);
      setUploadPct(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeImage(url: string): void {
    setImages((curr) => curr.filter((u) => u !== url));
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!shopId) {
      toast.error('Pick a shop first');
      return;
    }
    if (!form.categoryId) {
      toast.error('Pick a category');
      return;
    }
    await onCreate({
      shopId,
      categoryId: form.categoryId,
      sku: form.sku.trim().toUpperCase(),
      barcodeData: form.sku.trim().toUpperCase(),
      name: form.name.trim() || undefined,
      images,
      weightMg: Math.round(Number(form.weightGrams) * 1000),
      purityCaratX100: Number(form.purityCaratX100),
      hallmarkStatus: form.hallmark,
      costPricePaise: Math.round(Number(form.costRupees) * 100),
      makingChargeBps: Math.round(Number(form.makingPct) * 100),
    });
  }

  return (
    <>
      <header className="sticky top-0 z-10 bg-ink-0 border-b border-ink-100 px-5 py-4 pr-12">
        <h2 className="font-display text-md sm:text-lg text-ink-900">Add a new item to this shop</h2>
        <p className="text-xs text-ink-500 mt-0.5">
          Quick intake — appears in the catalog immediately. Detailed editing is in the admin Inventory module.
        </p>
      </header>

      <form onSubmit={submit} id="quick-add-form" className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {/* Image picker */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-ink-600">Product photos</Label>
            {!cloudinaryReady && (
              <span className="text-[10px] text-ink-500 bg-ink-25 border border-ink-100 px-1.5 py-0.5 rounded">
                Local image storage (dev)
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {images.map((url) => (
              <div key={url} className="relative aspect-square rounded-md overflow-hidden border border-ink-100 bg-ink-25">
                <img src={cloudinaryThumb(url, 200) ?? url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(url)}
                  className="absolute top-1 right-1 h-5 w-5 rounded-full bg-ink-900/70 text-ink-0 inline-flex items-center justify-center hover:bg-danger-600"
                  aria-label="Remove image"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {images.length < 4 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className={cn(
                  'aspect-square rounded-md border-2 border-dashed flex flex-col items-center justify-center gap-1 text-xs transition-colors',
                  uploading
                    ? 'border-brand-300 bg-brand-50/40 text-brand-700'
                    : 'border-ink-200 bg-ink-25 text-ink-500 hover:border-brand-400 hover:bg-brand-50/30 hover:text-brand-700',
                )}
              >
                {uploading ? (
                  <>
                    <Upload className="h-4 w-4 animate-pulse" />
                    <span className="tabular-nums">{uploadPct}%</span>
                  </>
                ) : (
                  <>
                    <ImagePlus className="h-5 w-5" />
                    <span>Add photo</span>
                  </>
                )}
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPickImage}
          />
          <p className="text-[11px] text-ink-500">
            Up to 4 photos. First photo is the catalog hero. Resized + compressed via Cloudinary.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-ink-600">Item name</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Mira Bangle 22K"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-ink-600">SKU / Barcode</Label>
          <Input
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
            placeholder="DW-0051"
            required
            minLength={2}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-ink-600">Category</Label>
          <select
            className="w-full h-9 rounded-md border border-ink-200 bg-ink-0 px-3 text-sm"
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            required
          >
            <option value="">Pick category…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-ink-600">Weight (g)</Label>
            <Input
              inputMode="decimal"
              value={form.weightGrams}
              onChange={(e) => setForm({ ...form, weightGrams: e.target.value })}
              placeholder="8.50"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-ink-600">Purity</Label>
            <select
              className="w-full h-9 rounded-md border border-ink-200 bg-ink-0 px-3 text-sm"
              value={form.purityCaratX100}
              onChange={(e) => setForm({ ...form, purityCaratX100: Number(e.target.value) })}
            >
              <option value={2400}>24K</option>
              <option value={2200}>22K</option>
              <option value={1800}>18K</option>
              <option value={1400}>14K</option>
              <option value={0}>Silver</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-ink-600">Cost price (₹)</Label>
            <Input
              inputMode="numeric"
              value={form.costRupees}
              onChange={(e) => setForm({ ...form, costRupees: e.target.value })}
              placeholder="55000"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-ink-600">Making (%)</Label>
            <Input
              inputMode="decimal"
              value={form.makingPct}
              onChange={(e) => setForm({ ...form, makingPct: e.target.value })}
              placeholder="12"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-ink-600">Hallmark</Label>
          <select
            className="w-full h-9 rounded-md border border-ink-200 bg-ink-0 px-3 text-sm"
            value={form.hallmark}
            onChange={(e) => setForm({ ...form, hallmark: e.target.value as typeof form.hallmark })}
          >
            <option value="CERTIFIED">BIS certified</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="PENDING">Pending</option>
            <option value="EXEMPT">Exempt (silver / under-weight)</option>
          </select>
        </div>
      </form>

      <footer className="sticky bottom-0 bg-ink-0 border-t border-ink-100 px-5 py-3 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="quick-add-form" disabled={creating} className="sm:min-w-[160px]">
          {creating ? 'Adding…' : 'Add to shop'}
        </Button>
      </footer>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree-shake markers (keep filter icon import alive for the toolbar)
// ─────────────────────────────────────────────────────────────────────────────

void Filter;
