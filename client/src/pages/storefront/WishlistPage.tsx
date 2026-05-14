import { Link } from 'react-router-dom';
import { Heart, ShoppingBag, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { removeFromWishlist, addToCart } from '@/features/storefront/shopSlice';

export function WishlistPage(): JSX.Element {
  const wishlist = useAppSelector((s) => s.shop.wishlist);
  const dispatch = useAppDispatch();

  if (wishlist.length === 0) {
    return (
      <div className="max-w-[760px] mx-auto px-6 py-20 text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-ink-50 flex items-center justify-center">
          <Heart className="h-6 w-6 text-ink-500" />
        </div>
        <h1 className="font-display text-[32px] mt-6 text-ink-900">Your wishlist is empty</h1>
        <p className="mt-2 text-ink-600 text-sm">
          Tap the heart on any piece to save it for later. Wishlists sync to your phone when you sign in.
        </p>
        <Link
          to="/store/collections/bridal"
          className="mt-8 inline-flex h-12 px-7 rounded-full bg-brand-400 text-ink-900 text-sm font-medium hover:bg-brand-300 transition-colors"
        >
          Explore bridal
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-10 md:py-14">
      <header className="mb-10">
        <p className="text-eyebrow uppercase text-ink-500">Saved for you</p>
        <h1 className="font-display text-[34px] md:text-[40px] text-ink-900 mt-2">
          {wishlist.length} {wishlist.length === 1 ? 'piece' : 'pieces'} on your wishlist
        </h1>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-12 md:gap-x-6">
        {wishlist.map((item) => (
          <article key={item.slug} className="group relative">
            <button
              type="button"
              onClick={() => {
                dispatch(removeFromWishlist(item.slug));
                toast.success('Removed from wishlist');
              }}
              className="absolute top-3 right-3 z-10 h-9 w-9 rounded-full bg-ink-0/95 backdrop-blur text-ink-700 hover:text-ink-900 inline-flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
              aria-label={`Remove ${item.name} from wishlist`}
            >
              <X className="h-4 w-4" />
            </button>
            <Link to={`/store/products/${item.slug}`} className="block">
              <div className="aspect-[4/5] overflow-hidden bg-ink-100">
                <img
                  src={item.img}
                  alt={item.name}
                  className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-slow"
                  loading="lazy"
                />
              </div>
              <div className="mt-4">
                <h3 className="font-display text-[18px] leading-tight text-ink-900">{item.name}</h3>
                <p className="text-xs text-ink-500 mt-1">{item.weight}</p>
                <p className="text-sm text-ink-900 font-mono tabular-nums mt-1.5">{item.priceLabel}</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => {
                dispatch(
                  addToCart({
                    slug: item.slug,
                    name: item.name,
                    weight: item.weight,
                    priceLabel: item.priceLabel,
                    pricePaise: item.pricePaise,
                    img: item.img,
                  }),
                );
                toast.success(`${item.name} added to bag`);
              }}
              className="mt-3 w-full h-10 rounded-full border border-ink-200 text-ink-900 text-xs font-medium hover:bg-ink-50 inline-flex items-center justify-center gap-2 transition-colors"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              Move to bag
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
