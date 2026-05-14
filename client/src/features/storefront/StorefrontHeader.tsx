import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Search, Heart, User, ShoppingBag, MapPin, Menu, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAppSelector } from '@/app/hooks';

const NAV = [
  { to: '/store/collections/bridal', label: 'Bridal' },
  { to: '/store/collections/daily-wear', label: 'Daily wear' },
  { to: '/store/collections/festive', label: 'Festive' },
  { to: '/store/collections/diamond', label: 'Diamond' },
  { to: '/store/collections/silver', label: 'Silver' },
  { to: '/store/locations', label: 'Stores' },
];

export function StorefrontHeader(): JSX.Element {
  const brand = useAppSelector((s) => s.storefrontContent.brand);
  const rates = useAppSelector((s) => s.storefrontContent.rates);
  const locationCount = useAppSelector((s) => s.storefrontContent.locations.length);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <header className="sticky top-0 z-40">
      {/* Announcement bar — gold rate ticker (Bluestone). */}
      <div className="bg-ink-900 text-ink-50">
        <div className="max-w-[1280px] mx-auto px-6 h-8 flex items-center justify-between text-[11px] tracking-wide">
          <span className="font-mono tabular-nums truncate">
            Today&apos;s rate · <span className="text-brand-300">22K {rates.g22}</span>
            <span className="text-ink-400 mx-2 hidden sm:inline">·</span>
            <span className="hidden sm:inline">18K {rates.g18} · Silver {rates.silver}</span>
          </span>
          <span className="hidden md:flex items-center gap-4 text-ink-300">
            <Link to="/store/locations" className="inline-flex items-center gap-1 hover:text-ink-0">
              <MapPin className="h-3 w-3" /> {locationCount} {locationCount === 1 ? 'store' : 'stores'}
            </Link>
            <Link to="/store/track" className="hover:text-ink-0">Track order</Link>
            <Link to="/store/help" className="hover:text-ink-0">Help</Link>
          </span>
        </div>
      </div>

      {/* Main bar */}
      <div
        className={cn(
          'transition-[background-color,box-shadow,height] duration-200 ease-out',
          scrolled
            ? 'bg-ink-0/90 backdrop-blur-md border-b border-ink-100 shadow-sm'
            : 'bg-ink-0 border-b border-ink-100',
        )}
      >
        <div
          className={cn(
            'max-w-[1280px] mx-auto px-6 flex items-center justify-between gap-6 transition-[height] duration-200',
            scrolled ? 'h-14' : 'h-[72px]',
          )}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="lg:hidden h-10 w-10 -ml-2 inline-flex items-center justify-center rounded-full text-ink-700 hover:bg-ink-50"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link
            to="/store"
            className="font-display tracking-tight text-ink-900 leading-none"
            aria-label="{brand.name} — home"
          >
            <span className={cn('block transition-[font-size] duration-200', scrolled ? 'text-xl' : 'text-2xl')}>
              {brand.name}
            </span>
            <span className="hidden md:block text-[10px] tracking-[0.22em] uppercase text-ink-400 mt-0.5 font-sans">
              Pune · Since 1972
            </span>
          </Link>

          <nav className="hidden lg:flex items-center gap-8 text-sm" aria-label="Primary">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cn(
                    'relative py-2 transition-colors duration-fast',
                    isActive ? 'text-ink-900' : 'text-ink-700 hover:text-ink-900',
                    'after:absolute after:left-0 after:right-0 after:-bottom-0.5 after:h-px after:bg-brand-500 after:scale-x-0 after:origin-center after:transition-transform after:duration-200 hover:after:scale-x-100',
                    isActive && 'after:scale-x-100',
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-1 text-ink-700">
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              className="h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-ink-50"
              aria-label="Search"
              aria-expanded={searchOpen}
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
            <button className="hidden sm:inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-ink-50" aria-label="Wishlist">
              <Heart className="h-[18px] w-[18px]" />
            </button>
            <button className="hidden sm:inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-ink-50" aria-label="Account">
              <User className="h-[18px] w-[18px]" />
            </button>
            <button className="relative h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-ink-50" aria-label="Cart">
              <ShoppingBag className="h-[18px] w-[18px]" />
              <span className="absolute top-1.5 right-1.5 h-4 min-w-4 px-1 rounded-full bg-brand-500 text-ink-0 text-[10px] leading-4 text-center tabular-nums">
                2
              </span>
            </button>
          </div>
        </div>

        {/* Inline search panel (no popup) */}
        {searchOpen && (
          <div className="border-t border-ink-100 bg-ink-0">
            <div className="max-w-[1280px] mx-auto px-6 py-5">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                <input
                  autoFocus
                  type="search"
                  placeholder="Search rings, bangles, necklaces…"
                  className="w-full h-12 pl-11 pr-12 bg-ink-25 rounded-full border border-ink-100 text-sm text-ink-900 placeholder:text-ink-400 focus:bg-ink-0 focus:border-brand-300 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-full text-ink-500 hover:bg-ink-100"
                  aria-label="Close search"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-ink-600">
                <span className="text-ink-400">Trending:</span>
                {['Bridal sets', 'Mangalsutra', 'Diamond rings', 'Light-weight bangles', 'Daily-wear chains'].map((t) => (
                  <button key={t} className="px-3 py-1 rounded-full border border-ink-100 hover:border-ink-300 hover:text-ink-900">
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink-900/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-[85%] max-w-sm bg-ink-0 flex flex-col">
            <div className="flex items-center justify-between h-16 px-6 border-b border-ink-100">
              <span className="font-display text-xl text-ink-900">{brand.name}</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="h-10 w-10 -mr-2 inline-flex items-center justify-center rounded-full text-ink-700 hover:bg-ink-50"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-2">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'block px-6 py-4 font-display text-display-sm border-b border-ink-100',
                      isActive ? 'text-ink-900' : 'text-ink-700',
                    )
                  }
                >
                  {n.label}
                </NavLink>
              ))}
              <div className="px-6 py-6 space-y-3 text-sm text-ink-600">
                <Link to="/store/track" onClick={() => setMobileOpen(false)} className="block">Track order</Link>
                <Link to="/store/help" onClick={() => setMobileOpen(false)} className="block">Help</Link>
                <a href="https://wa.me/919876543210" className="block text-brand-700">Chat on WhatsApp</a>
              </div>
            </nav>
            <div className="border-t border-ink-100 px-6 py-4 bg-ink-25 text-xs font-mono tabular-nums text-ink-600">
              22K <span className="text-brand-700">{rates.g22}</span> · 18K {rates.g18}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
