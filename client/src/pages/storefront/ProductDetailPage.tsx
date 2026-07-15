import { Fragment, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Heart, Truck, RotateCcw, RefreshCw, Sparkles, Award, Banknote, ChevronDown, ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { Money } from '@/components/ui/money';
import { cn } from '@/lib/cn';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { signOut, upsertAddress } from '@/features/storefront/shopSlice';
import { useShopActions } from '@/features/storefront/useShopActions';
import { useAuthGate } from '@/features/storefront/AuthSheet';
import {
  useCreatePublicOrderMutation,
  useGetPublicProductsQuery,
  useGetPublicCollectionsQuery,
  useGetPublicGoldRateQuery,
  useGetProductReviewsQuery,
  useVerifyRazorpayPaymentMutation,
  type PublicProduct,
} from '@/features/storefront/storefrontApi';
import {
  productMaterialLabel,
  productMetaLabel,
  productPriceView,
  isNonPrecious,
  computeSalePrice,
} from '@/features/storefront/pricing';
import { openRazorpayCheckout } from '@/lib/razorpay';
import { StarRating } from './OrderReviewSheet';
import { SizeGuideDialog } from './SizeGuideDialog';

// Fallback 22K rate used only when the live /website/gold-rate feed hasn't
// hydrated yet (e.g. cold-start, first paint). The header + PDP both prefer
// the polled live feed via useGetPublicGoldRateQuery so the page stays in
// sync with the worker's 5-minute MCX refresh.
const FALLBACK_RATE_PER_GRAM_22K_PAISE = 6420_00;
const GST_BPS = 300;

export function ProductDetailPage(): JSX.Element {
  const { slug = '' } = useParams<{ slug: string }>();
  const [imgIdx, setImgIdx] = useState(0);
  // Selected size label. Empty until the shopper picks one; the price calc
  // falls back to the product's first size (or its base weight when unsized).
  const [size, setSize] = useState<string>('');
  const [qty, setQty] = useState(1);
  const [openSection, setOpenSection] = useState<string | null>('specs');
  const [reserveOpen, setReserveOpen] = useState(false);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const shop = useShopActions();
  const navigate = useNavigate();
  const wishlisted = useAppSelector((s) => s.shop.wishlist.some((w) => w.slug === slug));
  const { requireAuth } = useAuthGate();
  const { data: products, isLoading } = useGetPublicProductsQuery();
  const { data: categories = [] } = useGetPublicCollectionsQuery();
  // Live gold/silver rate — same poll cadence as the header ticker so the
  // PDP, header announcement bar, and breakdown row stay in lockstep.
  const { data: liveRate } = useGetPublicGoldRateQuery(undefined, {
    pollingInterval: 5 * 60 * 1000,
  });
  const contentLocations = useAppSelector((s) => s.storefrontContent.locations);

  const product: PublicProduct | undefined = products?.find((p) => p.slug === slug);
  const category = product ? categories.find((c) => c.id === product.categoryId) : undefined;
  const related: PublicProduct[] = (products ?? []).filter((p) => p.slug !== slug).slice(0, 4);

  // Loading + not-found states (early-return AFTER hooks so the React hooks order is stable).
  if (isLoading) {
    return (
      <div className="bg-[#FDF8F4] min-h-[60vh]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center text-ink-500 text-sm">
          Loading the piece…
        </div>
      </div>
    );
  }
  if (!product) {
    return (
      <div className="bg-[#FDF8F4] min-h-[60vh]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
          <h1 className="font-display text-2xl sm:text-[28px] leading-tight text-ink-900 mb-3">Piece not found</h1>
          <p className="text-ink-600 mb-6 max-w-prose mx-auto">
            We couldn&apos;t find a piece with that slug. It may have been retired or not yet published.
          </p>
          <Link to="/store/collections" className="inline-block text-sm text-ink-900 underline decoration-brand-500 underline-offset-4">
            Browse the collection
          </Link>
        </div>
      </div>
    );
  }

  // Size variants (rings, bangles). When present, the selected size's weight
  // drives the whole price calc below — only the metal value changes between
  // sizes. `selectedSize` defaults to the first option until the shopper picks
  // one (derived, not an effect, to keep hook order stable across the early
  // returns above).
  const sizeOptions = (product.sizes ?? []).filter((s) => s.weightMg > 0);
  const selectedSize = sizeOptions.find((s) => s.label === size) ?? sizeOptions[0];
  const effectiveWeightMg = selectedSize?.weightMg ?? product.weightMg;

  const weightG = effectiveWeightMg / 1000;
  const purityK = product.purityCaratX100 / 100;
  // Material label — never "0K · BIS Hallmarked" for non-precious / gold-tone
  // pieces (stainless steel carries no carat and isn't hallmarked).
  const purity = productMaterialLabel(product);
  const nonPrecious = isNonPrecious(product);

  // Determine if this product is gold-based. Only GOLD and DIAMOND items
  // use the gold rate for valuation. Silver, Stainless Steel, Platinum and
  // Other metals must NOT use the gold rate — this was the root cause of the
  // Tone Necklace (STAINLESS_STEEL) being priced using the silver rate but
  // labelled as "Gold value".
  // A fixed selling price is the all-in tag price (GST-inclusive). When set we
  // bypass the live metal-rate calc for EVERY metal type and price off the
  // pre-GST fixed base (mirrored onto basePricePaise), so the displayed total
  // matches what POS + checkout charge. Routing through the non-precious branch
  // below (metalValue = basePricePaise) does exactly that. Sized fixed-price
  // pieces scale that base by the selected size's weight (handled in that branch).
  const isFixed = product.fixedPricePaise != null;
  const isGold = !isFixed && (product.metalType === 'GOLD' || product.metalType === 'DIAMOND' || product.metalType === null);
  const isSilver = !isFixed && product.metalType === 'SILVER';

  // Resolve a per-gram rate from the live feed. Strategy:
  //   1. If the feed has an entry matching this piece's exact purity
  //      (silver → purity=0, 14K → 1400, 18K → 1800, 22K → 2200, 24K → 2400),
  //      use that rate directly — most accurate path.
  //   2. Otherwise scale the 22K rate by the piece's purity ratio (legacy
  //      fallback formula). Keeps the breakdown working for any future
  //      non-standard purity grades the feed doesn't carry yet.
  //   3. If the feed hasn't hydrated at all (cold start) use the hardcoded
  //      fallback so the page never renders ₹0.
  const findRate = (p: number): number | undefined =>
    liveRate?.rates.find((r) => r.purity === p)?.ratePerGramPaise;
  const live22 = findRate(2200);
  const liveSilver = findRate(0); // purity=0 is the silver canonical
  const exactRate = findRate(product.purityCaratX100);

  // Metal value calculation — gated on metal type.
  // Gold/Diamond: use gold rate (exact match or 22K-scaled). Default for
  //   legacy products without a metalType (backwards compatibility).
  // Silver: use the silver (purity=0) rate from the feed.
  // Stainless Steel / Platinum / Other: no live-rate metal component;
  //   basePricePaise already captures the fixed cost.
  let metalValuePaise = 0;
  let displayRatePerGramPaise = 0;
  let ratePerGramPaise = 0;

  if (isGold) {
    ratePerGramPaise = exactRate ?? live22 ?? FALLBACK_RATE_PER_GRAM_22K_PAISE;
    displayRatePerGramPaise = exactRate ?? ratePerGramPaise;
    metalValuePaise = exactRate
      ? Math.round((effectiveWeightMg * exactRate) / 1000)
      : Math.round(
          (effectiveWeightMg * ratePerGramPaise * product.purityCaratX100) /
            (1000 * 2200),
        );
  } else if (isSilver) {
    ratePerGramPaise = liveSilver ?? 0;
    displayRatePerGramPaise = ratePerGramPaise;
    metalValuePaise = Math.round((effectiveWeightMg * ratePerGramPaise) / 1000);
  } else {
    // Fixed price / Stainless Steel / Platinum / Other: basePricePaise is the
    // pre-GST base. For sized pieces, scale that base by the selected size's
    // weight (per-gram from base) so heavier sizes cost proportionally more —
    // matching the Add/Edit Item size preview and the server checkout calc.
    metalValuePaise =
      sizeOptions.length > 0 && product.weightMg > 0
        ? Math.round((product.basePricePaise * effectiveWeightMg) / product.weightMg)
        : product.basePricePaise;
  }

  const gold = metalValuePaise; // kept as `gold` for downstream compatibility

  // Making charges — respect the item-level mode (PERCENTAGE or PER_GRAM).
  // PERCENTAGE: bps × metalValue / 10000 (e.g. 12% of gold value)
  // PER_GRAM:   perGramPaise × weightG (flat ₹/g regardless of metal rate)
  // If metalType is non-precious (no metalValuePaise), making charges are
  // per-gram only since there is no metal value to take a percentage of.
  // Fixed-priced pieces carry no separate making charge — the inclusive price
  // already covers everything, so the only addition is GST below.
  let making = 0;
  if (isFixed) {
    making = 0;
  } else if (product.makingChargeMode === 'PER_GRAM' && product.makingChargePerGramPaise != null) {
    making = Math.round((product.makingChargePerGramPaise * effectiveWeightMg) / 1000);
  } else if (product.makingChargeBps > 0 && gold > 0) {
    // PERCENTAGE mode (default) — percentage of gold/silver metal value
    making = Math.round((gold * product.makingChargeBps) / 10000);
  }

  // stoneChargePaise is stored GST-inclusive; strip the embedded 3% before
  // computing the uniform GST so diamonds are not taxed twice.
  const stoneBasePaise = Math.round((product.stoneChargePaise * 10000) / 10300);
  const subtotal = gold + making + stoneBasePaise;
  const gst = Math.round((subtotal * GST_BPS) / 10000);
  const total = subtotal + gst;
  // Season Sale offer (% off / ₹ off / BOGO) — drives the struck price + badge.
  const offer = computeSalePrice(total, product.sale);
  const salePrice = offer?.discountedPaise ?? total;
  // What the cut is actually worth. 0 for BOGO-only offers (no per-unit price
  // change) and when there's no offer at all. Clamped so a FIXED_PRICE offer set
  // ABOVE the computed price can't render a negative "discount".
  const discountPaise = Math.max(0, total - salePrice);

  // Human label for the pill — "22K", "18K", "Silver", "Stainless Steel", "Pt 950", or the
  // exact carat for custom alloys.
  const purityLabelShort =
    product.metalType === 'STAINLESS_STEEL'
      ? 'Stainless Steel'
      : product.metalType === 'SILVER' || product.purityCaratX100 === 0
        ? 'Silver'
        : product.purityCaratX100 === 9500
          ? 'Pt 950'
          : `${Number.isInteger(purityK) ? purityK.toFixed(0) : purityK.toFixed(1)}K`;
  // "Updated 4:12 PM IST" — null until the live feed lands, in which case
  // we hide the "Updated …" portion rather than showing a fake time.
  const rateUpdatedLabel = liveRate
    ? new Date(liveRate.asOf).toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      })
    : null;
  // Stale flag from the worker — if MCX hasn't responded in a while the
  // server still returns the last-known rate but marks it stale. Surface
  // that to the customer so they know what they're seeing.
  const rateIsStale =
    liveRate?.rates.find((r) => r.purity === product.purityCaratX100)?.stale ??
    liveRate?.rates.find((r) => r.purity === 2200)?.stale ??
    false;

  return (
    <div className="bg-[#FDF8F4]">
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8 sm:py-10 md:py-14 pb-28 lg:pb-14">
      <nav className="text-xs text-ink-500 mb-6" aria-label="Breadcrumb">
        <Link to="/store" className="hover:text-brand-700 transition-colors">Home</Link>
        <span className="mx-2 text-ink-300">/</span>
        {category ? (
          <Link to={`/store/collections/${category.slug}`} className="hover:text-brand-700 transition-colors">{category.name}</Link>
        ) : (
          <Link to="/store/collections" className="hover:text-brand-700 transition-colors">Collections</Link>
        )}
        <span className="mx-2 text-ink-300">/</span>
        <span className="text-ink-800">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,690px)_1fr] gap-8 sm:gap-10 lg:gap-14">
        {/* Gallery — main image is a 690×690 square (shrinks responsively on
            narrow screens); prev/next slide buttons, thumbnails in a strip below. */}
        <section className="mx-auto w-full max-w-[690px] lg:mx-0">
          <div className="relative aspect-square overflow-hidden bg-[#FAF3EE] rounded-sm">
            <img src={product.images[imgIdx]} alt={product.name} className="h-full w-full object-cover" />
            {product.images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setImgIdx((i) => (i - 1 + product.images.length) % product.images.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 inline-flex items-center justify-center rounded-full bg-ink-0/80 text-ink-800 shadow-sm backdrop-blur hover:bg-ink-0 transition-colors"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setImgIdx((i) => (i + 1) % product.images.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 inline-flex items-center justify-center rounded-full bg-ink-0/80 text-ink-800 shadow-sm backdrop-blur hover:bg-ink-0 transition-colors"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
          {/* Thumbnails — horizontal strip below the main image */}
          {product.images.length > 1 && (
            <div className="mt-3 flex gap-2 sm:gap-3 overflow-x-auto pb-1">
              {product.images.map((src, i) => (
                <button
                  key={src}
                  onClick={() => setImgIdx(i)}
                  className={cn(
                    'h-16 w-16 sm:h-20 sm:w-20 shrink-0 aspect-square overflow-hidden bg-[#FAF3EE] rounded-sm transition-all',
                    i === imgIdx ? 'ring-1 ring-brand-500 ring-offset-2 ring-offset-[#FDF8F4]' : 'opacity-70 hover:opacity-100',
                  )}
                  aria-label={`View image ${i + 1}`}
                >
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Info */}
        <section className="space-y-6 sm:space-y-7">
          <header>
            <p className="text-eyebrow uppercase text-brand-700">{category?.name ?? 'Collection'} · {purity}</p>
            <h1 className="font-display text-2xl sm:text-[34px] md:text-[40px] leading-[1.1] text-ink-900 mt-2">{product.name}</h1>
            <p className="mt-2 text-sm text-ink-600">{weightG.toFixed(2)} g · {purity}</p>
          </header>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <Money paise={salePrice} className="font-mono text-2xl sm:text-[32px] text-ink-900 tabular-nums" />
              {offer?.hasStrike && (
                <Money paise={total} className="font-mono text-base sm:text-lg text-ink-400 tabular-nums line-through" />
              )}
              <span className="text-xs text-ink-500">Incl. of all taxes</span>
            </div>
            {offer && (
              <span className="inline-flex items-center bg-brand-600 text-ink-0 text-[11px] font-semibold uppercase tracking-[0.1em] px-2.5 py-1 rounded-sm">
                {offer.badge}
              </span>
            )}
          </div>

          {/* Today's rate pill — only shown for gold/silver items with a live
              rate feed. Non-precious metals (Stainless Steel etc.) have a fixed
              cost price so no live rate applies. */}
          {(isGold || isSilver) && displayRatePerGramPaise > 0 && (
          <div
            className={cn(
              'inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 px-3 py-1.5 rounded-full text-xs font-mono tabular-nums',
              rateIsStale
                ? 'bg-warning-50 text-warning-800'
                : 'bg-brand-50 text-brand-800',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                rateIsStale ? 'bg-warning-500' : 'bg-brand-500',
              )}
            />
            <span>
              Today&apos;s {purityLabelShort} rate · ₹
              {(displayRatePerGramPaise / 100).toLocaleString('en-IN')}/g
            </span>
            {rateUpdatedLabel && (
              <span className="text-brand-700/70 hidden sm:inline">
                · {rateIsStale ? 'Last known' : 'Updated'} {rateUpdatedLabel}
              </span>
            )}
          </div>
          )}

          {/* Transparent price breakdown. Only shown for gold/silver items
              where a live rate drives the total. Non-precious metals (Stainless
              Steel, Other) use basePricePaise as the fixed price — no breakdown. */}
          {(isGold || isSilver) && (
          <div className="rounded-md border border-[#EFE0D2] bg-ink-0 p-4 sm:p-5 space-y-2.5 text-sm">
            <p className="text-eyebrow uppercase text-brand-700">Price breakdown</p>
            <Row
              label={
                isGold
                  ? (exactRate
                    ? `Gold value · ${weightG.toFixed(2)} g × ₹${(displayRatePerGramPaise / 100).toLocaleString('en-IN')}/g`
                    : `Gold value · ${weightG.toFixed(2)} g × ₹${(ratePerGramPaise / 100).toLocaleString('en-IN')}/g (22K) × ${purityK}/22`)
                  : `Silver value · ${weightG.toFixed(2)} g × ₹${(displayRatePerGramPaise / 100).toLocaleString('en-IN')}/g`
              }
              value={<Money paise={gold} />}
            />
            <Row label="GST (3%)" value={<Money paise={gst} />} />
            <div className="border-t border-ink-100 pt-2.5 flex items-center justify-between">
              <span className="text-ink-900 font-medium">Total</span>
              <Money paise={total} className="text-ink-900 font-medium font-mono tabular-nums" />
            </div>
          </div>
          )}

          {/* Size — only shown for pieces that carry size variants. Each size
              has its own weight, so picking one re-prices the metal value,
              making charge, GST and total above. */}
          {sizeOptions.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-eyebrow uppercase text-ink-500">Size</span>
              <button
                type="button"
                onClick={() => setSizeGuideOpen(true)}
                className="text-xs text-ink-700 underline decoration-ink-200 underline-offset-4 hover:decoration-ink-500"
              >
                Size guide
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {sizeOptions.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setSize(s.label)}
                  className={cn(
                    'h-10 min-w-[64px] px-4 rounded-full border text-sm transition-colors',
                    selectedSize?.label === s.label ? 'border-ink-900 bg-ink-900 text-ink-0' : 'border-ink-200 text-ink-700 hover:border-ink-400',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          )}

          {/* Quantity + actions */}
          {product.inStock === false && (
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-ink-900 text-ink-0 text-xs uppercase tracking-[0.18em]">
              Sold out
            </div>
          )}
          <div className="flex flex-wrap gap-3 items-stretch">
            <div className="inline-flex items-center h-12 rounded-full border border-ink-200 overflow-hidden shrink-0">
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
              disabled={product.inStock === false}
              onClick={() => {
                // pricePaise is the pre-GST live-computed unit price (gold
                // value + making + stone). Cart sidebar adds GST on top so
                // the cart total matches what the PDP shows incl. GST.
                const doAdd = (): void => {
                  shop.addToCart({
                    slug,
                    productId: product.id,
                    name: product.name,
                    weight: `${weightG.toFixed(2)} g · ${purity}`,
                    priceLabel: `₹${(salePrice / 100).toLocaleString('en-IN')}`,
                    pricePaise: offer ? Math.round(salePrice / 1.03) : subtotal,
                    size: selectedSize?.label,
                    img: product.images[0] ?? '',
                    qty,
                  });
                  toast.success(`${product.name} added to bag`);
                };
                // Amazon-style: anonymous → sign-in wall, then resume the
                // add-to-cart automatically. Already signed in → fires
                // synchronously and proceeds with no friction.
                requireAuth({
                  intent: 'add-to-cart',
                  interest: `${product.name}${category ? ` (${category.name})` : ''}`,
                  mergeCart: [{ productId: product.id, qty }],
                  resume: doAdd,
                });
              }}
              className="flex-1 min-w-[140px] h-12 px-5 sm:px-7 rounded-full bg-ink-900 text-ink-0 text-sm font-medium hover:bg-ink-700 transition-colors duration-fast disabled:bg-ink-200 disabled:text-ink-500 disabled:cursor-not-allowed"
            >
              {product.inStock === false ? 'Sold out' : 'Add to bag'}
            </button>
            <button
              type="button"
              disabled={product.inStock === false}
              onClick={() => {
                const doAddAndGo = (): void => {
                  shop.addToCart({
                    slug,
                    productId: product.id,
                    name: product.name,
                    weight: `${weightG.toFixed(2)} g · ${purity}`,
                    priceLabel: `₹${(salePrice / 100).toLocaleString('en-IN')}`,
                    pricePaise: offer ? Math.round(salePrice / 1.03) : subtotal,
                    size: selectedSize?.label,
                    img: product.images[0] ?? '',
                    qty,
                  });
                  navigate('/store/cart');
                };
                requireAuth({
                  intent: 'buy-now',
                  interest: `${product.name}${category ? ` (${category.name})` : ''}`,
                  mergeCart: [{ productId: product.id, qty }],
                  resume: doAddAndGo,
                });
              }}
              className="flex-1 min-w-[140px] h-12 px-5 sm:px-7 rounded-full bg-brand-400 text-ink-900 text-sm font-medium hover:bg-brand-300 transition-colors duration-fast disabled:bg-ink-100 disabled:text-ink-400 disabled:cursor-not-allowed"
            >
              Buy now
            </button>
            <button
              type="button"
              onClick={() => {
                const doToggle = (): void => {
                  shop.toggleWishlist({
                    slug,
                    productId: product.id,
                    name: product.name,
                    weight: `${weightG.toFixed(2)} g · ${purity}`,
                    priceLabel: `₹${(salePrice / 100).toLocaleString('en-IN')}`,
                    pricePaise: offer ? Math.round(salePrice / 1.03) : subtotal,
                    img: product.images[0] ?? '',
                  });
                  toast.success(wishlisted ? 'Removed from wishlist' : 'Saved to wishlist');
                };
                // Removing from wishlist doesn't need auth (only signed-in
                // users have wishlist items in the first place). Adding does.
                if (wishlisted) {
                  doToggle();
                  return;
                }
                requireAuth({
                  intent: 'wishlist',
                  interest: `${product.name}${category ? ` (${category.name})` : ''}`,
                  mergeWishlist: [{ productId: product.id }],
                  resume: doToggle,
                });
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

          {contentLocations.length > 0 && (
            <p className="text-xs text-ink-500">
              Available at{' '}
              {contentLocations.map((loc, i) => (
                <span key={loc.id}>
                  {i > 0 && ' · '}
                  <span className="text-ink-700">{loc.name}</span>
                </span>
              ))}
            </p>
          )}

          {/* Feature / assurance grid — boxed icon row (Palmonas-style). The
              top row adapts to the metal (gold-tone fashion vs precious), the
              bottom row carries the universal service promises. */}
          <div className="pt-2 space-y-3">
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#F6EEE6] p-4 sm:p-5">
              <PdpFeature icon={<Truck className="h-6 w-6" />} label="Free Shipping" />
              <PdpFeature
                icon={<Sparkles className="h-6 w-6" />}
                label={nonPrecious ? 'Skin Safe Jewellery' : 'BIS Hallmarked'}
              />
              <PdpFeature
                icon={<Award className="h-6 w-6" />}
                label={nonPrecious ? '18K Gold Tone Plated' : 'Certified Purity'}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <PdpFeature boxed icon={<RotateCcw className="h-5 w-5" />} label="7 Day Returns" />
              <PdpFeature
                boxed
                icon={<RefreshCw className="h-5 w-5" />}
                label={nonPrecious ? '10 Day Exchange' : 'Lifetime Exchange'}
              />
              <PdpFeature boxed icon={<Banknote className="h-5 w-5" />} label="Cash on Delivery" />
            </div>
          </div>

          {/* Accordions — Specification · Price Breakup · Description · Supplier · Returns */}
          <div className="pt-4 border-t border-ink-100 divide-y divide-ink-100">
            <Accordion
              id="specs"
              title="Specification"
              open={openSection === 'specs'}
              onToggle={() => setOpenSection(openSection === 'specs' ? null : 'specs')}
            >
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-ink-500">SKU</dt>
                <dd className="text-ink-800 font-mono text-xs">{product.sku ?? product.slug}</dd>
                <dt className="text-ink-500">Gross weight</dt>
                <dd className="text-ink-800 tabular-nums">{weightG.toFixed(2)} g</dd>
                <dt className="text-ink-500">Metal</dt>
                <dd className="text-ink-800">{purity}</dd>
                {category && (
                  <>
                    <dt className="text-ink-500">Collection</dt>
                    <dd className="text-ink-800">{category.name}</dd>
                  </>
                )}
                {product.makingChargeBps > 0 && (
                  <>
                    <dt className="text-ink-500">Making charge</dt>
                    <dd className="text-ink-800 tabular-nums">{(product.makingChargeBps / 100).toFixed(2)}%</dd>
                  </>
                )}
                {/* Custom "Details & Dimensions" spec rows captured at intake
                    (Add item / PO), shown only when the item carries them. */}
                {(product.specs ?? []).map((s, i) => (
                  <Fragment key={`${s.label}-${i}`}>
                    <dt className="text-ink-500">{s.label}</dt>
                    <dd className="text-ink-800">{s.value}</dd>
                  </Fragment>
                ))}
              </dl>
              {!nonPrecious && (
                <p className="mt-4 text-sm text-ink-600 leading-relaxed">
                  Each piece carries a BIS 916 hallmark stamped on the inner band. You&apos;ll receive a printed certificate of weight, purity and current-day rate at billing — countersigned in store.
                </p>
              )}
            </Accordion>
            <Accordion
              id="pricebreakup"
              title="Price Breakup"
              open={openSection === 'pricebreakup'}
              onToggle={() => setOpenSection(openSection === 'pricebreakup' ? null : 'pricebreakup')}
            >
              <div className="space-y-4 text-sm">
                {/* Metal / base value — three columns mirror the in-store
                    certificate: rate · weight · final value. Non-precious or
                    fixed-price pieces have no live rate, so we drop the rate
                    column and show just weight × final value. */}
                <div>
                  <p className="font-medium text-ink-900 mb-2">{purity}</p>
                  {isGold || isSilver ? (
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Money
                          paise={weightG > 0 ? Math.round(gold / weightG) : displayRatePerGramPaise}
                          className="block text-ink-800 font-mono tabular-nums"
                        />
                        <span className="text-xs text-ink-500">Rate / g</span>
                      </div>
                      <div>
                        <span className="block text-ink-800 font-mono tabular-nums">{weightG.toFixed(2)} g</span>
                        <span className="text-xs text-ink-500">Weight</span>
                      </div>
                      <div className="text-right">
                        <Money paise={gold} className="block text-ink-800 font-mono tabular-nums" />
                        <span className="text-xs text-ink-500">Final value</span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="block text-ink-800 font-mono tabular-nums">{weightG.toFixed(2)} g</span>
                        <span className="text-xs text-ink-500">Weight</span>
                      </div>
                      <div className="text-right">
                        <Money paise={gold} className="block text-ink-800 font-mono tabular-nums" />
                        <span className="text-xs text-ink-500">Final value</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Diamond / stone groups — one block per stone group, mirroring
                    the metal block: carat weight · count · final value. The
                    values are already part of stoneChargePaise (and the total). */}
                {(product.diamonds ?? []).map((d, i) => {
                  const label = `${d.shape ? d.shape.charAt(0) + d.shape.slice(1).toLowerCase() + ' ' : ''}Diamond`;
                  return (
                    <div key={i} className="border-t border-ink-100 pt-3">
                      <p className="font-medium text-ink-900 mb-2">{label}</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <span className="block text-ink-800 font-mono tabular-nums">
                            {(d.caratWeightX100 / 100).toFixed(3)} ct
                          </span>
                          <span className="text-xs text-ink-500">Weight</span>
                        </div>
                        <div>
                          <span className="block text-ink-800 font-mono tabular-nums">{d.count}</span>
                          <span className="text-xs text-ink-500">Count</span>
                        </div>
                        <div className="text-right">
                          <Money paise={Math.round((d.valuePaise * 10000) / 10300)} className="block text-ink-800 font-mono tabular-nums" />
                          <span className="text-xs text-ink-500">Excl. GST</span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Charges & tax */}
                <div className="border-t border-ink-100 pt-3 space-y-2">
                  {making > 0 && <Row label="Making charges" value={<Money paise={making} />} />}
                  {/* Legacy fallback: products with a manual stone charge but no
                      detailed diamond groups still show a single line (excl. GST). */}
                  {(product.diamonds ?? []).length === 0 && product.stoneChargePaise > 0 && (
                    <Row label="Stone / diamond charges" value={<Money paise={Math.round((product.stoneChargePaise * 10000) / 10300)} />} />
                  )}
                  <Row label="GST (3%)" value={<Money paise={gst} />} />
                </div>

                {/* Grand total.
                    The Season Sale cut applies to the GST-INCLUSIVE total (that's
                    what computeSalePrice is handed), so it lands below the tax
                    line rather than in the charges block above.
                    This used to end at `total` — the pre-discount price — so a
                    piece on 30% off showed ₹1,700.00 here while the buy box
                    charged ₹1,190.00. */}
                {discountPaise > 0 ? (
                  <div className="border-t border-ink-100 pt-3 space-y-2">
                    <Row
                      label="Sub total"
                      value={<Money paise={total} />}
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-success-700">
                        Discount{offer?.priceBadge ? ` · ${offer.priceBadge}` : ''}
                      </span>
                      <span className="text-success-700 font-mono tabular-nums">
                        −<Money paise={discountPaise} withSymbol />
                      </span>
                    </div>
                    <div className="border-t border-ink-100 pt-3 flex items-center justify-between">
                      <span className="text-ink-900 font-medium">Grand Total</span>
                      <Money paise={salePrice} className="text-ink-900 font-medium font-mono tabular-nums" />
                    </div>
                    <p className="text-xs text-success-700">
                      You save <Money paise={discountPaise} withSymbol /> on this piece.
                    </p>
                  </div>
                ) : (
                  <div className="border-t border-ink-100 pt-3 flex items-center justify-between">
                    <span className="text-ink-900 font-medium">Grand Total</span>
                    <Money paise={salePrice} className="text-ink-900 font-medium font-mono tabular-nums" />
                  </div>
                )}
                {/* BOGO carries no per-unit price cut — the second piece is free
                    at checkout depending on cart pairing — so it gets a note
                    rather than a discount line that would misstate this total. */}
                {offer?.bogo && (
                  <p className="text-xs text-brand-700">
                    Buy 1 Get 1 free — add a pair to the bag to see it applied.
                  </p>
                )}
              </div>
            </Accordion>
            <Accordion
              id="description"
              title="Description"
              open={openSection === 'description'}
              onToggle={() => setOpenSection(openSection === 'description' ? null : 'description')}
            >
              <p className="text-sm text-ink-600 leading-relaxed whitespace-pre-line">
                {product.descriptionMd?.trim()
                  ? product.descriptionMd
                  : `${product.name} — ${purity}, ${weightG.toFixed(2)} g. Handcrafted ${nonPrecious ? 'gold-tone' : 'fine'} jewellery${category ? ` from our ${category.name} collection` : ''}.`}
              </p>
            </Accordion>
            <Accordion
              id="supplier"
              title="Supplier Information"
              open={openSection === 'supplier'}
              onToggle={() => setOpenSection(openSection === 'supplier' ? null : 'supplier')}
            >
              <div className="text-sm text-ink-600 leading-relaxed space-y-1.5">
                <p><span className="text-ink-500">Sold by</span> · Zehlora Jewellers, Haryana — since 1972</p>
                <p><span className="text-ink-500">Country of origin</span> · India</p>
                <p><span className="text-ink-500">Manufactured &amp; packed at</span> · Gurugram, Haryana</p>
                <p className="pt-1">For product, sizing or warranty queries, reach us from the Help page or visit your nearest Zehlora store.</p>
              </div>
            </Accordion>
            <Accordion
              id="returns"
              title="Returns"
              open={openSection === 'returns'}
              onToggle={() => setOpenSection(openSection === 'returns' ? null : 'returns')}
            >
              <p className="text-sm text-ink-600 leading-relaxed">
                Free delivery within Haryana; India-wide insured shipping in 4–6 working days. Returns accepted for 7 days in original packaging{nonPrecious ? ' with a 10-day exchange window' : '; lifetime exchange against pure-gold value'}. Cash on delivery available.
              </p>
            </Accordion>
          </div>
        </section>
      </div>

      {/* Reviews — pulled from OrderReview rows on orders that included
          this product. Hidden entirely until the product has at least one
          review so an empty section doesn't add noise to a fresh PDP. */}
      <ProductReviews slug={slug} />

      {/* Related */}
      <section className="mt-16 sm:mt-20 md:mt-28">
        <div className="flex items-end justify-between mb-6 sm:mb-8 gap-4">
          <h2 className="font-display text-2xl sm:text-[28px] md:text-[36px] leading-tight text-ink-900">You may also like</h2>
          <Link to="/store/collections" className="hidden sm:inline-block text-sm text-ink-700 hover:text-ink-900 border-b border-ink-200 pb-0.5 shrink-0">
            Browse all
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-8 sm:gap-x-5 sm:gap-y-10 md:gap-x-6">
          {related.map((p) => {
            // Same offer treatment as every other grid — a discounted piece must
            // not read full price just because it's in the "related" strip.
            const rp = productPriceView(p, liveRate?.rates);
            return (
              <Link key={p.slug} to={`/store/products/${p.slug}`} className="group block">
                <div className="relative aspect-[4/5] overflow-hidden bg-ink-100">
                  <img
                    src={p.images[0] ?? ''}
                    alt={p.name}
                    className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-slow"
                    loading="lazy"
                  />
                  {rp.badge && (
                    <span className="absolute top-2 right-2 z-10 bg-brand-600 text-ink-0 text-[10px] font-semibold uppercase tracking-[0.12em] px-2 py-1 rounded-sm shadow-sm">
                      {rp.badge}
                    </span>
                  )}
                </div>
                <div className="mt-3 sm:mt-4">
                  <h3 className="font-display text-base sm:text-[17px] leading-tight text-ink-900">{p.name}</h3>
                  <p className="text-[11px] sm:text-xs text-ink-500 mt-1">
                    {(p.weightMg / 1000).toFixed(2)} g{productMetaLabel(p) ? ` · ${productMetaLabel(p)}` : ''}
                  </p>
                  <p className="text-sm text-ink-900 font-mono tabular-nums mt-1 sm:mt-1.5 flex items-baseline gap-1.5">
                    <span>₹{(rp.finalPaise / 100).toLocaleString('en-IN')}</span>
                    {rp.hasStrike && (
                      <span className="text-xs text-ink-400 line-through">
                        ₹{(rp.originalPaise / 100).toLocaleString('en-IN')}
                      </span>
                    )}
                  </p>
                </div>
              </Link>
            );
          })}
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
          onClick={() => {
            const doAddAndGo = (): void => {
              shop.addToCart({
                slug,
                productId: product.id,
                name: product.name,
                weight: `${weightG.toFixed(2)} g · ${purity}`,
                priceLabel: `₹${(total / 100).toLocaleString('en-IN')}`,
                pricePaise: subtotal,
                size: selectedSize?.label,
                img: product.images[0] ?? '',
                qty,
              });
              navigate('/store/cart');
            };
            requireAuth({
              intent: 'buy-now',
              interest: `${product.name}${category ? ` (${category.name})` : ''}`,
              mergeCart: [{ productId: product.id, qty }],
              resume: doAddAndGo,
            });
          }}
          className="flex-1 max-w-[220px] h-11 px-5 rounded-full bg-brand-400 text-ink-900 text-sm font-medium"
        >
          Buy now
        </button>
      </div>

      <ReserveModal
        open={reserveOpen}
        onClose={() => setReserveOpen(false)}
        productId={product.id}
        productSlug={product.slug}
        productName={product.name}
        purity={purity}
        size={size}
        qty={qty}
        totalPaise={total}
      />

      <SizeGuideDialog open={sizeGuideOpen} onClose={() => setSizeGuideOpen(false)} />
    </div>
    </div>
  );
}

// Public reviews for a product. Renders nothing when the product has no
// reviews yet — a quiet PDP beats a "Be the first to review!" plea. Fetches
// summary + recent reviews in a single round trip via /products/:slug/reviews.
function ProductReviews({ slug }: { slug: string }): JSX.Element | null {
  const { data, isLoading } = useGetProductReviewsQuery({ slug, limit: 12 });

  // Keep the page short while the query resolves rather than reserving
  // vertical space with a skeleton — reviews are below-the-fold and unlikely
  // to be scrolled to before the data lands.
  if (isLoading || !data || data.summary.count === 0) return null;

  const { summary, reviews } = data;
  const maxBar = Math.max(1, ...Object.values(summary.distribution));

  return (
    <section className="mt-16 sm:mt-20 md:mt-24 border-t border-ink-100 pt-12 sm:pt-16">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-8 sm:mb-10">
        <div>
          <p className="text-eyebrow uppercase text-ink-500">Reviews</p>
          <h2 className="font-display text-2xl sm:text-[28px] md:text-[36px] leading-tight text-ink-900 mt-1.5">
            What our customers say
          </h2>
        </div>
        <p className="text-xs text-ink-500 max-w-xs sm:text-right">
          Reviews come from customers who&apos;ve received this piece — only delivered orders can be reviewed.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8 md:gap-12">
        {/* Summary card — avg + stars + per-bucket distribution. */}
        <aside className="rounded-lg border border-brand-200/60 bg-gradient-to-br from-brand-50/60 via-ink-0 to-ink-0 p-5 sm:p-6 h-fit">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-4xl sm:text-5xl text-ink-900 tabular-nums leading-none">
              {summary.avg.toFixed(1)}
            </span>
            <span className="text-sm text-ink-500">/ 5</span>
          </div>
          <div className="mt-2.5">
            <StarRating rating={Math.round(summary.avg)} size="md" />
          </div>
          <p className="text-xs text-ink-600 mt-2.5">
            From {summary.count} review{summary.count === 1 ? '' : 's'}
          </p>
          <hr className="my-5 border-ink-100" />
          <ul className="space-y-1.5">
            {([5, 4, 3, 2, 1] as const).map((star) => {
              const count = summary.distribution[String(star) as '1' | '2' | '3' | '4' | '5'] ?? 0;
              const pct = (count / maxBar) * 100;
              return (
                <li key={star} className="flex items-center gap-2.5 text-xs">
                  <span className="text-ink-500 font-mono w-3 tabular-nums">{star}</span>
                  <span className="text-brand-500">★</span>
                  <span className="flex-1 h-1.5 rounded-full bg-ink-50 overflow-hidden">
                    <span
                      className="block h-full rounded-full bg-brand-300 transition-all duration-slow"
                      style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
                    />
                  </span>
                  <span className="text-ink-500 font-mono tabular-nums w-8 text-right">{count}</span>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Review list. */}
        <ol className="space-y-6 sm:space-y-8">
          {reviews.map((r) => {
            const when = new Date(r.createdAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });
            return (
              <li
                key={r.id}
                className="border-b border-ink-100 last:border-b-0 pb-6 sm:pb-8 last:pb-0"
              >
                <div className="flex items-center justify-between gap-3 mb-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <StarRating rating={r.rating} />
                    {r.title && (
                      <span className="text-sm font-medium text-ink-900 truncate">
                        {r.title}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-ink-500 font-mono tabular-nums whitespace-nowrap shrink-0">
                    {when}
                  </span>
                </div>
                <p className="text-sm text-ink-700 leading-relaxed whitespace-pre-line">
                  {r.body}
                </p>
                {r.photos.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {r.photos.slice(0, 4).map((src, i) => (
                      <li key={i}>
                        <img
                          src={src}
                          alt=""
                          className="h-16 w-16 sm:h-20 sm:w-20 rounded-md object-cover ring-1 ring-ink-100"
                          loading="lazy"
                        />
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-[11px] text-ink-500 flex items-center gap-1.5">
                  <span className="font-medium text-ink-700">{r.author.name}</span>
                  {r.author.phoneMasked && (
                    <span className="font-mono text-ink-400">· {r.author.phoneMasked}</span>
                  )}
                  <span className="text-success-700 inline-flex items-center gap-1 ml-1">
                    <span className="h-1 w-1 rounded-full bg-success-500" />
                    Verified buyer
                  </span>
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

interface ReserveModalProps {
  open: boolean;
  onClose: () => void;
  productId: string;
  productSlug: string;
  productName: string;
  purity: string;
  size: string;
  qty: number;
  totalPaise: number;
}

function ReserveModal({ open, onClose, productId, productSlug, productName, purity, size, qty, totalPaise }: ReserveModalProps): JSX.Element {
  // Prefill from the signed-in account + default saved address. By the time
  // ReserveModal opens the visitor has already passed the AuthGate, so the
  // contact fields are known; the address book may or may not have an entry.
  const account = useAppSelector((s) => s.shop.account);
  const savedAddresses = useAppSelector((s) => s.shop.addresses);
  const defaultAddr = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0];
  const accountPhoneLocal = account.phone.startsWith('+91') ? account.phone.slice(3) : account.phone;

  const [name, setName] = useState(account.name);
  // Phone is stored as the local 10-digit portion only; the +91 prefix is a
  // fixed UI adornment so users can't accidentally edit or duplicate it.
  const [phone, setPhone] = useState(accountPhoneLocal);
  const [email, setEmail] = useState(account.email);
  const [line1, setLine1] = useState(defaultAddr?.line1 ?? '');
  const [line2, setLine2] = useState(defaultAddr?.line2 ?? '');
  const [city, setCity] = useState(defaultAddr?.city ?? '');
  const [stateName, setStateName] = useState(defaultAddr?.state ?? 'Haryana');
  const [pincode, setPincode] = useState(defaultAddr?.pincode ?? '');
  const [notes, setNotes] = useState('');
  const [saveAddress, setSaveAddress] = useState(true);
  // Payment method — three options. 'cod' is the default low-friction path;
  // 'razorpay' opens the hosted Razorpay checkout for UPI/card/netbanking;
  // 'reserve-at-store' is the in-store walk-in option (no money moves now).
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'razorpay' | 'reserve-at-store'>('cod');
  const dispatch = useAppDispatch();
  const [createOrder, { isLoading: submitting }] = useCreatePublicOrderMutation();
  const [verifyPayment] = useVerifyRazorpayPaymentMutation();

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    // When the visitor is signed in we ALWAYS attach the order to their
    // signed-in Customer row — local form state is ignored for name/phone/
    // email. This guarantees /store/account's order list (joined on the same
    // customer) sees the new order. The editable inputs only matter for the
    // (currently unreachable) guest-checkout path.
    const customerName = account.signedIn ? account.name : name.trim();
    const customerPhoneE164 = account.signedIn
      ? account.phone
      : `+91${phone}`;
    const customerEmail = account.signedIn ? account.email : email.trim();

    if (!customerName) {
      toast.error('Please enter your name');
      return;
    }
    if (!/^\+91[6-9]\d{9}$/.test(customerPhoneE164)) {
      toast.error('Please enter a valid 10-digit Indian phone number');
      return;
    }
    if (line1.trim().length < 3) {
      toast.error('Please enter your full street address');
      return;
    }
    if (!city.trim() || !stateName.trim()) {
      toast.error('Please enter city and state');
      return;
    }
    if (!/^[1-9]\d{5}$/.test(pincode)) {
      toast.error('Please enter a valid 6-digit PIN code');
      return;
    }
    const shippingAddress = {
      name: customerName,
      phone: customerPhoneE164,
      line1: line1.trim(),
      line2: line2.trim() || undefined,
      city: city.trim(),
      state: stateName.trim(),
      pincode,
    };

    // Send the slug — server resolves it to the live product id from a
    // fresh DB read at order time. Bypasses Vercel's edge cache on
    // /website/products, which is what made the older "refetch by slug"
    // fix unreliable (the refetch was served stale from the edge too).
    // We still send the cached id as a hint for back-compat with any
    // in-flight clients, but slug wins server-side.
    try {
      const res = await createOrder({
        customer: {
          name: customerName,
          phone: customerPhoneE164,
          email: customerEmail || undefined,
        },
        items: [{ productId, slug: productSlug, qty }],
        paymentMethod,
        shippingAddress,
        notes: notes.trim() || undefined,
        saveAddress,
      }).unwrap();

      // Optimistic local address-book update so the next Buy-now opens
      // pre-filled without waiting for a re-identify round trip.
      if (saveAddress) {
        dispatch(
          upsertAddress({
            id: `local-${Date.now()}`,
            label: null,
            name: shippingAddress.name,
            phone: shippingAddress.phone,
            line1: shippingAddress.line1,
            line2: shippingAddress.line2 ?? null,
            city: shippingAddress.city,
            state: shippingAddress.state,
            pincode: shippingAddress.pincode,
            isDefault: true,
          }),
        );
      }

      // Online payment branch — server returns a Razorpay order payload; we
      // open the hosted checkout, then call /payment/verify so the Order
      // row flips to paymentStatus=PAID. If the user dismisses the modal
      // the Order stays PENDING (admin can retry collection or cancel).
      if (paymentMethod === 'razorpay' && res.razorpay) {
        try {
          const checkout = await openRazorpayCheckout({
            keyId: res.razorpay.keyId,
            orderId: res.razorpay.orderId,
            amountPaise: res.razorpay.amountPaise,
            brandName: 'Zelora',
            description: `${productName} · ZL-${res.id.slice(-6).toUpperCase()}`,
            customer: {
              name: customerName,
              phone: customerPhoneE164,
              email: customerEmail || undefined,
            },
            simulated: res.razorpay.simulated,
          });
          await verifyPayment({
            orderId: res.id,
            razorpayOrderId: checkout.razorpayOrderId,
            razorpayPaymentId: checkout.razorpayPaymentId,
            razorpaySignature: checkout.razorpaySignature,
          }).unwrap();
        } catch (err) {
          const dismissed =
            err instanceof Error && err.message === 'CHECKOUT_DISMISSED';
          toast.error(
            dismissed
              ? 'Payment cancelled. Your order is on hold — finish payment from My Orders.'
              : 'Payment failed. Try again or pick Cash on delivery.',
          );
          // Order row exists in PENDING state — we don't close the modal so
          // the user can switch payment method without re-typing the form.
          return;
        }
      }

      const id = res.id.slice(-6).toUpperCase();
      const eta = res.expectedDeliveryAt
        ? new Date(res.expectedDeliveryAt).toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
          })
        : null;
      const successDesc =
        paymentMethod === 'razorpay'
          ? `${productName} · payment received${eta ? ` · arrives by ${eta}` : ''}.`
          : paymentMethod === 'reserve-at-store'
            ? `${productName} reserved. Drop in to the showroom to confirm and pay.`
            : eta
              ? `${productName} arrives by ${eta}. Pay cash (or UPI) when the courier hands it over.`
              : `We'll WhatsApp tracking once the courier picks up.`;
      toast.success(`Order placed! Confirmation ZL-${id}`, {
        description: successDesc,
        duration: 9000,
      });
      onClose();
      setNotes('');
    } catch (err) {
      const message =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ??
        'Could not place order. Please try again.';
      toast.error(message);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] sm:w-[92vw] max-w-lg max-h-[92vh] overflow-y-auto bg-ink-0 rounded-lg shadow-xl border border-ink-100 data-[state=open]:animate-in data-[state=open]:zoom-in-95">
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="font-display text-[22px] leading-tight text-ink-900">Buy {productName}</Dialog.Title>
                <Dialog.Description className="text-xs text-ink-500 mt-1">
                  {purity} · Size {size}″ · Qty {qty} · <Money paise={totalPaise} className="font-mono" />
                </Dialog.Description>
              </div>
              <Dialog.Close className="text-ink-500 hover:text-ink-900 p-1 -mr-1 -mt-1 rounded-md hover:bg-ink-50" aria-label="Close">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            {account.signedIn ? (
              // Signed-in contact summary — read-only by design. Editing here
              // would let the user submit a phone different from account.phone,
              // which would attach the order to a different Customer row and
              // make it invisible on /store/account. "Not you?" signs out so a
              // shared device can hand over to a different shopper cleanly.
              <fieldset className="space-y-2">
                <legend className="text-eyebrow uppercase text-ink-500 mb-1">Contact</legend>
                <div className="rounded-lg border border-ink-100 bg-ink-25 px-4 py-3 text-sm">
                  <p className="text-ink-900 font-medium truncate">{account.name}</p>
                  <p className="text-ink-600 mt-0.5 font-mono tabular-nums text-xs">
                    {account.phone}
                    {account.email ? <span className="font-sans"> · {account.email}</span> : null}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    dispatch(signOut());
                    onClose();
                    toast.success('Signed out. Sign in again to continue.');
                  }}
                  className="text-[11px] text-ink-500 underline decoration-ink-200 underline-offset-2 hover:text-ink-700"
                >
                  Not you? Sign out
                </button>
              </fieldset>
            ) : (
              <fieldset className="space-y-3">
                <legend className="text-eyebrow uppercase text-ink-500 mb-1">Contact</legend>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-wider text-ink-500">Full name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="mt-1 w-full h-11 px-3 rounded-lg border border-ink-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm"
                    placeholder="Full name"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-wider text-ink-500">Phone</span>
                    <div className="mt-1 flex items-stretch w-full h-11 rounded-lg border border-ink-200 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500 overflow-hidden">
                      <span className="flex items-center px-3 bg-ink-50 text-ink-600 text-sm font-mono border-r border-ink-200 select-none">
                        +91
                      </span>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        required
                        inputMode="numeric"
                        maxLength={10}
                        pattern="[6-9][0-9]{9}"
                        className="flex-1 px-3 text-sm font-mono focus:outline-none"
                        placeholder="98XXX XXXXX"
                      />
                    </div>
                  </label>
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-wider text-ink-500">Email (for invoice)</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1 w-full h-11 px-3 rounded-lg border border-ink-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm"
                      placeholder="you@example.com"
                    />
                  </label>
                </div>
              </fieldset>
            )}

            <fieldset className="space-y-3">
              <legend className="text-eyebrow uppercase text-ink-500 mb-1">Shipping address</legend>
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Address line 1</span>
                <input
                  type="text"
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                  required
                  className="mt-1 w-full h-11 px-3 rounded-lg border border-ink-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm"
                  placeholder="House / flat no., street"
                />
              </label>
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Address line 2 (optional)</span>
                <input
                  type="text"
                  value={line2}
                  onChange={(e) => setLine2(e.target.value)}
                  className="mt-1 w-full h-11 px-3 rounded-lg border border-ink-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm"
                  placeholder="Landmark, area, society"
                />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-[11px] uppercase tracking-wider text-ink-500">City</span>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    required
                    className="mt-1 w-full h-11 px-3 rounded-lg border border-ink-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm"
                    placeholder="Gurugram"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-wider text-ink-500">State</span>
                  <input
                    type="text"
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    required
                    className="mt-1 w-full h-11 px-3 rounded-lg border border-ink-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm"
                    placeholder="Haryana"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-wider text-ink-500">PIN code</span>
                  <input
                    type="text"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    inputMode="numeric"
                    maxLength={6}
                    pattern="[1-9][0-9]{5}"
                    className="mt-1 w-full h-11 px-3 rounded-lg border border-ink-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm font-mono tabular-nums"
                    placeholder="122001"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-ink-600 pt-1">
                <input
                  type="checkbox"
                  checked={saveAddress}
                  onChange={(e) => setSaveAddress(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-ink-300 text-brand-500 focus:ring-brand-400"
                />
                Save this address for next time
              </label>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-eyebrow uppercase text-ink-500 mb-1">Payment method</legend>
              {/* Three radio cards. COD default — lowest friction for the
                  Indian jewellery shopper who's still wary of paying online
                  for high-value pieces. Online (Razorpay) opens the hosted
                  checkout for UPI/card/netbanking. Reserve-at-store puts a
                  hold on the piece and the customer pays in person. */}
              {([
                {
                  value: 'cod' as const,
                  title: 'Cash on delivery',
                  sub: 'Pay cash or UPI when the courier hands you the piece.',
                },
                {
                  value: 'razorpay' as const,
                  title: 'Pay now — UPI / Card / Netbanking',
                  sub: 'Secure Razorpay checkout. Order ships the same day on prepaid.',
                },
                {
                  value: 'reserve-at-store' as const,
                  title: 'Reserve & pay at store',
                  sub: "We'll hold the piece for 48h. Pay at the showroom counter.",
                },
              ]).map((opt) => {
                const selected = paymentMethod === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                      selected
                        ? 'border-brand-500 bg-brand-50/40'
                        : 'border-ink-200 hover:border-ink-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={opt.value}
                      checked={selected}
                      onChange={() => setPaymentMethod(opt.value)}
                      className="mt-0.5 h-3.5 w-3.5 border-ink-300 text-brand-500 focus:ring-brand-400"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm text-ink-900 font-medium">{opt.title}</span>
                      <span className="block text-[11px] text-ink-500 leading-relaxed mt-0.5">
                        {opt.sub}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500">Notes (optional)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-ink-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm resize-none"
                placeholder="Size confirmation, engraving requests, gift wrap, etc."
              />
            </label>

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
                {submitting
                  ? paymentMethod === 'razorpay'
                    ? 'Opening payment…'
                    : 'Placing order…'
                  : paymentMethod === 'razorpay'
                    ? 'Pay & place order'
                    : paymentMethod === 'reserve-at-store'
                      ? 'Reserve at store'
                      : 'Place order'}
              </button>
            </div>

            <p className="text-[11px] text-ink-500 text-center leading-relaxed">
              {paymentMethod === 'razorpay'
                ? `Secure payment via Razorpay. We'll WhatsApp tracking to ${account.signedIn ? account.phone : phone ? `+91 ${phone}` : 'your phone'} once the courier picks up.`
                : paymentMethod === 'reserve-at-store'
                  ? `We'll hold this piece for 48 hours. Visit the showroom to confirm and pay.`
                  : `Pay cash on delivery (or UPI when the courier arrives). Estimated arrival in 5 business days. We'll WhatsApp tracking to ${account.signedIn ? account.phone : phone ? `+91 ${phone}` : 'your phone'} once the courier picks up.`}
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

// Boxed icon + label for the PDP assurance grid (Palmonas-style). `boxed`
// wraps it in a bordered card for the service-promise row.
function PdpFeature({
  icon,
  label,
  boxed,
}: {
  icon: React.ReactNode;
  label: string;
  boxed?: boolean;
}): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 text-center px-1 py-2',
        boxed && 'rounded-xl border border-ink-100 bg-ink-0 py-3',
      )}
    >
      <span className="text-brand-700">{icon}</span>
      <span className="text-[11px] sm:text-xs font-medium text-ink-700 leading-tight">{label}</span>
    </div>
  );
}
