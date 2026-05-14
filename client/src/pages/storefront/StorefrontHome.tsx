import { Link } from 'react-router-dom';
import { ArrowRight, Award, ShieldCheck, Sparkles, Quote } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import { useGetPublicProductsQuery, type PublicProduct } from '@/features/storefront/storefrontApi';

const SHOP_BY = [
  { label: '22K Gold', to: '/store/collections/22k' },
  { label: '18K Gold', to: '/store/collections/18k' },
  { label: 'Diamond', to: '/store/collections/diamond' },
  { label: 'Silver', to: '/store/collections/silver' },
  { label: 'Under ₹50,000', to: '/store/collections/under-50k' },
  { label: 'Gifting', to: '/store/collections/gifting' },
];

interface BestSellerCard {
  slug: string;
  name: string;
  priceLabel: string;
  weight: string;
  img: string;
  alt: string;
}

const BESTSELLERS_FALLBACK: BestSellerCard[] = [
  { slug: 'mira-bangle', name: 'Mira bangle', priceLabel: '₹84,500', weight: '12.45 g · 22K', img: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=800&q=80', alt: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=80' },
  { slug: 'tara-mangalsutra', name: 'Tara mangalsutra', priceLabel: '₹62,200', weight: '8.10 g · 22K', img: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=800&q=80', alt: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=800&q=80' },
  { slug: 'aarya-ring', name: 'Aarya solitaire', priceLabel: '₹48,900', weight: '0.32 ct · 18K', img: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=800&q=80', alt: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=800&q=80' },
  { slug: 'riya-jhumka', name: 'Riya jhumkas', priceLabel: '₹31,400', weight: '5.20 g · 22K', img: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=80', alt: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=800&q=80' },
];

function toBestSellerCard(p: PublicProduct): BestSellerCard {
  const grams = (p.weightMg / 1000).toFixed(2);
  const purity = p.purityCaratX100 ? `${p.purityCaratX100 / 100}K` : '';
  return {
    slug: p.slug,
    name: p.name,
    priceLabel: `₹${(p.basePricePaise / 100).toLocaleString('en-IN')}`,
    weight: [grams && `${grams} g`, purity].filter(Boolean).join(' · '),
    img: p.images[0] ?? BESTSELLERS_FALLBACK[0]!.img,
    alt: p.images[1] ?? p.images[0] ?? BESTSELLERS_FALLBACK[0]!.alt,
  };
}

export function StorefrontHome(): JSX.Element {
  const content = useAppSelector((s) => s.storefrontContent);
  const { hero, rates, collections, story, testimonial } = content;
  const { data: liveProducts } = useGetPublicProductsQuery();
  const bestSellers: BestSellerCard[] =
    liveProducts && liveProducts.length > 0
      ? liveProducts.slice(0, 4).map(toBestSellerCard)
      : BESTSELLERS_FALLBACK;
  return (
    <>
      {/* Hero — single image, full bleed, editorial. */}
      <section className="relative isolate overflow-hidden bg-ink-900">
        <div
          className="absolute inset-0"
          aria-hidden
          style={{
            background: `linear-gradient(180deg, rgba(15,14,12,0.35) 0%, rgba(15,14,12,0.05) 35%, rgba(15,14,12,0.65) 100%), url('${hero.image}') center/cover no-repeat`,
          }}
        />
        <div className="relative max-w-[1280px] mx-auto px-6 pt-28 pb-32 md:pt-44 md:pb-48 text-ink-0">
          <p className="text-eyebrow uppercase text-brand-200">{hero.eyebrow}</p>
          <h1 className="font-display text-[44px] leading-[1.04] sm:text-[64px] md:text-[88px] md:leading-[1] tracking-tight max-w-3xl mt-5">
            {hero.title}
          </h1>
          <p className="mt-6 max-w-xl text-base md:text-lg text-ink-100/90 leading-relaxed">
            {hero.subtitle}
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              to={hero.ctaHref}
              className="inline-flex items-center gap-2 h-12 px-7 rounded-full bg-brand-400 text-ink-900 text-sm font-medium hover:bg-brand-300 transition-colors duration-fast"
            >
              {hero.ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
            {hero.secondaryCtaLabel && (
              <Link
                to={hero.secondaryCtaHref}
                className="inline-flex items-center gap-2 h-12 px-6 rounded-full border border-ink-0/30 text-ink-0 text-sm hover:bg-ink-0/10 transition-colors duration-fast backdrop-blur-sm"
              >
                {hero.secondaryCtaLabel}
              </Link>
            )}
          </div>
        </div>

        {/* Live rate strip overlay (bottom) */}
        <div className="relative border-t border-ink-0/10 bg-ink-900/60 backdrop-blur-sm">
          <div className="max-w-[1280px] mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-y-2 gap-x-6 text-xs text-ink-200 font-mono tabular-nums">
            <span><span className="text-ink-400">Today 22K</span> <span className="text-brand-200">{rates.g22}</span></span>
            <span><span className="text-ink-400">18K</span> {rates.g18}</span>
            <span><span className="text-ink-400">Silver</span> {rates.silver}</span>
            <span className="hidden md:inline text-ink-400">Updated {rates.updatedAt} · From MCX</span>
          </div>
        </div>
      </section>

      {/* Shop by — quiet pill row */}
      <section className="border-b border-ink-100">
        <div className="max-w-[1280px] mx-auto px-6 py-6 flex flex-wrap items-center gap-2 md:gap-3">
          <span className="text-eyebrow uppercase text-ink-500 mr-2">Shop by</span>
          {SHOP_BY.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="px-4 h-9 inline-flex items-center rounded-full border border-ink-100 text-sm text-ink-700 hover:border-ink-300 hover:text-ink-900 transition-colors duration-fast"
            >
              {s.label}
            </Link>
          ))}
        </div>
      </section>

      {/* Collection TOC — magazine-style. */}
      <section className="max-w-[1280px] mx-auto px-6 py-20 md:py-24">
        <div className="flex items-end justify-between mb-10">
          <div>
            <p className="text-eyebrow uppercase text-ink-500">Shop by occasion</p>
            <h2 className="font-display text-display-lg md:text-[48px] md:leading-[1.05] text-ink-900 mt-2">Collections</h2>
          </div>
          <Link to="/store/collections" className="hidden sm:inline-flex items-center gap-1 text-sm text-ink-700 hover:text-ink-900 border-b border-ink-200 hover:border-ink-400 pb-0.5">
            See all
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10">
          {collections.map((c, i) => (
            <Link
              key={c.slug}
              to={`/store/collections/${c.slug}`}
              className="group block"
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-ink-100">
                <img
                  src={c.img}
                  alt={c.name}
                  className="h-full w-full object-cover group-hover:scale-[1.04] transition-transform duration-slow ease-out"
                  loading={i === 0 ? 'eager' : 'lazy'}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink-900/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" aria-hidden />
              </div>
              <div className="mt-5">
                <h3 className="font-display text-[22px] leading-tight text-ink-900">{c.name}</h3>
                <p className="text-sm text-ink-500 mt-1.5">{c.tagline}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured pair — 1 big editorial + 2 stacked. */}
      <section className="bg-ink-25 border-y border-ink-100">
        <div className="max-w-[1280px] mx-auto px-6 py-20 md:py-24 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 md:gap-8">
          <Link to="/store/collections/bridal" className="group relative block aspect-[4/5] lg:aspect-auto lg:min-h-[560px] overflow-hidden bg-ink-100">
            <img
              src="https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=1400&q=85"
              alt="Bridal lookbook"
              className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-slow"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-900/70 via-ink-900/10 to-transparent" aria-hidden />
            <div className="absolute bottom-0 left-0 right-0 p-8 md:p-10 text-ink-0">
              <p className="text-eyebrow uppercase text-brand-200">Lookbook · Autumn</p>
              <h3 className="font-display text-[34px] md:text-[44px] leading-[1.05] mt-3 max-w-md">The Bridal lookbook</h3>
              <p className="mt-3 text-sm text-ink-100/85 max-w-md">Twelve heirloom pieces, photographed in our Gurugram workshop. Long-form story, no carousel.</p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm border-b border-brand-300 pb-0.5">
                Read the story
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>
          <div className="grid grid-rows-2 gap-6 md:gap-8">
            {[
              { slug: 'gifting', overline: 'Under ₹50,000', title: 'Gifts that hold value', img: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1100&q=85' },
              { slug: 'diamond', overline: 'New · Diamond', title: 'Solitaires, certified', img: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=1100&q=85' },
            ].map((f) => (
              <Link key={f.slug} to={`/store/collections/${f.slug}`} className="group relative block overflow-hidden bg-ink-100 aspect-[4/3] lg:aspect-auto">
                <img src={f.img} alt={f.title} className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-slow" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-r from-ink-900/55 via-ink-900/10 to-transparent" aria-hidden />
                <div className="absolute inset-0 p-6 md:p-7 flex flex-col justify-end text-ink-0">
                  <p className="text-eyebrow uppercase text-brand-200">{f.overline}</p>
                  <h3 className="font-display text-[24px] md:text-[28px] leading-tight mt-2">{f.title}</h3>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Best-sellers — product grid with hover-flip second image (CaratLane). */}
      <section className="max-w-[1280px] mx-auto px-6 py-20 md:py-24">
        <div className="flex items-end justify-between mb-10">
          <div>
            <p className="text-eyebrow uppercase text-ink-500">Most loved this season</p>
            <h2 className="font-display text-display-lg md:text-[48px] md:leading-[1.05] text-ink-900 mt-2">Best-sellers</h2>
          </div>
          <Link to="/store/collections" className="hidden sm:inline-flex items-center gap-1 text-sm text-ink-700 hover:text-ink-900 border-b border-ink-200 hover:border-ink-400 pb-0.5">
            Browse all
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-10 md:gap-x-6">
          {bestSellers.map((p) => (
            <Link key={p.slug} to={`/store/products/${p.slug}`} className="group block">
              <div className="relative aspect-[4/5] overflow-hidden bg-ink-100">
                <img src={p.img} alt={p.name} className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300 group-hover:opacity-0" loading="lazy" />
                <img src={p.alt} alt="" className="absolute inset-0 h-full w-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-300" loading="lazy" aria-hidden />
                <span className="absolute top-3 left-3 bg-ink-0/90 backdrop-blur-sm text-[10px] uppercase tracking-[0.16em] px-2.5 py-1 rounded-full text-ink-700">Bestseller</span>
              </div>
              <div className="mt-4">
                <h3 className="font-display text-[18px] text-ink-900 leading-tight">{p.name}</h3>
                <p className="text-xs text-ink-500 mt-1">{p.weight}</p>
                <p className="text-sm text-ink-900 font-mono tabular-nums mt-1.5">{p.priceLabel}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Editorial story strip — three generations */}
      <section className="bg-ink-50 border-y border-ink-100">
        <div className="max-w-[1280px] mx-auto px-6 py-20 md:py-24 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="aspect-[4/5] bg-ink-100 overflow-hidden">
            <img
              src={story.image}
              alt={story.title}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
          <div className="max-w-md">
            <p className="text-eyebrow uppercase text-ink-500">{story.eyebrow}</p>
            <h2 className="font-display text-[36px] md:text-[44px] leading-[1.05] text-ink-900 mt-3 whitespace-pre-line">
              {story.title}
            </h2>
            <p className="mt-6 text-base text-ink-600 leading-relaxed whitespace-pre-line">
              {story.body}
            </p>
            <Link to="/store/story" className="mt-8 inline-flex items-center gap-2 text-sm text-ink-900 border-b border-brand-400 hover:border-brand-600 pb-1 transition-colors">
              Read the story
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section>
        <div className="max-w-[1280px] mx-auto px-6 py-14 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          {[
            { icon: ShieldCheck, title: 'BIS Hallmarked', body: 'Every gram. Every piece. Audited monthly by an independent lab.' },
            { icon: Sparkles, title: 'Transparent pricing', body: 'Weight × today’s MCX rate + making + GST. Itemised on every bill.' },
            { icon: Award, title: 'Lifetime exchange', body: 'Trade in any piece against pure-gold value — no time limit.' },
          ].map((t) => (
            <div key={t.title} className="flex items-start gap-4">
              <div className="h-11 w-11 shrink-0 rounded-full bg-brand-50 text-brand-700 inline-flex items-center justify-center">
                <t.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-[15px] text-ink-900 font-medium">{t.title}</h3>
                <p className="mt-1.5 text-sm text-ink-600 leading-relaxed">{t.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonial / press */}
      <section className="bg-ink-900 text-ink-100">
        <div className="max-w-[1280px] mx-auto px-6 py-20 md:py-24 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-10 items-end">
          <figure className="max-w-2xl">
            <Quote className="h-6 w-6 text-brand-300" aria-hidden />
            <blockquote className="mt-5 font-display text-[28px] md:text-[36px] leading-[1.15] text-ink-0">
              &ldquo;{testimonial.quote}&rdquo;
            </blockquote>
            <figcaption className="mt-6 text-sm text-ink-300">
              {testimonial.author}
            </figcaption>
          </figure>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-ink-400 text-xs uppercase tracking-[0.18em]">
            <span>Vogue India</span>
            <span>Femina</span>
            <span>The Hindu</span>
            <span>Times of India</span>
          </div>
        </div>
      </section>

      {/* Visit-us CTA */}
      <section>
        <div className="max-w-[1280px] mx-auto px-6 py-16 md:py-20 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border-t border-ink-100">
          <div className="max-w-xl">
            <p className="text-eyebrow uppercase text-ink-500">Visit us</p>
            <h2 className="font-display text-[28px] md:text-[36px] leading-tight text-ink-900 mt-3">
              Two showrooms in Haryana. Walk in, weigh, decide.
            </h2>
          </div>
          <Link to="/store/locations" className="inline-flex items-center gap-2 h-12 px-7 rounded-full bg-ink-900 text-ink-0 text-sm font-medium hover:bg-ink-800 transition-colors duration-fast">
            Find a store
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
