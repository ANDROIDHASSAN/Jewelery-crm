import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';

const CATALOG = [
  { slug: 'mira-bangle', name: 'Mira bangle', priceLabel: '₹84,500', weight: '12.45 g · 22K', img: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=800&q=80', tags: 'bridal bangle 22k gold' },
  { slug: 'tara-mangalsutra', name: 'Tara mangalsutra', priceLabel: '₹62,200', weight: '8.10 g · 22K', img: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=800&q=80', tags: 'bridal mangalsutra chain 22k' },
  { slug: 'aarya-ring', name: 'Aarya solitaire', priceLabel: '₹48,900', weight: '0.32 ct · 18K', img: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=800&q=80', tags: 'diamond ring solitaire 18k' },
  { slug: 'riya-jhumka', name: 'Riya jhumkas', priceLabel: '₹31,400', weight: '5.20 g · 22K', img: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=80', tags: 'festive jhumka earring 22k' },
  { slug: 'diya-chain', name: 'Diya chain', priceLabel: '₹54,800', weight: '7.40 g · 22K', img: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=800&q=80', tags: 'daily wear chain 22k gold' },
];

export function SearchResultsPage(): JSX.Element {
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const collections = useAppSelector((s) => s.storefrontContent.collections);

  const productMatches = useMemo(() => {
    if (!q) return [];
    const needle = q.toLowerCase();
    return CATALOG.filter(
      (p) => p.name.toLowerCase().includes(needle) || p.tags.toLowerCase().includes(needle),
    );
  }, [q]);

  const collectionMatches = useMemo(() => {
    if (!q) return [];
    const needle = q.toLowerCase();
    return collections.filter(
      (c) => c.name.toLowerCase().includes(needle) || c.tagline.toLowerCase().includes(needle),
    );
  }, [q, collections]);

  const hasResults = productMatches.length > 0 || collectionMatches.length > 0;

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-10 md:py-14">
      <header className="mb-10">
        <p className="text-eyebrow uppercase text-ink-500 inline-flex items-center gap-2">
          <SearchIcon className="h-3.5 w-3.5" /> Search
        </p>
        <h1 className="font-display text-[34px] md:text-[40px] text-ink-900 mt-2">
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

      {q && !hasResults && (
        <div className="rounded-md border border-ink-100 bg-ink-25 p-8 text-center">
          <p className="text-ink-700">Nothing matched &ldquo;{q}&rdquo;.</p>
          <p className="text-sm text-ink-500 mt-1">
            Try a different keyword like &ldquo;bridal&rdquo;, &ldquo;mangalsutra&rdquo;, or &ldquo;ring&rdquo;.
          </p>
        </div>
      )}

      {collectionMatches.length > 0 && (
        <section className="mb-14">
          <h2 className="font-display text-[22px] text-ink-900 mb-5">Collections</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {collectionMatches.map((c) => (
              <Link key={c.slug} to={`/store/collections/${c.slug}`} className="group block">
                <div className="aspect-[4/5] overflow-hidden bg-ink-100">
                  <img src={c.img} alt={c.name} className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-slow" loading="lazy" />
                </div>
                <h3 className="font-display text-[18px] text-ink-900 mt-3">{c.name}</h3>
                <p className="text-xs text-ink-500 mt-1">{c.tagline}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {productMatches.length > 0 && (
        <section>
          <h2 className="font-display text-[22px] text-ink-900 mb-5">Pieces</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-10">
            {productMatches.map((p) => (
              <Link key={p.slug} to={`/store/products/${p.slug}`} className="group block">
                <div className="aspect-[4/5] overflow-hidden bg-ink-100">
                  <img src={p.img} alt={p.name} className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-slow" loading="lazy" />
                </div>
                <div className="mt-4">
                  <h3 className="font-display text-[17px] text-ink-900 leading-tight">{p.name}</h3>
                  <p className="text-xs text-ink-500 mt-1">{p.weight}</p>
                  <p className="text-sm text-ink-900 font-mono tabular-nums mt-1.5">{p.priceLabel}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
