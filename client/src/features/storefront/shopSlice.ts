// Storefront shopper state — cart, wishlist, and a lightweight customer account.
// Pure client state, persisted to localStorage. No server roundtrip yet; the
// admin POS / orders module owns persistence on the server side.

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface CartItem {
  slug: string;
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
} = slice.actions;

export const shopReducer = slice.reducer;
