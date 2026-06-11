import { useMemo, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAppSelector } from '@/app/hooks';
import {
  useGetPublicProductsQuery,
  useGetPublicCollectionsQuery,
  useGetPublicGoldRateQuery,
  useGetCollectionItemsQuery,
  type PublicProduct,
  type PublicCategory,
} from '@/features/storefront/storefrontApi';
import type { FilterGroup } from '@/features/storefront/storefrontContentSlice';
import {
  storefrontTotalPaise,
  productMetaLabel,
  type StorefrontRates,
} from '@/features/storefront/pricing';

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

// GST-inclusive price the customer pays (matches the product page + checkout).
// `rates` is optional so module-level filters/sorts can call it with the
// fallback rate; the card grid passes the live feed for accuracy.
function priceOf(p: PublicProduct, rates?: StorefrontRates): number {
  return storefrontTotalPaise(p, rates);
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
  // Silver = metal type SILVER, NOT purity 0 — stainless-steel "gold tone" and
  // other non-precious pieces also carry purity 0. The null fallback keeps
  // legacy products (no metalType) that are genuinely purity-0 silver.
  Silver: (p) => p.metalType === 'SILVER' || (p.metalType == null && p.purityCaratX100 === 0),
  Platinum: (p) => p.metalType === 'PLATINUM' || p.purityCaratX100 === 9500,
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

// Token-split a slug for fuzzy matching. "9kt-fine-gold" → ["9kt", "gold"]
// (the "fine" stop-word and 1-char tokens are dropped). Used to recover
// when the nav menu still points at an old slug after a category rename:
// e.g. the admin had a category called "9kt Fine Gold" → /collections/
// 9kt-fine-gold, then renamed it to "9kt Gold" (slug "9kt-gold"). Exact
// slug match fails; token overlap rescues it.
const SLUG_STOP_TOKENS = new Set(['fine', 'pure', 'the', 'and', 'of', 'a']);
function tokenizeSlug(slug: string): string[] {
  return slug
    .toLowerCase()
    .split(/[-_/\s]+/)
    .filter((t) => t.length >= 2 && !SLUG_STOP_TOKENS.has(t));
}

// Apply collection-slug rules to a product list. Real categories match by
// slugified name (via /website/collections); pseudo-collections (22k, 18k,
// under-50k, gifting, silver) use intrinsic product fields.
//
// Main-category rollup: when the slug points to a top-level category
// (parentId === null), products tagged to either that main OR any of its
// sub-categories are included. Without this, an admin who created
// "9kt Fine Gold" → "Rings" and added a product under "Rings" would see an
// empty page when clicking the "9kt Fine Gold" nav item, because the
// product's categoryId is the Rings sub-cat id, not the main's.
//
// Slug rename recovery: when no category exactly matches the URL slug, we
// fall back to a token-overlap match — a category whose slug tokens are a
// subset of the URL slug tokens (after dropping stop-words). The longest
// match wins. Prevents the storefront from silently showing ALL products
// when the nav still points at a stale slug.
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
      // metalType, not purity — purity 0 also matches stainless-steel "gold
      // tone" / non-precious pieces, which were leaking into the Silver page.
      return products.filter(
        (p) => p.metalType === 'SILVER' || (p.metalType == null && p.purityCaratX100 === 0),
      );
    case 'under-50k':
      return products.filter((p) => priceOf(p) < 50_00_000);
    case 'gifting':
      return products.filter((p) => priceOf(p) <= 1_00_000_00);
    default: {
      let cat = categories.find((c) => c.slug === slug);
      // Fuzzy fallback — token overlap, prefer the longest token-match.
      if (!cat) {
        const wanted = new Set(tokenizeSlug(slug));
        let best: PublicCategory | undefined;
        let bestScore = 0;
        for (const c of categories) {
          const tokens = tokenizeSlug(c.slug);
          if (tokens.length === 0) continue;
          // Only count a match when every token of the candidate appears in
          // the URL slug — this keeps "rings" from matching "9kt-fine-gold".
          const allHit = tokens.every((t) => wanted.has(t));
          if (allHit && tokens.length > bestScore) {
            best = c;
            bestScore = tokens.length;
          }
        }
        cat = best;
      }
      // Still nothing — return an empty list rather than every product.
      // Better UX than silently showing the full catalogue under a wrong
      // collection heading; the empty-state copy below tells the customer
      // there's nothing here yet.
      if (!cat) return [];
      const includedIds = new Set<string>([cat.id]);
      if (!cat.parentId) {
        for (const c of categories) {
          if (c.parentId === cat.id) includedIds.add(c.id);
        }
      }
      return products.filter((p) => includedIds.has(p.categoryId));
    }
  }
}

export function CollectionPage(): JSX.Element {
  const { slug } = useParams();
  // Optional ?sub=<categoryId> deep-link — narrows a collection to one specific
  // sub-category (e.g. 18K Gold Tone → Rings). Keyed by id, not slug, because
  // sub-category slugs collide across metals ("bracelets" exists under each).
  const [searchParams] = useSearchParams();
  const subId = searchParams.get('sub');

  const [sort, setSort] = useState<Sort>('Featured');
  const [sortOpen, setSortOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // One Set of selected options per group key — single source of truth for
  // both the desktop sidebar and the mobile drawer.
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});
  const [q, setQ] = useState('');

  const { data: products = [], isLoading: productsLoading } = useGetPublicProductsQuery();
  const { data: categories = [] } = useGetPublicCollectionsQuery();
  // Live metal rates so gold/silver cards show the same price as the product
  // page (incl. GST). Cached app-wide (the header polls the same feed).
  const { data: liveRate } = useGetPublicGoldRateQuery();
  const rates = liveRate?.rates;
  // Try to fetch collection items if slug is provided. Returns 404 if not an inventory collection.
  const { data: collectionItems = [], isLoading: collectionItemsLoading, isError: collectionItemsError } = useGetCollectionItemsQuery(slug ?? '', { skip: !slug });

  // Title resolution order:
  //   1. Hardcoded TITLES entry (legacy pseudo-collections + curated copy)
  //   2. Live category name from /website/collections — picks up admin-
  //      added main categories like "9kt Fine Gold" automatically.
  //   3. The raw slug as a last resort so the header never renders blank.
  const baseMeta = !slug
    ? { title: 'All collections', subtitle: 'Every piece in our catalogue, ready to view.' }
    : TITLES[slug] ?? {
        title: categories.find((c) => c.slug === slug)?.name ?? slug,
        subtitle: '',
      };
  // When deep-linked to a sub-category, lead with its name and keep the parent
  // collection as the sub-heading (e.g. "Rings" under "18K GOLD TONE").
  const subCategory = subId ? categories.find((c) => c.id === subId) : undefined;
  const meta = subCategory
    ? { title: subCategory.name, subtitle: baseMeta.title }
    : baseMeta;

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
    // If this is an inventory collection and items were loaded, use them directly.
    // Otherwise, fall back to category-based filtering.
    const baseProducts = !collectionItemsError && collectionItems.length > 0 ? collectionItems : filterBySlug(products, categories, slug);

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
    // Build a label → category-id-set lookup so admin-added filter options
    // like "Ring", "Bracelet", "Diamond pendant" actually filter. Matching
    // rules (case-insensitive):
    //   - exact name or slug match
    //   - option label is a token of the category name/slug
    //   - category name/slug is a token of the option label
    //   - singular ↔ plural normalisation
    // Main categories also fold in their direct sub-categories.
    const categoryIdsByOptionLabel = new Map<string, Set<string>>();
    // Singular/plural normalisation helper for both category match and
    // product-name match. "Rings" → "ring"; "Ring" → "ring".
    const stem = (s: string): string => {
      const t = s.trim().toLowerCase();
      return t.endsWith('s') && t.length > 3 ? t.slice(0, -1) : t;
    };
    for (const opt of new Set(visibleGroups.flatMap((g) => g.options))) {
      const target = opt.trim().toLowerCase();
      if (!target) continue;
      const targetStem = stem(target);
      const ids = new Set<string>();
      for (const c of categories) {
        const name = c.name.trim().toLowerCase();
        const cslug = c.slug.toLowerCase();
        const nameTokens = name.split(/\s+/);
        const slugTokens = cslug.split(/[-_]/);
        const nameTokenStems = nameTokens.map(stem);
        const slugTokenStems = slugTokens.map(stem);
        const hits =
          name === target ||
          cslug === target ||
          nameTokenStems.includes(targetStem) ||
          slugTokenStems.includes(targetStem) ||
          target.split(/\s+/).map(stem).some((t) => slugTokenStems.includes(t));
        if (hits) {
          ids.add(c.id);
          // Roll subs into the set so a parent-level chip catches sub-cat
          // products too.
          if (!c.parentId) {
            for (const sub of categories) {
              if (sub.parentId === c.id) ids.add(sub.id);
            }
          }
        }
      }
      if (ids.size > 0) categoryIdsByOptionLabel.set(opt, ids);
    }

    // For each visible group, the product passes if either nothing is
    // selected in that group OR at least one selected option matches. An
    // option matches via FOUR independent paths, in order of precision:
    //   1. Hardcoded predicate (22K Gold / Under 10 g / Under ₹50,000 / …)
    //   2. Category-id match (exact tag like Rings sub of 9kt Fine Gold)
    //   3. Product-name token match — "Rings" chip catches "Rose Ring"
    //      even when the product was tagged to the parent main rather
    //      than the Rings sub. This is the fallback that makes the
    //      jewellery-vocab filters (Rings / Earrings / Bracelets /
    //      Necklaces / Pendants etc.) work without forcing admins to
    //      re-tag every product to a leaf sub-category.
    // Options with NO mapping at all stay as no-op so the page still
    // renders if admin types something nobody mapped.
    const passGroup = (p: PublicProduct, group: FilterGroup): boolean => {
      const sel = selections[group.key];
      if (!sel || sel.size === 0) return true;
      return Array.from(sel).some((opt) => {
        const pred = FILTER_PREDICATES[opt];
        if (pred && pred(p)) return true;
        const catSet = categoryIdsByOptionLabel.get(opt);
        if (catSet && catSet.has(p.categoryId)) return true;
        // Name-token fallback. Split product name into stem tokens, and
        // see if the option's stem is in there. So "Rose Ring" → tokens
        // ["rose", "ring"], stems same; "Rings" → stem "ring"; match.
        const optStem = stem(opt);
        const nameTokens = p.name.toLowerCase().split(/\s+/).map(stem);
        if (optStem.length >= 3 && nameTokens.includes(optStem)) return true;
        // Nothing matched and there's no mapping registered → no-op (don't
        // block every product just because admin typed a freeform label).
        return !pred && !catSet && optStem.length < 3;
      });
    };
    // Sub-category deep-link narrows the base set to one category id before the
    // search / sidebar filters apply.
    const scoped = subId ? baseProducts.filter((p) => p.categoryId === subId) : baseProducts;
    return scoped.filter(
      (p) => passQ(p) && visibleGroups.every((g) => passGroup(p, g)),
    );
  }, [products, categories, slug, subId, q, selections, visibleGroups, collectionItems, collectionItemsError]);

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
        return arr.sort((a, b) => priceOf(a, rates) - priceOf(b, rates));
      case 'Price: high → low':
        return arr.sort((a, b) => priceOf(b, rates) - priceOf(a, rates));
      case 'Weight: light → heavy':
        return arr.sort((a, b) => a.weightMg - b.weightMg);
      case 'Newest':
        return arr.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      default:
        return arr;
    }
  }, [filtered, sort, rates]);

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

        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-8 sm:gap-x-5 sm:gap-y-10 md:gap-x-6">
          {(productsLoading || collectionItemsLoading) && (
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
            const meta = productMetaLabel(p);
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
                    {weightG.toFixed(2)} g{meta ? ` · ${meta}` : ''}
                  </p>
                  <p className="text-sm text-ink-900 font-mono tabular-nums pt-0.5">
                    ₹{(priceOf(p, rates) / 100).toLocaleString('en-IN')}
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
