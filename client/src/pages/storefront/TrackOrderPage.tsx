// Customer-facing "where is my piece?" page. Two modes:
//   1. /store/track             — lookup form (id + phone)
//   2. /store/track/:id         — auto-lookup using account.phone (or location.state.phone)
//
// Once an order is loaded, polls /lookup every 10 seconds so the customer
// sees admin status transitions without refreshing. Stops polling when the
// order reaches a terminal state (DELIVERED, CANCELLED, RETURNED) so we
// don't hammer the server forever for fulfilled orders.

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Truck,
  Package,
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
  MapPin,
  Sparkles,
  MessageCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Money } from '@/components/ui/money';
import { useAppSelector } from '@/app/hooks';
import { useLookupOrderQuery } from '@/features/storefront/storefrontApi';

const TERMINAL_STATUSES = new Set(['DELIVERED', 'CANCELLED', 'RETURNED']);

const STAGE_FLOW = [
  { key: 'PENDING', label: 'Placed', Icon: Clock },
  { key: 'CONFIRMED', label: 'Confirmed', Icon: CheckCircle2 },
  { key: 'PACKED', label: 'Packed', Icon: Package },
  { key: 'SHIPPED', label: 'In transit', Icon: Truck },
  { key: 'DELIVERED', label: 'Delivered', Icon: CheckCircle2 },
] as const;

function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const local = digits.startsWith('91') ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(local)) return null;
  return `+91${local}`;
}

function eventIconFor(status: string): typeof Clock {
  switch (status) {
    case 'PENDING':
      return Clock;
    case 'CONFIRMED':
      return CheckCircle2;
    case 'PACKED':
      return Package;
    case 'SHIPPED':
      return Truck;
    case 'DELIVERED':
      return CheckCircle2;
    case 'CANCELLED':
      return XCircle;
    case 'RETURNED':
      return RotateCcw;
    default:
      return Clock;
  }
}

function formatEventTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const timePart = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today, ${timePart}`;
  if (isYesterday) return `Yesterday, ${timePart}`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + `, ${timePart}`;
}

export function TrackOrderPage(): JSX.Element {
  const { id: paramId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const accountPhone = useAppSelector((s) => s.shop.account.phone);

  const [id, setId] = useState(paramId ?? '');
  const [phone, setPhone] = useState(accountPhone || '+91 ');
  const [committed, setCommitted] = useState<{ id: string; phone: string } | null>(() => {
    // Auto-fire when both id (from URL) + phone (from persisted account) are present.
    if (paramId && accountPhone) {
      return { id: paramId, phone: accountPhone };
    }
    return null;
  });

  // Switch to polling once we have a successfully-loaded order. Stop polling
  // when the order reaches a terminal state. Two separate hook calls would be
  // cleaner here, but RTK Query reads pollingInterval from the same call that
  // returns the data — so we use a separate state to track terminal-ness and
  // avoid a temporal-dead-zone reference to the result we're destructuring.
  const [isTerminal, setIsTerminal] = useState(false);
  const lookup = useLookupOrderQuery(committed ?? { id: '', phone: '' }, {
    skip: !committed,
    pollingInterval: committed && !isTerminal ? 10_000 : 0,
  });
  const { data: order, isFetching, error, refetch } = lookup;

  useEffect(() => {
    if (order && TERMINAL_STATUSES.has(order.status)) setIsTerminal(true);
    else setIsTerminal(false);
  }, [order]);

  // Tiny visual heartbeat so the customer can see we're actively polling.
  // Pulses for ~1.5s every time a fresh fetch completes.
  const [pulsedAt, setPulsedAt] = useState<number>(0);
  useEffect(() => {
    if (!isFetching && committed) setPulsedAt(Date.now());
  }, [isFetching, committed]);

  // Keep the URL in sync with the looked-up order so the customer can
  // bookmark / share it. We only push when the id resolves cleanly to an
  // actual order — avoids polluting history if they typo.
  useEffect(() => {
    if (order && paramId !== order.id.slice(-6).toUpperCase()) {
      const short = order.id.slice(-6).toUpperCase();
      navigate(`/store/track/${short}`, { replace: true, state: { phone: committed?.phone } });
    }
  }, [order, paramId, navigate, committed]);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    const trimmedId = id.trim();
    if (trimmedId.length < 4) {
      toast.error('Please enter your order id');
      return;
    }
    const normalized = normalizePhone(phone);
    if (!normalized) {
      toast.error('Please enter a valid Indian phone number');
      return;
    }
    setCommitted({ id: trimmedId, phone: normalized });
  }

  const currentStageIdx = order ? STAGE_FLOW.findIndex((s) => s.key === order.status) : -1;
  const isCancelled = order?.status === 'CANCELLED' || order?.status === 'RETURNED';
  const eta = order?.expectedDeliveryAt
    ? new Date(order.expectedDeliveryAt).toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
      })
    : null;

  // Show the form when there's no committed lookup. Once a lookup is in
  // flight or resolved, hide the form and show the live timeline.
  if (!committed) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <header className="text-center">
          <p className="text-eyebrow uppercase text-ink-500">Track your order</p>
          <h1 className="font-display text-3xl sm:text-[44px] md:text-[52px] leading-tight text-ink-900 mt-3">
            Where is my piece?
          </h1>
          <p className="mt-3 text-sm text-ink-600 max-w-md mx-auto">
            Enter the order id (e.g. <span className="font-mono">ZL-AB12CD</span>) and the
            phone number you used at checkout.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="mt-8 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3"
        >
          <input
            required
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="ZL-AB12CD"
            className="h-12 px-4 rounded-full border border-ink-200 text-sm focus:border-brand-400 outline-none font-mono"
          />
          <input
            required
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98XXX XXXXX"
            className="h-12 px-4 rounded-full border border-ink-200 text-sm focus:border-brand-400 outline-none font-mono"
          />
          <button
            type="submit"
            className="h-12 px-7 rounded-full bg-ink-900 text-ink-0 text-sm font-medium hover:bg-ink-800 transition-colors"
          >
            Track
          </button>
        </form>
      </div>
    );
  }

  // Error state — id + phone didn't match any order.
  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <h1 className="font-display text-2xl sm:text-3xl text-ink-900">
          We couldn&apos;t find that order.
        </h1>
        <p className="mt-3 text-sm text-ink-600">
          Double-check the order id and the phone number you used at checkout. If you
          still can&apos;t find it, WhatsApp us — we&apos;ll look it up by name.
        </p>
        <button
          type="button"
          onClick={() => setCommitted(null)}
          className="mt-6 h-11 px-6 rounded-full border border-ink-200 text-sm hover:bg-ink-50"
        >
          Try a different order id
        </button>
      </div>
    );
  }

  // Loading skeleton — first fetch only.
  if (!order) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <div className="h-12 w-48 rounded bg-ink-100 animate-pulse" />
        <div className="mt-6 h-32 rounded-md bg-ink-100 animate-pulse" />
        <div className="mt-6 h-48 rounded-md bg-ink-100 animate-pulse" />
      </div>
    );
  }

  const isPulsing = Date.now() - pulsedAt < 1500;
  const displayId = `ZL-${order.id.slice(-6).toUpperCase()}`;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      {/* Header — order id + ETA + heartbeat */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8 sm:mb-10">
        <div className="min-w-0">
          <p className="text-eyebrow uppercase text-ink-500 flex items-center gap-2">
            Order
            <span
              className={`h-1.5 w-1.5 rounded-full transition-all ${
                isPulsing ? 'bg-success-500 scale-150' : 'bg-success-400'
              }`}
              aria-hidden
              title="Live — refreshing every 10 seconds"
            />
            <span className="text-[10px] text-ink-400 tracking-normal normal-case">
              live · auto-refreshing
            </span>
          </p>
          <p className="font-mono text-2xl sm:text-3xl text-ink-900 mt-1.5">{displayId}</p>
          <p className="text-xs text-ink-500 mt-1">
            Placed {new Date(order.createdAt).toLocaleString('en-IN')}
          </p>
        </div>
        {!isCancelled && eta && (
          <div className="text-left sm:text-right shrink-0">
            <p className="text-eyebrow uppercase text-ink-500">Arrives by</p>
            <p className="font-display text-xl sm:text-2xl text-ink-900 mt-1">{eta}</p>
            <p className="text-xs text-ink-500 mt-0.5 flex items-center gap-1.5 sm:justify-end">
              <Sparkles className="h-3 w-3 text-brand-600" />
              hand-finished &middot; tracked on WhatsApp
            </p>
          </div>
        )}
      </header>

      {/* Cancelled banner — replaces the stepper when terminal */}
      {isCancelled && (
        <div className="mb-8 rounded-md border border-danger-200 bg-danger-50 p-5">
          <div className="flex items-start gap-3">
            <XCircle className="h-5 w-5 text-danger-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-ink-900 font-medium">
                Order {order.status === 'CANCELLED' ? 'cancelled' : 'returned'}
              </p>
              {order.cancelReason && (
                <p className="text-sm text-ink-700 mt-1">{order.cancelReason}</p>
              )}
              <p className="text-xs text-ink-500 mt-2">
                If anything looks wrong, WhatsApp us — we&apos;ll fix it.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stepper — only for the active flow */}
      {!isCancelled && (
        <div className="mb-10">
          <div className="relative">
            <div className="absolute top-5 sm:top-6 left-5 right-5 h-px bg-ink-100" aria-hidden />
            <div
              className="absolute top-5 sm:top-6 left-5 h-px bg-brand-500 transition-all duration-500"
              style={{
                width: `calc(${
                  currentStageIdx <= 0 ? 0 : (currentStageIdx / (STAGE_FLOW.length - 1)) * 100
                }% - ${currentStageIdx <= 0 ? 0 : 40}px)`,
              }}
              aria-hidden
            />
            <ol className="grid grid-cols-5 gap-1 sm:gap-3 relative">
              {STAGE_FLOW.map((s, i) => {
                const reached = currentStageIdx >= i;
                const isCurrent = currentStageIdx === i;
                const Icon = s.Icon;
                return (
                  <li key={s.key} className="flex flex-col items-center text-center">
                    <div
                      className={`h-10 w-10 sm:h-12 sm:w-12 rounded-full inline-flex items-center justify-center transition-all ${
                        reached
                          ? 'bg-brand-500 text-ink-0 shadow-md shadow-brand-500/30'
                          : 'bg-ink-100 text-ink-400'
                      } ${isCurrent ? 'ring-4 ring-brand-100' : ''}`}
                    >
                      <Icon className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.6} />
                    </div>
                    <span
                      className={`mt-2 text-[10px] sm:text-xs leading-tight uppercase tracking-wider ${
                        reached ? 'text-ink-800 font-medium' : 'text-ink-400'
                      }`}
                    >
                      {s.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}

      {/* Timeline — every recorded event, latest first */}
      <section className="mb-10">
        <p className="text-eyebrow uppercase text-ink-500 mb-4">Activity</p>
        <ol className="relative space-y-5 sm:space-y-6 pl-7 sm:pl-8 before:absolute before:left-2.5 sm:before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-ink-100">
          {[...order.events].reverse().map((evt, i) => {
            const Icon = eventIconFor(evt.status);
            const isLatest = i === 0;
            return (
              <li key={evt.id} className="relative">
                <span
                  className={`absolute -left-7 sm:-left-8 top-0 h-6 w-6 rounded-full inline-flex items-center justify-center ${
                    isLatest ? 'bg-ink-900 text-ink-0' : 'bg-ink-100 text-ink-500'
                  }`}
                  aria-hidden
                >
                  <Icon className="h-3 w-3" strokeWidth={1.8} />
                </span>
                <p className={`text-sm ${isLatest ? 'text-ink-900 font-medium' : 'text-ink-700'}`}>
                  {evt.note ?? evt.status}
                </p>
                <p className="text-xs text-ink-500 mt-0.5">{formatEventTime(evt.createdAt)}</p>
                {evt.location && (
                  <p className="text-xs text-ink-600 mt-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {evt.location}
                  </p>
                )}
                {evt.actorName && (
                  <p className="text-[10px] text-ink-400 mt-1 uppercase tracking-wider">
                    via {evt.actorName}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {/* AWB pill */}
      {order.shiprocketAwb && (
        <div className="mb-10 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ink-25 border border-ink-100 text-sm">
          <Truck className="h-4 w-4 text-ink-600" />
          <span className="text-ink-600">Courier:</span>
          <span className="font-mono text-ink-900">{order.shiprocketAwb}</span>
        </div>
      )}

      {/* Items */}
      <section className="mb-10">
        <p className="text-eyebrow uppercase text-ink-500 mb-4">Your pieces</p>
        <ul className="divide-y divide-ink-100 rounded-md border border-ink-100 bg-ink-0">
          {order.items.map((it) => (
            <li key={it.id} className="p-4 sm:p-5 flex items-center gap-4">
              {it.product?.images?.[0] && (
                <img
                  src={it.product.images[0]}
                  alt={it.product.name}
                  className="h-14 w-14 sm:h-16 sm:w-16 rounded object-cover bg-ink-50"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm sm:text-base text-ink-900 truncate">
                  {it.product?.name ?? 'Piece'}
                </p>
                <p className="text-xs text-ink-500 mt-0.5">Qty {it.qty}</p>
              </div>
              <Money
                paise={it.pricePaise * it.qty}
                className="font-mono tabular-nums text-sm text-ink-900"
              />
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center justify-between text-sm border-t border-ink-100 pt-4">
          <span className="text-ink-500">Total</span>
          <Money paise={order.totalPaise} className="font-mono tabular-nums text-base text-ink-900" />
        </div>
      </section>

      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={() => void refetch()}
          className="flex-1 h-12 rounded-full border border-ink-200 text-ink-900 text-sm hover:bg-ink-50 transition-colors"
        >
          Refresh now
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`Hi, I have a question about my order ${displayId}.`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 h-12 rounded-full bg-ink-900 text-ink-0 text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-ink-800 transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          Ask on WhatsApp
        </a>
      </div>
    </div>
  );
}
