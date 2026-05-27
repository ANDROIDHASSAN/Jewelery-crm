import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAppSelector } from '@/app/hooks';
import {
  useGetPublicProductsQuery,
  useGetPublicCollectionsQuery,
  type PublicProduct,
  type PublicCategory,
} from '@/features/storefront/storefrontApi';
import type { FilterGroup } from '@/features/storefront/storefrontContentSlice';

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

// Predicate registry — keyed by the option label inside each FilterGroup
// (see DEFAULT_CONTENT.filters in storefrontContentSlice). The admin can
// add/remove option *labels*, but if a label has no matching predicate here
// the filter is a no-op (all products pass). Add the predicate alongside the
// option label whenever a new built-in filter ships.
const FILTER_PREDICATES: Record<string, (p: PublicProduct) => boolean> = {
  // metal
  '22K Gold': (p) => p.purityCaratX100 === 2200,
  '18K Gold': (p) => p.purityCaratX100 === 1800,
  Silver: (p) => p.purityCaratX100 < 1000,
  Platinum: (p) => p.purityCaratX100 === 9500,
  // weight
  'Under 10 g': (p) => p.weightMg < 10_000,
  '10 – 20 g': (p) => p.weightMg >= 10_000 && p.weightMg < 20_000,
  '20 – 40 g': (p) => p.weightMg >= 20_000 && p.weightMg < 40_000,
  'Over 40 g': (p) => p.weightMg >= 40_000,
  // price
  'Under ₹50,000': (p) => priceOf(p) < 50_00_000,
  '₹50,000 – ₹1,00,000': (p) => priceOf(p) >= 50_00_000 && priceOf(p) < 1_00_00_000,
  'Over ₹1,00,000': (p) => priceOf(p) >= 1_00_00_000,
  // purity
  '22K': (p) => p.purityCaratX100 === 2200,
  '18K': (p) => p.purityCaratX100 === 1800,
  '14K': (p) => p.purityCaratX100 === 1400,
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
  // One Set of selected options per group key — single source of truth for
  // both the desktop sidebar and the mobile drawer.
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});
  const [q, setQ] = useState('');

  const { data: products = [], isLoading: productsLoading } = useGetPublicProductsQuery();
  const { data: categories = [] } = useGetPublicCollectionsQuery();

  // Pull filter config from the CMS. Per-collection override > defaults.
  const filtersConfig = useAppSelector((s) => s.storefrontContent.filters);
  const visibleGroups: FilterGroup[] = useMemo(() => {
    const override = slug ? filtersConfig.perCollection[slug] : undefined;
    const keys = override ?? filtersConfig.defaultGroupKeys;
    return keys
      .map((k: string) => filtersConfig.groups.find((g) => g.key === k))
      .filter((g): g is FilterGroup => Boolean(g));
  }, [filtersConfig, slug]);

  const filtered = useMemo(() => {
    const bySlug = filterBySlug(products, categories, slug);
    // Token-AND match on name + slug only — descriptionMd is excluded because
    // every gold-jewellery description repeats "gold/BIS/hallmarked" and would
    // turn the in-collection search into a no-op (everything matches). Match
    // strategy mirrors SearchResultsPage so the two surfaces feel consistent.
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const passQ = (p: PublicProduct): boolean => {
      if (tokens.length === 0) return true;
      const haystack = `${p.name.toLowerCase()} ${p.slug.toLowerCase()}`;
      return tokens.every((t) => haystack.includes(t));
    };
    // For each visible group, the product passes if either nothing is selected
    // in that group OR at least one selected option's predicate matches.
    // Options without a registered predicate are treated as no-op (always pass)
    // so admin can add custom-label options without crashing the page.
    const passGroup = (p: PublicProduct, group: FilterGroup): boolean => {
      const sel = selections[group.key];
      if (!sel || sel.size === 0) return true;
      return Array.from(sel).some((opt) => {
        const pred = FILTER_PREDICATES[opt];
        return pred ? pred(p) : true;
      });
    };
    return bySlug.filter(
      (p) => passQ(p) && visibleGroups.every((g) => passGroup(p, g)),
    );
  }, [products, categories, slug, q, selections, visibleGroups]);

  function toggleOption(groupKey: string, value: string): void {
    setSelections((curr) => {
      const next = new Set(curr[groupKey] ?? []);
      if (next.has(value)) next.delete(value); else next.add(value);
      return { ...curr, [groupKey]: next };
    });
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
    <div className="bg-[#FDF8F4] min-h-full">
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8 sm:py-12 md:py-16">
      <nav className="text-xs text-ink-500 mb-5" aria-label="Breadcrumb">
        <Link to="/store" className="hover:text-brand-700">Home</Link>
        <span className="mx-2 text-ink-300">/</span>
        <Link to="/store/collections" className="hover:text-brand-700">Collections</Link>
        {slug && (
          <>
            <span className="mx-2 text-ink-300">/</span>
            <span className="text-ink-800">{meta.title}</span>
          </>
        )}
      </nav>

      <header className="mb-8 sm:mb-12 max-w-3xl text-center mx-auto">
        <p className="text-eyebrow uppercase text-brand-700">Collection</p>
        <h1 className="font-display text-3xl sm:text-[40px] md:text-[56px] leading-[1.05] text-ink-900 mt-3">{meta.title}</h1>
        {meta.subtitle && <p className="mt-4 sm:mt-5 text-sm sm:text-base text-ink-600 leading-relaxed max-w-2xl mx-auto">{meta.subtitle}</p>}
      </header>

      <div className="bg-[#FAF3EE] -mx-4 sm:-mx-6 px-4 sm:px-6 border-y border-[#EFE0D2] mb-8 sm:mb-10">
        <div className="h-14 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="inline-flex items-center gap-2 text-sm text-ink-700 hover:text-ink-900 shrink-0"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            <span className="text-ink-400 hidden sm:inline">·</span>
            <span className="text-ink-500 hidden sm:inline">{sorted.length} pieces</span>
          </button>

          {/* Live search across name + slug + description. Works alongside the
              metal/weight/price checkboxes — they intersect, not replace. */}
          <div className="relative flex-1 max-w-md mx-2 sm:mx-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search this collection…"
              aria-label="Search pieces"
              className="w-full h-10 pl-9 pr-8 bg-ink-0 rounded-full border border-[#EFE0D2] text-sm text-ink-900 placeholder:text-ink-500 focus:bg-ink-0 focus:border-brand-500 focus:ring-2 focus:ring-brand-200/40 outline-none transition-colors"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-full text-ink-500 hover:bg-ink-100"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="relative shrink-0">
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
                className="absolute right-0 top-full mt-2 w-60 rounded-md border border-[#EFE0D2] bg-ink-0 shadow-lg py-1 text-sm z-20"
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
                        'w-full text-left px-3 py-2 hover:bg-[#FDF8F4] transition-colors',
                        s === sort ? 'text-brand-700 font-medium' : 'text-ink-700',
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

      <div
        className={cn(
          'grid grid-cols-1 gap-8 lg:gap-10',
          visibleGroups.length > 0 && 'lg:grid-cols-[220px_1fr]',
        )}
      >
        {visibleGroups.length > 0 && (
          <aside className={cn('space-y-7 text-sm', filtersOpen ? 'block' : 'hidden lg:block')}>
            {visibleGroups.map((g) => (
              <FilterGroupView
                key={g.key}
                label={g.label}
                options={g.options}
                selected={selections[g.key] ?? EMPTY_SET}
                onToggle={(v) => toggleOption(g.key, v)}
              />
            ))}
          </aside>
        )}

        <section className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-8 sm:gap-x-5 sm:gap-y-10 md:gap-x-6">
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
            // `inStock` is computed server-side from the linked inventory
            // Item. Sold-out cards stay visible (per the admin's choice) but
            // get a desaturated thumbnail + an unmistakable corner badge.
            const soldOut = p.inStock === false;
            return (
              <Link to={`/store/products/${p.slug}`} key={p.id} className="group block">
                <div className="relative aspect-[4/5] overflow-hidden bg-[#FAF3EE] rounded-sm">
                  <img
                    src={primary}
                    alt={p.name}
                    className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 group-hover:opacity-0 ${
                      soldOut ? 'grayscale opacity-70' : ''
                    }`}
                    loading="lazy"
                  />
                  <img
                    src={secondary}
                    alt=""
                    className={`absolute inset-0 h-full w-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
                      soldOut ? 'grayscale' : ''
                    }`}
                    loading="lazy"
                    aria-hidden
                  />
                  {soldOut && (
                    <span className="absolute top-2 left-2 z-10 bg-ink-900 text-ink-0 text-[10px] uppercase tracking-[0.18em] px-2 py-1 rounded-sm">
                      Sold out
                    </span>
                  )}
                  {/* CaratLane-style hover overlay with quiet view CTA */}
                  <div className="absolute inset-x-0 bottom-0 px-3 py-2.5 bg-ink-0/85 backdrop-blur-sm text-center text-[11px] uppercase tracking-[0.18em] text-ink-900 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {soldOut ? 'View piece' : 'View piece'}
                  </div>
                </div>
                <div className="mt-3 sm:mt-4 space-y-1 px-0.5">
                  <h3 className="font-display text-base sm:text-[18px] leading-tight text-ink-900 group-hover:text-brand-700 transition-colors">{p.name}</h3>
                  <p className="text-[11px] sm:text-xs text-ink-500">
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
            <div className="flex items-center justify-between h-14 px-5 border-b border-[#EFE0D2]">
              <span className="font-display text-lg text-ink-900">Filters</span>
              <button onClick={() => setFiltersOpen(false)} className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-[#FDF8F4]" aria-label="Close filters">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-7 text-sm">
              {visibleGroups.map((g) => (
                <FilterGroupView
                  key={g.key}
                  label={g.label}
                  options={g.options}
                  selected={selections[g.key] ?? EMPTY_SET}
                  onToggle={(v) => toggleOption(g.key, v)}
                />
              ))}
              {visibleGroups.length === 0 && (
                <p className="text-ink-500">No filters configured for this collection.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

// Stable empty Set so we don't allocate a new Set every render when a group
// has no selections — keeps FilterGroupView's referential equality clean.
const EMPTY_SET: Set<string> = new Set();

function FilterGroupView({
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
