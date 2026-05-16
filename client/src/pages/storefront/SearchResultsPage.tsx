import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import { useGetPublicProductsQuery } from '@/features/storefront/storefrontApi';

export function SearchResultsPage(): JSX.Element {
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const collections = useAppSelector((s) => s.storefrontContent.collections);
  const { data: products = [], isLoading } = useGetPublicProductsQuery();

  const productMatches = useMemo(() => {
    if (!q) return [];
    const needle = q.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        p.descriptionMd.toLowerCase().includes(needle) ||
        p.slug.includes(needle),
    );
  }, [q, products]);

  const collectionMatches = useMemo(() => {
    if (!q) return [];
    const needle = q.toLowerCase();
    return collections.filter(
      (c) => c.name.toLowerCase().includes(needle) || c.tagline.toLowerCase().includes(needle),
    );
  }, [q, collections]);

  const hasResults = productMatches.length > 0 || collectionMatches.length > 0;

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8 sm:py-10 md:py-14">
      <header className="mb-8 sm:mb-10">
        <p className="text-eyebrow uppercase text-ink-500 inline-flex items-center gap-2">
          <SearchIcon className="h-3.5 w-3.5" /> Search
        </p>
        <h1 className="font-display text-2xl sm:text-[34px] md:text-[40px] text-ink-900 mt-2 break-words">
          {q ? <>Results for &ldquo;{q}&rdquo;</> : 'What are you looking for?'}
        </h1>
        {q && (
          <p className="text-sm text-ink-600 mt-2">
            {productMatches.length + collectionMatches.length}{' '}
            {productMatches.length + collectionMatches.length === 1 ? 'match' : 'matches'}
          </p>
        )}
      </header>

      {!q && (
        <div className="text-sm text-ink-600">
          Try one of our most-loved pieces or collections, or use the search bar in the header.
        </div>
      )}

      {q && isLoading && <p className="text-sm text-ink-500">Searching…</p>}

      {q && !isLoading && !hasResults && (
        <div className="rounded-md border border-ink-100 bg-ink-25 p-6 sm:p-8 text-center">
          <p className="text-ink-700 break-words">Nothing matched &ldquo;{q}&rdquo;.</p>
          <p className="text-sm text-ink-500 mt-1">
            Try a different keyword like &ldquo;bridal&rdquo;, &ldquo;mangalsutra&rdquo;, or &ldquo;ring&rdquo;.
          </p>
        </div>
      )}

      {collectionMatches.length > 0 && (
        <section className="mb-12 sm:mb-14">
          <h2 className="font-display text-xl sm:text-[22px] text-ink-900 mb-4 sm:mb-5">Collections</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {collectionMatches.map((c) => (
              <Link key={c.slug} to={`/store/collections/${c.slug}`} className="group block">
                <div className="aspect-[4/5] overflow-hidden bg-ink-100">
                  <img src={c.img} alt={c.name} className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-slow" loading="lazy" />
                </div>
                <h3 className="font-display text-base sm:text-[18px] text-ink-900 mt-3">{c.name}</h3>
                <p className="text-[11px] sm:text-xs text-ink-500 mt-1">{c.tagline}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {productMatches.length > 0 && (
        <section>
          <h2 className="font-display text-xl sm:text-[22px] text-ink-900 mb-4 sm:mb-5">Pieces</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-8 sm:gap-x-5 sm:gap-y-10">
            {productMatches.map((p) => {
              const price = p.basePricePaise + p.stoneChargePaise;
              const purity = p.purityCaratX100 < 1000 ? 'Silver' : `${p.purityCaratX100 / 100}K`;
              return (
                <Link key={p.id} to={`/store/products/${p.slug}`} className="group block">
                  <div className="aspect-[4/5] overflow-hidden bg-ink-100">
                    <img src={p.images[0] ?? ''} alt={p.name} className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-slow" loading="lazy" />
                  </div>
                  <div className="mt-3 sm:mt-4">
                    <h3 className="font-display text-base sm:text-[17px] text-ink-900 leading-tight">{p.name}</h3>
                    <p className="text-[11px] sm:text-xs text-ink-500 mt-1">{(p.weightMg / 1000).toFixed(2)} g · {purity}</p>
                    <p className="text-sm text-ink-900 font-mono tabular-nums mt-1 sm:mt-1.5">₹{(price / 100).toLocaleString('en-IN')}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
