import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  User,
  LogOut,
  Heart,
  ShoppingBag,
  MapPin,
  Phone,
  Mail,
  Package,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  Pencil,
  Sparkles,
  Calendar,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { hydrateFromServer, signOut } from '@/features/storefront/shopSlice';
import {
  useIdentifyCustomerMutation,
  useListOrdersByPhoneQuery,
} from '@/features/storefront/storefrontApi';
import { toast } from 'sonner';
import { Money } from '@/components/ui/money';
import { OrderReviewSheet, StarRating } from './OrderReviewSheet';

// Payment method → human label. Drives the small payment chip on each
// order row + the order-detail / track-order surfaces. Kept centralised so
// every place that shows an order gets the same vocabulary ("Online" not
// "Razorpay", "Cash on delivery" not "cod").
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cod: 'Cash on delivery',
  razorpay: 'Paid online',
  'reserve-at-store': 'Pay at store',
};

// Payment status → colour + label. PAID always renders green; PENDING is
// neutral for COD/Reserve-at-store and warning for online (because online
// PENDING means the customer left mid-checkout). FAILED is red so retries
// are obvious.
const PAYMENT_STATUS_TONE: Record<string, string> = {
  PAID: 'bg-success-50 text-success-700 border-success-100',
  PENDING: 'bg-ink-50 text-ink-600 border-ink-100',
  FAILED: 'bg-danger-50 text-danger-700 border-danger-100',
};

const STATUS_LABEL: Record<string, { label: string; tone: string; Icon: typeof Clock }> = {
  PENDING:   { label: 'Pending',    tone: 'bg-warning-50 text-warning-700 border-warning-100', Icon: Clock },
  CONFIRMED: { label: 'Confirmed',  tone: 'bg-info-50 text-info-700 border-info-100', Icon: CheckCircle2 },
  PACKED:    { label: 'Packed',     tone: 'bg-info-50 text-info-700 border-info-100', Icon: Package },
  SHIPPED:   { label: 'In transit', tone: 'bg-info-50 text-info-700 border-info-100', Icon: Truck },
  DELIVERED: { label: 'Delivered',  tone: 'bg-success-50 text-success-700 border-success-100', Icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled',  tone: 'bg-ink-50 text-ink-600 border-ink-100', Icon: XCircle },
  RETURNED:  { label: 'Returned',   tone: 'bg-ink-50 text-ink-600 border-ink-100', Icon: XCircle },
};

export function AccountPage(): JSX.Element {
  const account = useAppSelector((s) => s.shop.account);
  const localCart = useAppSelector((s) => s.shop.cart);
  const localWishlist = useAppSelector((s) => s.shop.wishlist);
  const wishlistCount = useAppSelector((s) => s.shop.wishlist.length);
  const cartCount = useAppSelector((s) => s.shop.cart.length);
  const dispatch = useAppDispatch();

  // Tab state for the auth wall: "sign-in" returns existing customers in one
  // tap (phone only); "register" captures the profile for new accounts. Same
  // /customers/identify endpoint backs both — the tab just decides which
  // fields we collect + how to handle the response (existing vs. new).
  const [authTab, setAuthTab] = useState<'sign-in' | 'register'>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pincode, setPincode] = useState('');
  const [identify, { isLoading: signingIn }] = useIdentifyCustomerMutation();

  // Self-heal legacy localStorage: older sign-ins (before AuthSheet existed)
  // wrote raw input via the local-only `signIn` reducer, so the visitor ends
  // up with account.signedIn=true but no customerId and a non-E.164 phone.
  // Those accounts can't fetch orders by customerId (the new robust path),
  // so we transparently re-identify against the server on mount — phone gets
  // normalized to E.164, customerId is populated, and any local-only cart
  // or wishlist items get pushed up so nothing's lost in the rehydrate.
  const healedRef = useRef(false);
  useEffect(() => {
    if (healedRef.current) return;
    if (!account.signedIn) return;
    if (account.customerId) return; // already healthy
    if (!account.phone) return;
    const digits = account.phone.replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(digits)) return; // can't normalize — bail
    healedRef.current = true;
    const e164 = `+91${digits}`;
    const mergeCart = localCart
      .filter((c): c is typeof c & { productId: string } => Boolean(c.productId))
      .map((c) => ({ productId: c.productId, qty: c.qty }));
    const mergeWishlist = localWishlist
      .filter((w): w is typeof w & { productId: string } => Boolean(w.productId))
      .map((w) => ({ productId: w.productId }));
    (async () => {
      try {
        const res = await identify({
          phone: e164,
          name: account.name || undefined,
          email: account.email || undefined,
          mergeCart: mergeCart.length > 0 ? mergeCart : undefined,
          mergeWishlist: mergeWishlist.length > 0 ? mergeWishlist : undefined,
          intent: 'browse',
        }).unwrap();
        dispatch(
          hydrateFromServer({
            customer: {
              ...res.customer,
              email: account.email || res.customer.email,
            },
            cart: res.cart,
            wishlist: res.wishlist,
          }),
        );
      } catch {
        // Silent — if the heal fails (e.g. server is down) the page still
        // works with the old localStorage state; user can still browse and
        // sign in fresh via /store later.
      }
    })();
  }, [
    account.signedIn,
    account.customerId,
    account.phone,
    account.name,
    account.email,
    dispatch,
    identify,
    localCart,
    localWishlist,
  ]);

  // Sign-in path: phone only. We probe the server with just the phone — if
  // the customer exists with a real name (anything other than the placeholder
  // "Customer") we hydrate and we're done. If the row doesn't exist OR was
  // created as a placeholder by an order-flow, we redirect the user to the
  // Create account tab (the name is the first piece of profile we want
  // captured before treating it as an actual account).
  async function handleSignIn(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!/^[6-9]\d{9}$/.test(phone)) {
      toast.error('Enter a valid 10-digit Indian phone number');
      return;
    }
    try {
      const res = await identify({ phone: `+91${phone}`, intent: 'browse' }).unwrap();
      const hasRealName = Boolean(res.customer.name) && res.customer.name !== 'Customer';
      if (res.isNew || !hasRealName) {
        toast.error("We couldn't find an account for that number. Create one in a few seconds.");
        setAuthTab('register');
        return;
      }
      dispatch(
        hydrateFromServer({
          customer: res.customer,
          cart: res.cart,
          wishlist: res.wishlist,
        }),
      );
      toast.success(`Welcome back, ${res.customer.name.split(' ')[0]}`);
    } catch (err) {
      const msg = (err as { data?: { error?: { message?: string } } }).data?.error?.message
        ?? 'Could not sign in. Please try again.';
      toast.error(msg);
    }
  }

  // Register path: full profile capture. The same identify endpoint upserts
  // the row, server-side also fires a Lead so the sales team sees the signup.
  async function handleRegister(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error('Please enter your full name');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(phone)) {
      toast.error('Enter a valid 10-digit Indian phone number');
      return;
    }
    try {
      const res = await identify({
        phone: `+91${phone}`,
        name: name.trim(),
        email: email.trim() || undefined,
        pincode: pincode.trim() || undefined,
        intent: 'browse',
      }).unwrap();
      dispatch(
        hydrateFromServer({
          customer: { ...res.customer, email: email.trim() || res.customer.email },
          cart: res.cart,
          wishlist: res.wishlist,
        }),
      );
      toast.success(
        res.isNew
          ? `Account created. Welcome, ${name.trim().split(' ')[0]}!`
          : `Welcome back, ${res.customer.name.split(' ')[0]}`,
      );
    } catch (err) {
      const msg = (err as { data?: { error?: { message?: string } } }).data?.error?.message
        ?? 'Could not create account. Please try again.';
      toast.error(msg);
    }
  }

  if (!account.signedIn) {
    const isSignIn = authTab === 'sign-in';
    return (
      <div className="max-w-md w-full mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="mx-auto h-14 w-14 rounded-full bg-brand-50 flex items-center justify-center">
          <User className="h-6 w-6 text-brand-700" />
        </div>
        <h1 className="font-display text-2xl sm:text-[32px] text-ink-900 text-center mt-6">
          {isSignIn ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="text-center text-sm text-ink-600 mt-2">
          {isSignIn
            ? 'Sign in with your phone number to access your orders and saved pieces.'
            : 'Just a few details so we can ship to you and stay in touch.'}
        </p>

        {/* Tabs — Amazon-style two-track auth. Returning customers tap the
            left tab; first-timers tap the right. The phone field is shared
            so switching tabs doesn't make them retype. */}
        <div
          role="tablist"
          aria-label="Sign in or create account"
          className="mt-8 sm:mt-10 grid grid-cols-2 rounded-full bg-ink-50 p-1 text-sm"
        >
          <button
            type="button"
            role="tab"
            aria-selected={isSignIn}
            onClick={() => setAuthTab('sign-in')}
            className={`h-10 rounded-full transition-colors ${
              isSignIn ? 'bg-ink-0 text-ink-900 shadow-sm font-medium' : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isSignIn}
            onClick={() => setAuthTab('register')}
            className={`h-10 rounded-full transition-colors ${
              !isSignIn ? 'bg-ink-0 text-ink-900 shadow-sm font-medium' : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            Create account
          </button>
        </div>

        {isSignIn ? (
          <form className="mt-6 space-y-4" onSubmit={handleSignIn}>
            <Field
              label="Phone"
              value={phone}
              onChange={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
              placeholder="98XXXXXXXX"
              required
            />
            <button
              type="submit"
              disabled={signingIn}
              className="w-full h-12 rounded-full bg-brand-400 text-ink-900 text-sm font-medium hover:bg-brand-300 disabled:opacity-60 transition-colors"
            >
              {signingIn ? 'Signing in…' : 'Continue'}
            </button>
            <p className="text-[11px] text-ink-500 text-center leading-relaxed">
              New to Zelora?{' '}
              <button
                type="button"
                onClick={() => setAuthTab('register')}
                className="underline decoration-ink-200 underline-offset-4 hover:text-ink-700"
              >
                Create an account
              </button>
            </p>
          </form>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleRegister}>
            <Field label="Full name" value={name} onChange={setName} placeholder="Your full name" required />
            <Field
              label="Phone"
              value={phone}
              onChange={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
              placeholder="98XXXXXXXX"
              required
            />
            <Field label="Email (optional)" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
            <Field
              label="Pincode (optional)"
              value={pincode}
              onChange={(v) => setPincode(v.replace(/\D/g, '').slice(0, 6))}
              placeholder="122001"
            />
            <button
              type="submit"
              disabled={signingIn}
              className="w-full h-12 rounded-full bg-brand-400 text-ink-900 text-sm font-medium hover:bg-brand-300 disabled:opacity-60 transition-colors"
            >
              {signingIn ? 'Creating account…' : 'Create account'}
            </button>
            <p className="text-[11px] text-ink-500 text-center leading-relaxed">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setAuthTab('sign-in')}
                className="underline decoration-ink-200 underline-offset-4 hover:text-ink-700"
              >
                Sign in
              </button>
            </p>
          </form>
        )}

        <p className="text-[11px] text-ink-500 text-center leading-relaxed mt-5">
          By continuing you agree to our{' '}
          <Link to="/store/terms" className="underline decoration-ink-200 underline-offset-4">terms</Link> and{' '}
          <Link to="/store/privacy" className="underline decoration-ink-200 underline-offset-4">privacy policy</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#FDF8F4]">
    <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 md:py-14">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-6">
        <div className="min-w-0">
          <p className="text-eyebrow uppercase text-brand-700">Your account</p>
          <h1 className="font-display text-2xl sm:text-[34px] md:text-[40px] text-ink-900 mt-2">Hi, {account.name.split(' ')[0]}</h1>
          <p className="text-sm text-ink-600 mt-2 break-words">
            Signed in as {account.phone}
            {account.email ? ` · ${account.email}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => dispatch(signOut())}
          className="self-start sm:self-auto inline-flex items-center gap-2 h-10 px-5 rounded-full border border-[#EFE0D2] bg-ink-0 text-sm text-ink-700 hover:bg-[#FAF3EE] transition-colors shrink-0"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </header>

      <MyOrders
        phone={account.phone}
        customerId={account.customerId}
        wishlistCount={wishlistCount}
        cartCount={cartCount}
      />

      <section className="mt-8 sm:mt-10 rounded-md border border-ink-100 bg-ink-25 p-5 sm:p-6">
        <p className="text-eyebrow uppercase text-brand-700">Contact details</p>
        <ul className="mt-4 space-y-3 text-sm text-ink-800">
          <li className="flex items-center gap-3"><User className="h-4 w-4 text-ink-500" />{account.name}</li>
          <li className="flex items-center gap-3"><Phone className="h-4 w-4 text-ink-500" />{account.phone}</li>
          {account.email && <li className="flex items-center gap-3"><Mail className="h-4 w-4 text-ink-500" />{account.email}</li>}
        </ul>
      </section>
    </div>
    </div>
  );
}

function MyOrders({
  phone,
  customerId,
  wishlistCount,
  cartCount,
}: {
  phone: string;
  customerId: string | undefined;
  wishlistCount: number;
  cartCount: number;
}): JSX.Element {
  // Poll every 20s while the account page is open so a status change pushed
  // from admin shows up without a refresh. Skip entirely if the customer
  // hasn't given us a phone (the lookup is phone-keyed). `customerId` is
  // passed when present — the server prefers it because joining on the
  // immutable PK is immune to phone-format drift.
  const { data: orders = [], isLoading } = useListOrdersByPhoneQuery(
    { phone, customerId },
    { skip: !phone, pollingInterval: 20_000 },
  );

  // Local state for the review sheet — `orderId` of the order being reviewed,
  // or null when closed. Lifting this to MyOrders lets a single sheet instance
  // serve every order row.
  const [reviewingOrderId, setReviewingOrderId] = useState<string | null>(null);
  const reviewingOrder = orders.find((o) => o.id === reviewingOrderId) ?? null;

  // Lifetime stats computed from the order list. Cancelled/returned orders
  // are excluded from total-spent so the headline number reflects realised
  // value, not "amount touched". `memberSince` is the oldest order date.
  const stats = useMemo(() => {
    if (orders.length === 0) {
      return { totalOrders: 0, totalSpentPaise: 0, memberSince: null as Date | null };
    }
    const valid = orders.filter((o) => !['CANCELLED', 'RETURNED'].includes(o.status));
    const totalSpent = valid.reduce((s, o) => s + o.totalPaise, 0);
    const memberSince = orders.reduce(
      (min, o) => {
        const d = new Date(o.createdAt);
        return min == null || d < min ? d : min;
      },
      null as Date | null,
    );
    return { totalOrders: orders.length, totalSpentPaise: totalSpent, memberSince };
  }, [orders]);

  const open = orders.filter((o) => !['DELIVERED', 'CANCELLED', 'RETURNED'].includes(o.status));
  const inTransit = orders.filter((o) => o.status === 'SHIPPED');

  return (
    <>
      {/* Lifetime stats — only shown for returning customers with at least
          one order. Keeps the first-time visitor's page from feeling empty
          with three zero-state lines. */}
      {stats.totalOrders > 0 && (
        <section className="mt-8 sm:mt-10 relative overflow-hidden rounded-lg border border-brand-200/60 bg-gradient-to-br from-brand-50/70 via-ink-0 to-ink-0">
          <div aria-hidden className="absolute inset-0 bg-hairlines opacity-25 pointer-events-none" />
          <div className="relative grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-ink-100">
            <Stat
              icon={<Calendar className="h-4 w-4 text-brand-600" />}
              label="Customer since"
              value={
                stats.memberSince
                  ? stats.memberSince.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
                  : '—'
              }
            />
            <Stat
              icon={<Package className="h-4 w-4 text-brand-600" />}
              label="Orders placed"
              value={String(stats.totalOrders)}
            />
            <Stat
              icon={<Sparkles className="h-4 w-4 text-brand-600" />}
              label="Lifetime value"
              value={<Money paise={stats.totalSpentPaise} />}
            />
          </div>
        </section>
      )}

      <div className="mt-8 sm:mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Tile
          to="/store/wishlist"
          icon={<Heart className="h-4 w-4 text-brand-700" />}
          label="Wishlist"
          value={`${wishlistCount} ${wishlistCount === 1 ? 'piece' : 'pieces'}`}
        />
        <Tile
          to="/store/cart"
          icon={<ShoppingBag className="h-4 w-4 text-brand-700" />}
          label="Bag"
          value={`${cartCount} ${cartCount === 1 ? 'piece' : 'pieces'}`}
        />
        <Tile
          to={inTransit.length === 1 ? `/store/track/${inTransit[0]!.id.slice(-6).toUpperCase()}` : '/store/track'}
          icon={<MapPin className="h-4 w-4 text-brand-700" />}
          label="In transit"
          value={inTransit.length > 0 ? `${inTransit.length} on the way` : open.length > 0 ? `${open.length} open` : 'None'}
        />
      </div>

      <section className="mt-8 sm:mt-10">
        <header className="flex items-center justify-between mb-4">
          <h2 className="text-eyebrow uppercase text-brand-700">My orders</h2>
          {orders.length > 0 && (
            <span className="text-xs text-ink-500">{orders.length} total</span>
          )}
        </header>
        {isLoading && (
          <p className="text-sm text-ink-500">Loading your orders…</p>
        )}
        {!isLoading && orders.length === 0 && (
          <div className="rounded-md border border-ink-100 bg-ink-0 p-6 text-center">
            <Package className="h-6 w-6 text-ink-400 mx-auto" />
            <p className="text-sm text-ink-700 mt-3">No orders yet.</p>
            <p className="text-xs text-ink-500 mt-1">
              Place your first order and it&apos;ll show up here automatically.
            </p>
            <Link
              to="/store/collections/bridal"
              className="inline-block mt-4 h-10 px-5 rounded-full bg-ink-900 text-ink-0 text-xs font-medium leading-[2.5rem]"
            >
              Browse collections
            </Link>
          </div>
        )}
        {orders.length > 0 && (
          <ul className="space-y-3">
            {orders.map((o) => {
              const meta = STATUS_LABEL[o.status] ?? STATUS_LABEL.PENDING!;
              const Icon = meta.Icon;
              const firstImage = o.items.find((i) => i.product?.images?.[0])?.product?.images?.[0];
              const titleLine =
                o.items.length === 1
                  ? o.items[0]!.product?.name ?? 'Piece'
                  : `${o.items[0]!.product?.name ?? 'Piece'} + ${o.items.length - 1} more`;
              const canReview = o.status === 'DELIVERED' && !o.review;
              const hasReview = !!o.review;
              return (
                <li key={o.id} className="rounded-md border border-ink-100 bg-ink-0 overflow-hidden">
                  {/* Top row — the existing tap-target that opens the
                      track page. Kept clickable so order tracking is a
                      single tap away. */}
                  <Link
                    to={`/store/track/${o.id.slice(-6).toUpperCase()}`}
                    className="flex items-center gap-4 p-4 hover:bg-ink-25 transition-colors"
                  >
                    {firstImage ? (
                      <img src={firstImage} alt="" className="h-14 w-14 rounded object-cover bg-ink-50" />
                    ) : (
                      <div className="h-14 w-14 rounded bg-ink-50 flex items-center justify-center">
                        <Package className="h-5 w-5 text-ink-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink-900 truncate font-medium">{titleLine}</p>
                      <p className="font-mono text-xs text-ink-500 mt-0.5">
                        ZL-{o.id.slice(-6).toUpperCase()} &middot;{' '}
                        {new Date(o.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <span
                      className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border ${meta.tone}`}
                    >
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </span>
                    <Money paise={o.totalPaise} className="font-mono tabular-nums text-sm text-ink-900 w-24 text-right shrink-0" />
                  </Link>

                  {/* Footer row — review affordance + track shortcut. Renders
                      different content depending on whether the order is
                      reviewable, already reviewed, or still in flight. */}
                  <footer
                    className={`px-4 py-2.5 border-t border-ink-50 flex flex-wrap items-center gap-2 sm:gap-3 ${
                      hasReview ? 'bg-brand-50/30' : 'bg-ink-25/40'
                    }`}
                  >
                    {/* Mobile: status pill (hidden on sm+ since it shows in the row above). */}
                    <span
                      className={`sm:hidden inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border ${meta.tone}`}
                    >
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </span>

                    {/* Payment chip — visible on every order, every breakpoint.
                        Combines the method (Cash on delivery / Paid online /
                        Pay at store) with the payment-status colour so the
                        customer can see at a glance whether they still owe
                        money on a COD shipment. */}
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border ${
                        PAYMENT_STATUS_TONE[o.paymentStatus] ?? PAYMENT_STATUS_TONE.PENDING!
                      }`}
                      title={`Payment: ${o.paymentStatus.toLowerCase()}`}
                    >
                      {PAYMENT_METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod}
                      {o.paymentStatus === 'PAID' ? ' · paid' : o.paymentStatus === 'FAILED' ? ' · failed' : ''}
                    </span>

                    {hasReview && o.review && (
                      <div className="flex items-center gap-2 min-w-0">
                        <StarRating rating={o.review.rating} />
                        <span className="text-xs text-ink-700 truncate">
                          {o.review.title
                            ? <span className="font-medium text-ink-900">{o.review.title}</span>
                            : <span className="italic text-ink-600">&ldquo;{o.review.body.slice(0, 60)}{o.review.body.length > 60 ? '…' : ''}&rdquo;</span>}
                        </span>
                      </div>
                    )}

                    {canReview && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setReviewingOrderId(o.id); }}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-ink-900 text-ink-0 text-xs font-medium hover:bg-ink-800 transition-colors"
                      >
                        <Pencil className="h-3 w-3" />
                        Write a review
                      </button>
                    )}

                    <Link
                      to={`/store/track/${o.id.slice(-6).toUpperCase()}`}
                      className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-ink-200 text-xs text-ink-700 hover:bg-ink-50 transition-colors"
                    >
                      <Truck className="h-3 w-3" />
                      Track order
                    </Link>
                  </footer>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Single sheet instance — reopens with fresh state for each order. */}
      {reviewingOrder && (
        <OrderReviewSheet
          open={!!reviewingOrderId}
          onClose={() => setReviewingOrderId(null)}
          orderId={reviewingOrder.id}
          phone={phone}
          orderLabel={
            reviewingOrder.items.length === 1
              ? reviewingOrder.items[0]!.product?.name ?? 'Your order'
              : `${reviewingOrder.items[0]!.product?.name ?? 'Your order'} + ${reviewingOrder.items.length - 1} more`
          }
          thumbUrl={reviewingOrder.items.find((i) => i.product?.images?.[0])?.product?.images?.[0]}
        />
      )}

      {/* Soft prompt under the orders list — gentle reminder for delivered
          orders that haven't been reviewed yet. Stays understated; doesn't
          interrupt the page if nothing needs reviewing. */}
      {(() => {
        const pendingReviews = orders.filter((o) => o.status === 'DELIVERED' && !o.review);
        if (pendingReviews.length === 0) return null;
        return (
          <p className="mt-4 text-xs text-ink-500 inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-brand-500" />
            {pendingReviews.length} delivered order{pendingReviews.length === 1 ? '' : 's'} waiting for your review — your feedback helps other shoppers.
          </p>
        );
      })()}
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}): JSX.Element {
  return (
    <label className="block">
      <span className="text-eyebrow uppercase text-brand-700 block mb-2">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full h-12 px-4 bg-ink-25 rounded-md border border-ink-100 text-sm text-ink-900 placeholder:text-ink-400 focus:bg-ink-0 focus:border-brand-300 outline-none transition-colors"
      />
    </label>
  );
}

function Tile({ to, icon, label, value }: { to: string; icon: React.ReactNode; label: string; value: string }): JSX.Element {
  return (
    <Link to={to} className="block rounded-md border border-ink-100 bg-ink-0 p-5 hover:border-ink-300 transition-colors">
      <div className="h-8 w-8 rounded-full bg-brand-50 inline-flex items-center justify-center">{icon}</div>
      <p className="mt-4 text-eyebrow uppercase text-brand-700">{label}</p>
      <p className="text-lg text-ink-900 mt-1">{value}</p>
    </Link>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}): JSX.Element {
  return (
    <div className="px-5 sm:px-6 py-4 sm:py-5">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">
          {label}
        </p>
      </div>
      <p className="font-display text-xl sm:text-2xl text-ink-900 mt-1.5 tabular-nums">{value}</p>
    </div>
  );
}
