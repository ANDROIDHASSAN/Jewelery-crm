import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { Minus, Plus, Trash2, ShoppingBag, ShieldCheck, Truck, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { Money } from '@/components/ui/money';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { setCartQty, removeFromCart, clearCart } from '@/features/storefront/shopSlice';
import {
  useGetPublicProductsQuery,
  useCreatePublicOrderMutation,
} from '@/features/storefront/storefrontApi';

export function CartPage(): JSX.Element {
  const cart = useAppSelector((s) => s.shop.cart);
  const dispatch = useAppDispatch();
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const subtotal = cart.reduce((sum, item) => sum + item.pricePaise * item.qty, 0);
  const gst = Math.round((subtotal * 300) / 10000);
  const total = subtotal + gst;

  if (cart.length === 0) {
    return (
      <div className="max-w-[760px] mx-auto px-6 py-20 text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-ink-50 flex items-center justify-center">
          <ShoppingBag className="h-6 w-6 text-ink-500" />
        </div>
        <h1 className="font-display text-[32px] mt-6 text-ink-900">Your bag is empty</h1>
        <p className="mt-2 text-ink-600 text-sm">
          Add a piece to your bag or browse our collections — every order is hand-finished in Haryana.
        </p>
        <Link
          to="/store/collections/bridal"
          className="mt-8 inline-flex h-12 px-7 rounded-full bg-brand-400 text-ink-900 text-sm font-medium hover:bg-brand-300 transition-colors"
        >
          Browse collections
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-10 md:py-14">
      <header className="mb-10">
        <p className="text-eyebrow uppercase text-ink-500">Your bag</p>
        <h1 className="font-display text-[34px] md:text-[40px] text-ink-900 mt-2">
          {cart.length} {cart.length === 1 ? 'piece' : 'pieces'} in your bag
        </h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10 lg:gap-16">
        <section className="space-y-6">
          {cart.map((item) => (
            <article key={item.slug} className="flex gap-5 pb-6 border-b border-ink-100">
              <Link to={`/store/products/${item.slug}`} className="shrink-0 w-28 h-32 sm:w-32 sm:h-36 bg-ink-50 overflow-hidden">
                <img src={item.img} alt={item.name} className="h-full w-full object-cover" />
              </Link>
              <div className="flex-1 min-w-0 flex flex-col">
                <Link to={`/store/products/${item.slug}`} className="font-display text-[20px] text-ink-900 truncate hover:underline decoration-ink-300 underline-offset-4">
                  {item.name}
                </Link>
                <p className="text-xs text-ink-500 mt-1">
                  {item.weight}{item.size ? ` · Size ${item.size}″` : ''}
                </p>
                <p className="text-sm text-ink-900 font-mono tabular-nums mt-2">{item.priceLabel}</p>

                <div className="mt-auto flex items-center justify-between pt-4">
                  <div className="inline-flex items-center h-10 rounded-full border border-ink-200 overflow-hidden">
                    <button
                      onClick={() => dispatch(setCartQty({ slug: item.slug, qty: item.qty - 1 }))}
                      className="h-10 w-10 inline-flex items-center justify-center text-ink-700 hover:bg-ink-50"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center text-sm font-mono tabular-nums">{item.qty}</span>
                    <button
                      onClick={() => dispatch(setCartQty({ slug: item.slug, qty: item.qty + 1 }))}
                      className="h-10 w-10 inline-flex items-center justify-center text-ink-700 hover:bg-ink-50"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => dispatch(removeFromCart(item.slug))}
                    className="inline-flex items-center gap-2 text-xs text-ink-500 hover:text-ink-900"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}

          <button
            type="button"
            onClick={() => dispatch(clearCart())}
            className="text-xs text-ink-500 hover:text-ink-900 underline decoration-ink-200 underline-offset-4"
          >
            Clear bag
          </button>
        </section>

        <aside className="lg:sticky lg:top-28 self-start">
          <div className="rounded-md border border-ink-100 bg-ink-25 p-6 space-y-3 text-sm">
            <p className="text-eyebrow uppercase text-ink-500">Order summary</p>
            <Row label="Subtotal" value={<Money paise={subtotal} />} />
            <Row label="GST (3%)" value={<Money paise={gst} />} />
            <Row label="Shipping" value={<span className="text-brand-700">Free</span>} />
            <div className="border-t border-ink-100 pt-3 flex items-center justify-between">
              <span className="text-ink-900 font-medium">Total</span>
              <Money paise={total} className="text-ink-900 font-medium font-mono tabular-nums text-lg" />
            </div>
            <button
              type="button"
              onClick={() => setCheckoutOpen(true)}
              className="w-full h-12 mt-4 rounded-full bg-brand-400 text-ink-900 text-sm font-medium hover:bg-brand-300 transition-colors"
            >
              Place order
            </button>
            <p className="text-[11px] text-ink-500 leading-relaxed">
              We&apos;ll confirm the day&apos;s gold rate on WhatsApp before billing. No card charged today.
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

      <CheckoutDialog open={checkoutOpen} onClose={() => setCheckoutOpen(false)} />
    </div>
  );
}

function CheckoutDialog({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const cart = useAppSelector((s) => s.shop.cart);
  const account = useAppSelector((s) => s.shop.account);
  const dispatch = useAppDispatch();
  const { data: products } = useGetPublicProductsQuery();
  const [createOrder, { isLoading }] = useCreatePublicOrderMutation();
  const [name, setName] = useState(account.name);
  const [phone, setPhone] = useState(account.phone || '+91 ');

  const total = cart.reduce((s, l) => s + l.pricePaise * l.qty, 0);
  const gst = Math.round((total * 300) / 10_000);
  const grand = total + gst;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (name.trim().length < 2) return void toast.error('Please enter your name');
    const digits = phone.replace(/\D/g, '');
    const local = digits.startsWith('91') ? digits.slice(2) : digits;
    if (!/^[6-9]\d{9}$/.test(local)) return void toast.error('Please enter a valid Indian phone number');
    if (!products || products.length === 0) return void toast.error('Catalog is still loading, try again');

    // Map cart slugs → product IDs. Skip items not in the live catalog (shouldn't happen).
    const productIdBySlug = new Map(products.map((p) => [p.slug, p.id]));
    const items = cart
      .map((c) => {
        const id = productIdBySlug.get(c.slug);
        return id ? { productId: id, qty: c.qty } : null;
      })
      .filter((x): x is { productId: string; qty: number } => x !== null);

    if (items.length === 0) {
      return void toast.error('None of these pieces are available right now — try refreshing.');
    }

    try {
      const res = await createOrder({
        customer: { name: name.trim(), phone: `+91${local}` },
        items,
        paymentMethod: 'cod',
      }).unwrap();
      const eta = res.expectedDeliveryAt
        ? new Date(res.expectedDeliveryAt).toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
          })
        : null;
      toast.success(`Order placed! Confirmation ZL-${res.id.slice(-6).toUpperCase()}`, {
        description: eta
          ? `Arrives by ${eta}. We'll WhatsApp tracking once the courier picks up.`
          : `We'll WhatsApp tracking once the courier picks up.`,
        duration: 9000,
      });
      dispatch(clearCart());
      onClose();
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-md bg-ink-0 rounded-lg shadow-xl border border-ink-100">
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
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
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  inputMode="tel"
                  className="mt-1 w-full h-11 px-3 rounded-lg border border-ink-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm font-mono"
                  placeholder="+91 98XXX XXXXX"
                />
              </label>
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
                {isLoading ? 'Reserving…' : 'Confirm reservation'}
              </button>
            </div>

            <p className="text-[11px] text-ink-500 text-center leading-relaxed">
              Pay cash on delivery, or via UPI when the courier arrives. Estimated arrival: 5 business days, tracked on WhatsApp.
            </p>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-500">{label}</span>
      <span className="text-ink-800 font-mono tabular-nums">{value}</span>
    </div>
  );
}
