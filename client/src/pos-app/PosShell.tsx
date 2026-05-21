// PosShell — left-sidebar dashboard layout for the POS subdomain.
//
//   ┌─────────────┬──────────────────────────────────────────────┐
//   │             │  Top bar · shop · online · 22K · session     │  ← Sticky chrome
//   │  Sidebar    ├──────────────────────────────────────────────┤
//   │  (lg+)      │  Haryana · 22K · 18K · …  (gold ticker)      │
//   │             ├──────────────────────────────────────────────┤
//   │  Billing    │                                              │
//   │  Parked 3   │   <Outlet /> — billing / parked / …          │
//   │  …          │                                              │
//   │             │                                              │
//   │  [AK] Anant │                                              │
//   │  Settings   │                                              │
//   │  Sign out   │                                              │
//   └─────────────┴──────────────────────────────────────────────┘
//
// Below `lg`, the sidebar collapses into a slide-in drawer accessed via the
// hamburger in the top bar. No bottom nav — the sidebar carries every
// workflow link.

import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Banknote,
  Bell,
  Calculator,
  ChevronDown,
  ClipboardList,
  CreditCard,
  FileText,
  Hand,
  LogOut,
  Menu,
  Settings,
  Wifi,
  WifiOff,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { signOutAndClear } from '@/features/auth/authActions';
import { useGetOpenSessionQuery, useListParkedQuery, useListRepairsQuery } from './posFeaturesApi';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import { GoldRateTicker } from './GoldRateTicker';
import { PosSidebar, type PosSidebarNavItem } from './PosSidebar';
import { isPosHost } from '@/app/routes';
import { useGetGoldRateQuery } from '@/features/pos/posApi';
import { startBackgroundSync, pendingCount as offlinePendingCount } from '@/features/pos/offline';

export function PosShell(): JSX.Element {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const location = useLocation();

  const user = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  // Online/offline mirror.
  const [online, setOnline] = useState<boolean>(typeof navigator === 'undefined' ? true : navigator.onLine);
  // Queued-bill counter — shows next to the offline pill so the cashier
  // always sees how many bills are pending sync. Refreshed by the
  // background-sync loop (which already runs ever 5s) plus a focus listener.
  const [queuedBills, setQueuedBills] = useState<number>(0);
  useEffect(() => {
    function on(): void { setOnline(true); }
    function off(): void { setOnline(false); }
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Start the background sync loop for queued offline bills. The loop pings
  // /health on a 5s interval and drains Dexie when the server is reachable.
  // Refresh the queued-count pill every tick so the cashier sees it drain
  // live.
  useEffect(() => {
    const stop = startBackgroundSync();
    const refresh = async (): Promise<void> => setQueuedBills(await offlinePendingCount());
    void refresh();
    const interval = setInterval(() => void refresh(), 5_000);
    window.addEventListener('focus', refresh);
    return () => {
      stop();
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const { data: shopsData } = useGetShopsQuery();
  const shops = shopsData?.data ?? [];
  const shopId = user?.shopId ?? shops[0]?.id ?? null;
  const shop = shops.find((s) => s.id === shopId) ?? null;

  const { data: sessionData } = useGetOpenSessionQuery(shopId ?? '', { skip: !shopId });
  const openSession = sessionData?.data ?? null;

  const { data: parkedData } = useListParkedQuery(shopId ?? '', { skip: !shopId, pollingInterval: 30_000 });
  const parkedCount = parkedData?.data.filter((p) => p.status === 'ACTIVE').length ?? 0;

  const { data: repairsData } = useListRepairsQuery({ shopId: shopId ?? '' }, { skip: !shopId, pollingInterval: 60_000 });
  const repairsActive = repairsData?.data.filter((r) =>
    r.status === 'INTAKE' || r.status === 'IN_WORKSHOP' || r.status === 'READY',
  ).length ?? 0;

  // Headline 22K rate for the top-bar pill.
  const { data: rateData } = useGetGoldRateQuery(undefined, { pollingInterval: 60_000 });
  const rate22K = rateData?.data.find((r) => r.purity === 2200);

  const items: PosSidebarNavItem[] = [
    { to: '/pos', end: true, icon: CreditCard, label: 'Billing', description: 'Ring up a sale' },
    { to: '/pos/parked', icon: Hand, label: 'Parked bills', badge: parkedCount, description: 'Held customers' },
    { to: '/pos/estimates', icon: FileText, label: 'Estimates', description: 'Kachi parchi quotes' },
    { to: '/pos/repairs', icon: Wrench, label: 'Repairs', badge: repairsActive, description: 'Workshop intake' },
    { to: '/pos/advances', icon: Banknote, label: 'Advances', description: 'Bookings & receipts' },
    { to: '/pos/cash', icon: Calculator, label: 'Cash drawer', description: 'Open till · day close' },
    { to: '/pos/bills', icon: ClipboardList, label: 'Past bills', description: 'Search & reprint' },
  ];

  // Close drawer on route change + Esc.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!mobileNavOpen) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setMobileNavOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

  async function onSignOut(): Promise<void> {
    // Resets the RTK Query cache too — keeps the next cashier (or any
    // signed-in admin) from briefly seeing this cashier's POS state.
    await dispatch(signOutAndClear());
    navigate(isPosHost() ? '/login' : '/admin/login', { replace: true });
  }

  const initials = user?.name
    ? user.name.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : 'C';

  const sessionLabel = openSession ? `SS-${openSession.id.slice(-4).toUpperCase()}` : null;
  const tillOpenedAt = openSession
    ? new Date(openSession.openedAt).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : null;

  // Title shown in the top bar — derived from active route so a phone user
  // who closed the drawer still knows which workflow they're on.
  const currentItem = items.find((it) =>
    it.end ? location.pathname === it.to : location.pathname.startsWith(it.to),
  );

  return (
    <div className="min-h-screen flex bg-ink-25">
      <PosSidebar
        items={items}
        shopName={shop?.name ?? null}
        cashierName={user?.name ?? null}
        initials={initials}
        tillOpen={openSession !== null}
        openingFloatPaise={openSession?.openingFloatPaise}
        onSignOut={onSignOut}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar -------------------------------------------------- */}
        <header className="sticky top-0 z-20 bg-ink-0 border-b border-ink-100">
          <div className="h-14 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 lg:px-6">
            {/* Hamburger (drawer on < lg) */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden h-9 w-9 -ml-1 rounded-md text-ink-700 hover:bg-ink-50 flex items-center justify-center"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Page title block */}
            <div className="min-w-0 flex-1 leading-tight">
              <div className="flex items-baseline gap-2 flex-wrap">
                <h1 className="font-display text-md sm:text-lg text-ink-900 truncate">
                  {currentItem?.label ?? 'POS'}
                </h1>
                {currentItem?.description && (
                  <span className="hidden md:inline text-xs text-ink-500 truncate">
                    {currentItem.description}
                  </span>
                )}
              </div>
              {shop && (
                <div className="lg:hidden text-[10px] uppercase tracking-wider text-ink-500 truncate">
                  {shop.name}
                </div>
              )}
            </div>

            {/* Online status pill + queued-bills indicator. The queued
                count is the load-bearing UX: a cashier in a basement that
                drops Wi-Fi for 10 minutes shouldn't lose sight of the bills
                waiting to sync. */}
            <span
              className={cn(
                'hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium border',
                online
                  ? 'border-success-200 bg-success-50 text-success-700'
                  : 'border-warning-200 bg-warning-50 text-warning-700',
              )}
              title={queuedBills > 0
                ? `${queuedBills} bill${queuedBills === 1 ? '' : 's'} pending sync`
                : (online ? 'Connected and synced' : 'No connection — bills are queued locally')}
            >
              {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {online ? 'Online' : 'Offline'}
              {queuedBills > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-[1.25rem] rounded-full bg-warning-200 text-warning-900 text-[10px] font-semibold px-1 tabular-nums">
                  {queuedBills}
                </span>
              )}
            </span>

            {/* Live 22K rate condensed pill */}
            {rate22K && (
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-ink-25 border border-ink-100">
                <span className="text-[10px] uppercase tracking-wider text-ink-500">Live 22K</span>
                <span className="text-sm font-mono font-medium text-ink-900 tabular-nums">
                  ₹{Math.round(rate22K.ratePerGramPaise / 100).toLocaleString('en-IN')}
                </span>
                <span className="text-[10px] text-ink-500">/g</span>
              </div>
            )}

            {/* Session info */}
            {sessionLabel && (
              <div className="hidden xl:block text-right leading-tight">
                <div className="text-[10px] uppercase tracking-wider text-ink-500">Session</div>
                <div className="text-xs text-ink-900 font-mono">
                  {sessionLabel} <span className="text-ink-400">·</span> opened {tillOpenedAt}
                </div>
              </div>
            )}

            {/* Notifications */}
            <button
              type="button"
              className="hidden sm:inline-flex relative items-center justify-center h-9 w-9 rounded-md text-ink-500 hover:bg-ink-50 hover:text-ink-800"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              {parkedCount + repairsActive > 0 && (
                <span className="absolute top-1 right-1 h-3 w-3 rounded-full bg-danger-500 text-ink-0 text-[8px] font-medium inline-flex items-center justify-center leading-none">
                  {Math.min(9, parkedCount + repairsActive)}
                </span>
              )}
            </button>

            {/* Account menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((v) => !v)}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-ink-50"
                aria-label="Account menu"
              >
                <span className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 inline-flex items-center justify-center text-xs font-medium">
                  {initials}
                </span>
                <span className="hidden md:flex flex-col items-start leading-none">
                  <span className="text-sm text-ink-900 font-medium truncate max-w-[120px]">
                    {user?.name}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-ink-500 mt-0.5">
                    Cashier
                  </span>
                </span>
                <ChevronDown className="hidden md:inline h-3.5 w-3.5 text-ink-400" />
              </button>
              {accountOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setAccountOpen(false)} aria-hidden />
                  <div className="absolute right-0 mt-2 w-52 rounded-md border border-ink-100 bg-ink-0 shadow-lg z-40 overflow-hidden">
                    <NavLink
                      to="/pos/settings"
                      onClick={() => setAccountOpen(false)}
                      className="flex items-center gap-2 px-3 py-2.5 text-sm text-ink-700 hover:bg-ink-50"
                    >
                      <Settings className="h-4 w-4" /> Settings
                    </NavLink>
                    <button
                      type="button"
                      onClick={() => { setAccountOpen(false); void onSignOut(); }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-ink-700 hover:bg-danger-50 hover:text-danger-700 border-t border-ink-50"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Live gold-rate ticker — state-aware (Haryana, etc.) */}
          <GoldRateTicker />
        </header>

        {/* Page body --------------------------------------------------- */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
