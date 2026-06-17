import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Star } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAppSelector } from '@/app/hooks';
import {
  useGetPublicSaleItemsQuery,
  useGetPublicCollectionsQuery,
  useGetPublicGoldRateQuery,
  type PublicSaleProduct,
} from '@/features/storefront/storefrontApi';
import {
  storefrontTotalPaise,
  productMetaLabel,
  computeSalePrice,
} from '@/features/storefront/pricing';

const SORTS = ['Featured', 'Discount: high → low', 'Price: low → high', 'Price: high → low'] as const;
type Sort = (typeof SORTS)[number];

// Full Season Sale listing — the dedicated "View all" page linked from the
// homepage Season Sales section. Reads the same /website/sale-items feed (the
// pool the admin tagged in Inventory → Season sales, each carrying its
// discount) and the same CMS-controlled heading/sub-copy, then renders every
// piece (the homepage section caps at 8). Renders an empty-state when the sale
// pool is empty so the route never 404s.
export function SaleCollectionPage(): JSX.Element {
  const L = useAppSelector((s) => s.storefrontContent.sectionLabels);
  const { data: saleProducts = [], isLoading } = useGetPublicSaleItemsQuery();
  const { data: categories = [] } = useGetPublicCollectionsQuery();
  const { data: liveRate } = useGetPublicGoldRateQuery();
  const rates = liveRate?.rates;
  const categoryNameById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const [sort, setSort] = useState<Sort>('Featured');
  const [sortOpen, setSortOpen] = useState(false);

  // Sale-wide Buy-1-Get-1 is the same flag on every sale item.
  const bogoActive = saleProducts.some((p) => p.sale?.bogo);

  const sorted = useMemo(() => {
    // Discounted price (after the per-item cut) drives both the price sorts and
    // the discount sort, so the order matches what the customer actually sees.
    const finalPaise = (p: PublicSaleProduct): number => {
      const original = storefrontTotalPaise(p, rates);
      return computeSalePrice(original, p.sale)?.discountedPaise ?? original;
    };
    const discountPaise = (p: PublicSaleProduct): number =>
      storefrontTotalPaise(p, rates) - finalPaise(p);
    const arr = [...saleProducts];
    switch (sort) {
      case 'Discount: high → low':
        return arr.sort((a, b) => discountPaise(b) - discountPaise(a));
      case 'Price: low → high':
        return arr.sort((a, b) => finalPaise(a) - finalPaise(b));
      case 'Price: high → low':
        return arr.sort((a, b) => finalPaise(b) - finalPaise(a));
      default:
        return arr;
    }
  }, [saleProducts, sort, rates]);

  const title = L.seasonSaleTitle || 'Season Sales';

  return (
    <div className="bg-[#FDF8F4] min-h-full">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8 sm:py-12 md:py-16">
        <nav className="text-xs text-ink-500 mb-5" aria-label="Breadcrumb">
          <Link to="/store" className="hover:text-brand-700">Home</Link>
          <span className="mx-2 text-ink-300">/</span>
          <span className="text-ink-800">{title}</span>
        </nav>

        <header className="mb-8 sm:mb-12 max-w-3xl text-center mx-auto">
          <p className="text-eyebrow uppercase text-brand-700">{L.seasonSaleEyebrow}</p>
          <h1 className="font-display text-3xl sm:text-[40px] md:text-[56px] leading-[1.05] text-ink-900 mt-3">
            {title}
          </h1>
          {bogoActive && (
            <p className="mt-4 inline-flex items-center bg-brand-600 text-ink-0 text-xs font-semibold uppercase tracking-[0.12em] px-3 py-1.5 rounded-sm">
              Buy 1 Get 1 Free — on every piece
            </p>
          )}
          {L.seasonSaleSub && (
            <p className="mt-4 sm:mt-5 text-sm sm:text-base text-ink-600 leading-relaxed max-w-2xl mx-auto">
              {L.seasonSaleSub}
            </p>
          )}
        </header>

        <div className="bg-[#FAF3EE] -mx-4 sm:-mx-6 px-4 sm:px-6 border-y border-[#EFE0D2] mb-8 sm:mb-10">
          <div className="h-14 flex items-center justify-between gap-4">
            <span className="text-sm text-ink-500">{sorted.length} pieces on sale</span>
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

        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-8 sm:gap-x-5 sm:gap-y-10 md:gap-x-6">
          {isLoading && <p className="col-span-full text-sm text-ink-500">Loading the sale…</p>}
          {!isLoading && sorted.length === 0 && (
            <div className="col-span-full text-center py-16">
              <p className="font-display text-[22px] text-ink-900">No sale running right now</p>
              <p className="text-sm text-ink-500 mt-2 max-w-md mx-auto">
                There are no pieces on sale at the moment. Check back soon — or browse the full catalogue.
              </p>
              <Link
                to="/store/collections"
                className="inline-block mt-5 text-sm text-ink-900 underline decoration-brand-500 underline-offset-4"
              >
                Browse all pieces
              </Link>
            </div>
          )}
          {sorted.map((p) => {
            const soldOut = p.inStock === false;
            const catLabel = categoryNameById.get(p.categoryId) ?? productMetaLabel(p);
            const original = storefrontTotalPaise(p, rates);
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
        </section>
      </div>
    </div>
  );
}
