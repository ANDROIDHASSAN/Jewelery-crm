import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/cn';

const IMG = [
  'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=800&q=80',
];

const PRODUCTS = Array.from({ length: 12 }).map((_, i) => ({
  slug: `piece-${i + 1}`,
  name: ['Mira', 'Tara', 'Aarya', 'Riya', 'Diya', 'Saanvi', 'Kiara', 'Anya', 'Ishani', 'Reet', 'Naina', 'Vanya'][i] + ' bangle',
  pricePaise: 84_500_00 + i * 12_500_00,
  weightG: 12 + i * 0.8,
  purity: i % 3 === 0 ? '18K' : '22K',
  img: IMG[i % 4],
  alt: IMG[(i + 1) % 4],
  isNew: i % 5 === 0,
}));

const TITLES: Record<string, { title: string; subtitle: string }> = {
  bridal: { title: 'Bridal', subtitle: 'Heirloom pieces for the day that matters. Hand-set, 22K, BIS-hallmarked.' },
  'daily-wear': { title: 'Daily wear', subtitle: 'Light-weight gold and silver, made to be worn every day.' },
  festive: { title: 'Festive', subtitle: 'For Diwali, Karva Chauth, Navratri — designed to be photographed.' },
  diamond: { title: 'Diamond', subtitle: 'Certified solitaires and studded pieces. IGI / GIA on every stone above 0.20 ct.' },
  silver: { title: 'Silver', subtitle: '92.5 sterling. Hallmarked. For gifting and daily wear.' },
};

const SORTS = ['Featured', 'Newest', 'Price: low → high', 'Price: high → low', 'Weight: light → heavy'] as const;
type Sort = (typeof SORTS)[number];

export function CollectionPage(): JSX.Element {
  const { slug = 'bridal' } = useParams();
  const meta = TITLES[slug] ?? { title: slug, subtitle: '' };

  const [sort, setSort] = useState<Sort>('Featured');
  const [sortOpen, setSortOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const sorted = useMemo(() => {
    const arr = [...PRODUCTS];
    switch (sort) {
      case 'Price: low → high':
        return arr.sort((a, b) => a.pricePaise - b.pricePaise);
      case 'Price: high → low':
        return arr.sort((a, b) => b.pricePaise - a.pricePaise);
      case 'Weight: light → heavy':
        return arr.sort((a, b) => a.weightG - b.weightG);
      case 'Newest':
        return arr.sort((a, b) => Number(b.isNew) - Number(a.isNew));
      default:
        return arr;
    }
  }, [sort]);

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-12 md:py-16">
      {/* Breadcrumb */}
      <nav className="text-xs text-ink-500 mb-5" aria-label="Breadcrumb">
        <Link to="/store" className="hover:text-ink-700">Home</Link>
        <span className="mx-2 text-ink-300">/</span>
        <Link to="/store/collections" className="hover:text-ink-700">Collections</Link>
        <span className="mx-2 text-ink-300">/</span>
        <span className="text-ink-700">{meta.title}</span>
      </nav>

      <header className="mb-10 max-w-3xl">
        <p className="text-eyebrow uppercase text-ink-500">Collection</p>
        <h1 className="font-display text-[40px] md:text-[56px] leading-[1.05] text-ink-900 mt-2">{meta.title}</h1>
        {meta.subtitle && <p className="mt-4 text-base text-ink-600 leading-relaxed max-w-2xl">{meta.subtitle}</p>}
      </header>

      {/* Toolbar — sticky on scroll */}
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
        {/* Side filters */}
        <aside className={cn('space-y-7 text-sm', filtersOpen ? 'block' : 'hidden lg:block')}>
          <FilterGroup label="Metal" options={['22K Gold', '18K Gold', 'Silver', 'Platinum']} />
          <FilterGroup label="Weight" options={['Under 10 g', '10 – 20 g', '20 – 40 g', 'Over 40 g']} />
          <FilterGroup label="Occasion" options={['Daily', 'Festive', 'Wedding']} />
          <FilterGroup label="Price" options={['Under ₹50,000', '₹50,000 – ₹1,00,000', 'Over ₹1,00,000']} />
        </aside>

        <section className="grid grid-cols-2 md:grid-cols-3 gap-x-5 gap-y-10 md:gap-x-6">
          {sorted.map((p) => (
            <Link to={`/store/products/${p.slug}`} key={p.slug} className="group block">
              <div className="relative aspect-[4/5] overflow-hidden bg-ink-100">
                <img
                  src={p.img}
                  alt={p.name}
                  className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300 group-hover:opacity-0"
                  loading="lazy"
                />
                <img
                  src={p.alt}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  loading="lazy"
                  aria-hidden
                />
                {p.isNew && (
                  <span className="absolute top-3 left-3 bg-ink-0/90 backdrop-blur-sm text-[10px] uppercase tracking-[0.16em] px-2.5 py-1 rounded-full text-ink-700">
                    New
                  </span>
                )}
              </div>
              <div className="mt-4 space-y-1">
                <h3 className="font-display text-[18px] leading-tight text-ink-900">{p.name}</h3>
                <p className="text-xs text-ink-500">
                  {p.weightG.toFixed(2)} g · {p.purity} hallmarked
                </p>
                <p className="text-sm text-ink-900 font-mono tabular-nums pt-0.5">
                  ₹{(p.pricePaise / 100).toLocaleString('en-IN')}
                </p>
              </div>
            </Link>
          ))}
        </section>
      </div>

      {/* Mobile filter drawer */}
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
              <FilterGroup label="Metal" options={['22K Gold', '18K Gold', 'Silver', 'Platinum']} />
              <FilterGroup label="Weight" options={['Under 10 g', '10 – 20 g', '20 – 40 g', 'Over 40 g']} />
              <FilterGroup label="Occasion" options={['Daily', 'Festive', 'Wedding']} />
              <FilterGroup label="Price" options={['Under ₹50,000', '₹50,000 – ₹1,00,000', 'Over ₹1,00,000']} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, options }: { label: string; options: string[] }): JSX.Element {
  return (
    <div>
      <p className="text-eyebrow uppercase text-ink-500 mb-3">{label}</p>
      <ul className="space-y-2.5">
        {options.map((o) => (
          <li key={o}>
            <label className="flex items-center gap-2.5 text-ink-700 cursor-pointer hover:text-ink-900">
              <input type="checkbox" className="h-3.5 w-3.5 rounded border-ink-300 text-brand-500 focus:ring-brand-400" />
              <span>{o}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
