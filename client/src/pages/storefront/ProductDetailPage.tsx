import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Heart, ShieldCheck, Truck, RotateCcw, ChevronDown, Minus, Plus, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { Money } from '@/components/ui/money';
import { cn } from '@/lib/cn';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { addToCart, toggleWishlist } from '@/features/storefront/shopSlice';

const PRODUCT = {
  name: 'Mira bangle',
  weightG: 12.45,
  purity: '22K · BIS Hallmarked',
  ratePerGram: 6420_00,
  makingPerGram: 850_00,
  stonePaise: 0,
  gstBps: 300,
  sku: 'AJ-BNG-MIRA-22K-12.45',
  images: [
    'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=1400&q=85',
    'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=1400&q=85',
    'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1400&q=85',
    'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=1400&q=85',
  ],
};

const SIZES = ['2.4', '2.6', '2.8'];

const RELATED = [
  { slug: 'tara-mangalsutra', name: 'Tara mangalsutra', priceLabel: '₹62,200', weight: '8.10 g · 22K', img: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=800&q=80' },
  { slug: 'aarya-ring', name: 'Aarya solitaire', priceLabel: '₹48,900', weight: '0.32 ct · 18K', img: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=800&q=80' },
  { slug: 'riya-jhumka', name: 'Riya jhumkas', priceLabel: '₹31,400', weight: '5.20 g · 22K', img: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=80' },
  { slug: 'diya-chain', name: 'Diya chain', priceLabel: '₹54,800', weight: '7.40 g · 22K', img: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=800&q=80' },
];

export function ProductDetailPage(): JSX.Element {
  const { slug = 'mira-bangle' } = useParams();
  const [imgIdx, setImgIdx] = useState(0);
  const [size, setSize] = useState<string>(SIZES[1] ?? SIZES[0] ?? '');
  const [qty, setQty] = useState(1);
  const [openSection, setOpenSection] = useState<string | null>('details');
  const [reserveOpen, setReserveOpen] = useState(false);
  const dispatch = useAppDispatch();
  const wishlisted = useAppSelector((s) => s.shop.wishlist.some((w) => w.slug === slug));

  const gold = Math.round((PRODUCT.weightG * 1000 * PRODUCT.ratePerGram * 2200) / (1000 * 2400));
  const making = Math.round((PRODUCT.weightG * 1000 * PRODUCT.makingPerGram) / 1000);
  const subtotal = gold + making + PRODUCT.stonePaise;
  const gst = Math.round((subtotal * PRODUCT.gstBps) / 10000);
  const total = subtotal + gst;

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-10 md:py-14 pb-28 lg:pb-14">
      <nav className="text-xs text-ink-500 mb-6" aria-label="Breadcrumb">
        <Link to="/store" className="hover:text-ink-700">Home</Link>
        <span className="mx-2 text-ink-300">/</span>
        <Link to="/store/collections/bridal" className="hover:text-ink-700">Bridal</Link>
        <span className="mx-2 text-ink-300">/</span>
        <span className="text-ink-700">{slug}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-[58%_1fr] gap-10 lg:gap-16">
        {/* Gallery */}
        <section className="lg:flex lg:gap-4">
          {/* Thumbnails — vertical on desktop */}
          <div className="order-2 lg:order-1 mt-4 lg:mt-0 grid grid-cols-4 lg:grid-cols-1 lg:flex-col gap-3 lg:w-[80px]">
            {PRODUCT.images.map((src, i) => (
              <button
                key={src}
                onClick={() => setImgIdx(i)}
                className={cn(
                  'aspect-square overflow-hidden bg-ink-50 transition-all',
                  i === imgIdx ? 'ring-1 ring-brand-500 ring-offset-2 ring-offset-ink-0' : 'opacity-70 hover:opacity-100',
                )}
                aria-label={`View image ${i + 1}`}
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
          <div className="order-1 lg:order-2 flex-1 aspect-square overflow-hidden bg-ink-50">
            <img src={PRODUCT.images[imgIdx]} alt={PRODUCT.name} className="h-full w-full object-cover" />
          </div>
        </section>

        {/* Info */}
        <section className="space-y-7">
          <header>
            <p className="text-eyebrow uppercase text-ink-500">Bridal · Bangle</p>
            <h1 className="font-display text-[34px] md:text-[40px] leading-[1.1] text-ink-900 mt-2">{PRODUCT.name}</h1>
            <p className="mt-2 text-sm text-ink-600">{PRODUCT.weightG.toFixed(2)} g · {PRODUCT.purity}</p>
          </header>

          <div className="flex items-baseline gap-3">
            <Money paise={total} className="font-mono text-[32px] text-ink-900 tabular-nums" />
            <span className="text-xs text-ink-500">Incl. of all taxes</span>
          </div>

          {/* Today's rate pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 text-brand-800 text-xs font-mono tabular-nums">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            Today&apos;s 22K rate · ₹{(PRODUCT.ratePerGram / 100).toLocaleString('en-IN')}/g
            <span className="text-brand-700/70">· Updated 11:02 AM</span>
          </div>

          {/* Transparent price breakdown — Bluestone-grade. */}
          <div className="rounded-md border border-ink-100 bg-ink-25 p-5 space-y-2.5 text-sm">
            <p className="text-eyebrow uppercase text-ink-500">Price breakdown</p>
            <Row
              label={`Gold value · ${PRODUCT.weightG.toFixed(2)} g × ₹${(PRODUCT.ratePerGram / 100).toLocaleString('en-IN')}/g × 22/24`}
              value={<Money paise={gold} />}
            />
            <Row label="Making charges" value={<Money paise={making} />} />
            <Row label="GST (3%)" value={<Money paise={gst} />} />
            <div className="border-t border-ink-100 pt-2.5 flex items-center justify-between">
              <span className="text-ink-900 font-medium">Total</span>
              <Money paise={total} className="text-ink-900 font-medium font-mono tabular-nums" />
            </div>
          </div>

          {/* Size */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-eyebrow uppercase text-ink-500">Size (inches)</span>
              <button className="text-xs text-ink-700 underline decoration-ink-200 underline-offset-4 hover:decoration-ink-500">Size guide</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  className={cn(
                    'h-10 min-w-[64px] px-4 rounded-full border text-sm transition-colors',
                    s === size ? 'border-ink-900 bg-ink-900 text-ink-0' : 'border-ink-200 text-ink-700 hover:border-ink-400',
                  )}
                >
                  {s}″
                </button>
              ))}
            </div>
          </div>

          {/* Quantity + actions */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch">
            <div className="inline-flex items-center h-12 rounded-full border border-ink-200 overflow-hidden">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-12 w-12 inline-flex items-center justify-center text-ink-700 hover:bg-ink-50" aria-label="Decrease quantity">
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center text-sm font-mono tabular-nums">{qty}</span>
              <button onClick={() => setQty((q) => q + 1)} className="h-12 w-12 inline-flex items-center justify-center text-ink-700 hover:bg-ink-50" aria-label="Increase quantity">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                dispatch(
                  addToCart({
                    slug,
                    name: PRODUCT.name,
                    weight: `${PRODUCT.weightG.toFixed(2)} g · ${PRODUCT.purity}`,
                    priceLabel: `₹${(total / 100).toLocaleString('en-IN')}`,
                    pricePaise: total,
                    img: PRODUCT.images[0] ?? '',
                    qty,
                  }),
                );
                toast.success(`${PRODUCT.name} added to bag`);
              }}
              className="flex-1 h-12 px-7 rounded-full bg-ink-900 text-ink-0 text-sm font-medium hover:bg-ink-700 transition-colors duration-fast"
            >
              Add to bag
            </button>
            <button
              type="button"
              onClick={() => setReserveOpen(true)}
              className="flex-1 h-12 px-7 rounded-full bg-brand-400 text-ink-900 text-sm font-medium hover:bg-brand-300 transition-colors duration-fast"
            >
              Reserve at store
            </button>
            <button
              type="button"
              onClick={() => {
                dispatch(
                  toggleWishlist({
                    slug,
                    name: PRODUCT.name,
                    weight: `${PRODUCT.weightG.toFixed(2)} g · ${PRODUCT.purity}`,
                    priceLabel: `₹${(total / 100).toLocaleString('en-IN')}`,
                    img: PRODUCT.images[0] ?? '',
                  }),
                );
                toast.success(wishlisted ? 'Removed from wishlist' : 'Saved to wishlist');
              }}
              className={cn(
                'h-12 px-5 rounded-full border text-sm transition-colors duration-fast inline-flex items-center justify-center gap-2',
                wishlisted
                  ? 'border-brand-500 bg-brand-50 text-brand-800'
                  : 'border-ink-200 text-ink-900 hover:bg-ink-50',
              )}
              aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
              aria-pressed={wishlisted}
            >
              <Heart className={cn('h-4 w-4', wishlisted && 'fill-brand-500 text-brand-700')} />
              <span className="sm:hidden">Wishlist</span>
            </button>
          </div>

          <p className="text-xs text-ink-500">
            Available at <span className="text-ink-700">Main Showroom — Pune</span> · <span className="text-ink-700">Camp Branch — Pune</span>
          </p>

          {/* Trust row */}
          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs text-ink-600">
            <li className="flex flex-col items-start gap-1.5">
              <ShieldCheck className="h-4 w-4 text-brand-700" />
              <span>BIS hallmarked · weighed in front of you</span>
            </li>
            <li className="flex flex-col items-start gap-1.5">
              <Truck className="h-4 w-4 text-brand-700" />
              <span>Free Pune delivery · India shipping</span>
            </li>
            <li className="flex flex-col items-start gap-1.5">
              <RotateCcw className="h-4 w-4 text-brand-700" />
              <span>Lifetime exchange against pure-gold value</span>
            </li>
          </ul>

          {/* Accordions */}
          <div className="pt-4 border-t border-ink-100 divide-y divide-ink-100">
            <Accordion
              id="details"
              title="Product details"
              open={openSection === 'details'}
              onToggle={() => setOpenSection(openSection === 'details' ? null : 'details')}
            >
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-ink-500">SKU</dt>
                <dd className="text-ink-800 font-mono text-xs">{PRODUCT.sku}</dd>
                <dt className="text-ink-500">Gross weight</dt>
                <dd className="text-ink-800 tabular-nums">{PRODUCT.weightG.toFixed(2)} g</dd>
                <dt className="text-ink-500">Metal</dt>
                <dd className="text-ink-800">22K Gold (916 hallmark)</dd>
                <dt className="text-ink-500">Setting</dt>
                <dd className="text-ink-800">Hand-set, kundan accents</dd>
                <dt className="text-ink-500">Made in</dt>
                <dd className="text-ink-800">Pune, India</dd>
              </dl>
            </Accordion>
            <Accordion
              id="cert"
              title="Certification & hallmark"
              open={openSection === 'cert'}
              onToggle={() => setOpenSection(openSection === 'cert' ? null : 'cert')}
            >
              <p className="text-sm text-ink-600 leading-relaxed">
                Each piece carries a BIS 916 hallmark stamped on the inner band. You&apos;ll receive a printed certificate of weight, purity and current-day rate at billing — countersigned in store.
              </p>
            </Accordion>
            <Accordion
              id="shipping"
              title="Shipping & returns"
              open={openSection === 'shipping'}
              onToggle={() => setOpenSection(openSection === 'shipping' ? null : 'shipping')}
            >
              <p className="text-sm text-ink-600 leading-relaxed">
                Free delivery within Pune. India-wide shipping via insured Shiprocket within 4–6 working days. Returns accepted for 7 days in original packaging; exchange against pure-gold value valid for lifetime.
              </p>
            </Accordion>
          </div>
        </section>
      </div>

      {/* Related */}
      <section className="mt-20 md:mt-28">
        <div className="flex items-end justify-between mb-8">
          <h2 className="font-display text-[28px] md:text-[36px] leading-tight text-ink-900">You may also like</h2>
          <Link to="/store/collections" className="hidden sm:inline-block text-sm text-ink-700 hover:text-ink-900 border-b border-ink-200 pb-0.5">
            Browse all
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-10 md:gap-x-6">
          {RELATED.map((p) => (
            <Link key={p.slug} to={`/store/products/${p.slug}`} className="group block">
              <div className="aspect-[4/5] overflow-hidden bg-ink-100">
                <img src={p.img} alt={p.name} className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-slow" loading="lazy" />
              </div>
              <div className="mt-4">
                <h3 className="font-display text-[17px] leading-tight text-ink-900">{p.name}</h3>
                <p className="text-xs text-ink-500 mt-1">{p.weight}</p>
                <p className="text-sm text-ink-900 font-mono tabular-nums mt-1.5">{p.priceLabel}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Sticky mobile bar */}
      <div className="fixed lg:hidden bottom-0 left-0 right-0 bg-ink-0 border-t border-ink-100 px-4 py-3 flex items-center justify-between gap-3 z-30">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-ink-500">Total</p>
          <Money paise={total} className="text-lg font-mono tabular-nums" />
        </div>
        <button
          type="button"
          onClick={() => setReserveOpen(true)}
          className="flex-1 max-w-[220px] h-11 px-5 rounded-full bg-brand-400 text-ink-900 text-sm font-medium"
        >
          Reserve
        </button>
      </div>

      <ReserveModal
        open={reserveOpen}
        onClose={() => setReserveOpen(false)}
        productName={PRODUCT.name}
        purity={PRODUCT.purity}
        size={size}
        qty={qty}
        totalPaise={total}
      />
    </div>
  );
}

interface ReserveModalProps {
  open: boolean;
  onClose: () => void;
  productName: string;
  purity: string;
  size: string;
  qty: number;
  totalPaise: number;
}

function ReserveModal({ open, onClose, productName, purity, size, qty, totalPaise }: ReserveModalProps): JSX.Element {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+91 ');
  const [store, setStore] = useState<'main-showroom' | 'camp-branch'>('main-showroom');
  const [date, setDate] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return t.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter your name');
      return;
    }
    const phoneDigits = phone.replace(/\D/g, '');
    if (!/^91?[6-9]\d{9}$/.test(phoneDigits)) {
      toast.error('Please enter a valid Indian phone number');
      return;
    }
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 600));
    const id = 'ZL-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const storeLabel = store === 'main-showroom' ? 'Main Showroom — Pune' : 'Camp Branch — Pune';
    const dateLabel = new Date(date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
    toast.success(`Reserved! Confirmation ${id}`, {
      description: `We've held ${productName} for 48 hours. Visit ${storeLabel} by ${dateLabel}. We'll WhatsApp you a reminder.`,
      duration: 9000,
    });
    setSubmitting(false);
    onClose();
    setName('');
    setPhone('+91 ');
    setNotes('');
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-md max-h-[90vh] overflow-y-auto bg-ink-0 rounded-lg shadow-xl border border-ink-100 data-[state=open]:animate-in data-[state=open]:zoom-in-95">
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="font-display text-[22px] leading-tight text-ink-900">Reserve {productName}</Dialog.Title>
                <Dialog.Description className="text-xs text-ink-500 mt-1">
                  {purity} · Size {size}″ · Qty {qty} · <Money paise={totalPaise} className="font-mono" />
                </Dialog.Description>
              </div>
              <Dialog.Close className="text-ink-500 hover:text-ink-900 p-1 -mr-1 -mt-1 rounded-md hover:bg-ink-50" aria-label="Close">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Your name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                  className="mt-1 w-full h-11 px-3 rounded-lg border border-ink-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm"
                  placeholder="Full name"
                />
              </label>

              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Phone</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  inputMode="tel"
                  className="mt-1 w-full h-11 px-3 rounded-lg border border-ink-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm font-mono"
                  placeholder="+91 98XXX XXXXX"
                />
              </label>

              <fieldset>
                <legend className="text-[11px] uppercase tracking-wider text-ink-500">Preferred store</legend>
                <div className="mt-1 space-y-2">
                  <label className={cn(
                    'flex items-center gap-2.5 cursor-pointer rounded-lg border px-3 py-2.5 transition-colors',
                    store === 'main-showroom' ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:bg-ink-50',
                  )}>
                    <input type="radio" name="store" value="main-showroom" checked={store === 'main-showroom'} onChange={() => setStore('main-showroom')} className="accent-brand-500" />
                    <span className="text-sm text-ink-900">Main Showroom — Pune</span>
                  </label>
                  <label className={cn(
                    'flex items-center gap-2.5 cursor-pointer rounded-lg border px-3 py-2.5 transition-colors',
                    store === 'camp-branch' ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:bg-ink-50',
                  )}>
                    <input type="radio" name="store" value="camp-branch" checked={store === 'camp-branch'} onChange={() => setStore('camp-branch')} className="accent-brand-500" />
                    <span className="text-sm text-ink-900">Camp Branch — Pune</span>
                  </label>
                </div>
              </fieldset>

              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Visit by</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className="mt-1 w-full h-11 px-3 rounded-lg border border-ink-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Notes (optional)</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-ink-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm resize-none"
                  placeholder="Size confirmation, engraving requests, etc."
                />
              </label>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 h-11 rounded-full border border-ink-200 text-ink-900 text-sm hover:bg-ink-50 disabled:opacity-60 transition-colors duration-fast"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-[2] h-11 rounded-full bg-brand-400 text-ink-900 text-sm font-medium hover:bg-brand-300 disabled:opacity-60 transition-colors duration-fast"
              >
                {submitting ? 'Reserving…' : 'Confirm reservation'}
              </button>
            </div>

            <p className="text-[11px] text-ink-500 text-center leading-relaxed">
              We'll hold this piece for 48 hours. No payment online — pay in store at the current-day gold rate.
            </p>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-ink-500">{label}</span>
      <span className="text-ink-800 shrink-0 font-mono tabular-nums">{value}</span>
    </div>
  );
}

function Accordion({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`acc-${id}`}
        onClick={onToggle}
        className="w-full flex items-center justify-between py-4 text-left"
      >
        <span className="text-sm font-medium text-ink-900">{title}</span>
        <ChevronDown className={cn('h-4 w-4 text-ink-500 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div id={`acc-${id}`} className="pb-5">
          {children}
        </div>
      )}
    </div>
  );
}
