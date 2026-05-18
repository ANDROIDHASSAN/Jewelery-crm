// RTKQ slice for storefront customer identity + persisted cart + wishlist.
// Mirrors the /website/customers/identify, /website/cart, /website/wishlist
// endpoints in server/src/modules/website/website.routes.ts.
//
// Identity model: phone is the auth key. There's no session cookie — every
// mutation includes the phone in the body. This matches /orders/lookup and
// keeps the storefront fully stateless from the server's perspective.

import { baseApi } from '@/app/store';

export interface ServerProductSummary {
  id: string;
  name: string;
  slug: string;
  images: string[];
  basePricePaise: number;
  stoneChargePaise: number;
  weightMg: number;
  purityCaratX100: number;
}

export interface ServerCartItem {
  id: string;
  productId: string;
  qty: number;
  pricePaise: number;
  addedAt: string;
  product: ServerProductSummary;
}

export interface ServerWishlistItem {
  id: string;
  productId: string;
  addedAt: string;
  product: ServerProductSummary;
}

export interface ServerCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

export interface IdentifyResponse {
  customer: ServerCustomer;
  cart: ServerCartItem[];
  wishlist: ServerWishlistItem[];
}

export const customerApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // Sign in OR sign up by phone. Optional `mergeCart` / `mergeWishlist`
    // upserts any localStorage items into the persisted cart in the same
    // round-trip — used when a visitor builds a bag while anonymous, then
    // signs in.
    identifyCustomer: build.mutation<
      IdentifyResponse,
      {
        phone: string;
        name?: string;
        email?: string;
        mergeCart?: Array<{ productId: string; qty: number }>;
        mergeWishlist?: Array<{ productId: string }>;
      }
    >({
      query: (body) => ({ url: '/website/customers/identify', method: 'POST', body }),
      transformResponse: (raw: { data: IdentifyResponse }) => raw.data,
      invalidatesTags: [
        { type: 'Cart', id: 'LIST' },
        { type: 'Wishlist', id: 'LIST' },
      ],
    }),

    // Fetch the persisted cart. Skipped client-side when no phone is
    // available; the storefront falls back to localStorage in that case.
    getCart: build.query<ServerCartItem[], { phone: string }>({
      query: ({ phone }) => ({ url: '/website/cart', params: { phone } }),
      transformResponse: (raw: { data: ServerCartItem[] }) => raw.data,
      providesTags: [{ type: 'Cart', id: 'LIST' }],
    }),

    // Upsert a single cart line. qty=0 deletes it (server enforces).
    upsertCartItem: build.mutation<
      ServerCartItem | { deleted: true },
      { phone: string; productId: string; qty: number }
    >({
      query: (body) => ({ url: '/website/cart/items', method: 'POST', body }),
      transformResponse: (raw: { data: ServerCartItem | { deleted: true } }) => raw.data,
      invalidatesTags: [{ type: 'Cart', id: 'LIST' }],
    }),

    clearCart: build.mutation<{ cleared: true }, { phone: string }>({
      query: ({ phone }) => ({ url: '/website/cart', method: 'DELETE', params: { phone } }),
      transformResponse: (raw: { data: { cleared: true } }) => raw.data,
      invalidatesTags: [{ type: 'Cart', id: 'LIST' }],
    }),

    getWishlist: build.query<ServerWishlistItem[], { phone: string }>({
      query: ({ phone }) => ({ url: '/website/wishlist', params: { phone } }),
      transformResponse: (raw: { data: ServerWishlistItem[] }) => raw.data,
      providesTags: [{ type: 'Wishlist', id: 'LIST' }],
    }),

    // Toggle a wishlist entry — server adds if missing, deletes if present.
    toggleWishlistItem: build.mutation<
      ServerWishlistItem | { removed: true },
      { phone: string; productId: string }
    >({
      query: (body) => ({ url: '/website/wishlist/items', method: 'POST', body }),
      transformResponse: (raw: { data: ServerWishlistItem | { removed: true } }) => raw.data,
      invalidatesTags: [{ type: 'Wishlist', id: 'LIST' }],
    }),
  }),
});

export const {
  useIdentifyCustomerMutation,
  useGetCartQuery,
  useLazyGetCartQuery,
  useUpsertCartItemMutation,
  useClearCartMutation,
  useGetWishlistQuery,
  useToggleWishlistItemMutation,
} = customerApi;
