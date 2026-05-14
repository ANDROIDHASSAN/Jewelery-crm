import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Heart, ShieldCheck, Truck, RotateCcw, ChevronDown, Minus, Plus } from 'lucide-react';
import { Money } from '@/components/ui/money';
import { cn } from '@/lib/cn';

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
  const [size, setSize] = useState(SIZES[1]);
  const [qty, setQty] = useState(1);
  const [openSection, setOpenSection] = useState<string | null>('details');

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
            <button className="flex-1 h-12 px-7 rounded-full bg-brand-400 text-ink-900 text-sm font-medium hover:bg-brand-300 transition-colors duration-fast">
              Reserve at store
            </button>
            <button className="h-12 px-5 rounded-full border border-ink-200 text-ink-900 text-sm hover:bg-ink-50 transition-colors duration-fast inline-flex items-center justify-center gap-2" aria-label="Add to wishlist">
              <Heart className="h-4 w-4" />
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
        <button className="flex-1 max-w-[220px] h-11 px-5 rounded-full bg-brand-400 text-ink-900 text-sm font-medium">Reserve</button>
      </div>
    </div>
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
