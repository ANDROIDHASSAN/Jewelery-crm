import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Search, Heart, User, ShoppingBag, MapPin, Menu, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAppSelector } from '@/app/hooks';
import { useGetPublicGoldRateQuery } from '@/features/storefront/storefrontApi';

// Format paise/g → "₹14,073/g" (no decimal for per-gram rates above ₹1k).
// Falls back to the CMS-edited string when the live feed has no value yet.
function formatLiveRate(paise: number | undefined, fallback: string): string {
  if (!paise || paise <= 0) return fallback;
  const rupees = paise / 100;
  return rupees >= 1000
    ? `₹${Math.round(rupees).toLocaleString('en-IN')}/g`
    : `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/g`;
}

const NAV = [
  // "All" jumps to /store/collections (no slug) which renders the full
  // catalogue with the same filter sidebar + search input as a single
  // collection page. Lives at the front so it reads as the entry point.
  { to: '/store/collections', label: 'All', end: true },
  { to: '/store/collections/bridal', label: 'Bridal' },
  { to: '/store/collections/daily-wear', label: 'Daily wear' },
  { to: '/store/collections/festive', label: 'Festive' },
  { to: '/store/collections/diamond', label: 'Diamond' },
  { to: '/store/collections/silver', label: 'Silver' },
  { to: '/store/locations', label: 'Stores' },
];

export function StorefrontHeader(): JSX.Element {
  const brand = useAppSelector((s) => s.storefrontContent.brand);
  const cmsRates = useAppSelector((s) => s.storefrontContent.rates);
  // Live gold rate — overrides the CMS string when the worker has cached
  // today's value. Polls every 5 min so a daily refresh shows up in-session.
  const { data: liveRate } = useGetPublicGoldRateQuery(undefined, {
    pollingInterval: 5 * 60 * 1000,
  });
  const rates = useMemo(() => {
    const find = (p: number): number | undefined =>
      liveRate?.rates.find((r) => r.purity === p)?.ratePerGramPaise;
    return {
      ...cmsRates,
      g22: formatLiveRate(find(2200), cmsRates.g22),
      g18: formatLiveRate(find(1800), cmsRates.g18),
      silver: formatLiveRate(find(0), cmsRates.silver),
      g24: formatLiveRate(find(2400), '—'),
    };
  }, [cmsRates, liveRate]);
  const locationCount = useAppSelector((s) => s.storefrontContent.locations.length);
  const cartCount = useAppSelector((s) => s.shop.cart.reduce((n, c) => n + c.qty, 0));
  const wishlistCount = useAppSelector((s) => s.shop.wishlist.length);
  const signedIn = useAppSelector((s) => s.shop.account.signedIn);
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');

  function submitSearch(query: string): void {
    const q = query.trim();
    if (!q) return;
    setSearchOpen(false);
    navigate(`/store/search?q=${encodeURIComponent(q)}`);
  }

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
      {/* Announcement bar — faint blush + champagne, premium tonal. */}
      <div className="bg-[#F5E5DC] border-b border-[#E8CFC1]/60 text-ink-700">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-9 flex items-center justify-between text-[11px] tracking-wide">
          <span className="font-mono tabular-nums truncate">
            <span className="text-ink-500">Today&apos;s rate ·</span> <span className="text-brand-700 font-semibold">24K {rates.g24}</span>
            <span className="text-ink-300 mx-2 hidden sm:inline">·</span>
            <span className="text-brand-700 font-semibold hidden sm:inline">22K {rates.g22}</span>
            <span className="text-ink-300 mx-2 hidden sm:inline">·</span>
            <span className="hidden md:inline text-ink-600">18K {rates.g18} · Silver {rates.silver}</span>
          </span>
          <span className="hidden md:flex items-center gap-5 text-ink-600">
            <Link to="/store/locations" className="inline-flex items-center gap-1 hover:text-ink-900 transition-colors">
              <MapPin className="h-3 w-3" /> {locationCount} {locationCount === 1 ? 'store' : 'stores'}
            </Link>
            <Link to="/store/track" className="hover:text-ink-900 transition-colors">Track order</Link>
            <Link to="/store/help" className="hover:text-ink-900 transition-colors">Help</Link>
          </span>
        </div>
      </div>

      {/* Main bar — champagne cream. Header is sticky; logo shrinks slightly on scroll. */}
      <div className="bg-[#FAF3EE] border-b border-[#EFE0D2]/70">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 flex items-center justify-between gap-3 sm:gap-6 h-16 sm:h-[72px]">
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
            className="font-display tracking-tight text-ink-900 leading-none flex items-center gap-2 sm:gap-3 min-w-0"
            aria-label={`${brand.name} — home`}
          >
            {brand.logo && (
              <img
                src={brand.logo}
                alt=""
                aria-hidden="true"
                className={cn(
                  'rounded-md object-cover transition-[height,width] duration-200 shrink-0',
                  scrolled ? 'h-8 w-8' : 'h-10 w-10',
                )}
              />
            )}
            <span className="block min-w-0">
              <span className={cn('block transition-[font-size] duration-200 truncate', scrolled ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl')}>
                {brand.name}
              </span>
              <span className="hidden md:block text-[10px] tracking-[0.22em] uppercase text-ink-400 mt-0.5 font-sans">
                Haryana · Since 1972
              </span>
            </span>
          </Link>

          <nav className="hidden lg:flex items-center gap-8 text-sm" aria-label="Primary">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
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

          <div className="flex items-center gap-0.5 sm:gap-1 text-ink-700 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              className="h-9 w-9 sm:h-10 sm:w-10 inline-flex items-center justify-center rounded-full hover:bg-ink-50"
              aria-label="Search"
              aria-expanded={searchOpen}
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
            <Link
              to="/store/wishlist"
              className="relative hidden sm:inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-ink-50"
              aria-label={`Wishlist${wishlistCount ? ` (${wishlistCount})` : ''}`}
            >
              <Heart className="h-[18px] w-[18px]" />
              {wishlistCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-4 min-w-4 px-1 rounded-full bg-brand-500 text-ink-0 text-[10px] leading-4 text-center tabular-nums">
                  {wishlistCount}
                </span>
              )}
            </Link>
            <Link
              to="/store/account"
              className="hidden sm:inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-ink-50"
              aria-label={signedIn ? 'Your account' : 'Sign in'}
            >
              <User className="h-[18px] w-[18px]" />
            </Link>
            <Link
              to="/store/cart"
              className="relative h-9 w-9 sm:h-10 sm:w-10 inline-flex items-center justify-center rounded-full hover:bg-ink-50"
              aria-label={`Cart${cartCount ? ` (${cartCount})` : ''}`}
            >
              <ShoppingBag className="h-[18px] w-[18px]" />
              {cartCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-4 min-w-4 px-1 rounded-full bg-brand-500 text-ink-0 text-[10px] leading-4 text-center tabular-nums">
                  {cartCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Inline search panel (no popup) */}
        {searchOpen && (
          <div className="border-t border-ink-100 bg-ink-0">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-4 sm:py-5">
              <form
                className="relative"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitSearch(searchQ);
                }}
              >
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                <input
                  autoFocus
                  type="search"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
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
              </form>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-ink-600">
                <span className="text-ink-400">Trending:</span>
                {['Bridal sets', 'Mangalsutra', 'Diamond rings', 'Light-weight bangles', 'Daily-wear chains'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => submitSearch(t)}
                    className="px-3 py-1 rounded-full border border-ink-100 hover:border-ink-300 hover:text-ink-900"
                  >
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
            <div className="flex items-center justify-between h-16 px-5 sm:px-6 border-b border-ink-100">
              <span className="font-display text-xl text-ink-900 flex items-center gap-2">
                {brand.logo && (
                  <img src={brand.logo} alt="" aria-hidden="true" className="h-8 w-8 rounded-md object-cover" />
                )}
                {brand.name}
              </span>
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
                  end={n.end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'block px-5 sm:px-6 py-4 font-display text-2xl sm:text-display-sm border-b border-ink-100',
                      isActive ? 'text-ink-900' : 'text-ink-700',
                    )
                  }
                >
                  {n.label}
                </NavLink>
              ))}
              <div className="px-5 sm:px-6 py-6 space-y-3 text-sm text-ink-600">
                <Link to="/store/account" onClick={() => setMobileOpen(false)} className="block">{signedIn ? 'Your account' : 'Sign in'}</Link>
                <Link to="/store/wishlist" onClick={() => setMobileOpen(false)} className="block">Wishlist{wishlistCount ? ` (${wishlistCount})` : ''}</Link>
                <Link to="/store/cart" onClick={() => setMobileOpen(false)} className="block">Bag{cartCount ? ` (${cartCount})` : ''}</Link>
                <Link to="/store/track" onClick={() => setMobileOpen(false)} className="block">Track order</Link>
                <Link to="/store/help" onClick={() => setMobileOpen(false)} className="block">Help</Link>
                <a href="https://wa.me/919876543210" className="block text-brand-700">Chat on WhatsApp</a>
              </div>
            </nav>
            <div className="border-t border-ink-100 px-5 sm:px-6 py-4 bg-ink-25 text-xs font-mono tabular-nums text-ink-600">
              22K <span className="text-brand-700">{rates.g22}</span> · 18K {rates.g18}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
