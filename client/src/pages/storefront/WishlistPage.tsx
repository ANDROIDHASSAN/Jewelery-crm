import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { useShopActions } from '@/features/storefront/useShopActions';
import { replaceWishlist } from '@/features/storefront/shopSlice';
import { useGetWishlistQuery } from '@/features/storefront/customerApi';

export function WishlistPage(): JSX.Element {
  const wishlist = useAppSelector((s) => s.shop.wishlist);
  const account = useAppSelector((s) => s.shop.account);
  const dispatch = useAppDispatch();
  const shop = useShopActions();

  // When the customer is signed in, the wishlist is the canonical
  // server-side list — fetch it from /website/wishlist and mirror it
  // into Redux so this page (and the TopBar badge count + AccountPage
  // tile) reflect the database, not stale localStorage. Anonymous
  // visitors continue to read Redux directly (backed by localStorage).
  const isSignedIn = Boolean(account.signedIn && account.phone);
  const {
    data: serverWishlist,
    isLoading: serverLoading,
    isUninitialized,
  } = useGetWishlistQuery(
    { phone: account.phone },
    { skip: !isSignedIn, refetchOnMountOrArgChange: true },
  );

  useEffect(() => {
    if (serverWishlist) {
      // serverWishlist already conforms to replaceWishlist's payload shape
      // (productId + product summary). The mapping to local WishlistItem
      // happens inside the reducer so price/weight formatting stays in one
      // place — see shopSlice.replaceWishlist.
      dispatch(replaceWishlist(serverWishlist));
    }
  }, [serverWishlist, dispatch]);

  // Initial-fetch skeleton: only block render when we're signed in AND
  // the server query hasn't resolved yet AND we have no cached items to
  // show in the meantime. Anonymous users skip this entirely.
  const isInitialFetch = isSignedIn && (serverLoading || isUninitialized) && wishlist.length === 0;

  if (isInitialFetch) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8 sm:py-10 md:py-14">
        <header className="mb-8 sm:mb-10">
          <p className="text-eyebrow uppercase text-ink-500">Saved for you</p>
          <div className="h-10 sm:h-12 md:h-14 w-2/3 max-w-md rounded bg-ink-100 animate-pulse mt-2" />
        </header>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-8 sm:gap-x-5 sm:gap-y-12 md:gap-x-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="aspect-[4/5] bg-ink-100 animate-pulse" />
              <div className="h-4 w-3/4 rounded bg-ink-100 animate-pulse" />
              <div className="h-3 w-1/3 rounded bg-ink-100 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (wishlist.length === 0) {
    return (
      <div className="max-w-2xl w-full mx-auto px-4 sm:px-6 py-14 sm:py-20 text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-ink-50 flex items-center justify-center">
          <Heart className="h-6 w-6 text-ink-500" />
        </div>
        <h1 className="font-display text-2xl sm:text-[32px] mt-6 text-ink-900">Your wishlist is empty</h1>
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
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8 sm:py-10 md:py-14">
      <header className="mb-8 sm:mb-10">
        <p className="text-eyebrow uppercase text-ink-500">Saved for you</p>
        <h1 className="font-display text-2xl sm:text-[34px] md:text-[40px] text-ink-900 mt-2">
          {wishlist.length} {wishlist.length === 1 ? 'piece' : 'pieces'} on your wishlist
        </h1>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-8 sm:gap-x-5 sm:gap-y-12 md:gap-x-6">
        {wishlist.map((item) => (
          <article key={item.slug} className="group relative">
            <button
              type="button"
              onClick={() => {
                shop.removeFromWishlist(item.slug, item.productId);
                toast.success('Removed from wishlist');
              }}
              className="absolute top-2 right-2 sm:top-3 sm:right-3 z-10 h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-ink-0/95 backdrop-blur text-ink-700 hover:text-ink-900 inline-flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-sm"
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
              <div className="mt-3 sm:mt-4">
                <h3 className="font-display text-base sm:text-[18px] leading-tight text-ink-900">{item.name}</h3>
                <p className="text-[11px] sm:text-xs text-ink-500 mt-1">{item.weight}</p>
                <p className="text-sm text-ink-900 font-mono tabular-nums mt-1 sm:mt-1.5">{item.priceLabel}</p>
              </div>
            </Link>
            {/* Wishlist-only inline action. Documented exception to the
                "no Add-to-cart on product card" rule (see design-system.md):
                the wishlist is explicitly a pre-purchase shortlist, not a
                discovery surface, so a quiet eyebrow-link is appropriate.
                Kept as a text link (not a pill) so the image stays the
                hero of the card. */}
            <button
              type="button"
              onClick={() => {
                shop.addToCart({
                  slug: item.slug,
                  productId: item.productId,
                  name: item.name,
                  weight: item.weight,
                  priceLabel: item.priceLabel,
                  pricePaise: item.pricePaise,
                  img: item.img,
                });
                toast.success(`${item.name} added to bag`);
              }}
              className="mt-3 text-[11px] uppercase tracking-[0.12em] text-brand-700 hover:text-brand-800 underline decoration-brand-200 hover:decoration-brand-400 underline-offset-4 transition-colors"
            >
              Move to bag
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
