// Global order-notifications bell, lives in TopBar so every admin page
// participates regardless of which module is active. Two things drive it:
//
//   1. `useGetOrdersLiveCountQuery` polls the DB-backed aggregate every 5s.
//      The bell badge displays `byStatus.PENDING` directly — i.e. the
//      number of NEW orders that haven't been acknowledged yet. The badge
//      decreases naturally as the shop moves orders out of PENDING; it's
//      not a "since last viewed" counter, it's the live action queue.
//
//      A toast alert also fires when `total` jumps between polls — that's
//      the "ding, new order arrived" cue.
//
//   2. `useGetOrdersQuery` is fetched on-demand when the bell dropdown opens
//      so we can show the actual last 20 orders without paying the cost on
//      every poll. The dropdown lists them with status, customer, total and
//      a "time ago" stamp; clicking one navigates to /admin/ecommerce.
//
// `lastSeenAt` in localStorage is still used to subtly highlight rows in
// the dropdown that are newer than the last time the user opened the bell.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Inbox, X, Package, Clock, CheckCircle2, Truck, XCircle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  useGetOrdersLiveCountQuery,
  useGetOrdersQuery,
} from '@/features/ecommerce/ecommerceApi';
import { Money } from '@/components/ui/money';

const STORAGE_KEY = 'zelora.notifications.lastSeenAt';

const STATUS_ICON: Record<string, typeof Clock> = {
  PENDING: Clock,
  CONFIRMED: CheckCircle2,
  PACKED: Package,
  SHIPPED: Truck,
  DELIVERED: CheckCircle2,
  CANCELLED: XCircle,
  RETURNED: RotateCcw,
};

const STATUS_DOT: Record<string, string> = {
  PENDING: 'bg-warning-500',
  CONFIRMED: 'bg-info-500',
  PACKED: 'bg-info-500',
  SHIPPED: 'bg-info-500',
  DELIVERED: 'bg-success-500',
  CANCELLED: 'bg-ink-400',
  RETURNED: 'bg-ink-400',
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function readLastSeen(): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return 0;
  const ts = Number(raw);
  return Number.isFinite(ts) ? ts : 0;
}

function writeLastSeen(ts: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(ts));
  } catch {
    /* quota — ignore */
  }
}

export function NotificationBell(): JSX.Element {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<number>(() => readLastSeen());

  // Live aggregate poll — the cheap aggregate that drives the new-order
  // delta detection. 5s feels real-time without crushing the DB; one
  // groupBy + a handful of counts per tick.
  const { data: liveCountRes } = useGetOrdersLiveCountQuery(undefined, {
    pollingInterval: 5_000,
  });
  const liveCount = liveCountRes?.data;
  const totalOrders = liveCount?.total ?? 0;

  // Detect a "new order arrived" event: `total` went up since the previous
  // poll. We compare against the previous render's value (kept in a ref so
  // the comparison survives across renders but doesn't re-render itself).
  const prevTotalRef = useRef<number | null>(null);
  useEffect(() => {
    if (!liveCount) return;
    if (prevTotalRef.current !== null && totalOrders > prevTotalRef.current) {
      const delta = totalOrders - prevTotalRef.current;
      toast.message(`${delta} new order${delta === 1 ? '' : 's'} just arrived`, {
        description: 'Click the bell to view, or jump to E-commerce.',
        action: { label: 'Open', onClick: () => navigate('/admin/ecommerce') },
        duration: 8000,
      });
    }
    prevTotalRef.current = totalOrders;
  }, [totalOrders, liveCount, navigate]);

  // Fetch the recent orders list only when the dropdown is open. Saves a
  // 50-row payload on every render of the bell.
  const { data: ordersRes, isLoading: ordersLoading } = useGetOrdersQuery(
    undefined,
    { skip: !open, pollingInterval: open ? 10_000 : 0 },
  );
  const recentOrders = useMemo(() => {
    const all = ordersRes?.data ?? [];
    return all.slice(0, 20);
  }, [ordersRes]);

  // BELL BADGE — count of NEW (PENDING) orders, pulled directly from the
  // server's live aggregate. This is the action queue: every PENDING order
  // is waiting on the shop to acknowledge it. When the cashier drags a
  // PENDING card to Confirmed, this count decreases automatically on the
  // next 5s poll. The badge does NOT auto-clear when the dropdown opens —
  // it always reflects reality.
  const pendingCount = liveCount?.byStatus.PENDING ?? 0;

  // Mark-all-read still exists to control the "fresh row" highlight in the
  // dropdown (rows newer than lastSeen get a brand tint). It does NOT touch
  // the bell badge — that's a live DB count.
  function markAllRead(): void {
    const now = Date.now();
    setLastSeen(now);
    writeLastSeen(now);
  }

  function toggleOpen(): void {
    setOpen((v) => !v);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        className="relative h-9 w-9 inline-flex items-center justify-center rounded-md text-ink-700 hover:bg-ink-50 transition-colors"
        aria-label={
          pendingCount > 0
            ? `Notifications, ${pendingCount} new ${pendingCount === 1 ? 'order' : 'orders'} pending`
            : 'Notifications'
        }
      >
        <Bell className="h-4 w-4" />
        {pendingCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-danger-500 text-ink-0 text-[10px] font-semibold tabular-nums leading-none inline-flex items-center justify-center animate-pulse"
            aria-hidden
            title={`${pendingCount} new order${pendingCount === 1 ? '' : 's'} pending`}
          >
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop captures outside-clicks. */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 mt-2 w-[min(92vw,380px)] rounded-md border border-ink-100 bg-ink-0 shadow-xl z-40 overflow-hidden">
            <header className="px-4 py-3 border-b border-ink-100 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-ink-900">
                  Notifications
                  {pendingCount > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-warning-50 text-warning-700 text-[10px] font-medium align-middle">
                      <span className="h-1 w-1 rounded-full bg-warning-500 animate-pulse" />
                      {pendingCount} new
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-ink-500 mt-0.5">
                  {liveCount
                    ? pendingCount > 0
                      ? `${pendingCount} pending order${pendingCount === 1 ? '' : 's'} need attention · ${totalOrders} total`
                      : `All caught up · ${totalOrders} total orders`
                    : 'Loading…'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-ink-400 hover:text-ink-700 p-1 -mr-1"
                aria-label="Close notifications"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="max-h-[60vh] overflow-y-auto">
              {ordersLoading && (
                <p className="px-4 py-6 text-sm text-ink-500 text-center">Loading orders…</p>
              )}
              {!ordersLoading && recentOrders.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <Inbox className="h-6 w-6 text-ink-300 mx-auto" />
                  <p className="mt-2 text-sm text-ink-500">No notifications yet.</p>
                  <p className="text-[11px] text-ink-400 mt-0.5">
                    New customer orders show up here as soon as they&apos;re placed.
                  </p>
                </div>
              )}
              <ul className="divide-y divide-ink-50">
                {recentOrders.map((o) => {
                  const Icon = STATUS_ICON[o.status] ?? Bell;
                  const dot = STATUS_DOT[o.status] ?? 'bg-ink-400';
                  const isFresh = new Date(o.createdAt).getTime() > lastSeen;
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          // Deep-link the order id so EcommerceAdminPage
                          // auto-opens the drawer for this exact order.
                          navigate(`/admin/ecommerce?orderId=${o.id}`);
                        }}
                        className={`w-full text-left px-4 py-3 hover:bg-ink-25 flex items-start gap-3 ${
                          isFresh ? 'bg-brand-50/30' : ''
                        }`}
                      >
                        <span
                          className={`mt-1 h-6 w-6 rounded-full flex items-center justify-center ${dot} text-ink-0 shrink-0`}
                        >
                          <Icon className="h-3 w-3" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-sm text-ink-900 truncate">
                              {o.customer?.name ?? 'Walk-in'} · {o.status.toLowerCase()}
                            </p>
                            <p className="text-[10px] text-ink-400 whitespace-nowrap shrink-0">
                              {timeAgo(o.createdAt)}
                            </p>
                          </div>
                          <p className="text-[11px] text-ink-500 truncate font-mono">
                            ZL-{o.id.slice(-6).toUpperCase()}
                            {o.customer?.phone ? ` · ${o.customer.phone}` : ''}
                          </p>
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-[11px] text-ink-500">
                              {o.items?.length ?? 0} item
                              {(o.items?.length ?? 0) === 1 ? '' : 's'} · {o.paymentMethod}
                            </p>
                            <Money
                              paise={o.totalPaise}
                              className="font-mono tabular-nums text-xs text-ink-700"
                            />
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {recentOrders.length > 0 && (
              <footer className="px-4 py-2.5 border-t border-ink-100 bg-ink-25/50 flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-ink-500 hover:text-ink-900"
                >
                  Mark all read
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    navigate('/admin/ecommerce');
                  }}
                  className="text-brand-700 hover:text-brand-800 font-medium"
                >
                  View all orders →
                </button>
              </footer>
            )}
          </div>
        </>
      )}
    </div>
  );
}
