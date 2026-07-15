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
  productPriceView,
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
  men: { title: "For Men", subtitle: 'Chains, rings, bracelets and kadas crafted for him.' },
  women: { title: "For Women", subtitle: 'Necklaces, earrings, rings and more, designed for her.' },
};

const SORTS = ['Featured', 'Newest', 'Price: low → high', 'Price: high → low', 'Weight: light → heavy'] as const;
type Sort = (typeof SORTS)[number];

// GST-inclusive price the customer pays (matches the product page + checkout).
// `rates` is optional so module-level filters/sorts can call it with the
// fallback rate; the card grid passes the live feed for accuracy.
function priceOf(p: PublicProduct, rates?: StorefrontRates): number {
  return storefrontTotalPaise(p, rates);
}

// Filter option labels are CMS free-text (Website → Filters), so they CANNOT be
// matched against a hardcoded label→predicate registry — that's exactly what
// broke here. An admin renamed the price buckets to "Under ₹2,000" / "Under
// ₹10,000" / "Under ₹25,000" / "₹25,000-₹1,00,000"; none of those strings were
// registry keys, so checking any of them matched nothing and emptied the grid.
//
// Instead we PARSE the label. Anything an editor can reasonably type for a
// numeric range is understood, so new buckets need no code change:
//   "Under ₹2,000" / "Below 2000"      → max
//   "Over ₹1,00,000" / "Above 1 lakh"  → min
//   "₹25,000-₹1,00,000" / "₹25k – ₹1L" → range   (-, –, —, "to" all work)
//   "₹2,000+"                          → min
//
// Returns null when the label carries no numbers — the caller then falls
// through to the category / product-name paths.
interface NumericRange {
  min?: number;
  max?: number;
}

// Indian shorthand: 2k = 2,000; 1L / 1 lakh = 1,00,000; 1cr = 1,00,00,000.
function parseMagnitude(raw: string, suffix: string): number {
  const n = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(n)) return NaN;
  const s = suffix.toLowerCase();
  if (s.startsWith('k')) return n * 1_000;
  if (s.startsWith('l')) return n * 1_00_000;
  if (s.startsWith('cr')) return n * 1_00_00_000;
  return n;
}

/** Pull every number (with optional k/L/cr suffix) out of a label, in order. */
function numbersIn(label: string): number[] {
  const out: number[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(cr|crore|lakhs?|l|k)?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(label)) !== null) {
    const v = parseMagnitude(m[1]!, m[2] ?? '');
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

/**
 * Interpret a filter label as a numeric range. Unit-agnostic — the caller
 * scales the result (rupees → paise, grams → mg), so one parser serves both the
 * price and weight groups.
 */
export function parseRangeLabel(label: string): NumericRange | null {
  const nums = numbersIn(label);
  if (nums.length === 0) return null;
  const l = label.toLowerCase();

  // Explicit two-number range wins, whatever the wording.
  if (nums.length >= 2) {
    const [a, b] = [nums[0]!, nums[1]!];
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }

  const n = nums[0]!;
  if (/\b(under|below|less than|upto|up to|<)\b/.test(l) || l.includes('under')) return { max: n };
  if (/\b(over|above|more than|greater than|>)\b/.test(l) || l.endsWith('+')) return { min: n };
  // A bare number with no qualifier ("₹25,000") reads as a ceiling — the most
  // common intent for a lone price chip.
  return { max: n };
}

function inRange(value: number, r: NumericRange): boolean {
  // max is exclusive so adjacent buckets ("Under ₹10,000", "₹10,000-₹25,000")
  // don't both claim a piece priced at exactly ₹10,000.
  if (r.min != null && value < r.min) return false;
  if (r.max != null && value >= r.max) return false;
  return true;
}

// Metal/purity labels are matched by meaning rather than exact string, so
// "Silver", "silver", "Sterling Silver" all land. Checked before the numeric
// parser, since "22K Gold" contains a number but isn't a range.
export function matchMetalLabel(
  label: string,
  p: Pick<PublicProduct, 'metalType' | 'purityCaratX100'>,
): boolean | null {
  const l = label.toLowerCase().trim();
  // Silver = metal type SILVER, NOT purity 0 — stainless-steel "gold tone" and
  // other non-precious pieces also carry purity 0. The null fallback keeps
  // legacy products (no metalType) that are genuinely purity-0 silver.
  if (/\bsilver\b/.test(l)) {
    return p.metalType === 'SILVER' || (p.metalType == null && p.purityCaratX100 === 0);
  }
  if (/\bplatinum\b|\bpt\s*9\d0\b/.test(l)) {
    return p.metalType === 'PLATINUM' || p.purityCaratX100 === 9500;
  }
  if (/gold tone|non[- ]precious|stainless|fashion/.test(l)) {
    return p.metalType === 'STAINLESS_STEEL' || p.metalType === 'OTHER';
  }
  // "22K", "22K Gold", "9 K Fine Gold" → carat match.
  const k = /(\d+(?:\.\d+)?)\s*k\b/.exec(l);
  if (k) {
    const wanted = Math.round(Number(k[1]) * 100);
    return p.purityCaratX100 === wanted;
  }
  if (/\bgold\b/.test(l)) {
    return p.metalType === 'GOLD' || p.metalType === 'DIAMOND';
  }
  return null;
}

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

// Resolve EVERY category a collection slug should surface — not just one.
// The catalogue nests jewellery-type sub-categories ("Rings", "Necklaces &
// Chains", …) under several parent lines ("Demifine Jewellery", "9KT Fine
// Gold", …). Because slugs derive from the name alone, the same sub-type under
// two lines produces the same slug (both "Necklaces & Chains" → necklaces-
// chains). A single homepage tile named "Necklaces & Chains" should therefore
// show necklaces from ALL lines, so we return every matching category, not an
// arbitrary first hit.
//
// Match order:
//   1. Exact slug match — returns all categories whose slug equals the URL slug.
//   2. Fuzzy token-overlap fallback (slug-rename recovery) — every candidate
//      whose slug tokens are a subset of the URL slug tokens, keeping all
//      categories tied for the best (longest) token match.
// Returns [] when nothing matches, so the caller can show the empty state
// rather than the whole catalogue.
function matchCategoriesForSlug(
  categories: PublicCategory[],
  slug: string,
): PublicCategory[] {
  const exact = categories.filter((c) => c.slug === slug);
  if (exact.length > 0) return exact;
  const wanted = new Set(tokenizeSlug(slug));
  let bestScore = 0;
  const scored: Array<{ cat: PublicCategory; score: number }> = [];
  for (const c of categories) {
    const tokens = tokenizeSlug(c.slug);
    if (tokens.length === 0) continue;
    // Only count a match when every token of the candidate appears in the URL
    // slug — this keeps "rings" from matching "9kt-fine-gold".
    if (tokens.every((t) => wanted.has(t))) {
      scored.push({ cat: c, score: tokens.length });
      if (tokens.length > bestScore) bestScore = tokens.length;
    }
  }
  return scored.filter((s) => s.score === bestScore).map((s) => s.cat);
}

// Last-resort human title from a slug when no category name resolves —
// "necklaces-and-chains" → "Necklaces And Chains". Only used for the header;
// a real category name always wins when one matches.
function prettifySlug(slug: string): string {
  return slug
    .split(/[-_/\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
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
  rates?: StorefrontRates,
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
      return products.filter((p) => priceOf(p, rates) < 50_00_000);
    case 'gifting':
      return products.filter((p) => priceOf(p, rates) <= 1_00_000_00);
    case 'men':
      return products.filter((p) => p.gender === 'MEN');
    case 'women':
      return products.filter((p) => p.gender === 'WOMEN');
    default: {
      // Every category matching the slug (exact, else best fuzzy) — plural,
      // because the same sub-type name can live under several parent lines.
      const matched = matchCategoriesForSlug(categories, slug);
      // Nothing matched — return an empty list rather than every product.
      // Better UX than silently showing the full catalogue under a wrong
      // collection heading; the empty-state copy below tells the customer
      // there's nothing here yet.
      if (matched.length === 0) return [];
      // Roll every matched category into the include set, plus the direct
      // sub-categories of any top-level match (so a main-category slug also
      // catches products tagged to its leaves).
      const includedIds = new Set<string>();
      for (const cat of matched) {
        includedIds.add(cat.id);
        if (!cat.parentId) {
          for (const c of categories) {
            if (c.parentId === cat.id) includedIds.add(c.id);
          }
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
  // Optional ?metal=<MetalType> scope. Sub-category slugs collide across metal
  // lines — "Rings" exists under Demifine Jewellery, 9KT Fine Gold AND 925
  // Sterling Silver, and all three slugify to "rings" — so a bare
  // /store/collections/rings deliberately shows rings from every line. The
  // homepage "Browse by category" tiles are a Demifine browser, so they pin the
  // metal here. Unlike ?sub (one category id) this scopes by material, which is
  // what "show only Demifine" actually means.
  const metalScope = searchParams.get('metal');

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
        // Resolve the heading via the same exact-or-fuzzy match the product
        // filter uses, so a tile slug like "necklaces-and-chains" shows the
        // real category name ("Necklaces & Chains") instead of the raw slug.
        title: matchCategoriesForSlug(categories, slug)[0]?.name ?? prettifySlug(slug),
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
    const baseProductsRaw =
      !collectionItemsError && collectionItems.length > 0
        ? collectionItems
        : filterBySlug(products, categories, slug, rates);
    // ?metal= narrows to one material. Applied to BOTH branches so it scopes a
    // real inventory Collection too — a collection can span metal lines, and
    // the homepage renders one collections row per line.
    const baseProducts = metalScope
      ? baseProductsRaw.filter((p) => p.metalType === metalScope)
      : baseProductsRaw;

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

    // Resolve ONE option label to a matcher. Paths in order:
    //   1. Numeric range parsed from the label — price/weight groups only. Price
    //      compares against the GST-inclusive price at LIVE rates, i.e. the same
    //      number the card renders; weight against grams.
    //   2. Metal/purity by meaning — "Silver", "22K Gold", "Gold tone"
    //   3. Category-id match (exact tag like Rings sub of 9kt Fine Gold)
    //   4. Product-name token match — a "Rings" chip catches "Rose Ring" even
    //      when the product was tagged to the parent main rather than the Rings
    //      sub, so jewellery-vocab filters work without re-tagging everything.
    const matcherFor = (opt: string, groupKey: string): ((p: PublicProduct) => boolean) => {
      const catSet = categoryIdsByOptionLabel.get(opt);
      const optStem = stem(opt);
      const key = groupKey.toLowerCase();
      const isPriceGroup = key.includes('price');
      const isWeightGroup = key.includes('weight');

      // Only the price/weight groups get the numeric parser — otherwise a
      // "22K Gold" metal chip would be read as "max 22".
      const range = isPriceGroup || isWeightGroup ? parseRangeLabel(opt) : null;

      return (p: PublicProduct): boolean => {
        // Range FIRST for price/weight groups. `range` is only non-null for
        // those, and the ordering matters: a price label like "Under ₹2k" would
        // otherwise hit matchMetalLabel's carat regex and be read as "2 carat".
        if (range) {
          // Rupees → paise for price; grams → milligrams for weight. Price uses
          // the LIVE rates so the bucket agrees with the price on the card.
          const value = isPriceGroup ? priceOf(p, rates) : p.weightMg;
          const scale = isPriceGroup ? 100 : 1000;
          return inRange(value, {
            ...(range.min != null ? { min: range.min * scale } : {}),
            ...(range.max != null ? { max: range.max * scale } : {}),
          });
        }
        const byMetal = matchMetalLabel(opt, p);
        if (byMetal != null) return byMetal;
        if (catSet && catSet.has(p.categoryId)) return true;
        if (optStem.length >= 3) {
          const nameTokens = p.name.toLowerCase().split(/\s+/).map(stem);
          if (nameTokens.includes(optStem)) return true;
        }
        return false;
      };
    };

    // A product passes a group when nothing is selected, or when at least one
    // selected option matches.
    //
    // Uninterpretable options are DROPPED, not failed. Previously an option we
    // couldn't map fell through to a `optStem.length < 3` escape hatch that was
    // effectively never true, so one unrecognised label rejected every product
    // and the grid went empty. Ignoring what we can't read means a typo'd or
    // unmapped CMS label degrades to "no filtering" instead of "no products".
    const passGroup = (p: PublicProduct, group: FilterGroup): boolean => {
      const sel = selections[group.key];
      if (!sel || sel.size === 0) return true;
      const opts = Array.from(sel);
      const usable = opts.filter((opt) => {
        const key = group.key.toLowerCase();
        if (key.includes('price') || key.includes('weight')) {
          if (parseRangeLabel(opt)) return true;
        }
        if (matchMetalLabel(opt, p) != null) return true;
        if (categoryIdsByOptionLabel.has(opt)) return true;
        return stem(opt).length >= 3;
      });
      if (usable.length === 0) return true;
      return usable.some((opt) => matcherFor(opt, group.key)!(p));
    };
    // Sub-category deep-link narrows the base set to one category id before the
    // search / sidebar filters apply.
    const scoped = subId ? baseProducts.filter((p) => p.categoryId === subId) : baseProducts;
    return scoped.filter(
      (p) => passQ(p) && visibleGroups.every((g) => passGroup(p, g)),
    );
  }, [
    products,
    categories,
    slug,
    subId,
    metalScope,
    q,
    selections,
    visibleGroups,
    collectionItems,
    collectionItemsError,
    // Price buckets compare against the live-rate price, so a rate refresh must
    // re-run the filter — otherwise the bucket and the card disagree.
    rates,
  ]);

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
            // Offer travels with the piece, so it renders here too — not only on
            // the Season Sale row.
            const price = productPriceView(p, rates);
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
                  {price.badge && (
                    <span className="absolute top-2 right-2 z-10 bg-brand-600 text-ink-0 text-[10px] font-semibold uppercase tracking-[0.12em] px-2 py-1 rounded-sm shadow-sm">
                      {price.badge}
                    </span>
                  )}
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
                  <p className="text-sm text-ink-900 font-mono tabular-nums pt-0.5 flex items-baseline gap-1.5">
                    <span>₹{(price.finalPaise / 100).toLocaleString('en-IN')}</span>
                    {price.hasStrike && (
                      <span className="text-xs text-ink-400 line-through">
                        ₹{(price.originalPaise / 100).toLocaleString('en-IN')}
                      </span>
                    )}
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
