// Post-checkout landing. CartPage navigates here on success with the new
// order id + phone passed via location.state. We hydrate from the public
// lookup endpoint so the page reads exactly what the customer will see on
// the track page (single source of truth — no second representation of
// "your order"). Falls back to a graceful "look up by phone" form if the
// URL is hit directly without state.

import { useEffect } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, ArrowRight, MessageCircle, Sparkles } from 'lucide-react';
import { Money } from '@/components/ui/money';
import { useAppSelector } from '@/app/hooks';
import { useLookupOrderQuery } from '@/features/storefront/storefrontApi';

interface SuccessState {
  phone?: string;
  totalPaise?: number;
  expectedDeliveryAt?: string | null;
}

export function OrderSuccessPage(): JSX.Element {
  const { id = '' } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const accountPhone = useAppSelector((s) => s.shop.account.phone);
  const passed = (location.state ?? {}) as SuccessState;
  // Prefer the phone the customer just typed at checkout (carried via
  // navigate state) over the persisted account phone — if someone is using
  // a shared device, the freshly-typed number is the right one.
  const phone = passed.phone || accountPhone || '';
  const display = `ZL-${id.slice(-6).toUpperCase()}`;

  // Only fetch when we have both id and phone. Without phone the lookup
  // endpoint returns 404 (it's the auth gate), so we'd render a noisy error
  // banner on what's supposed to be the happiest screen in the funnel.
  const { data: order, isLoading } = useLookupOrderQuery(
    { id, phone },
    { skip: !id || !phone },
  );

  // If we landed here cold without an id (e.g. user pasted the route), send
  // them to the track form so they can look up by id + phone instead.
  useEffect(() => {
    if (!id) navigate('/store/track', { replace: true });
  }, [id, navigate]);

  const etaIso = order?.expectedDeliveryAt ?? passed.expectedDeliveryAt ?? null;
  const eta = etaIso
    ? new Date(etaIso).toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
      })
    : null;
  const totalPaise = order?.totalPaise ?? passed.totalPaise ?? null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <header className="text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-success-50 flex items-center justify-center mb-5">
          <CheckCircle2 className="h-7 w-7 text-success-600" strokeWidth={1.5} />
        </div>
        <p className="text-eyebrow uppercase text-ink-500">Order placed</p>
        <h1 className="font-display text-3xl sm:text-[44px] md:text-[52px] leading-tight text-ink-900 mt-3">
          Thank you{order?.customer?.name ? `, ${order.customer.name.split(' ')[0]}` : ''}.
        </h1>
        <p className="mt-3 text-sm sm:text-base text-ink-600 max-w-md mx-auto">
          {phone ? (
            <>
              Your order has been received. We&apos;ll WhatsApp the rate lock and a
              tracking link to{' '}
              <span className="font-mono text-ink-800">{phone}</span> within the next hour.
            </>
          ) : (
            <>Your order has been received. We&apos;ll WhatsApp the rate lock and a tracking link within the next hour.</>
          )}
        </p>
      </header>

      <section className="mt-8 sm:mt-10 rounded-xl border border-ink-100 bg-ink-0 overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-ink-100">
          <div className="p-6 sm:p-8">
            <p className="text-eyebrow uppercase text-ink-500">Order id</p>
            <p className="font-mono text-2xl sm:text-3xl text-ink-900 mt-2 tracking-wide">
              {display}
            </p>
            <p className="text-xs text-ink-500 mt-2">
              Save this — you&apos;ll need it to track. We&apos;ll also include it on
              WhatsApp.
            </p>
          </div>
          <div className="p-6 sm:p-8">
            <p className="text-eyebrow uppercase text-ink-500">Arrives by</p>
            <p className="font-display text-2xl sm:text-3xl text-ink-900 mt-2">
              {eta ?? '5 business days'}
            </p>
            <p className="text-xs text-ink-500 mt-2 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-brand-600" />
              Hand-finished in Haryana &middot; shipped India-wide
            </p>
          </div>
        </div>

        {totalPaise !== null && (
          <div className="px-6 sm:px-8 py-4 border-t border-ink-100 bg-ink-25 flex items-center justify-between">
            <span className="text-sm text-ink-500">Order total</span>
            <Money paise={totalPaise} className="font-mono tabular-nums text-lg text-ink-900" />
          </div>
        )}
      </section>

      {/* Pieces */}
      {order && order.items.length > 0 && (
        <section className="mt-6">
          <p className="text-eyebrow uppercase text-ink-500 mb-3">In your order</p>
          <ul className="divide-y divide-ink-100 rounded-md border border-ink-100 bg-ink-0">
            {order.items.map((it) => (
              <li key={it.id} className="p-4 flex items-center gap-4">
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
        </section>
      )}

      <section className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-3">
        <Link
          to={`/store/track/${id}`}
          state={{ phone }}
          className="flex-1 h-12 rounded-full bg-ink-900 text-ink-0 text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-ink-800 transition-colors"
        >
          Track your order
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          to="/store"
          className="flex-1 h-12 rounded-full border border-ink-200 text-ink-900 text-sm font-medium inline-flex items-center justify-center hover:bg-ink-50 transition-colors"
        >
          Continue shopping
        </Link>
      </section>

      <p className="mt-6 text-center text-xs text-ink-500 flex items-center justify-center gap-1.5">
        <MessageCircle className="h-3.5 w-3.5" />
        Questions? WhatsApp us — we reply within 30 minutes during shop hours.
      </p>

      {isLoading && !order && (
        <p className="mt-4 text-center text-xs text-ink-400">Loading your order details…</p>
      )}
    </div>
  );
}
