import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { Minus, Plus, Trash2, ShoppingBag, ShieldCheck, Truck, RotateCcw, X, BadgeCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Money } from '@/components/ui/money';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { updateAccount, hydrateFromServer } from '@/features/storefront/shopSlice';
import { useShopActions } from '@/features/storefront/useShopActions';
import {
  useGetPublicProductsQuery,
  useGetCartAvailabilityQuery,
  useCreatePublicOrderMutation,
  useVerifyRazorpayPaymentMutation,
} from '@/features/storefront/storefrontApi';
import { useIdentifyCustomerMutation } from '@/features/storefront/customerApi';
import { openRazorpayCheckout } from '@/lib/razorpay';
import { useComputeCheckoutPricingMutation } from '@/features/promotions/promotionsApi';
import type { PricingBreakdown } from '@/features/promotions/promotionsApi';
import { CouponInput } from '@/features/promotions/CouponInput';
import { LoyaltyToggle } from '@/features/promotions/LoyaltyToggle';
import { PriceSummary } from '@/features/promotions/PriceSummary';

export function CartPage(): JSX.Element {
  const cart = useAppSelector((s) => s.shop.cart);
  const shop = useShopActions();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [sidebarPricing, setSidebarPricing] = useState<PricingBreakdown | null>(null);
  const [computeSidebarPricing, { isLoading: isSidebarPricingLoading }] = useComputeCheckoutPricingMutation();

  // Live availability for the bag. Sorted + de-duped so the RTK cache key is
  // stable regardless of cart order. Skipped for an empty bag.
  const cartSlugs = useMemo(
    () => Array.from(new Set(cart.map((c) => c.slug))).sort(),
    [cart],
  );
  const { data: availability } = useGetCartAvailabilityQuery(cartSlugs, {
    skip: cartSlugs.length === 0,
    refetchOnMountOrArgChange: true,
  });
  const statusBySlug = useMemo(() => {
    const m = new Map<string, { available: boolean; inStock: boolean }>();
    for (const a of availability ?? []) m.set(a.slug, { available: a.available, inStock: a.inStock });
    return m;
  }, [availability]);
  // A line is "sold out" when the piece still exists but has no stock. A line is
  // "gone" (deleted/unpublished) when it's absent from the availability result.
  // Until availability loads we treat everything as fine (optimistic) so the bag
  // doesn't flicker.
  const isSoldOut = useCallback(
    (slug: string): boolean => {
      const s = statusBySlug.get(slug);
      return Boolean(s && s.available && !s.inStock);
    },
    [statusBySlug],
  );
  const hasSoldOut = cart.some((c) => isSoldOut(c.slug));

  // Auto-remove pieces that were deleted / unpublished from inventory — they can
  // never be ordered, so drop them from the bag (with a heads-up) instead of
  // leaving a dead line. Sold-out pieces are KEPT (badged) so the shopper sees
  // what happened and can remove them themselves. Depends only on `availability`
  // so it re-runs when fresh data arrives, not on every render; after removal
  // the refetch returns without the gone slugs, so it converges.
  useEffect(() => {
    if (!availability) return;
    const gone = cart.filter((c) => statusBySlug.get(c.slug)?.available === false);
    if (gone.length === 0) return;
    for (const g of gone) shop.removeFromCart(g.slug, g.productId);
    toast.message(
      gone.length === 1
        ? `“${gone[0]!.name}” is no longer available — removed from your bag.`
        : `${gone.length} pieces are no longer available — removed from your bag.`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability]);

  // Only in-stock, available lines count toward the total + checkout. Sold-out
  // lines stay visible but are excluded until removed.
  const orderableCart = useMemo(() => cart.filter((c) => !isSoldOut(c.slug)), [cart, isSoldOut]);
  const subtotal = orderableCart.reduce((sum, item) => sum + item.pricePaise * item.qty, 0);

  const refreshSidebarPricing = useCallback(async (code: string | null) => {
    const items = orderableCart.map((c) => ({ slug: c.slug, qty: c.qty, sizeLabel: c.size }));
    if (items.length === 0) { setSidebarPricing(null); return; }
    try {
      const result = await computeSidebarPricing({ cart_items: items, coupon_code: code ?? undefined }).unwrap();
      setSidebarPricing(result);
    } catch { setSidebarPricing(null); }
  }, [orderableCart, computeSidebarPricing]);

  // Compute the full breakdown (incl. sale-wide Buy-1-Get-1) on mount and on
  // every cart/coupon change, so the sidebar summary matches the checkout
  // dialog. Without this, sidebarPricing stays null and PriceSummary falls back
  // to subtotal + GST only — hiding the BOGO discount until checkout.
  useEffect(() => {
    void refreshSidebarPricing(couponCode);
  }, [refreshSidebarPricing, couponCode]);

  if (cart.length === 0) {
    return (
      <div className="bg-[#FDF8F4] min-h-[60vh]">
        <div className="max-w-2xl w-full mx-auto px-4 sm:px-6 py-14 sm:py-20 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-[#FAF3EE] ring-1 ring-[#EFE0D2] flex items-center justify-center">
            <ShoppingBag className="h-6 w-6 text-brand-700" />
          </div>
          <h1 className="font-display text-2xl sm:text-[32px] mt-6 text-ink-900">Your bag is empty</h1>
          <p className="mt-2 text-ink-600 text-sm">
            Add a piece to your bag or browse our collections — every order is hand-finished in Haryana.
          </p>
          <Link
            to="/store/collections/bridal"
            className="mt-8 inline-flex h-12 px-7 rounded-full bg-ink-900 text-ink-0 text-sm font-medium hover:bg-ink-800 transition-colors"
          >
            Browse collections
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#FDF8F4]">
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8 sm:py-10 md:py-14">
      <header className="mb-8 sm:mb-10">
        <p className="text-eyebrow uppercase text-brand-700">Your bag</p>
        <h1 className="font-display text-2xl sm:text-[34px] md:text-[40px] text-ink-900 mt-2">
          {cart.length} {cart.length === 1 ? 'piece' : 'pieces'} in your bag
        </h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 sm:gap-10 lg:gap-16">
        <section className="space-y-5 sm:space-y-6">
          {hasSoldOut && (
            <div className="rounded-md border border-danger-500/30 bg-danger-50 px-4 py-3 text-sm text-danger-700 flex items-start justify-between gap-3">
              <span>
                Some pieces in your bag are <strong>sold out</strong> and won&apos;t be ordered. Remove them to check out.
              </span>
              <button
                type="button"
                onClick={() => {
                  cart.filter((c) => isSoldOut(c.slug)).forEach((c) => shop.removeFromCart(c.slug, c.productId));
                }}
                className="shrink-0 underline decoration-danger-500 underline-offset-4 hover:text-danger-600"
              >
                Remove all
              </button>
            </div>
          )}
          {cart.map((item) => {
            const soldOut = isSoldOut(item.slug);
            return (
            <article key={item.slug} className="flex gap-3 sm:gap-5 pb-5 sm:pb-6 border-b border-[#EFE0D2]">
              <Link to={`/store/products/${item.slug}`} className="relative shrink-0 w-20 h-24 sm:w-28 sm:h-32 md:w-32 md:h-36 bg-[#FAF3EE] rounded-sm overflow-hidden">
                <img
                  src={item.img}
                  alt={item.name}
                  className={`h-full w-full object-cover ${soldOut ? 'grayscale opacity-60' : ''}`}
                />
                {soldOut && (
                  <span className="absolute top-1.5 left-1.5 bg-ink-900 text-ink-0 text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-sm">
                    Sold out
                  </span>
                )}
              </Link>
              <div className="flex-1 min-w-0 flex flex-col">
                <Link to={`/store/products/${item.slug}`} className="font-display text-base sm:text-[20px] text-ink-900 truncate hover:text-brand-700 transition-colors">
                  {item.name}
                </Link>
                <p className="text-xs text-ink-500 mt-1">
                  {item.weight}{item.size ? ` · Size ${item.size}″` : ''}
                </p>
                {soldOut ? (
                  <p className="text-sm text-danger-700 font-medium mt-2">Sold out — remove to continue</p>
                ) : (
                  <p className="text-sm text-ink-900 font-mono tabular-nums mt-2">{item.priceLabel}</p>
                )}

                <div className="mt-auto flex items-center justify-between flex-wrap gap-3 pt-3 sm:pt-4">
                  <div className={`inline-flex items-center h-10 rounded-full border border-[#EFE0D2] bg-ink-0 overflow-hidden ${soldOut ? 'opacity-40 pointer-events-none' : ''}`}>
                    <button
                      onClick={() => shop.setCartQty(item.slug, item.qty - 1, item.productId)}
                      disabled={soldOut}
                      className="h-10 w-10 inline-flex items-center justify-center text-ink-700 hover:bg-[#FAF3EE] disabled:cursor-not-allowed"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center text-sm font-mono tabular-nums">{item.qty}</span>
                    <button
                      onClick={() => shop.setCartQty(item.slug, item.qty + 1, item.productId)}
                      disabled={soldOut}
                      className="h-10 w-10 inline-flex items-center justify-center text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => shop.removeFromCart(item.slug, item.productId)}
                    className="inline-flex items-center gap-2 text-xs text-ink-500 hover:text-ink-900"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            </article>
            );
          })}

          <div className="flex items-center justify-between flex-wrap gap-3">
            <button
              type="button"
              onClick={() => shop.clearCart()}
              className="text-xs text-ink-500 hover:text-ink-900 underline decoration-ink-200 underline-offset-4"
            >
              Clear bag
            </button>
            {shop.isSyncing && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-success-700">
                <BadgeCheck className="h-3.5 w-3.5" />
                Saved to your account
              </span>
            )}
          </div>
        </section>

        <aside className="lg:sticky lg:top-28 self-start">
          <div className="rounded-md border border-[#EFE0D2] bg-ink-0 p-5 sm:p-6 space-y-4 text-sm">
            <p className="text-eyebrow uppercase text-brand-700">Order summary</p>

            {/* Coupon code — usable before checkout */}
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-ink-500">Have a coupon?</p>
              <CouponInput
                onApply={(code) => setCouponCode(code)}
                onRemove={() => setCouponCode(null)}
                appliedCode={couponCode}
                discountPaise={sidebarPricing?.couponDiscountPaise ?? 0}
                error={sidebarPricing?.couponError ?? null}
                isLoading={isSidebarPricingLoading}
              />
            </div>

            <PriceSummary pricing={sidebarPricing} fallbackSubtotalPaise={subtotal} />

            <button
              type="button"
              onClick={() => setCheckoutOpen(true)}
              disabled={hasSoldOut || orderableCart.length === 0}
              className="w-full h-12 rounded-full bg-ink-900 text-ink-0 text-sm font-medium hover:bg-ink-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-ink-900"
            >
              Place order
            </button>
            <p className="text-[11px] text-ink-500 leading-relaxed">
              {hasSoldOut
                ? 'Remove the sold-out pieces above to continue to checkout.'
                : "We'll confirm the day's gold rate on WhatsApp before billing. No card charged today."}
            </p>
          </div>

          <ul className="mt-6 grid grid-cols-1 gap-3 text-xs text-ink-600">
            <li className="flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-brand-700 shrink-0 mt-0.5" />
              BIS hallmarked · weighed in front of you
            </li>
            <li className="flex items-start gap-2">
              <Truck className="h-4 w-4 text-brand-700 shrink-0 mt-0.5" />
              Free Haryana delivery · India-wide shipping
            </li>
            <li className="flex items-start gap-2">
              <RotateCcw className="h-4 w-4 text-brand-700 shrink-0 mt-0.5" />
              Lifetime exchange against pure-gold value
            </li>
          </ul>
        </aside>
      </div>

      <CheckoutDialog open={checkoutOpen} onClose={() => setCheckoutOpen(false)} initialCouponCode={couponCode} />
    </div>
    </div>
  );
}

function CheckoutDialog({ open, onClose, initialCouponCode = null }: { open: boolean; onClose: () => void; initialCouponCode?: string | null }): JSX.Element {
  const cart = useAppSelector((s) => s.shop.cart);
  const account = useAppSelector((s) => s.shop.account);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { data: products, refetch: refetchProducts } = useGetPublicProductsQuery();
  const [createOrder, { isLoading }] = useCreatePublicOrderMutation();
  const [verifyRazorpay] = useVerifyRazorpayPaymentMutation();
  const [identifyCustomer] = useIdentifyCustomerMutation();
  const [computePricing, { isLoading: isPricingLoading }] = useComputeCheckoutPricingMutation();
  const shop = useShopActions();
  const [name, setName] = useState(account.name);
  const [phone, setPhone] = useState(() => (account.phone || '').replace(/\D/g, '').replace(/^91/, '').slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'cod'>('razorpay');

  // Promotions state — coupon pre-populated from sidebar if applied before opening
  const [couponCode, setCouponCode] = useState<string | null>(initialCouponCode);
  const [useLoyalty, setUseLoyalty] = useState(false);
  const [pricing, setPricing] = useState<PricingBreakdown | null>(null);

  const subtotal = cart.reduce((s, l) => s + l.pricePaise * l.qty, 0);
  const gst = Math.round((subtotal * 300) / 10_000);
  const grand = pricing?.totalPaise ?? (subtotal + gst);

  // Re-compute pricing whenever cart, coupon, or loyalty changes (debounced via useCallback)
  const refreshPricing = useCallback(async (code: string | null, loyalty: boolean, ph: string) => {
    const items = cart.map((c) => ({ slug: c.slug, qty: c.qty, sizeLabel: c.size }));
    if (items.length === 0) { setPricing(null); return; }
    try {
      const customerPhone = ph.length === 10 ? `+91${ph}` : undefined;
      const result = await computePricing({
        cart_items: items,
        coupon_code: code ?? undefined,
        use_loyalty_points: loyalty,
        customer_phone: customerPhone,
      }).unwrap();
      setPricing(result);
    } catch {
      // pricing errors are surfaced per-field; don't block checkout
    }
  }, [cart, computePricing]);

  // Sync coupon from sidebar when dialog first opens
  useEffect(() => {
    if (open) setCouponCode(initialCouponCode);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recompute on open and whenever promo state changes
  useEffect(() => {
    if (open) void refreshPricing(couponCode, useLoyalty, phone);
  }, [open, couponCode, useLoyalty, phone, refreshPricing]);

  const handleApplyCoupon = (code: string): void => {
    setCouponCode(code);
  };
  const handleRemoveCoupon = (): void => {
    setCouponCode(null);
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (name.trim().length < 2) return void toast.error('Please enter your name');
    if (!/^[6-9]\d{9}$/.test(phone)) return void toast.error('Please enter a valid 10-digit Indian phone number');
    const local = phone;
    // Refetch the catalog before mapping slugs → product IDs. The product list
    // is cached (keepUnusedDataFor: 5 min); after a re-seed the cached IDs go
    // stale and the server rejects them with PRODUCT_UNAVAILABLE. Pull fresh
    // IDs at submit time so the server-side lookup always matches.
    const fresh = await refetchProducts().unwrap().catch(() => products);
    const liveProducts = fresh ?? products;
    if (!liveProducts || liveProducts.length === 0) {
      return void toast.error('Catalog is still loading, try again');
    }

    const productIdBySlug = new Map(liveProducts.map((p) => [p.slug, p.id]));
    const items = cart
      .map((c) => {
        const id = productIdBySlug.get(c.slug);
        return id ? { productId: id, qty: c.qty, sizeLabel: c.size } : null;
      })
      .filter((x): x is { productId: string; qty: number; sizeLabel: string | undefined } => x !== null);

    if (items.length === 0) {
      return void toast.error('None of these pieces are available right now — try refreshing.');
    }

    try {
      const normalizedPhone = `+91${local}`;
      const res = await createOrder({
        customer: { name: name.trim(), phone: normalizedPhone },
        items,
        paymentMethod,
        couponCode: couponCode ?? undefined,
        useLoyaltyPoints: useLoyalty,
      }).unwrap();

      // Razorpay flow: open the checkout modal immediately, then verify.
      // If the user dismisses the modal the order stays PENDING (admin can
      // chase, or we expire it on a cron); we surface that as a soft warning.
      if (paymentMethod === 'razorpay' && res.razorpay) {
        try {
          const checkoutResult = await openRazorpayCheckout({
            keyId: res.razorpay.keyId,
            orderId: res.razorpay.orderId,
            amountPaise: res.razorpay.amountPaise,
            brandName: 'Zelora',
            description: `Order ZL-${res.id.slice(-6).toUpperCase()}`,
            customer: { name: name.trim(), phone: normalizedPhone },
            simulated: res.razorpay.simulated,
          });
          await verifyRazorpay({
            orderId: res.id,
            razorpayOrderId: checkoutResult.razorpayOrderId,
            razorpayPaymentId: checkoutResult.razorpayPaymentId,
            razorpaySignature: checkoutResult.razorpaySignature,
          }).unwrap();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg === 'CHECKOUT_DISMISSED') {
            toast.message('Payment cancelled', {
              description: 'Your order is held for 30 min — finish payment from the Track page.',
            });
            navigate(`/store/track?id=${res.id.slice(-6).toUpperCase()}&phone=${encodeURIComponent(normalizedPhone)}`);
            return;
          }
          throw e;
        }
      }

      toast.success(`Order placed! ZL-${res.id.slice(-6).toUpperCase()}`, { duration: 4000 });
      // Persist phone + name in the account so the Track page can auto-fill
      // them on repeat visits and "My Orders" works after a session restore.
      dispatch(updateAccount({ name: name.trim(), phone: normalizedPhone }));
      // Promote the buyer to a "signed-in" customer in the DB so their
      // future cart/wishlist sync. The server upserts the Customer row, and
      // hydrateFromServer mirrors the empty cart (post-checkout) into the
      // slice. This is what makes the order-placement-flow also a sign-in.
      try {
        const identity = await identifyCustomer({
          phone: normalizedPhone,
          name: name.trim(),
        }).unwrap();
        dispatch(hydrateFromServer(identity));
      } catch {
        // Identify failure shouldn't break checkout — local clearCart still runs.
      }
      shop.clearCart();
      onClose();
      // Hand off to the success page — that's where the customer gets the
      // big order number, ETA, and a clear CTA to track. Pass the phone via
      // location state so the lookup auto-fires without re-entry.
      navigate(`/store/order/success/${res.id}`, {
        state: {
          phone: normalizedPhone,
          totalPaise: res.totalPaise,
          expectedDeliveryAt: res.expectedDeliveryAt,
        },
      });
    } catch (err) {
      const message =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ??
        'Could not place order. Please try again.';
      toast.error(message);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] sm:w-[92vw] max-w-md max-h-[90vh] overflow-y-auto bg-ink-0 rounded-lg shadow-xl border border-ink-100">
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="font-display text-[22px] leading-tight text-ink-900">
                  Place your order
                </Dialog.Title>
                <Dialog.Description className="text-xs text-ink-500 mt-1">
                  {cart.length} piece{cart.length === 1 ? '' : 's'} ·{' '}
                  <Money paise={grand} className="font-mono" /> incl. GST
                </Dialog.Description>
              </div>
              <Dialog.Close className="text-ink-500 hover:text-ink-900 p-1 -mr-1 -mt-1 rounded-md hover:bg-ink-50" aria-label="Close">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Your name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                  className="mt-1 w-full h-11 px-3 rounded-lg border border-ink-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm"
                  placeholder="Full name"
                />
              </label>

              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Phone</span>
                <div className="mt-1 flex items-stretch w-full h-11 rounded-lg border border-ink-200 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500 overflow-hidden">
                  <span className="flex items-center px-3 bg-ink-50 text-ink-600 text-sm font-mono border-r border-ink-200 select-none">
                    +91
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    required
                    inputMode="numeric"
                    maxLength={10}
                    pattern="[6-9][0-9]{9}"
                    className="flex-1 px-3 text-sm font-mono focus:outline-none"
                    placeholder="98XXX XXXXX"
                  />
                </div>
              </label>

              <fieldset className="block">
                <legend className="text-[11px] uppercase tracking-wider text-ink-500">Payment</legend>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <label className={`cursor-pointer flex flex-col gap-0.5 px-3 py-2.5 rounded-lg border text-sm transition-colors ${paymentMethod === 'razorpay' ? 'border-brand-500 bg-brand-50/40 text-ink-900' : 'border-ink-200 text-ink-600 hover:border-ink-300'}`}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="razorpay"
                      checked={paymentMethod === 'razorpay'}
                      onChange={() => setPaymentMethod('razorpay')}
                      className="sr-only"
                    />
                    <span className="font-medium">Pay online</span>
                    <span className="text-[11px] text-ink-500">UPI · Card · Net-banking</span>
                  </label>
                  <label className={`cursor-pointer flex flex-col gap-0.5 px-3 py-2.5 rounded-lg border text-sm transition-colors ${paymentMethod === 'cod' ? 'border-brand-500 bg-brand-50/40 text-ink-900' : 'border-ink-200 text-ink-600 hover:border-ink-300'}`}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="cod"
                      checked={paymentMethod === 'cod'}
                      onChange={() => setPaymentMethod('cod')}
                      className="sr-only"
                    />
                    <span className="font-medium">Cash on delivery</span>
                    <span className="text-[11px] text-ink-500">Pay when it arrives</span>
                  </label>
                </div>
              </fieldset>
            </div>

            {/* Coupon Code */}
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-ink-500">Coupon code</p>
              <CouponInput
                onApply={handleApplyCoupon}
                onRemove={handleRemoveCoupon}
                appliedCode={couponCode}
                discountPaise={pricing?.couponDiscountPaise ?? 0}
                error={pricing?.couponError ?? null}
                isLoading={isPricingLoading}
              />
            </div>

            {/* Loyalty Points — only shown when customer has a phone (signed in) */}
            {pricing?.loyalty && (
              <LoyaltyToggle
                balance={pricing.loyalty.balance}
                pointsUsed={pricing.loyalty.pointsUsed}
                discountPaise={pricing.loyaltyDiscountPaise}
                enabled={useLoyalty}
                onToggle={(on) => setUseLoyalty(on)}
                error={pricing.loyaltyError}
                stackabilityConflict={pricing.stackabilityConflict}
              />
            )}

            {/* Price breakdown */}
            <div className="rounded-lg border border-[#EFE0D2] bg-[#FAFAF8] px-3 py-3 space-y-2">
              <PriceSummary pricing={pricing} fallbackSubtotalPaise={subtotal} />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="flex-1 h-11 rounded-full border border-ink-200 text-ink-900 text-sm hover:bg-ink-50 disabled:opacity-60 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-[2] h-11 rounded-full bg-brand-400 text-ink-900 text-sm font-medium hover:bg-brand-300 disabled:opacity-60 transition-colors"
              >
                {isLoading ? (paymentMethod === 'razorpay' ? 'Opening payment…' : 'Placing order…') : (paymentMethod === 'razorpay' ? 'Pay & place order' : 'Place order (COD)')}
              </button>
            </div>

            <p className="text-[11px] text-ink-500 text-center leading-relaxed">
              {paymentMethod === 'razorpay'
                ? 'Pay securely via Razorpay. Order is confirmed the moment payment succeeds.'
                : 'Pay cash on delivery, or via UPI when the courier arrives. Estimated arrival: 5 business days, tracked on WhatsApp.'}
            </p>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

