// Single source of truth for storefront cart + wishlist mutations.
//
// Pages call these helpers instead of dispatching shopSlice actions directly.
// Each helper does two things:
//   1. Mutate the local Redux state (instant UI response, works offline)
//   2. If the customer is signed-in (account.customerId present), fire the
//      matching server mutation so the persisted Neon row stays in sync
//
// Anonymous visitors stay localStorage-only, which means they can shop
// without signing in — the sign-in flow on AccountPage upserts their bag
// into the persisted cart via /customers/identify's mergeCart param.

import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  addToCart as addToCartLocal,
  removeFromCart as removeFromCartLocal,
  setCartQty as setCartQtyLocal,
  clearCart as clearCartLocal,
  toggleWishlist as toggleWishlistLocal,
  removeFromWishlist as removeFromWishlistLocal,
  signOut as signOutLocal,
  type CartItem,
  type WishlistItem,
} from './shopSlice';
import {
  useUpsertCartItemMutation,
  useClearCartMutation,
  useToggleWishlistItemMutation,
} from './customerApi';

interface ShopActions {
  /** Returns true if every cart/wishlist mutation also persists to the DB. */
  isSyncing: boolean;
  /** Add to cart — optimistic local, then persist if signed-in. */
  addToCart: (item: Omit<CartItem, 'qty'> & { qty?: number }) => void;
  setCartQty: (slug: string, qty: number, productId?: string) => void;
  removeFromCart: (slug: string, productId?: string) => void;
  clearCart: () => void;
  toggleWishlist: (item: WishlistItem) => void;
  removeFromWishlist: (slug: string, productId?: string) => void;
  signOut: () => void;
}

export function useShopActions(): ShopActions {
  const dispatch = useAppDispatch();
  const account = useAppSelector((s) => s.shop.account);
  const cart = useAppSelector((s) => s.shop.cart);
  const wishlist = useAppSelector((s) => s.shop.wishlist);
  const [upsertCart] = useUpsertCartItemMutation();
  const [clearServerCart] = useClearCartMutation();
  const [toggleWish] = useToggleWishlistItemMutation();

  const isSyncing = Boolean(account.customerId && account.phone);

  function findCartItem(slug: string): CartItem | undefined {
    return cart.find((c) => c.slug === slug);
  }
  function findWishlistItem(slug: string): WishlistItem | undefined {
    return wishlist.find((w) => w.slug === slug);
  }

  function syncCartQty(productId: string | undefined, qty: number): void {
    if (!isSyncing || !productId || !account.phone) return;
    // Fire-and-forget. RTKQ invalidates the Cart tag on success so the
    // AccountPage / persisted cart query refetches automatically. We don't
    // await — the local state already updated, the UI is already correct.
    void upsertCart({ phone: account.phone, productId, qty });
  }
  function syncWishlistToggle(productId: string | undefined): void {
    if (!isSyncing || !productId || !account.phone) return;
    void toggleWish({ phone: account.phone, productId });
  }

  return {
    isSyncing,
    addToCart(item) {
      dispatch(addToCartLocal(item));
      const existing = findCartItem(item.slug);
      const newQty = (existing?.qty ?? 0) + (item.qty ?? 1);
      syncCartQty(item.productId, newQty);
    },
    setCartQty(slug, qty, productIdHint) {
      dispatch(setCartQtyLocal({ slug, qty }));
      const productId = productIdHint ?? findCartItem(slug)?.productId;
      syncCartQty(productId, qty);
    },
    removeFromCart(slug, productIdHint) {
      const productId = productIdHint ?? findCartItem(slug)?.productId;
      dispatch(removeFromCartLocal(slug));
      // Delete is qty=0 on the server.
      syncCartQty(productId, 0);
    },
    clearCart() {
      dispatch(clearCartLocal());
      if (isSyncing && account.phone) {
        void clearServerCart({ phone: account.phone });
      }
    },
    toggleWishlist(item) {
      const wasPresent = Boolean(findWishlistItem(item.slug));
      dispatch(toggleWishlistLocal(item));
      // Server is a toggle too — just send the productId regardless of
      // direction. Server resolves add vs remove based on current state.
      syncWishlistToggle(item.productId);
      // If the local item didn't carry a productId, no server sync happens.
      // That's intentional — older localStorage entries from before this
      // refactor don't know their productId.
      void wasPresent; // suppress unused warning; useful when we add toasts later
    },
    removeFromWishlist(slug, productIdHint) {
      const productId = productIdHint ?? findWishlistItem(slug)?.productId;
      dispatch(removeFromWishlistLocal(slug));
      syncWishlistToggle(productId);
    },
    signOut() {
      // Server cart stays — they can sign back in and retrieve it.
      dispatch(signOutLocal());
    },
  };
}
