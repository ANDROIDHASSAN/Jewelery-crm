import { Link } from 'react-router-dom';
import { Minus, Plus, Trash2, ShoppingBag, ShieldCheck, Truck, RotateCcw } from 'lucide-react';
import { Money } from '@/components/ui/money';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { setCartQty, removeFromCart, clearCart } from '@/features/storefront/shopSlice';

export function CartPage(): JSX.Element {
  const cart = useAppSelector((s) => s.shop.cart);
  const dispatch = useAppDispatch();

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
          Reserve a piece online or browse our collections — every order is hand-finished in Haryana.
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
          {cart.length} {cart.length === 1 ? 'piece' : 'pieces'} reserved
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
                <p className="text-xs text-ink-500 mt-1">{item.weight}</p>
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
            <button className="w-full h-12 mt-4 rounded-full bg-brand-400 text-ink-900 text-sm font-medium hover:bg-brand-300 transition-colors">
              Reserve at store
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
    </div>
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
