import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award, ShieldCheck, Sparkles, Star } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAppSelector } from '@/app/hooks';
import {
  useGetPublicGoldRateQuery,
  useGetPublicProductsQuery,
  useGetPublicCollectionsQuery,
} from '@/features/storefront/storefrontApi';
import type { DoorCard, TestimonialCard, TrustBadge } from '@/features/storefront/storefrontContentSlice';
import { storefrontTotalPaise, productMetaLabel } from '@/features/storefront/pricing';
import { HeroCarousel } from './HeroCarousel';

function formatLiveRate(paise: number | undefined, fallback: string): string {
  if (!paise || paise <= 0) return fallback;
  const rupees = paise / 100;
  return rupees >= 1000
    ? `₹${Math.round(rupees).toLocaleString('en-IN')}/g`
    : `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/g`;
}

// Fixed "Shop by" pill row — these slugs are part of the router's collection
// taxonomy, so they belong in code rather than the CMS.
const SHOP_BY = [
  { label: '22K Gold', to: '/store/collections/22k' },
  { label: '18K Gold', to: '/store/collections/18k' },
  { label: 'Diamond', to: '/store/collections/diamond' },
  { label: 'Silver', to: '/store/collections/silver' },
  { label: 'Under ₹50,000', to: '/store/collections/under-50k' },
  { label: 'Gifting', to: '/store/collections/gifting' },
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

export function StorefrontHome(): JSX.Element {
  const content = useAppSelector((s) => s.storefrontContent);
  const {
    hero,
    heroSlides,
    rates: cmsRates,
    shopByOccasion,
    browseCategories,
    reels,
    deals,
    testimonialsRow1,
    testimonialsRow2,
    doorCards,
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
  const rates = {
    ...cmsRates,
    g24: formatLiveRate(rateBy(2400), '—'),
    g22: formatLiveRate(rateBy(2200), cmsRates.g22),
    g18: formatLiveRate(rateBy(1800), cmsRates.g18),
    silver: formatLiveRate(rateBy(0), cmsRates.silver),
    updatedAt: liveRate
      ? `${new Date(liveRate.asOf).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST`
      : cmsRates.updatedAt,
  };

  // Top Styles — featured 18K Gold Tone pieces with sub-category tabs. Pulls
  // live published products + categories; the gold-tone set is everything in
  // the "18k-gold-tone" main category and its sub-categories (same resolution
  // the collection page uses). Each tab is a sub-category; "View all" deep-links
  // to that collection (by sub-category id, since sub slugs collide per metal).
  const { data: allProducts = [] } = useGetPublicProductsQuery();
  const { data: allCategories = [] } = useGetPublicCollectionsQuery();
  const [topStyleTab, setTopStyleTab] = useState<string>('ALL');
  const goldToneMain = allCategories.find((c) => c.slug === '18k-gold-tone');
  const goldToneSubs = goldToneMain
    ? allCategories.filter((c) => c.parentId === goldToneMain.id)
    : [];
  const goldToneCatIds = new Set<string>(
    goldToneMain ? [goldToneMain.id, ...goldToneSubs.map((s) => s.id)] : [],
  );
  const goldToneProducts = allProducts.filter((p) => goldToneCatIds.has(p.categoryId));
  const topStyleTabs = [{ id: 'ALL', label: 'All' }, ...goldToneSubs.map((s) => ({ id: s.id, label: s.name }))];
  const topStyleVisible = (
    topStyleTab === 'ALL' ? goldToneProducts : goldToneProducts.filter((p) => p.categoryId === topStyleTab)
  ).slice(0, 4);
  const topStyleViewAll =
    topStyleTab === 'ALL'
      ? '/store/collections/18k-gold-tone'
      : `/store/collections/18k-gold-tone?sub=${topStyleTab}`;

  return (
    <>
      {/* Hero — full-bleed auto-rotating banner carousel (CMS-managed slides,
          each with its own "Shop Now" CTA). Falls back to nothing when no
          slides are configured; the editorial band below carries the copy. */}
      <HeroCarousel slides={heroSlides} />

      {/* Editorial brand band — the headline, CTAs and live rates moved here,
          directly under the banner, on cream. */}
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

      {/* Shop by — quiet pill row on blush */}
      <section className="bg-[#FDF8F4] border-b border-[#EFE0D2]/60">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-4 sm:py-6 flex flex-wrap items-center gap-2 md:gap-3">
          <span className="text-eyebrow uppercase text-ink-500 mr-2">Shop by</span>
          {SHOP_BY.map((s) => (
            <Link
              key={s.to}
              to={s.to}
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

      {/* Top Styles — featured 18K Gold Tone pieces, filterable by sub-category,
          with a "View all" deep-link to the (optionally sub-filtered) collection. */}
      {goldToneProducts.length > 0 && (
        <section className="bg-[#FDF8F4] border-b border-[#EFE0D2]/60">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-14 sm:py-20">
            <div className="text-center mb-7 sm:mb-9">
              <p className="text-eyebrow uppercase text-brand-700">Top Styles</p>
              <h2 className="font-display text-3xl sm:text-[40px] md:text-[48px] leading-tight text-ink-900 mt-2">
                18K Gold Tone
              </h2>
            </div>
            {topStyleTabs.length > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-8 sm:mb-10">
                {topStyleTabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTopStyleTab(t.id)}
                    className={cn(
                      'h-9 px-4 rounded-md border text-sm transition-colors duration-fast',
                      topStyleTab === t.id
                        ? 'border-ink-900 bg-ink-900 text-ink-0'
                        : 'border-ink-200 text-ink-700 hover:border-ink-400 hover:text-ink-900',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            {topStyleVisible.length > 0 ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-8 sm:gap-x-5 sm:gap-y-10">
                {topStyleVisible.map((p) => {
                  const meta = productMetaLabel(p);
                  const soldOut = p.inStock === false;
                  return (
                    <Link to={`/store/products/${p.slug}`} key={p.id} className="group block">
                      <div className="relative aspect-[4/5] overflow-hidden bg-[#FAF3EE] rounded-sm">
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
                        <h3 className="font-display text-base sm:text-[18px] leading-tight text-ink-900 group-hover:text-brand-700 transition-colors">
                          {p.name}
                        </h3>
                        <p className="text-[11px] sm:text-xs text-ink-500">
                          {(p.weightMg / 1000).toFixed(2)} g{meta ? ` · ${meta}` : ''}
                        </p>
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
                to={topStyleViewAll}
                className="inline-flex items-center gap-2 h-11 px-7 rounded-full border border-ink-300 text-ink-900 text-sm font-medium hover:bg-ink-900 hover:text-ink-0 transition-colors duration-fast"
              >
                View all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

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
              <div className="absolute inset-x-0 bottom-0 pt-16 pb-4 sm:pb-5 px-3 sm:px-4 bg-gradient-to-t from-ink-900/85 via-ink-900/50 to-transparent">
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

      {/* Featured pair — 1 big editorial + 2 stacked. Light surround, softer overlays. */}
      <section className="bg-[#FDF8F4]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-14 sm:py-20 md:py-24 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 md:gap-8">
          <Link to="/store/collections/bridal" className="group relative block aspect-[4/5] lg:aspect-auto lg:min-h-[560px] overflow-hidden bg-ink-100 rounded-sm">
            <img
              src="https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=2000&q=95"
              alt="Bridal lookbook"
              className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-slow"
              loading="lazy"
            />
            {/* Lighter, sheer overlay — photography wins */}
            <div className="absolute inset-0 bg-gradient-to-t from-ink-900/55 via-ink-900/5 to-transparent" aria-hidden />
            <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 md:p-10 text-ink-0">
              <p className="text-eyebrow uppercase text-brand-200">Lookbook · Autumn</p>
              <h3 className="font-display text-2xl sm:text-[34px] md:text-[44px] leading-[1.05] mt-3 max-w-md">The Bridal lookbook</h3>
              <p className="mt-2 sm:mt-3 text-xs sm:text-sm text-ink-100/90 max-w-md">Twelve heirloom pieces, photographed in our Gurugram workshop.</p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm border-b border-brand-300 pb-0.5">
                Read the story
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>
          <div className="grid grid-rows-2 gap-6 md:gap-8">
            {[
              { slug: 'gifting', overline: 'Under ₹50,000', title: 'Gifts that hold value', img: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1600&q=92' },
              { slug: 'diamond', overline: 'New · Diamond', title: 'Solitaires, certified', img: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=1600&q=92' },
            ].map((f) => (
              <Link key={f.slug} to={`/store/collections/${f.slug}`} className="group relative block overflow-hidden bg-ink-100 aspect-[4/3] lg:aspect-auto rounded-sm">
                <img src={f.img} alt={f.title} className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-slow" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-r from-ink-900/45 via-ink-900/5 to-transparent" aria-hidden />
                <div className="absolute inset-0 p-5 sm:p-6 md:p-7 flex flex-col justify-end text-ink-0">
                  <p className="text-eyebrow uppercase text-brand-200">{f.overline}</p>
                  <h3 className="font-display text-xl sm:text-[24px] md:text-[28px] leading-tight mt-2">{f.title}</h3>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Deals of the week — left editorial card + right 2x4 product grid.
          Reference: Antisa / WoodMart "Deals" layout. Horizontal scroll on
          mobile, fixed 5-col / 8-tile grid on desktop. */}
      <section className="bg-[#FAF3EE] border-y border-[#EFE0D2]/60">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-14 sm:py-20 md:py-24 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 sm:gap-8 lg:gap-10 items-stretch">
          {/* Left: editorial deal card */}
          <aside className="relative overflow-hidden rounded-md bg-ink-900 text-ink-0 min-h-[420px] lg:min-h-full flex flex-col">
            <img
              src="/categories/jew3.jpg"
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover opacity-50"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-ink-900/85 via-ink-900/60 to-ink-900/85" aria-hidden />
            <div className="relative z-10 flex-1 flex flex-col justify-between p-7 sm:p-8 lg:p-10">
              <div>
                <p className="text-eyebrow uppercase text-brand-300">{L.dealsEyebrow}</p>
                <h2 className="font-display text-3xl sm:text-[36px] md:text-[40px] leading-[1.1] mt-3 max-w-[14ch]">
                  {L.dealsTitle}
                </h2>
                <p className="mt-4 text-sm text-ink-200/85 leading-relaxed max-w-[28ch]">
                  {L.dealsSub}
                </p>
              </div>
              <Link
                to={L.dealsCtaHref || '/store/collections'}
                className="mt-8 inline-flex items-center gap-2 self-start h-11 sm:h-12 px-5 sm:px-7 rounded-full bg-brand-400 text-ink-900 text-sm font-medium hover:bg-brand-300 transition-colors duration-fast"
              >
                {L.dealsCtaLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </aside>

          {/* Right: 2 x 4 deal product grid (slick-style). Horizontal scroll
              on mobile, fixed grid on lg+. */}
          <div className="-mx-4 sm:-mx-6 lg:mx-0">
            <div className="px-4 sm:px-6 lg:px-0 grid grid-flow-col auto-cols-[68%] sm:auto-cols-[40%] md:auto-cols-[30%] lg:grid-flow-row lg:auto-cols-auto lg:grid-cols-4 lg:grid-rows-2 gap-3 sm:gap-4 lg:gap-5 overflow-x-auto lg:overflow-visible snap-x snap-mandatory lg:snap-none pb-2 lg:pb-0">
              {deals.map((d, i) => (
                <Link
                  key={d.slug}
                  to={`/store/products/${d.slug}`}
                  className={`group relative flex flex-col bg-ink-0 rounded-md border border-[#EFE0D2]/80 overflow-hidden snap-start lg:snap-align-none animate-fade-in-up-${(i % 6) + 1}`}
                >
                  <div className="relative aspect-square bg-[#FAF3EE] overflow-hidden gold-shine-target">
                    <img
                      src={d.img}
                      alt={d.name}
                      className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.06] transition-transform duration-slow"
                      loading="lazy"
                    />
                    {/* Badge top-left */}
                    <span
                      className={cn(
                        'absolute top-2.5 left-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] px-2 py-1 rounded-sm',
                        d.badge === 'NEW' && 'bg-success-500 text-ink-0',
                        d.badge === 'SALE' && 'bg-danger-500 text-ink-0',
                        d.badge === 'OUT' && 'bg-ink-800 text-ink-0',
                      )}
                    >
                      {d.badge === 'OUT' ? 'OUT-OF-STOCK' : d.badge}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 p-3 sm:p-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-ink-500">{d.category}</p>
                    <h3 className="font-display text-[15px] sm:text-base leading-tight text-ink-900 group-hover:text-brand-700 transition-colors truncate">{d.name}</h3>
                    <div className="flex items-center gap-0.5 text-brand-500 mt-0.5">
                      {Array.from({ length: 5 }).map((_, k) => (
                        <Star key={k} className="h-3 w-3 fill-current" aria-hidden />
                      ))}
                    </div>
                    <p className="text-sm text-ink-900 font-mono tabular-nums mt-0.5">{d.priceLabel}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

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
                <div className="absolute inset-0 bg-gradient-to-t from-ink-900/75 via-ink-900/10 to-ink-900/20" aria-hidden />
                {/* Reel play indicator */}
                <div className="absolute top-3 right-3 h-7 w-7 rounded-full bg-ink-0/85 backdrop-blur-sm inline-flex items-center justify-center shadow-sm">
                  <svg width="10" height="12" viewBox="0 0 10 12" fill="none" aria-hidden>
                    <path d="M0 0L10 6L0 12V0Z" fill="#1F1D1A" />
                  </svg>
                </div>
                <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4 text-ink-0">
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
