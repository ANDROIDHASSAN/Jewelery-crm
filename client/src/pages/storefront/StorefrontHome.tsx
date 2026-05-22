import { Link } from 'react-router-dom';
import { ArrowRight, Award, ShieldCheck, Sparkles, Star } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import {
  useGetPublicGoldRateQuery,
  useGetPublicProductsQuery,
  type PublicProduct,
} from '@/features/storefront/storefrontApi';

function formatLiveRate(paise: number | undefined, fallback: string): string {
  if (!paise || paise <= 0) return fallback;
  const rupees = paise / 100;
  return rupees >= 1000
    ? `₹${Math.round(rupees).toLocaleString('en-IN')}/g`
    : `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/g`;
}

const SHOP_BY = [
  { label: '22K Gold', to: '/store/collections/22k' },
  { label: '18K Gold', to: '/store/collections/18k' },
  { label: 'Diamond', to: '/store/collections/diamond' },
  { label: 'Silver', to: '/store/collections/silver' },
  { label: 'Under ₹50,000', to: '/store/collections/under-50k' },
  { label: 'Gifting', to: '/store/collections/gifting' },
];

// Tanishq-signature: circular portrait tiles for browse-by-category.
// Each links to an existing collection slug already wired in the router.
// SEO-friendly labels with metal/style hint.
const CATEGORY_TILES = [
  { label: 'Diamond rings', slug: 'diamond', img: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=92' },
  { label: 'Bridal necklaces', slug: 'bridal', img: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=800&q=92' },
  { label: 'Gold earrings', slug: 'daily-wear', img: 'https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?auto=format&fit=crop&w=800&q=92' },
  { label: '22K bangles', slug: '22k', img: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=800&q=92' },
  { label: 'Pendants', slug: '18k', img: 'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=800&q=92' },
  { label: 'Mangalsutra', slug: 'festive', img: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=800&q=92' },
];

// Instagram-reel-style 9:16 video tiles. Posters are still images today;
// swap to actual <video> via CMS once real branded reels are shot.
const REELS = [
  { handle: '@priya.bridal', caption: 'Day-of-wedding bridal set · 22K', poster: 'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=900&q=92', slug: 'bridal' },
  { handle: '@diya.daily', caption: 'Light-weight 22K chain · 8.2 g', poster: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=900&q=92', slug: 'daily-wear' },
  { handle: '@aisha.studio', caption: 'Festive jhumka stack', poster: 'https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?auto=format&fit=crop&w=900&q=92', slug: 'festive' },
  { handle: '@meera.solitaire', caption: 'IGI-certified solitaire · 0.48 ct', poster: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=900&q=92', slug: 'diamond' },
  { handle: '@aanya.bangles', caption: 'Stack of 6 · 22K · 38 g', poster: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=900&q=92', slug: '22k' },
];

// Multi-testimonial marquee — names + cities only (no PII per gotchas.md).
// Split into two rows so the section scrolls left + right in opposite
// directions (Tanishq/CaratLane-style social-proof strip).
interface Testimonial {
  quote: string;
  author: string;
  city: string;
  occasion: string;
}

const TESTIMONIALS_ROW_1: Testimonial[] = [
  { quote: 'They weighed each piece in front of me and printed the rate for that exact minute. I have never felt this calm buying gold.', author: 'Priya Sharma', city: 'Gurugram', occasion: 'Bridal set · 2024' },
  { quote: 'My daughter\u2019s mangalsutra arrived hand-finished, BIS hallmarked, with the GST broken out line-by-line. Three generations of trust.', author: 'Sunita Malhotra', city: 'Karnal', occasion: 'Wedding gift · 2024' },
  { quote: 'WhatsApp updates with photos of my piece on the bench made it feel personal. Worth every gram.', author: 'Aanya Kapoor', city: 'Faridabad', occasion: 'Anniversary · 2025' },
  { quote: 'Light-weight 22K chain I wear every day to work. Looks premium, priced fairly against the live MCX rate.', author: 'Kavya Iyer', city: 'Delhi', occasion: 'Daily wear · 2025' },
  { quote: 'The bridal set was hand-set in three weeks and weighed in front of me at delivery. Pure 22K, exactly as promised.', author: 'Anjali Verma', city: 'Panchkula', occasion: 'Daughter\u2019s wedding · 2024' },
];

const TESTIMONIALS_ROW_2: Testimonial[] = [
  { quote: 'My Diwali earrings arrived a day early with a BIS hallmark certificate. Best festive jewellery shopping I have done.', author: 'Meera Reddy', city: 'Gurugram', occasion: 'Festive set · 2024' },
  { quote: 'Mangalsutra design was customised over WhatsApp in two days. The karigar\u2019s craftsmanship is unmatched in Haryana.', author: 'Riya Singh', city: 'Karnal', occasion: 'Mangalsutra · 2024' },
  { quote: '0.48 ct IGI-certified solitaire, delivered with the original lab certificate and box. No middleman, no markup.', author: 'Divya Patel', city: 'Faridabad', occasion: 'Solitaire ring · 2025' },
  { quote: 'Engagement ring with a transparent breakdown \u2014 weight, rate, making, GST. No haggling, no surprises at billing.', author: 'Neha Joshi', city: 'Gurugram', occasion: 'Engagement · 2024' },
  { quote: 'Bought a complete bridal jewellery set for my wedding. Everything weighed publicly, hallmarked, and delivered on time.', author: 'Pooja Choudhary', city: 'Hisar', occasion: 'Bridal · 2025' },
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
  { slug: 'mira-bangle', name: 'Mira bangle', priceLabel: '₹84,500', weight: '12.45 g · 22K', img: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=1400&q=92', alt: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1400&q=92' },
  { slug: 'tara-mangalsutra', name: 'Tara mangalsutra', priceLabel: '₹62,200', weight: '8.10 g · 22K', img: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=1400&q=92', alt: 'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=1400&q=92' },
  { slug: 'aarya-ring', name: 'Aarya solitaire', priceLabel: '₹48,900', weight: '0.32 ct · 18K', img: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=1400&q=92', alt: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1400&q=92' },
  { slug: 'riya-jhumka', name: 'Riya jhumkas', priceLabel: '₹31,400', weight: '5.20 g · 22K', img: 'https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?auto=format&fit=crop&w=1400&q=92', alt: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=1400&q=92' },
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
  const { hero, rates: cmsRates, collections, story } = content;
  const { data: liveProducts } = useGetPublicProductsQuery();
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
  const bestSellers: BestSellerCard[] =
    liveProducts && liveProducts.length > 0
      ? liveProducts.slice(0, 4).map(toBestSellerCard)
      : BESTSELLERS_FALLBACK;
  return (
    <>
      {/* Hero — light split editorial. Text on faint blush, full-bleed image on right. */}
      <section className="bg-[#FAF3EE] border-b border-[#EFE0D2]/70">
        <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] items-stretch">
          {/* Left: cream content panel — staggered fade-in-up */}
          <div className="flex flex-col justify-center px-4 sm:px-6 lg:pl-2 lg:pr-12 py-14 sm:py-20 lg:py-24 order-2 lg:order-1">
            <p className="text-eyebrow uppercase text-brand-700 animate-fade-in-up-1 inline-flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-brand-500 animate-twinkle" aria-hidden /> {hero.eyebrow}
            </p>
            <h1 className="font-display text-[36px] leading-[1.05] sm:text-[48px] md:text-[64px] lg:text-[72px] lg:leading-[1.02] tracking-tight text-ink-900 mt-4 sm:mt-5 max-w-xl animate-fade-in-up-2">
              {hero.title}
            </h1>
            <p className="mt-5 sm:mt-6 max-w-md text-[15px] sm:text-base text-ink-600 leading-relaxed animate-fade-in-up-3">
              {hero.subtitle}
            </p>
            <div className="mt-7 sm:mt-9 flex flex-wrap items-center gap-3 animate-fade-in-up-4">
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
            {/* Live rate strip — on cream, gold accents */}
            <div className="mt-10 sm:mt-12 flex flex-wrap items-center gap-x-5 sm:gap-x-6 gap-y-2 text-xs text-ink-600 font-mono tabular-nums border-t border-ink-100 pt-5 sm:pt-6 animate-fade-in-up-5">
              <span><span className="text-ink-400">Today 24K</span> <span className="text-brand-700 font-semibold">{rates.g24}</span></span>
              <span><span className="text-ink-400">22K</span> <span className="text-brand-700 font-semibold">{rates.g22}</span></span>
              <span className="hidden sm:inline"><span className="text-ink-400">18K</span> {rates.g18}</span>
              <span className="hidden md:inline"><span className="text-ink-400">Silver</span> {rates.silver}</span>
              <span className="hidden lg:inline text-ink-400 ml-auto">Updated {rates.updatedAt}</span>
            </div>
          </div>

          {/* Right: full-bleed photography with slow ken-burns zoom */}
          <div className="relative aspect-[4/5] lg:aspect-auto lg:min-h-[640px] bg-ink-100 order-1 lg:order-2 overflow-hidden">
            <img
              src={hero.image}
              alt=""
              className="absolute inset-0 h-full w-full object-cover animate-ken-burns"
              loading="eager"
            />
            {/* Subtle vignette to keep edges soft against cream panel */}
            <div className="absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-[#FAF3EE]/40 pointer-events-none" aria-hidden />
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

      {/* Tanishq-style circular category portrait tiles */}
      <section className="bg-ink-0">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-20">
          <div className="text-center mb-8 sm:mb-12">
            <p className="text-eyebrow uppercase text-brand-700">Browse by category</p>
            <h2 className="font-display text-3xl sm:text-[36px] md:text-[44px] leading-tight text-ink-900 mt-2">Rings, necklaces, earrings &amp; more</h2>
            <p className="mt-3 text-sm text-ink-600 max-w-md mx-auto">Six categories, one hallmarked workshop. Shop diamond rings, 22K bridal necklaces, gold earrings, bangles, pendants and mangalsutra.</p>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 sm:gap-6 md:gap-8">
            {CATEGORY_TILES.map((c, i) => (
              <Link
                key={c.label}
                to={`/store/collections/${c.slug}`}
                className={`group flex flex-col items-center text-center animate-fade-in-up-${(i % 6) + 1}`}
              >
                <div className="relative w-full aspect-square overflow-hidden rounded-full bg-[#FAF3EE] ring-1 ring-[#EFE0D2] group-hover:ring-brand-400 transition-all duration-200 gold-shine-target">
                  <img
                    src={c.img}
                    alt={c.label}
                    className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.08] transition-transform duration-slow"
                    loading="lazy"
                  />
                </div>
                <span className="mt-3 sm:mt-4 text-xs sm:text-sm text-ink-800 group-hover:text-brand-700 tracking-wide transition-colors">
                  {c.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Collection TOC — magazine-style. */}
      <section className="max-w-[1280px] mx-auto px-4 sm:px-6 py-14 sm:py-20 md:py-24">
        <div className="flex items-end justify-between mb-8 sm:mb-10 gap-4">
          <div>
            <p className="text-eyebrow uppercase text-brand-700">Shop by occasion</p>
            <h2 className="font-display text-3xl sm:text-display-lg md:text-[48px] md:leading-[1.05] text-ink-900 mt-2">Indian bridal &amp; festive jewellery, by collection</h2>
            <p className="mt-3 text-sm text-ink-600 max-w-xl">Hand-crafted 22K and 18K pieces — bridal, daily-wear, festive, diamond and silver — from our family workshop in Haryana.</p>
          </div>
          <Link to="/store/collections" className="hidden sm:inline-flex items-center gap-1 text-sm text-ink-700 hover:text-brand-700 border-b border-ink-200 hover:border-brand-400 pb-0.5 shrink-0 transition-colors">
            See all
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-8 sm:gap-y-10">
          {collections.map((c, i) => (
            <Link
              key={c.slug}
              to={`/store/collections/${c.slug}`}
              className={`group block animate-fade-in-up-${(i % 4) + 1}`}
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-[#FAF3EE] rounded-sm gold-shine-target">
                <img
                  src={c.img}
                  alt={c.name}
                  className="h-full w-full object-cover group-hover:scale-[1.06] transition-transform duration-slow ease-out"
                  loading={i === 0 ? 'eager' : 'lazy'}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink-900/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" aria-hidden />
              </div>
              <div className="mt-4 sm:mt-5">
                <h3 className="font-display text-lg sm:text-[22px] leading-tight text-ink-900 group-hover:text-brand-700 transition-colors">{c.name}</h3>
                <p className="text-xs sm:text-sm text-ink-500 mt-1 sm:mt-1.5">{c.tagline}</p>
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

      {/* Best-sellers — product grid with hover-flip second image (CaratLane). */}
      <section className="max-w-[1280px] mx-auto px-4 sm:px-6 py-14 sm:py-20 md:py-24">
        <div className="flex items-end justify-between mb-8 sm:mb-10 gap-4">
          <div>
            <p className="text-eyebrow uppercase text-brand-700">Most loved this season</p>
            <h2 className="font-display text-3xl sm:text-display-lg md:text-[48px] md:leading-[1.05] text-ink-900 mt-2">Best-selling 22K bangles, mangalsutra &amp; solitaires</h2>
            <p className="mt-3 text-sm text-ink-600 max-w-xl">Hand-set by our karigars, BIS-hallmarked, priced against today\u2019s live gold rate.</p>
          </div>
          <Link to="/store/collections" className="hidden sm:inline-flex items-center gap-1 text-sm text-ink-700 hover:text-brand-700 border-b border-ink-200 hover:border-brand-400 pb-0.5 shrink-0 transition-colors">
            Browse all
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 sm:gap-x-5 gap-y-8 sm:gap-y-10 md:gap-x-6">
          {bestSellers.map((p, i) => (
            <Link key={p.slug} to={`/store/products/${p.slug}`} className={`group block animate-fade-in-up-${(i % 4) + 1}`}>
              <div className="relative aspect-[4/5] overflow-hidden bg-[#FAF3EE] rounded-sm gold-shine-target">
                <img src={p.img} alt={p.name} className="absolute inset-0 h-full w-full object-cover transition-all duration-500 group-hover:opacity-0 group-hover:scale-[1.04]" loading="lazy" />
                <img src={p.alt} alt="" className="absolute inset-0 h-full w-full object-cover opacity-0 group-hover:opacity-100 group-hover:scale-[1.04] transition-all duration-500" loading="lazy" aria-hidden />
                <span className="absolute top-3 left-3 bg-ink-0/90 backdrop-blur-sm text-[10px] uppercase tracking-[0.16em] px-2.5 py-1 rounded-full text-brand-700 font-medium">Bestseller</span>
              </div>
              <div className="mt-3 sm:mt-4">
                <h3 className="font-display text-base sm:text-[18px] text-ink-900 leading-tight group-hover:text-brand-700 transition-colors">{p.name}</h3>
                <p className="text-[11px] sm:text-xs text-ink-500 mt-1">{p.weight}</p>
                <p className="text-sm text-ink-900 font-mono tabular-nums mt-1 sm:mt-1.5">{p.priceLabel}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Editorial story strip — three generations */}
      <section className="bg-[#FAF3EE] border-y border-[#EFE0D2]/60">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-14 sm:py-20 md:py-24 grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-16 items-center">
          <div className="aspect-[4/5] bg-ink-100 overflow-hidden rounded-sm">
            <img
              src={story.image}
              alt={story.title}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
          <div className="max-w-md">
            <p className="text-eyebrow uppercase text-ink-500">{story.eyebrow}</p>
            <h2 className="font-display text-3xl sm:text-[36px] md:text-[44px] leading-[1.05] text-ink-900 mt-3 whitespace-pre-line">
              {story.title}
            </h2>
            <p className="mt-4 sm:mt-6 text-sm sm:text-base text-ink-600 leading-relaxed whitespace-pre-line">
              {story.body}
            </p>
            <Link to="/store/story" className="mt-6 sm:mt-8 inline-flex items-center gap-2 text-sm text-ink-900 border-b border-brand-400 hover:border-brand-600 pb-1 transition-colors">
              Read the story
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Trust strip — SEO copy: BIS 916 hallmark, MCX gold rate, GST, exchange */}
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-10 sm:py-14 grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 md:gap-12">
          {[
            { icon: ShieldCheck, title: 'BIS 916 hallmarked gold', body: 'Every gram of our 22K and 18K jewellery is BIS-hallmarked and audited monthly by an independent assay lab.' },
            { icon: Sparkles, title: 'Live MCX rate · transparent GST', body: 'Weight × today\u2019s MCX gold rate + making charges + 3% GST, itemised on every bill. No hidden margins.' },
            { icon: Award, title: 'Lifetime exchange on pure gold', body: 'Trade in any piece against pure-gold value at the current rate — no time limit, no deduction beyond stones.' },
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

      {/* Watch & wear — Instagram-reel-style 9:16 video tiles. Horizontal
          scroll on mobile, full grid on desktop. SEO copy mentions live
          customer styling for long-tail "how to wear / styling" searches. */}
      <section className="bg-ink-0">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-14 sm:py-20 md:py-24">
          <div className="flex items-end justify-between mb-8 sm:mb-10 gap-4">
            <div>
              <p className="text-eyebrow uppercase text-brand-700">Watch &amp; wear</p>
              <h2 className="font-display text-3xl sm:text-display-lg md:text-[48px] md:leading-[1.05] text-ink-900 mt-2">Styling reels from our customers</h2>
              <p className="mt-2 text-sm text-ink-600 max-w-md">
                Real brides, real jhumka stacks, real solitaires. Tap any reel to shop the look.
              </p>
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
            {REELS.map((r, i) => (
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
            <p className="text-eyebrow uppercase text-brand-700">Loved by jewellery families across Haryana</p>
            <h2 className="font-display text-3xl sm:text-[36px] md:text-[44px] leading-tight text-ink-900 mt-2">
              50,000+ verified customers since 1972
            </h2>
            <p className="mt-3 text-sm text-ink-600">Transparent pricing, BIS-hallmarked gold, and a WhatsApp update on every piece &mdash; that&apos;s why families trust us for bridal, festive, and gifting.</p>
          </div>
        </div>

        {/* Full-bleed marquee rows */}
        <div className="space-y-5 sm:space-y-6 pb-14 sm:pb-20 md:pb-24">
          <TestimonialMarquee items={TESTIMONIALS_ROW_1} direction="left" />
          <TestimonialMarquee items={TESTIMONIALS_ROW_2} direction="right" />
        </div>

        {/* Press strip beneath the reviews */}
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pb-14 sm:pb-20 md:pb-24">
          <div className="pt-8 border-t border-[#E8CFC1]/60 flex flex-wrap items-center justify-center gap-x-8 sm:gap-x-12 gap-y-3 text-ink-500 text-xs uppercase tracking-[0.18em]">
            <span className="text-ink-500">As featured in</span>
            <span>Vogue India</span>
            <span>Femina</span>
            <span>The Hindu</span>
            <span>Times of India</span>
          </div>
        </div>
      </section>

      {/* Visit-us CTA — faint blush surround */}
      <section className="bg-[#FDF8F4]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-20 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border-t border-[#EFE0D2]/60">
          <div className="max-w-xl">
            <p className="text-eyebrow uppercase text-brand-700">Visit our jewellery showrooms</p>
            <h2 className="font-display text-2xl sm:text-[28px] md:text-[36px] leading-tight text-ink-900 mt-3">
              Two BIS-certified showrooms in Gurugram &amp; Karnal. Walk in, weigh, decide.
            </h2>
            <p className="mt-3 text-sm text-ink-600 max-w-lg">In-person rate matching, free try-on, lifetime exchange — and a chai on the house while you decide.</p>
          </div>
          <Link to="/store/locations" className="inline-flex items-center gap-2 h-11 sm:h-12 px-5 sm:px-7 rounded-full bg-ink-900 text-ink-0 text-sm font-medium hover:bg-ink-800 transition-colors duration-fast">
            Find a store
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
  items: Testimonial[];
  direction: 'left' | 'right';
}): JSX.Element {
  const animClass = direction === 'left' ? 'animate-marquee-left' : 'animate-marquee-right';
  // Duplicate the list so the marquee loops with no visible gap. The wrapper
  // is w-max so children flow inline without wrapping; the outer section
  // already has overflow-hidden to clip the off-screen half.
  const doubled = [...items, ...items];
  return (
    <div className="group">
      <div className={`flex w-max gap-4 sm:gap-5 ${animClass} marquee-pause`}>
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
