import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  useGetPublicProductsQuery,
  useGetPublicCollectionsQuery,
  type PublicProduct,
  type PublicCategory,
} from '@/features/storefront/storefrontApi';

const TITLES: Record<string, { title: string; subtitle: string }> = {
  bridal: { title: 'Bridal', subtitle: 'Heirloom pieces for the day that matters. Hand-set, 22K, BIS-hallmarked.' },
  'daily-wear': { title: 'Daily wear', subtitle: 'Light-weight gold and silver, made to be worn every day.' },
  festive: { title: 'Festive', subtitle: 'For Diwali, Karva Chauth, Navratri — designed to be photographed.' },
  diamond: { title: 'Diamond', subtitle: 'Certified solitaires and studded pieces. IGI / GIA on every stone above 0.20 ct.' },
  silver: { title: 'Silver', subtitle: '92.5 sterling. Hallmarked. For gifting and daily wear.' },
  '22k': { title: '22K Gold', subtitle: 'BIS-hallmarked 22K pieces — bridal, daily-wear, festive.' },
  '18k': { title: '18K Gold', subtitle: 'Lighter, stronger 18K — modern silhouettes and diamond settings.' },
  'under-50k': { title: 'Under ₹50,000', subtitle: 'Gifting-ready pieces, under fifty thousand.' },
  gifting: { title: 'Gifting', subtitle: 'Hand-picked pieces, ready to gift.' },
};

const SORTS = ['Featured', 'Newest', 'Price: low → high', 'Price: high → low', 'Weight: light → heavy'] as const;
type Sort = (typeof SORTS)[number];

function priceOf(p: PublicProduct): number {
  return p.basePricePaise + p.stoneChargePaise;
}

function purityLabel(p: PublicProduct): string {
  if (p.purityCaratX100 < 1000) return 'Silver';
  return `${p.purityCaratX100 / 100}K`;
}

// Filter rule sets — each label maps to a predicate.
const METAL_RULES: Record<string, (p: PublicProduct) => boolean> = {
  '22K Gold': (p) => p.purityCaratX100 === 2200,
  '18K Gold': (p) => p.purityCaratX100 === 1800,
  Silver: (p) => p.purityCaratX100 < 1000,
  Platinum: (p) => p.purityCaratX100 === 9500,
};
const WEIGHT_RULES: Record<string, (p: PublicProduct) => boolean> = {
  'Under 10 g': (p) => p.weightMg < 10_000,
  '10 – 20 g': (p) => p.weightMg >= 10_000 && p.weightMg < 20_000,
  '20 – 40 g': (p) => p.weightMg >= 20_000 && p.weightMg < 40_000,
  'Over 40 g': (p) => p.weightMg >= 40_000,
};
const PRICE_RULES: Record<string, (p: PublicProduct) => boolean> = {
  'Under ₹50,000': (p) => priceOf(p) < 50_00_000,
  '₹50,000 – ₹1,00,000': (p) => priceOf(p) >= 50_00_000 && priceOf(p) < 1_00_00_000,
  'Over ₹1,00,000': (p) => priceOf(p) >= 1_00_00_000,
};

// Apply collection-slug rules to a product list. Real categories match by
// slugified name (via /website/collections); pseudo-collections (22k, 18k,
// under-50k, gifting, silver) use intrinsic product fields.
function filterBySlug(
  products: PublicProduct[],
  categories: PublicCategory[],
  slug: string | undefined,
): PublicProduct[] {
  if (!slug) return products;
  switch (slug) {
    case '22k':
      return products.filter((p) => p.purityCaratX100 === 2200);
    case '18k':
      return products.filter((p) => p.purityCaratX100 === 1800);
    case 'silver':
      return products.filter((p) => p.purityCaratX100 < 1000);
    case 'under-50k':
      return products.filter((p) => priceOf(p) < 50_00_000);
    case 'gifting':
      return products.filter((p) => priceOf(p) <= 1_00_000_00);
    default: {
      const cat = categories.find((c) => c.slug === slug);
      if (!cat) return products;
      return products.filter((p) => p.categoryId === cat.id);
    }
  }
}

export function CollectionPage(): JSX.Element {
  const { slug } = useParams();
  const meta = slug ? TITLES[slug] ?? { title: slug, subtitle: '' } : { title: 'All collections', subtitle: 'Every piece in our catalogue, ready to view.' };

  const [sort, setSort] = useState<Sort>('Featured');
  const [sortOpen, setSortOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [metals, setMetals] = useState<Set<string>>(new Set());
  const [weights, setWeights] = useState<Set<string>>(new Set());
  const [prices, setPrices] = useState<Set<string>>(new Set());

  const { data: products = [], isLoading: productsLoading } = useGetPublicProductsQuery();
  const { data: categories = [] } = useGetPublicCollectionsQuery();

  const filtered = useMemo(() => {
    const bySlug = filterBySlug(products, categories, slug);
    const passMetals = (p: PublicProduct): boolean =>
      metals.size === 0 || Array.from(metals).some((m) => METAL_RULES[m]?.(p));
    const passWeights = (p: PublicProduct): boolean =>
      weights.size === 0 || Array.from(weights).some((w) => WEIGHT_RULES[w]?.(p));
    const passPrices = (p: PublicProduct): boolean =>
      prices.size === 0 || Array.from(prices).some((pr) => PRICE_RULES[pr]?.(p));
    return bySlug.filter((p) => passMetals(p) && passWeights(p) && passPrices(p));
  }, [products, categories, slug, metals, weights, prices]);

  function toggle(set: Set<string>, value: string, setter: (s: Set<string>) => void): void {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    setter(next);
  }

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sort) {
      case 'Price: low → high':
        return arr.sort((a, b) => priceOf(a) - priceOf(b));
      case 'Price: high → low':
        return arr.sort((a, b) => priceOf(b) - priceOf(a));
      case 'Weight: light → heavy':
        return arr.sort((a, b) => a.weightMg - b.weightMg);
      case 'Newest':
        return arr.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      default:
        return arr;
    }
  }, [filtered, sort]);

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-12 md:py-16">
      <nav className="text-xs text-ink-500 mb-5" aria-label="Breadcrumb">
        <Link to="/store" className="hover:text-ink-700">Home</Link>
        <span className="mx-2 text-ink-300">/</span>
        <Link to="/store/collections" className="hover:text-ink-700">Collections</Link>
        {slug && (
          <>
            <span className="mx-2 text-ink-300">/</span>
            <span className="text-ink-700">{meta.title}</span>
          </>
        )}
      </nav>

      <header className="mb-10 max-w-3xl">
        <p className="text-eyebrow uppercase text-ink-500">Collection</p>
        <h1 className="font-display text-[40px] md:text-[56px] leading-[1.05] text-ink-900 mt-2">{meta.title}</h1>
        {meta.subtitle && <p className="mt-4 text-base text-ink-600 leading-relaxed max-w-2xl">{meta.subtitle}</p>}
      </header>

      <div className="sticky top-[88px] z-20 bg-ink-0/85 backdrop-blur-md -mx-6 px-6 border-y border-ink-100 mb-8">
        <div className="h-14 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="inline-flex items-center gap-2 text-sm text-ink-700 hover:text-ink-900"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            <span className="text-ink-400">·</span>
            <span className="text-ink-500">{sorted.length} pieces</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setSortOpen((v) => !v)}
              className="inline-flex items-center gap-2 text-sm text-ink-700 hover:text-ink-900"
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
            >
              <span className="text-ink-500">Sort:</span>
              {sort}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {sortOpen && (
              <ul
                role="listbox"
                className="absolute right-0 top-full mt-2 w-60 rounded-md border border-ink-100 bg-ink-0 shadow-md py-1 text-sm"
              >
                {SORTS.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={s === sort}
                      onClick={() => {
                        setSort(s);
                        setSortOpen(false);
                      }}
                      className={cn(
                        'w-full text-left px-3 py-2 hover:bg-ink-50',
                        s === sort ? 'text-ink-900' : 'text-ink-700',
                      )}
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-10">
        <aside className={cn('space-y-7 text-sm', filtersOpen ? 'block' : 'hidden lg:block')}>
          <FilterGroup
            label="Metal"
            options={Object.keys(METAL_RULES)}
            selected={metals}
            onToggle={(v) => toggle(metals, v, setMetals)}
          />
          <FilterGroup
            label="Weight"
            options={Object.keys(WEIGHT_RULES)}
            selected={weights}
            onToggle={(v) => toggle(weights, v, setWeights)}
          />
          <FilterGroup
            label="Price"
            options={Object.keys(PRICE_RULES)}
            selected={prices}
            onToggle={(v) => toggle(prices, v, setPrices)}
          />
        </aside>

        <section className="grid grid-cols-2 md:grid-cols-3 gap-x-5 gap-y-10 md:gap-x-6">
          {productsLoading && (
            <p className="col-span-full text-sm text-ink-500">Loading the collection…</p>
          )}
          {!productsLoading && sorted.length === 0 && (
            <div className="col-span-full text-center py-16">
              <p className="font-display text-[22px] text-ink-900">Nothing published yet</p>
              <p className="text-sm text-ink-500 mt-2 max-w-md mx-auto">
                This collection is empty. Add products from the admin panel — they&apos;ll appear here once published.
              </p>
              <Link to="/store/collections" className="inline-block mt-5 text-sm text-ink-900 underline decoration-brand-500 underline-offset-4">
                Browse all pieces
              </Link>
            </div>
          )}
          {sorted.map((p) => {
            const weightG = p.weightMg / 1000;
            const primary = p.images[0] ?? '';
            const secondary = p.images[1] ?? primary;
            return (
              <Link to={`/store/products/${p.slug}`} key={p.id} className="group block">
                <div className="relative aspect-[4/5] overflow-hidden bg-ink-100">
                  <img
                    src={primary}
                    alt={p.name}
                    className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300 group-hover:opacity-0"
                    loading="lazy"
                  />
                  <img
                    src={secondary}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    loading="lazy"
                    aria-hidden
                  />
                </div>
                <div className="mt-4 space-y-1">
                  <h3 className="font-display text-[18px] leading-tight text-ink-900">{p.name}</h3>
                  <p className="text-xs text-ink-500">
                    {weightG.toFixed(2)} g · {purityLabel(p)} hallmarked
                  </p>
                  <p className="text-sm text-ink-900 font-mono tabular-nums pt-0.5">
                    ₹{(priceOf(p) / 100).toLocaleString('en-IN')}
                  </p>
                </div>
              </Link>
            );
          })}
        </section>
      </div>

      {filtersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setFiltersOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 right-0 w-[85%] max-w-sm bg-ink-0 flex flex-col">
            <div className="flex items-center justify-between h-14 px-5 border-b border-ink-100">
              <span className="font-display text-lg text-ink-900">Filters</span>
              <button onClick={() => setFiltersOpen(false)} className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-ink-50" aria-label="Close filters">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-7 text-sm">
              <FilterGroup
                label="Metal"
                options={Object.keys(METAL_RULES)}
                selected={metals}
                onToggle={(v) => toggle(metals, v, setMetals)}
              />
              <FilterGroup
                label="Weight"
                options={Object.keys(WEIGHT_RULES)}
                selected={weights}
                onToggle={(v) => toggle(weights, v, setWeights)}
              />
              <FilterGroup
                label="Price"
                options={Object.keys(PRICE_RULES)}
                selected={prices}
                onToggle={(v) => toggle(prices, v, setPrices)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}): JSX.Element {
  return (
    <div>
      <p className="text-eyebrow uppercase text-ink-500 mb-3">{label}</p>
      <ul className="space-y-2.5">
        {options.map((o) => (
          <li key={o}>
            <label className="flex items-center gap-2.5 text-ink-700 cursor-pointer hover:text-ink-900">
              <input
                type="checkbox"
                checked={selected.has(o)}
                onChange={() => onToggle(o)}
                className="h-3.5 w-3.5 rounded border-ink-300 text-brand-500 focus:ring-brand-400"
              />
              <span>{o}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
