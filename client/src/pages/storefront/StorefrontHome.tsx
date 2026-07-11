import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award, ShieldCheck, Sparkles, Star } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAppSelector } from '@/app/hooks';
import {
  useGetPublicGoldRateQuery,
  useGetPublicProductsQuery,
  useGetPublicSaleItemsQuery,
  useGetPublicCollectionsQuery,
} from '@/features/storefront/storefrontApi';
import type {
  PublicProduct,
  PublicSaleProduct,
  PublicCategory,
  PublicGoldRateResponse,
} from '@/features/storefront/storefrontApi';
import type { DoorCard, SectionLabels, TestimonialCard, TrustBadge } from '@/features/storefront/storefrontContentSlice';
import { storefrontTotalPaise, productMetaLabel, computeSalePrice } from '@/features/storefront/pricing';
import { HeroCarousel } from './HeroCarousel';

// Parse a blog's ISO date (YYYY-MM-DD) into a {day, month} badge. Returns null
// for blank/invalid dates so the card can simply hide the badge.
function blogDateParts(iso: string): { day: string; month: string } | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return {
    day: String(d.getDate()).padStart(2, '0'),
    month: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
  };
}

function formatLiveRate(paise: number | undefined, fallback: string): string {
  if (!paise || paise <= 0) return fallback;
  const rupees = paise / 100;
  return rupees >= 1000
    ? `₹${Math.round(rupees).toLocaleString('en-IN')}/g`
    : `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/g`;
}

// Fallback "Shop by" pill row — used only if the CMS `shopBy` list is somehow
// empty. The live set is CMS-managed (Website CMS → Homepage sections → Shop by
// pills) and hydrated into content.shopBy.
const SHOP_BY_FALLBACK: Array<{ label: string; href: string }> = [
  { label: '22K Gold', href: '/store/collections/22k' },
  { label: '18K Gold', href: '/store/collections/18k' },
  { label: 'Diamond', href: '/store/collections/diamond' },
  { label: 'Silver', href: '/store/collections/silver' },
  { label: 'Under ₹50,000', href: '/store/collections/under-50k' },
  { label: 'Gifting', href: '/store/collections/gifting' },
];

// Fallback config for the 3 homepage product showcases — used only if the CMS
// `showcases` list is missing a slot. The live config is CMS-managed (Website
// CMS → Homepage sections → the three "Product showcase" cards).
const SHOWCASE_FALLBACK: Array<{ eyebrow: string; title: string; categorySlug: string }> = [
  { eyebrow: 'Top Styles', title: '18K Gold Tone', categorySlug: '18k-gold-tone' },
  { eyebrow: 'Deals of the week', title: '9 KT Fine Gold', categorySlug: '9-k-fine-gold' },
  { eyebrow: 'Sterling silver', title: 'Fine Silver', categorySlug: '925-sterling-silver' },
];

// Trust-badge icon registry — keys must match TrustBadge['icon'] in the slice.
// The CMS persists `icon: 'shield' | 'sparkles' | 'award'`; the JSX resolves
// the actual Lucide component via this map so we never serialise React nodes
// to JSON.
const TRUST_ICONS: Record<TrustBadge['icon'], React.ComponentType<{ className?: string }>> = {
  shield: ShieldCheck,
  sparkles: Sparkles,
  award: Award,
};

// One homepage category showcase — centered title, sub-category filter pills,
// a 4-across × 2-row product grid (max 8) and a "View all" deep-link to the
// collection. Shared by the 18K Gold Tone, 9 KT Fine Gold and Fine Silver
// blocks. `products` is already resolved to either the admin's curated CMS
// picks or the category auto-fill; the sub-category pills filter that set by
// `categoryId`. Renders nothing when there are no products to show.
function ProductShowcase({
  eyebrow,
  title,
  mainSlug,
  subCategories,
  products,
  liveRate,
  categoryNameById,
}: {
  eyebrow: string;
  title: string;
  mainSlug: string;
  subCategories: PublicCategory[];
  products: PublicProduct[];
  liveRate: PublicGoldRateResponse | undefined;
  categoryNameById: Map<string, string>;
}): JSX.Element | null {
  const [tab, setTab] = useState<string>('ALL');
  if (products.length === 0) return null;
  const tabs = [{ id: 'ALL', label: 'All' }, ...subCategories.map((s) => ({ id: s.id, label: s.name }))];
  const visible = (
    tab === 'ALL' ? products : products.filter((p) => p.categoryId === tab)
  ).slice(0, 8);
  const viewAll =
    tab === 'ALL' ? `/store/collections/${mainSlug}` : `/store/collections/${mainSlug}?sub=${tab}`;
  return (
    <section className="bg-[#FDF8F4] border-b border-[#EFE0D2]/60">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <div className="text-center mb-7 sm:mb-9">
          <p className="text-eyebrow uppercase text-brand-700">{eyebrow}</p>
          <h2 className="font-display text-3xl sm:text-[36px] md:text-[44px] leading-tight text-ink-900 mt-2">
            {title}
          </h2>
        </div>
        {tabs.length > 1 && (
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-8 sm:mb-10">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'h-9 px-4 rounded-md border text-sm transition-colors duration-fast',
                  tab === t.id
                    ? 'border-ink-900 bg-ink-900 text-ink-0'
                    : 'border-ink-200 text-ink-700 hover:border-ink-400 hover:text-ink-900',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        {visible.length > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-8 sm:gap-x-5 sm:gap-y-10">
            {visible.map((p) => {
              const soldOut = p.inStock === false;
              const catLabel = categoryNameById.get(p.categoryId) ?? productMetaLabel(p);
              return (
                <Link to={`/store/products/${p.slug}`} key={p.id} className="group block">
                  <div className="relative aspect-[4/5] overflow-hidden bg-[#FAF3EE] rounded-sm gold-shine-target">
                    <img
                      src={p.images[0] ?? ''}
                      alt={p.name}
                      className={cn(
                        'absolute inset-0 h-full w-full object-cover transition-transform duration-slow group-hover:scale-[1.03]',
                        soldOut && 'grayscale opacity-70',
                      )}
                      loading="lazy"
                    />
                    {soldOut && (
                      <span className="absolute top-2 left-2 z-10 bg-ink-900 text-ink-0 text-[10px] uppercase tracking-[0.18em] px-2 py-1 rounded-sm">
                        Sold out
                      </span>
                    )}
                  </div>
                  <div className="mt-3 sm:mt-4 space-y-1 px-0.5">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-ink-500 truncate">{catLabel}</p>
                    <h3 className="font-display text-base sm:text-[18px] leading-tight text-ink-900 group-hover:text-brand-700 transition-colors truncate">
                      {p.name}
                    </h3>
                    <div className="flex items-center gap-0.5 text-brand-500">
                      {Array.from({ length: 5 }).map((_, k) => (
                        <Star key={k} className="h-3 w-3 fill-current" aria-hidden />
                      ))}
                    </div>
                    <p className="text-sm text-ink-900 font-mono tabular-nums pt-0.5">
                      ₹{(storefrontTotalPaise(p, liveRate?.rates) / 100).toLocaleString('en-IN')}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-center text-sm text-ink-500 py-8">No pieces in this style yet.</p>
        )}
        <div className="text-center mt-9 sm:mt-12">
          <Link
            to={viewAll}
            className="inline-flex items-center gap-2 h-11 px-7 rounded-full border border-ink-300 text-ink-900 text-sm font-medium hover:bg-ink-900 hover:text-ink-0 transition-colors duration-fast"
          >
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// Season Sales — the items the admin tagged into the Season Sale pool (Inventory
// → Season sales), each with its own discount. Shows the original price struck
// through, the discounted price and a "Flat X% off" badge. Renders nothing when
// the sale is empty so the homepage simply omits the section. Sits directly
// below Top Styles.
function SeasonSales({
  liveRate,
  categoryNameById,
  labels,
}: {
  liveRate: PublicGoldRateResponse | undefined;
  categoryNameById: Map<string, string>;
  labels: SectionLabels;
}): JSX.Element | null {
  const { data: saleProducts = [] } = useGetPublicSaleItemsQuery();
  // Show the first 8 (a 4×2 grid) on the homepage; the "View all" button below
  // links to the dedicated sale page that lists the full pool.
  const visible = saleProducts.slice(0, 8);
  if (visible.length === 0) return null;
  // Sale-wide Buy-1-Get-1 is the same flag on every sale item.
  const bogoActive = visible.some((p) => p.sale?.bogo);
  return (
    <section className="bg-[#FFF7F0] border-b border-[#EFE0D2]/60">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <div className="text-center mb-7 sm:mb-9">
          <p className="text-eyebrow uppercase text-brand-700">{labels.seasonSaleEyebrow}</p>
          <h2 className="font-display text-3xl sm:text-[36px] md:text-[44px] leading-tight text-ink-900 mt-2">
            {labels.seasonSaleTitle}
          </h2>
          {bogoActive && (
            <p className="mt-3 inline-flex items-center bg-brand-600 text-ink-0 text-xs font-semibold uppercase tracking-[0.12em] px-3 py-1.5 rounded-sm">
              Buy 1 Get 1 Free — on every piece
            </p>
          )}
          {labels.seasonSaleSub && <p className="mt-3 text-sm text-ink-600">{labels.seasonSaleSub}</p>}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-8 sm:gap-x-5 sm:gap-y-10">
          {visible.map((p: PublicSaleProduct) => {
            const soldOut = p.inStock === false;
            const catLabel = categoryNameById.get(p.categoryId) ?? productMetaLabel(p);
            const original = storefrontTotalPaise(p, liveRate?.rates);
            const offer = computeSalePrice(original, p.sale);
            const discounted = offer?.discountedPaise ?? original;
            return (
              <Link to={`/store/products/${p.slug}`} key={p.id} className="group block">
                <div className="relative aspect-[4/5] overflow-hidden bg-[#FAF3EE] rounded-sm gold-shine-target">
                  <img
                    src={p.images[0] ?? ''}
                    alt={p.name}
                    className={cn(
                      'absolute inset-0 h-full w-full object-cover transition-transform duration-slow group-hover:scale-[1.03]',
                      soldOut && 'grayscale opacity-70',
                    )}
                    loading="lazy"
                  />
                  {offer && (
                    <span className="absolute top-2 right-2 z-10 bg-brand-600 text-ink-0 text-[10px] font-semibold uppercase tracking-[0.12em] px-2 py-1 rounded-sm shadow-sm">
                      {offer.badge}
                    </span>
                  )}
                  {soldOut && (
                    <span className="absolute top-2 left-2 z-10 bg-ink-900 text-ink-0 text-[10px] uppercase tracking-[0.18em] px-2 py-1 rounded-sm">
                      Sold out
                    </span>
                  )}
                </div>
                <div className="mt-3 sm:mt-4 space-y-1 px-0.5">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-ink-500 truncate">{catLabel}</p>
                  <h3 className="font-display text-base sm:text-[18px] leading-tight text-ink-900 group-hover:text-brand-700 transition-colors truncate">
                    {p.name}
                  </h3>
                  <div className="flex items-center gap-0.5 text-brand-500">
                    {Array.from({ length: 5 }).map((_, k) => (
                      <Star key={k} className="h-3 w-3 fill-current" aria-hidden />
                    ))}
                  </div>
                  <div className="flex items-baseline gap-2 pt-0.5">
                    <p className="text-sm text-ink-900 font-mono tabular-nums font-semibold">
                      ₹{(discounted / 100).toLocaleString('en-IN')}
                    </p>
                    {offer?.hasStrike && (
                      <p className="text-xs text-ink-400 font-mono tabular-nums line-through">
                        ₹{(original / 100).toLocaleString('en-IN')}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        <div className="text-center mt-9 sm:mt-12">
          <Link
            to="/store/sale"
            className="inline-flex items-center gap-2 h-11 px-7 rounded-full border border-ink-300 text-ink-900 text-sm font-medium hover:bg-ink-900 hover:text-ink-0 transition-colors duration-fast"
          >
            {labels.seasonSaleCtaLabel || 'View all'}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function StorefrontHome(): JSX.Element {
  const content = useAppSelector((s) => s.storefrontContent);
  const {
    brand,
    hero,
    heroSlides,
    story,
    rates: cmsRates,
    shopBy,
    shopByOccasion,
    browseCategories,
    reels,
    showcases,
    goldToneFeatured,
    nineKtFeatured,
    silverFeatured,
    testimonialsRow1,
    testimonialsRow2,
    doorCards,
    lookbookCards,
    blogs,
    trustBadges,
    pressLogos,
    sectionLabels,
  } = content;
  const L = sectionLabels;
  const { data: liveRate } = useGetPublicGoldRateQuery(undefined, {
    pollingInterval: 5 * 60 * 1000,
  });
  const rateBy = (p: number): number | undefined =>
    liveRate?.rates.find((r) => r.purity === p)?.ratePerGramPaise;
  // CMS-entered value wins when filled; live GoldAPI feed is the fallback for
  // any rate (or the "updated at" label) left blank. Display ticker only —
  // product prices always use the numeric live feed.
  const pick = (cms: string | undefined, purity: number): string => {
    const manual = (cms ?? '').trim();
    return manual || formatLiveRate(rateBy(purity), '—');
  };
  const rates = {
    ...cmsRates,
    g24: pick(cmsRates.g24, 2400),
    g22: pick(cmsRates.g22, 2200),
    g18: pick(cmsRates.g18, 1800),
    silver: pick(cmsRates.silver, 0),
    updatedAt:
      (cmsRates.updatedAt ?? '').trim() ||
      (liveRate
        ? `${new Date(liveRate.asOf).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST`
        : ''),
  };

  // Homepage product showcases — 18K Gold Tone, 9 KT Fine Gold and Fine Silver.
  // Each renders the admin's curated CMS picks (ordered product slugs) when set,
  // and otherwise auto-fills from the matching main category + its sub-categories
  // (the same resolution the collection page uses). The <ProductShowcase> block
  // adds the title, sub-category filter pills and "View all" deep-link.
  const { data: allProducts = [] } = useGetPublicProductsQuery();
  const { data: allCategories = [] } = useGetPublicCollectionsQuery();
  const categoryNameById = new Map(allCategories.map((c) => [c.id, c.name]));
  const productBySlug = new Map(allProducts.map((p) => [p.slug, p]));

  // Resolve a showcase to its product list + sub-categories. Curated slugs win
  // (in order, dropping any now-unpublished / deleted pieces); empty curation
  // falls back to the full category set.
  const resolveShowcase = (
    mainSlug: string,
    curatedSlugs: string[] | undefined,
  ): { products: PublicProduct[]; subs: PublicCategory[] } => {
    const main = allCategories.find((c) => c.slug === mainSlug);
    const subs = main ? allCategories.filter((c) => c.parentId === main.id) : [];
    const ids = new Set<string>(main ? [main.id, ...subs.map((s) => s.id)] : []);
    const auto = allProducts.filter((p) => ids.has(p.categoryId));
    const curated = (curatedSlugs ?? [])
      .map((s) => productBySlug.get(s))
      .filter((p): p is PublicProduct => Boolean(p));
    return { products: curated.length ? curated : auto, subs };
  };

  // Each of the 3 showcase slots is CMS-configured (eyebrow / title / source
  // category). Falls back to the original hardcoded config for any slot the CMS
  // hasn't provided, so a legacy content blob still renders.
  const sc = (i: number): { eyebrow: string; title: string; categorySlug: string } =>
    showcases?.[i] ?? SHOWCASE_FALLBACK[i]!;
  const goldTone = resolveShowcase(sc(0).categorySlug, goldToneFeatured);
  const nineKt = resolveShowcase(sc(1).categorySlug, nineKtFeatured);
  const silver = resolveShowcase(sc(2).categorySlug, silverFeatured);

  return (
    <>
      {/* Hero — full-bleed auto-rotating banner carousel (CMS-managed slides,
          each with its own "Shop Now" CTA). Falls back to nothing when no
          slides are configured; the editorial band below carries the copy. */}
      <HeroCarousel slides={heroSlides} />

      {/* Editorial brand band — the headline, CTAs and live rates moved here,
          directly under the banner, on cream.
          Hidden per client request (hero text section: "THE 2025 BRIDAL EDIT"
          heading through the "Updated …" rate strip). To restore, remove the
          `{false && (` guard below and its closing `)}`. */}
      {false && (
      <section className="bg-[#FAF3EE] border-b border-[#EFE0D2]/70">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 text-center">
          <p className="text-eyebrow uppercase text-brand-700 inline-flex items-center gap-1.5 animate-fade-in-up-1">
            <Sparkles className="h-3 w-3 text-brand-500 animate-twinkle" aria-hidden /> {hero.eyebrow}
          </p>
          <h1 className="font-display text-[30px] leading-[1.08] sm:text-[40px] lg:text-[48px] tracking-tight text-ink-900 mt-4 animate-fade-in-up-2">
            {hero.title}
          </h1>
          <p className="mt-4 mx-auto max-w-xl text-[15px] sm:text-base text-ink-600 leading-relaxed animate-fade-in-up-3">
            {hero.subtitle}
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3 animate-fade-in-up-4">
            <Link
              to={hero.ctaHref}
              className="group inline-flex items-center gap-2 h-11 sm:h-12 px-5 sm:px-7 rounded-full bg-ink-900 text-ink-0 text-sm font-medium hover:bg-ink-800 transition-colors duration-fast"
            >
              <span className="gold-shine-target">{hero.ctaLabel}</span>
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            {hero.secondaryCtaLabel && (
              <Link
                to={hero.secondaryCtaHref}
                className="inline-flex items-center gap-2 h-11 sm:h-12 px-5 sm:px-6 rounded-full border border-ink-200 text-ink-800 text-sm hover:border-ink-400 hover:text-ink-900 transition-colors duration-fast"
              >
                {hero.secondaryCtaLabel}
              </Link>
            )}
          </div>
          {/* Live rate strip — gold accents, centered under the CTAs */}
          <div className="mt-9 flex flex-wrap items-center justify-center gap-x-5 sm:gap-x-6 gap-y-2 text-xs text-ink-600 font-mono tabular-nums border-t border-ink-100 pt-5 animate-fade-in-up-5">
            <span><span className="text-ink-400">Today 24K</span> <span className="text-brand-700 font-semibold">{rates.g24}</span></span>
            <span><span className="text-ink-400">22K</span> <span className="text-brand-700 font-semibold">{rates.g22}</span></span>
            <span className="hidden sm:inline"><span className="text-ink-400">18K</span> {rates.g18}</span>
            <span className="hidden md:inline"><span className="text-ink-400">Silver</span> {rates.silver}</span>
            <span className="hidden lg:inline text-ink-400">· Updated {rates.updatedAt}</span>
          </div>
        </div>
      </section>
      )}

      {/* Shop by — quiet pill row on blush */}
      <section className="bg-[#FDF8F4] border-b border-[#EFE0D2]/60">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-4 sm:py-6 flex flex-wrap items-center gap-2 md:gap-3">
          <span className="text-eyebrow uppercase text-ink-500 mr-2">Shop by</span>
          {(shopBy?.length ? shopBy : SHOP_BY_FALLBACK).map((s) => (
            <Link
              key={`${s.label}-${s.href}`}
              to={s.href}
              className="px-4 h-9 inline-flex items-center rounded-full border border-[#E8CFC1]/70 bg-ink-0/60 text-sm text-ink-700 hover:border-brand-400 hover:text-ink-900 hover:bg-ink-0 transition-all duration-fast"
            >
              {s.label}
            </Link>
          ))}
        </div>
      </section>

      {/* Tanishq-style circular category portrait tiles — auto-scroll marquee.
          Tiles duplicated in JSX so the -50% translation keeps content visible
          throughout the loop. Pause on hover. Section padding preserved. */}
      <section className="bg-ink-0 overflow-hidden">
        <div className="py-12 sm:py-16 md:py-20">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 text-center mb-8 sm:mb-12">
            <p className="text-eyebrow uppercase text-brand-700">{L.categoriesEyebrow}</p>
            <h2 className="font-display text-3xl sm:text-[36px] md:text-[44px] leading-tight text-ink-900 mt-2">{L.categoriesTitle}</h2>
            <p className="mt-3 text-sm text-ink-600 max-w-md mx-auto">{L.categoriesSub}</p>
          </div>
          {/* Marquee */}
          <div className="group">
            <div className="flex w-max gap-6 sm:gap-8 md:gap-10 animate-marquee-left marquee-pause pr-6 sm:pr-8 md:pr-10">
              {[...browseCategories, ...browseCategories].map((c, i) => (
                <Link
                  key={`${c.label}-${i}`}
                  to={`/store/collections/${c.slug}`}
                  className="group/tile flex flex-col items-center text-center shrink-0 w-[120px] sm:w-[140px] md:w-[160px]"
                >
                  <div className="relative w-full aspect-square overflow-hidden rounded-full bg-[#FAF3EE] ring-1 ring-[#EFE0D2] group-hover/tile:ring-brand-400 transition-all duration-200 gold-shine-target">
                    <img
                      src={c.img}
                      alt={c.label}
                      className="absolute inset-0 h-full w-full object-cover group-hover/tile:scale-[1.08] transition-transform duration-slow"
                      loading="lazy"
                    />
                  </div>
                  <span className="mt-3 sm:mt-4 text-xs sm:text-sm text-ink-800 group-hover/tile:text-brand-700 tracking-wide transition-colors whitespace-nowrap">
                    {c.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Top Styles — 18K Gold Tone showcase: curated CMS picks (or auto-fill
          from the category), filterable by sub-category, with a "View all"
          deep-link to the (optionally sub-filtered) collection. */}
      <ProductShowcase
        eyebrow={sc(0).eyebrow}
        title={sc(0).title}
        mainSlug={sc(0).categorySlug}
        subCategories={goldTone.subs}
        products={goldTone.products}
        liveRate={liveRate}
        categoryNameById={categoryNameById}
      />

      {/* Season Sales — curated discounted pieces (Inventory → Season sales).
          Renders nothing when the sale pool is empty. Sits below Top Styles. */}
      <SeasonSales liveRate={liveRate} categoryNameById={categoryNameById} labels={L} />

      {/* Shop by occasion — 6 tall body-shot tiles with dark gradient overlay
          showing category name + product count. Replaces the older 4-card TOC. */}
      <section className="max-w-[1280px] mx-auto px-4 sm:px-6 py-14 sm:py-20 md:py-24">
        <div className="flex items-end justify-between mb-8 sm:mb-12 gap-4">
          <div className="max-w-2xl">
            <p className="text-eyebrow uppercase text-brand-700">{L.occasionEyebrow}</p>
            <h2 className="font-display text-3xl sm:text-[40px] md:text-[52px] leading-[1.06] text-ink-900 mt-2">{L.occasionTitle}</h2>
            <p className="mt-3 text-sm text-ink-600 max-w-xl">{L.occasionSub}</p>
          </div>
          <Link to="/store/collections" className="hidden sm:inline-flex items-center gap-1 text-sm text-ink-700 hover:text-brand-700 border-b border-ink-200 hover:border-brand-400 pb-0.5 shrink-0 transition-colors">
            See all
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 md:gap-5">
          {shopByOccasion.map((c, i) => (
            <Link
              key={c.slug}
              to={`/store/collections/${c.slug}`}
              className={`group relative block aspect-[3/4] overflow-hidden bg-[#FAF3EE] rounded-sm gold-shine-target animate-fade-in-up-${(i % 6) + 1}`}
            >
              <img
                src={c.img}
                alt={c.name}
                className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.06] transition-transform duration-slow ease-out"
                loading={i < 2 ? 'eager' : 'lazy'}
              />
              {/* Dark gradient at bottom — name + product count */}
              <div className="absolute inset-x-0 bottom-0 pt-16 pb-4 sm:pb-5 px-3 sm:px-4 bg-gradient-to-t from-ink-900/85 via-ink-900/50 to-transparent text-on-image">
                <h3 className="text-ink-0 font-display text-lg sm:text-[22px] leading-tight">
                  {c.name}
                </h3>
                <p className="mt-1 text-[10px] sm:text-[11px] uppercase tracking-[0.18em] text-ink-100/80 font-medium">
                  {c.count} products
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 9 KT Fine Gold showcase — curated CMS picks (or auto-fill from the
          category), with sub-category filter pills + "View all". Replaces the
          old "Deals of the week" left-card layout. */}
      <ProductShowcase
        eyebrow={sc(1).eyebrow}
        title={sc(1).title}
        mainSlug={sc(1).categorySlug}
        subCategories={nineKt.subs}
        products={nineKt.products}
        liveRate={liveRate}
        categoryNameById={categoryNameById}
      />

      {/* Featured lookbook — 1 big editorial + up to 2 stacked, CMS-managed
          (Website CMS → Homepage sections → Featured lookbook). The first card
          renders large with its body + CTA; the rest are compact image tiles.
          Sits below Deals of the Week. */}
      {lookbookCards.length > 0 && (
        <section className="bg-[#FDF8F4]">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-14 sm:py-20 md:py-24 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 md:gap-8">
            {lookbookCards[0] && (
              <Link to={lookbookCards[0].href || '#'} className="group relative block aspect-[4/5] lg:aspect-auto lg:min-h-[560px] overflow-hidden bg-ink-100 rounded-sm">
                <img
                  src={lookbookCards[0].img}
                  alt={lookbookCards[0].title}
                  className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-slow"
                  loading="lazy"
                />
                {/* Legibility scrim — strong at the bottom so the white title
                    stays readable over light photography. */}
                <div className="absolute inset-0 bg-gradient-to-t from-ink-900/80 via-ink-900/25 to-transparent" aria-hidden />
                <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 md:p-10 text-ink-0 text-on-image">
                  {lookbookCards[0].eyebrow && (
                    <p className="text-eyebrow uppercase text-brand-200">{lookbookCards[0].eyebrow}</p>
                  )}
                  <h3 className="font-display text-2xl sm:text-[34px] md:text-[44px] leading-[1.05] mt-3 max-w-md">{lookbookCards[0].title}</h3>
                  {lookbookCards[0].body && (
                    <p className="mt-2 sm:mt-3 text-xs sm:text-sm text-ink-100/90 max-w-md">{lookbookCards[0].body}</p>
                  )}
                  {lookbookCards[0].ctaLabel && (
                    <span className="mt-5 inline-flex items-center gap-1.5 text-sm border-b border-brand-300 pb-0.5">
                      {lookbookCards[0].ctaLabel}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
              </Link>
            )}
            {lookbookCards.length > 1 && (
              <div className="grid grid-rows-2 gap-6 md:gap-8">
                {lookbookCards.slice(1, 3).map((f, idx) => (
                  <Link key={idx} to={f.href || '#'} className="group relative block overflow-hidden bg-ink-100 aspect-[4/3] lg:aspect-auto rounded-sm">
                    <img src={f.img} alt={f.title} className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-slow" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-ink-900/80 via-ink-900/25 to-transparent" aria-hidden />
                    <div className="absolute inset-0 p-5 sm:p-6 md:p-7 flex flex-col justify-end text-ink-0 text-on-image">
                      {f.eyebrow && <p className="text-eyebrow uppercase text-brand-200">{f.eyebrow}</p>}
                      <h3 className="font-display text-xl sm:text-[24px] md:text-[28px] leading-tight mt-2">{f.title}</h3>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Fine Silver showcase — same treatment as the 9 KT Gold block, for the
          925 Sterling Silver category. Curated CMS picks (or auto-fill), with
          sub-category filter pills + "View all". Sits below the Featured
          lookbook. */}
      <ProductShowcase
        eyebrow={sc(2).eyebrow}
        title={sc(2).title}
        mainSlug={sc(2).categorySlug}
        subCategories={silver.subs}
        products={silver.products}
        liveRate={liveRate}
        categoryNameById={categoryNameById}
      />

      {/* Business story — CMS-editable (Website CMS → Story). Image + editorial
          copy on who we are. Hidden when no title/body is set. */}
      {(story.title || story.body) && (
        <section className="bg-ink-0">
          {/* Section header — sits above the editorial story block. */}
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-14 sm:pt-20 md:pt-24 text-center">
            <p className="text-eyebrow uppercase text-brand-700">Our heritage</p>
            <h2 className="font-display text-3xl sm:text-[40px] md:text-[48px] leading-tight text-ink-900 mt-2">
              The {brand.name} Story
            </h2>
          </div>
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-10 sm:pt-12 pb-14 sm:pb-20 md:pb-24 grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 items-center">
            {story.image && (
              <div className="relative aspect-[4/3] lg:aspect-[5/4] overflow-hidden rounded-sm bg-ink-100 order-1">
                <img src={story.image} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
              </div>
            )}
            <div className="order-2">
              {story.eyebrow && <p className="text-eyebrow uppercase text-brand-700">{story.eyebrow}</p>}
              {story.title && (
                <h2 className="font-display text-3xl sm:text-[40px] md:text-[48px] leading-tight text-ink-900 mt-2">{story.title}</h2>
              )}
              {story.body && (
                <p className="mt-5 text-sm sm:text-base text-ink-600 leading-relaxed whitespace-pre-line max-w-prose">{story.body}</p>
              )}
              <Link
                to="/store/story"
                className="mt-7 inline-flex items-center gap-2 text-sm text-ink-900 border-b border-ink-300 hover:border-brand-500 pb-0.5 transition-colors"
              >
                Our story
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Two editorial promo cards with doors-opening reveal animation.
          Left card slides in from the left, right card from the right when
          the section enters the viewport (IntersectionObserver-driven). */}
      <DoorsRevealSection cards={doorCards} />

      {/* Trust strip — CMS-driven badges (icon: shield/sparkles/award). */}
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-10 sm:py-14 grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 md:gap-12">
          {trustBadges.map((t) => {
            const Icon = TRUST_ICONS[t.icon] ?? ShieldCheck;
            return (
              <div key={t.title} className="flex items-start gap-4">
                <div className="h-11 w-11 shrink-0 rounded-full bg-brand-50 text-brand-700 inline-flex items-center justify-center">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-[15px] text-ink-900 font-medium">{t.title}</h3>
                  <p className="mt-1.5 text-sm text-ink-600 leading-relaxed">{t.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Watch & wear — Instagram-reel-style 9:16 video tiles. Horizontal
          scroll on mobile, full grid on desktop. SEO copy mentions live
          customer styling for long-tail "how to wear / styling" searches. */}
      <section className="bg-ink-0">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-14 sm:py-20 md:py-24">
          <div className="flex items-end justify-between mb-8 sm:mb-10 gap-4">
            <div>
              <p className="text-eyebrow uppercase text-brand-700">{L.reelsEyebrow}</p>
              <h2 className="font-display text-3xl sm:text-display-lg md:text-[48px] md:leading-[1.05] text-ink-900 mt-2">{L.reelsTitle}</h2>
              <p className="mt-2 text-sm text-ink-600 max-w-md">{L.reelsSub}</p>
            </div>
            <a
              href="https://instagram.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1 text-sm text-ink-700 hover:text-brand-700 border-b border-ink-200 hover:border-brand-400 pb-0.5 shrink-0 transition-colors"
            >
              Follow on Instagram
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
          {/* Horizontal scroll on mobile, 5-col grid on lg+ */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 md:gap-5">
            {reels.map((r, i) => (
              <Link
                key={r.handle}
                to={`/store/collections/${r.slug}`}
                className={`group relative block aspect-[9/16] overflow-hidden rounded-md bg-[#FAF3EE] gold-shine-target animate-fade-in-up-${(i % 5) + 1}`}
              >
                <img
                  src={r.poster}
                  alt={r.caption}
                  className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.06] transition-transform duration-slow"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink-900/90 via-ink-900/35 to-transparent" aria-hidden />
                {/* Reel play indicator */}
                <div className="absolute top-3 right-3 h-7 w-7 rounded-full bg-ink-0/85 backdrop-blur-sm inline-flex items-center justify-center shadow-sm">
                  <svg width="10" height="12" viewBox="0 0 10 12" fill="none" aria-hidden>
                    <path d="M0 0L10 6L0 12V0Z" fill="#1F1D1A" />
                  </svg>
                </div>
                <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4 text-ink-0 text-on-image">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-brand-200">{r.handle}</p>
                  <p className="mt-1 text-xs sm:text-sm leading-snug">{r.caption}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Customer reviews — 2-row scrolling marquee. Row 1 drifts left,
          row 2 drifts right (opposite directions). Pause on hover so the
          reader can finish a card. Each row's children are duplicated so
          the -50% translation loops seamlessly. */}
      <section className="bg-[#F5E5DC] border-y border-[#E8CFC1]/60 overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-14 sm:py-20 md:py-24">
          <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-12">
            <p className="text-eyebrow uppercase text-brand-700">{L.reviewsEyebrow}</p>
            <h2 className="font-display text-3xl sm:text-[36px] md:text-[44px] leading-tight text-ink-900 mt-2">{L.reviewsTitle}</h2>
            <p className="mt-3 text-sm text-ink-600">{L.reviewsSub}</p>
          </div>
        </div>

        {/* Full-bleed marquee rows */}
        <div className="space-y-5 sm:space-y-6 pb-14 sm:pb-20 md:pb-24">
          <TestimonialMarquee items={testimonialsRow1} direction="left" />
          <TestimonialMarquee items={testimonialsRow2} direction="right" />
        </div>

        {/* Press strip beneath the reviews */}
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pb-14 sm:pb-20 md:pb-24">
          <div className="pt-8 border-t border-[#E8CFC1]/60 flex flex-wrap items-center justify-center gap-x-8 sm:gap-x-12 gap-y-3 text-ink-500 text-xs uppercase tracking-[0.18em]">
            <span className="text-ink-500">As featured in</span>
            {pressLogos.map((p) => (
              <span key={p}>{p}</span>
            ))}
          </div>
        </div>
      </section>

      {/* From the journal — CMS-managed blog posts (Website CMS → Homepage
          sections → Blog / Journal posts). Up to 4 cards; each opens a detail
          page at /store/blog/:slug. Hidden when there are no posts. */}
      {blogs.length > 0 && (
        <section className="bg-ink-0 border-t border-[#EFE0D2]/60">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-14 sm:py-20 md:py-24">
            <div className="flex items-end justify-between mb-8 sm:mb-10 gap-4">
              <div>
                <p className="text-eyebrow uppercase text-brand-700">Our journal</p>
                <h2 className="font-display text-3xl sm:text-[36px] md:text-[44px] leading-tight text-ink-900 mt-2">
                  Stories, guides &amp; edits
                </h2>
                <p className="mt-2 text-sm text-ink-600 max-w-md">
                  Buying guides, care tips and behind-the-bench stories from our Haryana workshop.
                </p>
              </div>
              <Link
                to="/store/blog"
                className="hidden sm:inline-flex items-center gap-1 text-sm text-ink-700 hover:text-brand-700 border-b border-ink-200 hover:border-brand-400 pb-0.5 shrink-0 transition-colors"
              >
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6 md:gap-7">
              {blogs.slice(0, 4).map((b, i) => {
                const badge = blogDateParts(b.date);
                return (
                  <Link
                    key={b.slug}
                    to={`/store/blog/${b.slug}`}
                    className={`group flex flex-col animate-fade-in-up-${(i % 4) + 1}`}
                  >
                    <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-[#FAF3EE] gold-shine-target">
                      <img
                        src={b.image}
                        alt={b.title}
                        className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.05] transition-transform duration-slow"
                        loading="lazy"
                      />
                      {badge && (
                        <div className="absolute top-3 right-3 h-14 w-14 rounded-full bg-ink-0 shadow-sm flex flex-col items-center justify-center text-center leading-none">
                          <span className="font-display text-lg text-ink-900">{badge.day}</span>
                          <span className="text-[9px] uppercase tracking-[0.12em] text-ink-500 mt-0.5">{badge.month}</span>
                        </div>
                      )}
                    </div>
                    <h3 className="mt-4 font-display text-lg leading-snug text-ink-900 group-hover:text-brand-700 transition-colors line-clamp-2">
                      {b.title}
                    </h3>
                    {b.excerpt && (
                      <p className="mt-2 text-sm text-ink-600 leading-relaxed line-clamp-2">{b.excerpt}</p>
                    )}
                    <span className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand-700 group-hover:gap-2.5 transition-all">
                      Read more
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Visit-us CTA — faint blush surround */}
      <section className="bg-[#FDF8F4]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-20 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border-t border-[#EFE0D2]/60">
          <div className="max-w-xl">
            <p className="text-eyebrow uppercase text-brand-700">{L.visitEyebrow}</p>
            <h2 className="font-display text-2xl sm:text-[28px] md:text-[36px] leading-tight text-ink-900 mt-3">{L.visitTitle}</h2>
            <p className="mt-3 text-sm text-ink-600 max-w-lg">{L.visitSub}</p>
          </div>
          <Link to={L.visitCtaHref || '/store/locations'} className="inline-flex items-center gap-2 h-11 sm:h-12 px-5 sm:px-7 rounded-full bg-ink-900 text-ink-0 text-sm font-medium hover:bg-ink-800 transition-colors duration-fast">
            {L.visitCtaLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   TestimonialMarquee — full-bleed strip of 5-star review cards
   that auto-scrolls in the chosen direction. Children are
   rendered twice so the CSS keyframe (translateX -50%) loops
   seamlessly. Hover anywhere on the strip to pause.
   ───────────────────────────────────────────────────────────── */
function TestimonialMarquee({
  items,
  direction,
}: {
  items: TestimonialCard[];
  direction: 'left' | 'right';
}): JSX.Element {
  const animClass = direction === 'left' ? 'animate-marquee-left' : 'animate-marquee-right';
  // Duplicate the list so the marquee loops with no visible gap. The wrapper
  // is w-max so children flow inline without wrapping; the outer section
  // already has overflow-hidden to clip the off-screen half.
  const doubled = [...items, ...items];
  return (
    <div className="group">
      <div className={`flex w-max gap-4 sm:gap-5 ${animClass} marquee-pause pr-4 sm:pr-5`}>
        {doubled.map((t, i) => (
          <figure
            key={`${t.author}-${i}`}
            className="w-[300px] sm:w-[360px] md:w-[400px] shrink-0 bg-ink-0 rounded-xl p-5 sm:p-6 border border-[#E8CFC1]/70 shadow-sm flex flex-col"
          >
            {/* 5-star rating */}
            <div className="flex items-center gap-0.5 text-brand-500">
              {Array.from({ length: 5 }).map((_, k) => (
                <Star key={k} className="h-4 w-4 fill-current" aria-hidden />
              ))}
              <span className="sr-only">5 out of 5 stars</span>
            </div>
            <blockquote className="mt-3 sm:mt-4 text-[14px] sm:text-[15px] leading-relaxed text-ink-800 flex-1">
              &ldquo;{t.quote}&rdquo;
            </blockquote>
            <figcaption className="mt-5 pt-4 border-t border-[#EFE0D2] flex items-center gap-3">
              <span className="h-10 w-10 rounded-full bg-[#FAF3EE] ring-1 ring-[#EFE0D2] inline-flex items-center justify-center text-brand-700 font-display text-base shrink-0">
                {t.author.charAt(0)}
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-ink-900 truncate">
                  {t.author}
                  <span className="text-ink-500 font-normal">, {t.city}</span>
                </span>
                <span className="text-[11px] uppercase tracking-[0.14em] text-brand-700 mt-0.5">
                  {t.occasion}
                </span>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   DoorsRevealSection — two editorial cards (Necklace + Earrings)
   that slide in from opposite sides like double doors when the
   section enters the viewport. Uses a tiny IntersectionObserver
   hook to toggle the `.in-view` class on the wrapper.
   ───────────────────────────────────────────────────────────── */
function useInView<T extends HTMLElement>(): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.18, rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, inView];
}

function DoorsRevealSection({ cards }: { cards: DoorCard[] }): JSX.Element {
  const [ref, inView] = useInView<HTMLDivElement>();
  if (!cards || cards.length === 0) return <></>;
  return (
    <section className="bg-[#FAF3EE] border-y border-[#EFE0D2]/60">
      <div
        ref={ref}
        className={cn(
          'max-w-[1280px] mx-auto px-4 sm:px-6 py-14 sm:py-20 md:py-24 grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-10',
          inView && 'in-view',
        )}
      >
        {cards.slice(0, 2).map((c, i) => (
          <article
            key={c.eyebrow}
            className={cn(
              'door-card group relative overflow-hidden rounded-lg bg-[#F5E5DC] flex items-center min-h-[320px] sm:min-h-[360px] md:min-h-[420px]',
              i === 0 ? 'door-left' : 'door-right',
            )}
          >
            {/* Text */}
            <div className="relative z-10 flex-1 p-7 sm:p-10 md:p-12 max-w-[60%]">
              <p className="text-eyebrow uppercase text-brand-700">{c.eyebrow}</p>
              <h3 className="font-display text-2xl sm:text-[32px] md:text-[40px] leading-[1.1] text-ink-900 mt-3">
                {c.title}
              </h3>
              <p className="mt-3 text-sm text-ink-600 leading-relaxed max-w-[28ch]">{c.body}</p>
              <Link
                to={c.href}
                className="mt-6 sm:mt-7 inline-flex items-center gap-2 h-11 px-6 rounded-full bg-ink-0 text-ink-900 text-sm font-medium hover:bg-ink-900 hover:text-ink-0 transition-colors duration-fast"
              >
                Shop Now
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            {/* Image absolute on the right with subtle zoom on hover */}
            <div className="absolute inset-y-0 right-0 w-[55%] sm:w-[50%]">
              <img
                src={c.img}
                alt={c.title}
                className="h-full w-full object-cover group-hover:scale-[1.04] transition-transform duration-slow"
                loading="lazy"
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
