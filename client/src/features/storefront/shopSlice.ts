// Storefront shopper state — cart, wishlist, and a lightweight customer account.
// Pure client state, persisted to localStorage. No server roundtrip yet; the
// admin POS / orders module owns persistence on the server side.

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface CartItem {
  slug: string;
  /**
   * Server-side product id. Optional on legacy localStorage rows; required
   * for any item we want to sync to the persisted server-side cart. New
   * items always include it (set when the PDP/collection adds to cart).
   */
  productId?: string;
  name: string;
  weight: string;
  /** Display price label (e.g. "₹62,200"). Source of truth is the catalog. */
  priceLabel: string;
  /**
   * Numeric paise — pre-GST subtotal for one unit, matching the server's
   * (basePricePaise + stoneChargePaise) so the cart total stays aligned with
   * what the server stores on order creation.
   */
  pricePaise: number;
  /** Optional selected size (PDP). Surfaced on the cart line. */
  size?: string;
  img: string;
  qty: number;
}

export interface WishlistItem {
  slug: string;
  productId?: string;
  name: string;
  weight: string;
  priceLabel: string;
  /** Pre-GST paise (same convention as CartItem.pricePaise). */
  pricePaise: number;
  img: string;
}

export interface CustomerAccount {
  name: string;
  email: string;
  phone: string;
  /** True when the user has "signed in" via the demo form. */
  signedIn: boolean;
  /**
   * Server-side Customer.id. Present only after a successful sign-in /
   * identifyCustomer round-trip. UI uses this as the "really signed in"
   * gate — when present, all cart/wishlist mutations also call the server.
   * When absent, mutations are local-only (the visitor is anonymous OR
   * working offline).
   */
  customerId?: string;
}

interface ShopState {
  cart: CartItem[];
  wishlist: WishlistItem[];
  account: CustomerAccount;
}

const STORAGE_KEY = 'zelora.shop';

const EMPTY_ACCOUNT: CustomerAccount = { name: '', email: '', phone: '', signedIn: false };

function readStored(): ShopState {
  if (typeof window === 'undefined') {
    return { cart: [], wishlist: [], account: EMPTY_ACCOUNT };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { cart: [], wishlist: [], account: EMPTY_ACCOUNT };
    const parsed = JSON.parse(raw) as Partial<ShopState>;
    return {
      cart: Array.isArray(parsed.cart) ? parsed.cart : [],
      wishlist: Array.isArray(parsed.wishlist) ? parsed.wishlist : [],
      account: { ...EMPTY_ACCOUNT, ...(parsed.account ?? {}) },
    };
  } catch {
    return { cart: [], wishlist: [], account: EMPTY_ACCOUNT };
  }
}

export function persistShopState(state: ShopState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

const initialState: ShopState = readStored();

const slice = createSlice({
  name: 'shop',
  initialState,
  reducers: {
    addToCart(state, action: PayloadAction<Omit<CartItem, 'qty'> & { qty?: number }>) {
      const incoming = action.payload;
      const existing = state.cart.find((c) => c.slug === incoming.slug);
      if (existing) {
        existing.qty += incoming.qty ?? 1;
      } else {
        state.cart.push({ ...incoming, qty: incoming.qty ?? 1 });
      }
    },
    setCartQty(state, action: PayloadAction<{ slug: string; qty: number }>) {
      const item = state.cart.find((c) => c.slug === action.payload.slug);
      if (!item) return;
      if (action.payload.qty <= 0) {
        state.cart = state.cart.filter((c) => c.slug !== action.payload.slug);
      } else {
        item.qty = action.payload.qty;
      }
    },
    removeFromCart(state, action: PayloadAction<string>) {
      state.cart = state.cart.filter((c) => c.slug !== action.payload);
    },
    clearCart(state) {
      state.cart = [];
    },

    toggleWishlist(state, action: PayloadAction<WishlistItem>) {
      const exists = state.wishlist.find((w) => w.slug === action.payload.slug);
      if (exists) {
        state.wishlist = state.wishlist.filter((w) => w.slug !== action.payload.slug);
      } else {
        state.wishlist.push(action.payload);
      }
    },
    removeFromWishlist(state, action: PayloadAction<string>) {
      state.wishlist = state.wishlist.filter((w) => w.slug !== action.payload);
    },

    signIn(state, action: PayloadAction<{ name: string; email: string; phone: string }>) {
      state.account = { ...action.payload, signedIn: true };
    },
    updateAccount(state, action: PayloadAction<Partial<Omit<CustomerAccount, 'signedIn'>>>) {
      state.account = { ...state.account, ...action.payload };
    },
    signOut(state) {
      state.account = EMPTY_ACCOUNT;
      // Clear local cart + wishlist on sign-out so a shared device doesn't
      // leak the previous customer's bag to the next visitor. The persisted
      // server-side cart stays untouched; signing back in restores it.
      state.cart = [];
      state.wishlist = [];
    },

    // Replaces local cart + wishlist + customer identity with the snapshot
    // returned from /website/customers/identify. Called right after a
    // successful sign-in so the UI shows the canonical server-side bag,
    // not stale localStorage. The server has already merged any local
    // mergeCart/mergeWishlist payload, so this is non-destructive.
    hydrateFromServer(
      state,
      action: PayloadAction<{
        customer: { id: string; name: string; phone: string; email: string | null };
        cart: Array<{
          productId: string;
          qty: number;
          pricePaise: number;
          product: { name: string; slug: string; images: string[]; weightMg: number; purityCaratX100: number };
        }>;
        wishlist: Array<{
          productId: string;
          product: {
            name: string;
            slug: string;
            images: string[];
            weightMg: number;
            purityCaratX100: number;
            basePricePaise: number;
            stoneChargePaise: number;
          };
        }>;
      }>,
    ) {
      const { customer, cart, wishlist } = action.payload;
      state.account = {
        name: customer.name,
        email: customer.email ?? '',
        phone: customer.phone,
        signedIn: true,
        customerId: customer.id,
      };
      state.cart = cart.map((c) => ({
        slug: c.product.slug,
        productId: c.productId,
        name: c.product.name,
        weight: `${(c.product.weightMg / 1000).toFixed(2)}g`,
        priceLabel: `₹${(c.pricePaise / 100).toLocaleString('en-IN')}`,
        pricePaise: c.pricePaise,
        img: c.product.images[0] ?? '',
        qty: c.qty,
      }));
      state.wishlist = wishlist.map((w) => {
        const pricePaise = w.product.basePricePaise + w.product.stoneChargePaise;
        return {
          slug: w.product.slug,
          productId: w.productId,
          name: w.product.name,
          weight: `${(w.product.weightMg / 1000).toFixed(2)}g`,
          priceLabel: `₹${(pricePaise / 100).toLocaleString('en-IN')}`,
          pricePaise,
          img: w.product.images[0] ?? '',
        };
      });
    },
  },
});

export const {
  addToCart,
  setCartQty,
  removeFromCart,
  clearCart,
  toggleWishlist,
  removeFromWishlist,
  signIn,
  updateAccount,
  signOut,
  hydrateFromServer,
} = slice.actions;

export const shopReducer = slice.reducer;
