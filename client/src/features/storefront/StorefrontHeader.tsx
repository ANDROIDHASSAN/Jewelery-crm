import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Search, Heart, User, ShoppingBag, MapPin, Menu, X, Gem, ChevronRight, Plus, Minus, Layers } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAppSelector } from '@/app/hooks';
import {
  useGetPublicCouponsQuery,
  useGetPublicGoldRateQuery,
  useGetPublicCollectionsQuery,
  useGetPublicCollectionsListQuery,
} from '@/features/storefront/storefrontApi';

// Format paise/g → "₹14,073/g" (no decimal for per-gram rates above ₹1k).
// Falls back to the CMS-edited string when the live feed has no value yet.
function formatLiveRate(paise: number | undefined, fallback: string): string {
  if (!paise || paise <= 0) return fallback;
  const rupees = paise / 100;
  return rupees >= 1000
    ? `₹${Math.round(rupees).toLocaleString('en-IN')}/g`
    : `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/g`;
}

// Default nav surfaces when the CMS hasn't customised navMenu yet (empty
// array). Once an editor saves changes from Website CMS → Navigation, those
// override this baseline.
const DEFAULT_NAV: Array<{ to: string; label: string; end?: boolean }> = [
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
  // CMS-managed nav. Empty array (the schema default) means "use baseline"
  // so storefronts that pre-date the nav CMS keep their existing menu. The
  // shape in the schema uses { label, href, end? } so we re-map onto the
  // local { to, label, end? } shape NavLink expects.
  const cmsNav = useAppSelector((s) => s.storefrontContent.navMenu);
  const NAV: Array<{ to: string; label: string; end?: boolean }> =
    cmsNav && cmsNav.length > 0
      ? cmsNav.map((n: { href: string; label: string; end?: boolean }) => ({
          to: n.href,
          label: n.label,
          end: n.end,
        }))
      : DEFAULT_NAV;
  // Metal rates. The server has already applied the precedence — live GoldAPI
  // feed when a key is attached, otherwise the CMS-entered rate — so we just
  // render what it sends. Polls every 5 min so a daily refresh shows up
  // in-session.
  const { data: liveRate } = useGetPublicGoldRateQuery(undefined, {
    pollingInterval: 5 * 60 * 1000,
  });
  // Top-level categories (e.g. "18K Gold Tone", "9KT Fine Gold", "925 Sterling
  // Silver") become the mobile drawer's "tone" toggle; the selected tone's
  // sub-categories fill the Palmonas-style "Shop by Category" grid below it.
  const { data: allCategories = [] } = useGetPublicCollectionsQuery();
  // The storefront quotes 9K gold and silver only. The server resolved the
  // source already (live feed if GOLDAPI_KEY is attached, else the CMS rate),
  // so there is no CMS-vs-live pick to make here any more — that inversion used
  // to live in this component and let a stale CMS string mask a live feed.
  const rates = useMemo(
    () => ({
      g9: formatLiveRate(liveRate?.gold9kPaise ?? undefined, '—'),
      silver: formatLiveRate(liveRate?.silverPaise ?? undefined, '—'),
      // Editor-typed "as of" label wins; otherwise fall back to nothing rather
      // than implying a freshness we can't vouch for.
      updatedAt: (cmsRates.updatedAt ?? '').trim(),
    }),
    [cmsRates.updatedAt, liveRate],
  );
  // Coupons the jeweller opted to advertise (Website → Coupons → "Show on
  // storefront"). Same 5-min poll as the rate, so publishing a code lands in an
  // open session. Empty array = nothing opted in → the bar just shows the rate.
  const { data: coupons = [] } = useGetPublicCouponsQuery(undefined, {
    pollingInterval: 5 * 60 * 1000,
  });
  const locationCount = useAppSelector((s) => s.storefrontContent.locations.length);
  const cartCount = useAppSelector((s) => s.shop.cart.reduce((n, c) => n + c.qty, 0));
  const wishlistCount = useAppSelector((s) => s.shop.wishlist.length);
  const signedIn = useAppSelector((s) => s.shop.account.signedIn);
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  // Mobile drawer: which tone tab is selected + whether "Shop by Category" is
  // expanded. `mobileTone` stays null until the visitor taps a tab, so the
  // active tone falls back to the first available tone on first open.
  const [mobileTone, setMobileTone] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(true);
  // Tones = top-level categories that actually have sub-categories to show,
  // ordered by the admin's Category sortOrder (lower = first) so e.g. "Demifine
  // Jewellery" can lead "9KT Fine Gold" regardless of alphabetical name. The
  // server already sorts by sortOrder; we re-sort defensively in case a cached
  // payload arrives in a different order.
  const tones = useMemo(
    () =>
      allCategories
        .filter((c) => c.parentId === null && allCategories.some((s) => s.parentId === c.id))
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [allCategories],
  );
  const activeToneId =
    mobileTone && tones.some((t) => t.id === mobileTone) ? mobileTone : tones[0]?.id;
  const activeTone = tones.find((t) => t.id === activeToneId);
  const toneSubs = useMemo(
    () => (activeToneId ? allCategories.filter((c) => c.parentId === activeToneId) : []),
    [allCategories, activeToneId],
  );
  // Curated inventory collections for "Shop by Collection" (only non-empty
  // ones are returned by the API). Collapsible sections start closed to keep
  // the drawer compact.
  const { data: collections = [] } = useGetPublicCollectionsListQuery();
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [genderOpen, setGenderOpen] = useState(false);

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

  // Announcement bar rotation: slot 0 is always today's rate, then one slot per
  // advertised coupon. With no coupons there is a single slot and the interval
  // never starts, so the bar behaves exactly as it did before this feature.
  const slotCount = 1 + coupons.length;
  const [slot, setSlot] = useState(0);
  useEffect(() => {
    if (slotCount <= 1) {
      setSlot(0);
      return;
    }
    const id = window.setInterval(() => setSlot((s) => (s + 1) % slotCount), 4000);
    return () => window.clearInterval(id);
  }, [slotCount]);
  // A coupon being unpublished mid-rotation shrinks the list; clamp so we never
  // index past the end for a frame.
  const activeSlot = slot % slotCount;
  const activeCoupon = activeSlot === 0 ? null : coupons[activeSlot - 1];

  return (
    <header className="sticky top-0 z-40">
      {/* Announcement bar — faint blush + champagne, premium tonal. */}
      <div className="bg-[#F5E5DC] border-b border-[#E8CFC1]/60 text-ink-700">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-9 flex items-center justify-between text-[11px] tracking-wide">
          {/* Rotates rate ↔ each advertised coupon every 4s. `key` on the slot
              re-triggers the fade so consecutive messages read as a change
              rather than a silent swap. */}
          <span key={activeSlot} className="font-mono tabular-nums truncate animate-fade-in">
            {activeCoupon ? (
              <>
                <span className="text-ink-500">Use code</span>{' '}
                <span className="text-brand-700 font-semibold tracking-[0.08em]">
                  {activeCoupon.code}
                </span>{' '}
                <span className="text-ink-600">— {activeCoupon.offerLabel}</span>
                {activeCoupon.minCartPaise > 0 && (
                  <span className="hidden sm:inline text-ink-500">
                    {' '}
                    on orders over ₹
                    {Math.round(activeCoupon.minCartPaise / 100).toLocaleString('en-IN')}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="text-ink-500">Today&apos;s rate ·</span>{' '}
                <span className="text-brand-700 font-semibold">9K {rates.g9}</span>
                <span className="text-ink-300 mx-2 hidden sm:inline">·</span>
                <span className="hidden sm:inline text-ink-600">Silver {rates.silver}</span>
                {rates.updatedAt && (
                  <span className="hidden md:inline text-ink-500"> · {rates.updatedAt}</span>
                )}
              </>
            )}
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
            <nav className="flex-1 overflow-y-auto pb-2">
              {activeTone ? (
                <>
                  {/* Tone toggle — top-level categories ("18K Gold Tone",
                      "9KT Fine Gold", …). Tapping a tab swaps the sub-category
                      grid below and re-opens "Shop by Category". */}
                  <div
                    className="grid border-b border-ink-100"
                    style={{ gridTemplateColumns: `repeat(${tones.length}, minmax(0, 1fr))` }}
                  >
                    {tones.map((t, idx) => {
                      const active = t.id === activeToneId;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setMobileTone(t.id);
                            setCategoryOpen(true);
                          }}
                          aria-pressed={active}
                          className={cn(
                            'relative px-1 py-3.5 text-center text-[11px] leading-tight uppercase tracking-wide transition-colors',
                            idx > 0 && 'border-l border-ink-100',
                            active ? 'text-ink-900 font-semibold' : 'text-ink-500 hover:text-ink-800',
                          )}
                        >
                          {t.name}
                          {active && (
                            <span className="absolute left-3 right-3 -bottom-px h-0.5 bg-brand-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Shop by Category — collapsible header (Palmonas −/+). */}
                  <button
                    type="button"
                    onClick={() => setCategoryOpen((v) => !v)}
                    aria-expanded={categoryOpen}
                    className="w-full flex items-center justify-between px-5 py-4 text-[15px] text-ink-900 hover:bg-[#FAF3EE] transition-colors"
                  >
                    <span className="font-medium">Shop by Category</span>
                    {categoryOpen ? (
                      <Minus className="h-4 w-4 text-ink-500" />
                    ) : (
                      <Plus className="h-4 w-4 text-ink-500" />
                    )}
                  </button>

                  {categoryOpen && (
                    <div className="px-5 pb-4">
                      {toneSubs.length > 0 ? (
                        <>
                          <div className="grid grid-cols-2 gap-2.5">
                            {toneSubs.map((s) => (
                              <Link
                                key={s.id}
                                to={`/store/collections/${activeTone.slug}?sub=${s.id}`}
                                onClick={() => setMobileOpen(false)}
                                className="flex items-center justify-between gap-2 rounded-xl border border-ink-100 px-3.5 py-3 hover:border-brand-300 hover:bg-[#FAF3EE] transition-colors"
                              >
                                <span className="text-[13px] leading-tight text-ink-800">{s.name}</span>
                                <Gem className="h-4 w-4 text-brand-500 shrink-0" />
                              </Link>
                            ))}
                          </div>
                          <Link
                            to={`/store/collections/${activeTone.slug}`}
                            onClick={() => setMobileOpen(false)}
                            className="mt-3 block text-center text-[13px] text-brand-700 underline underline-offset-4"
                          >
                            View all {activeTone.name}
                          </Link>
                        </>
                      ) : (
                        <Link
                          to={`/store/collections/${activeTone.slug}`}
                          onClick={() => setMobileOpen(false)}
                          className="block text-center text-[13px] text-brand-700 underline underline-offset-4"
                        >
                          View all {activeTone.name}
                        </Link>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Fallback — tenants without a categorised catalogue keep the
                      CMS-nav 2-up tile grid. */}
                  <div className="px-5 pt-5 pb-3">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Shop by Category</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 px-5">
                    {NAV.filter((n) => !n.to.includes('/locations')).map((n) => (
                      <NavLink
                        key={n.to}
                        to={n.to}
                        end={n.end}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center justify-between gap-2 rounded-xl border border-ink-100 px-3.5 py-3 hover:border-brand-300 hover:bg-[#FAF3EE] transition-colors"
                      >
                        <span className="text-[13px] leading-tight text-ink-800">{n.label}</span>
                        <Gem className="h-4 w-4 text-brand-500 shrink-0" />
                      </NavLink>
                    ))}
                  </div>
                  <Link
                    to="/store/collections"
                    onClick={() => setMobileOpen(false)}
                    className="mt-3 block text-center text-[13px] text-brand-700 underline underline-offset-4"
                  >
                    View all
                  </Link>
                </>
              )}

              {/* Shop by Collection — curated inventory collections (only
                  non-empty ones are returned). Collapsible accordion section. */}
              {collections.length > 0 && (
                <div className="border-t border-ink-100">
                  <button
                    type="button"
                    onClick={() => setCollectionOpen((v) => !v)}
                    aria-expanded={collectionOpen}
                    className="w-full flex items-center justify-between px-5 py-4 text-[15px] text-ink-900 hover:bg-[#FAF3EE] transition-colors"
                  >
                    <span className="font-medium">Shop by Collection</span>
                    {collectionOpen ? (
                      <Minus className="h-4 w-4 text-ink-500" />
                    ) : (
                      <Plus className="h-4 w-4 text-ink-500" />
                    )}
                  </button>
                  {collectionOpen && (
                    <div className="px-5 pb-4 grid grid-cols-2 gap-2.5">
                      {collections.map((c) => (
                        <Link
                          key={c.id}
                          to={`/store/collections/${c.slug}`}
                          onClick={() => setMobileOpen(false)}
                          className="flex items-center justify-between gap-2 rounded-xl border border-ink-100 px-3.5 py-3 hover:border-brand-300 hover:bg-[#FAF3EE] transition-colors"
                        >
                          <span className="text-[13px] leading-tight text-ink-800">{c.name}</span>
                          <Layers className="h-4 w-4 text-brand-500 shrink-0" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Shop by Gender — Men / Women (gender is an item-level field). */}
              <div className="border-t border-ink-100">
                <button
                  type="button"
                  onClick={() => setGenderOpen((v) => !v)}
                  aria-expanded={genderOpen}
                  className="w-full flex items-center justify-between px-5 py-4 text-[15px] text-ink-900 hover:bg-[#FAF3EE] transition-colors"
                >
                  <span className="font-medium">Shop by Gender</span>
                  {genderOpen ? (
                    <Minus className="h-4 w-4 text-ink-500" />
                  ) : (
                    <Plus className="h-4 w-4 text-ink-500" />
                  )}
                </button>
                {genderOpen && (
                  <div className="px-5 pb-4 grid grid-cols-2 gap-2.5">
                    {[
                      { to: '/store/collections/women', label: 'Women' },
                      { to: '/store/collections/men', label: 'Men' },
                    ].map((g) => (
                      <Link
                        key={g.to}
                        to={g.to}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center justify-between gap-2 rounded-xl border border-ink-100 px-3.5 py-3 hover:border-brand-300 hover:bg-[#FAF3EE] transition-colors"
                      >
                        <span className="text-[13px] leading-tight text-ink-800">{g.label}</span>
                        <User className="h-4 w-4 text-brand-500 shrink-0" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Compact link rows — the Palmonas-style accordion list. */}
              <div className="mt-4 border-t border-ink-100">
                {[
                  { to: '/store/collections', label: 'New Arrivals', end: false },
                  { to: '/store/locations', label: 'Stores & Services', end: false },
                  { to: '/store/account', label: signedIn ? 'Your account' : 'Sign in', end: false },
                  { to: '/store/wishlist', label: `Wishlist${wishlistCount ? ` (${wishlistCount})` : ''}`, end: false },
                  { to: '/store/cart', label: `Bag${cartCount ? ` (${cartCount})` : ''}`, end: false },
                  { to: '/store/track', label: 'Track Order', end: false },
                  { to: '/store/help', label: 'Help', end: false },
                ].map((r) => (
                  <Link
                    key={r.label}
                    to={r.to}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-between px-5 py-3.5 border-b border-ink-100 text-[15px] text-ink-800 hover:bg-[#FAF3EE]"
                  >
                    <span>{r.label}</span>
                    <ChevronRight className="h-4 w-4 text-ink-300" />
                  </Link>
                ))}
                <a
                  href="https://wa.me/919876543210"
                  className="flex items-center justify-between px-5 py-3.5 border-b border-ink-100 text-[15px] text-brand-700 hover:bg-[#FAF3EE]"
                >
                  <span>Chat on WhatsApp</span>
                  <ChevronRight className="h-4 w-4 text-brand-300" />
                </a>
              </div>
            </nav>
            <div className="border-t border-ink-100 px-5 sm:px-6 py-4 bg-ink-25 text-xs font-mono tabular-nums text-ink-600">
              9K <span className="text-brand-700">{rates.g9}</span> · Silver {rates.silver}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
