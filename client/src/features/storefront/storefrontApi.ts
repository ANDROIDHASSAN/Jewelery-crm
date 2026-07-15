// RTK Query slice for the database-backed storefront content.
// - getPublicStorefront: hits the public /website/storefront endpoint (no auth) — used by the storefront pages.
// - getAdminStorefront / updateStorefront: hit the auth'd /storefront endpoint — used by the Website CMS.

import type { StorefrontContent } from '@goldos/shared/schemas';
import { baseApi } from '@/app/store';

export interface StorefrontResponse {
  content: StorefrontContent;
  version: number;
  updatedAt: string;
}

export interface PublicProduct {
  id: string;
  slug: string;
  name: string;
  descriptionMd: string;
  images: string[];
  weightMg: number;
  purityCaratX100: number;
  makingChargeBps: number;
  /** Mode for making charge calculation: PERCENTAGE (of metal value) or PER_GRAM (flat ₹/g). */
  makingChargeMode: 'PERCENTAGE' | 'PER_GRAM' | null;
  /** Per-gram making charge in paise. Used when makingChargeMode is PER_GRAM. */
  makingChargePerGramPaise: number | null;
  basePricePaise: number;
  /**
   * Pre-GST taxable base for a FIXED-priced piece (admin set a selling price).
   * Non-null = skip the live metal-rate calc and price off this value + GST so
   * the customer pays exactly the inclusive selling price. Null = price live.
   */
  fixedPricePaise: number | null;
  stoneChargePaise: number;
  /**
   * Customer-facing diamond value in paise (Σ of the linked item's stone-group
   * selling prices). Already included in `stoneChargePaise` (and therefore the
   * total) — surfaced separately so the PDP can show a labelled "Diamond value"
   * line in the price breakup. 0 for pieces without priced diamonds.
   */
  diamondValuePaise?: number;
  /**
   * Per-stone-group detail for the PDP price breakup — carat weight, count and
   * customer-facing value (the stone's selling price). Only priced groups are
   * included; the internal purchase cost is never exposed. Their values sum to
   * `diamondValuePaise` (and are part of `stoneChargePaise` / the total).
   */
  diamonds?: { shape: string | null; caratWeightX100: number; count: number; valuePaise: number }[];
  /**
   * Season Sale offer on this piece (PERCENT / FLAT / BOGO), or null when not on
   * sale. Drives the struck price + offer badge on cards and the PDP.
   */
  sale?: { type: 'PERCENT' | 'FLAT' | 'BOGO'; discountBps: number; discountFlatPaise: number; bogo: boolean } | null;
  /**
   * Optional size variants `{ label, weightMg }`. When non-empty the PDP shows
   * a size selector and prices the piece off the SELECTED size's weight at the
   * live metal rate (fixedPricePaise is ignored for sized pieces). Null/empty =
   * single-weight piece priced off `weightMg`.
   */
  sizes?: { label: string; weightMg: number }[] | null;
  /**
   * Custom "Details & Dimensions" spec rows mirrored from the inventory item —
   * rendered under the PDP Specification (e.g. Closure/Hoopwire, Length/1.5 cm,
   * Net Quantity/1 Pair). Null/empty = none.
   */
  specs?: { label: string; value: string }[] | null;
  categoryId: string;
  /** Target audience — drives the storefront "Shop by Gender" filter. Null = unspecified/unisex. */
  gender: 'MEN' | 'WOMEN' | null;
  /** Metal type from the linked category — gates gold vs silver vs non-precious price calc. */
  metalType: 'GOLD' | 'SILVER' | 'DIAMOND' | 'PLATINUM' | 'STAINLESS_STEEL' | 'OTHER' | null;
  /** BIS Hallmark Unique ID (6-char). Null for non-gold pieces. */
  bisHuid: string | null;
  /** ISO timestamp of when the piece was hallmarked. */
  hallmarkedAt: string | null;
  /** SKU from the linked inventory item. Null for products without a linked item. */
  sku: string | null;
  isPublished: boolean;
  createdAt: string;
  /**
   * Live availability flag computed by the server from the linked inventory
   * Item. `false` when the piece is sold / melted / out of stock; storefront
   * cards render a "Sold out" badge in that case. Defaults to `true` for
   * legacy products without a linked Item.
   */
  inStock: boolean;
}

/**
 * Per-slug availability of a cart line, from POST /website/products/availability.
 * `available` = still exists as a published product; `inStock` = orderable right
 * now. A deleted/unpublished piece comes back `{ available: false, inStock: false }`.
 */
export interface CartAvailability {
  slug: string;
  available: boolean;
  inStock: boolean;
  name: string | null;
}

/** A published product on sale — a PublicProduct whose `sale` offer is set. */
export interface PublicSaleProduct extends PublicProduct {
  sale: { type: 'PERCENT' | 'FLAT' | 'BOGO'; discountBps: number; discountFlatPaise: number; bogo: boolean };
}

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  /** parent category id when this is a sub-category, null for main categories. */
  parentId: string | null;
  /** Admin-controlled display order (lower = first). Optional for legacy payloads. */
  sortOrder?: number;
}

/** A curated inventory Collection (cross-category grouping) for "Shop by Collection". */
export interface PublicCollection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder?: number;
  /** Live count of PUBLISHED products in this collection, across all metals. */
  publishedCount?: number;
  /**
   * Published product count per metal (from the linked item's category), e.g.
   * `{ STAINLESS_STEEL: 3, GOLD: 1 }`. A collection is an Item↔Collection M2M
   * with no metal of its own, so it can span lines — the homepage renders one
   * collections row per line and each picks its own count from here.
   */
  countByMetal?: Record<string, number>;
}

export interface PublicGoldRate {
  purity: number;
  ratePerGramPaise: number;
  stale: boolean;
}

/**
 * A coupon the jeweller has opted to advertise (Website → Coupons → "Show on
 * storefront"). The server only returns codes that are genuinely redeemable
 * right now — active, in their validity window, and not used up.
 */
export interface PublicCoupon {
  code: string;
  /** Ready-to-render offer text, e.g. "10% off" / "Buy 2 Get 1 free". */
  offerLabel: string;
  /** Minimum cart subtotal in paise; 0 = no minimum. */
  minCartPaise: number;
  validUntil: string | null;
}

/** Where a rate came from. `cms` = typed in Website → Gold rates (no API key). */
export type PublicRateSource = 'live' | 'cms' | 'live-stale' | 'none';

export interface PublicGoldRateResponse {
  /**
   * The published rates. The storefront quotes 9K gold ONLY — no 24K/22K/18K.
   * With GOLDAPI_KEY attached these are live; otherwise they are the CMS rates.
   * Platinum is CMS-only (no provider feeds it). null = unconfigured.
   */
  gold9kPaise: number | null;
  silverPaise: number | null;
  platinum950Paise: number | null;
  goldSource: PublicRateSource;
  silverSource: PublicRateSource;
  platinumSource: PublicRateSource;
  stale: boolean;
  cmsUpdatedAt: string | null;
  /**
   * Per-purity rates, kept for PRODUCT PRICING only — a piece is priced at its
   * own registered purity, which may not be 9K. Never render these as a quoted
   * rate; the storefront shows 9K.
   */
  rates: PublicGoldRate[];
  asOf: string;
}

// Saved shipping address, as returned by /customers/identify. Default-first
// ordering on the server means index 0 is the one to pre-fill at checkout.
export interface SavedAddress {
  id: string;
  label: string | null;
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

export const storefrontApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // Live gold/silver rate for the storefront ticker. Polls every 5 min so a
    // worker refresh shows up within the customer's session without thrashing
    // the network. No auth — the rate is public.
    getPublicGoldRate: build.query<PublicGoldRateResponse, void>({
      query: () => ({ url: '/website/gold-rate' }),
      transformResponse: (raw: { data: PublicGoldRateResponse }) => raw.data,
    }),
    getPublicStorefront: build.query<StorefrontResponse, void>({
      query: () => ({ url: '/website/storefront' }),
      transformResponse: (raw: { data: StorefrontResponse }) => raw.data,
      providesTags: [{ type: 'StorefrontContent', id: 'LIST' }],
    }),
    getAdminStorefront: build.query<StorefrontResponse, void>({
      query: () => ({ url: '/storefront' }),
      transformResponse: (raw: { data: StorefrontResponse }) => raw.data,
      providesTags: [{ type: 'StorefrontContent', id: 'LIST' }],
    }),
    updateStorefront: build.mutation<StorefrontResponse, StorefrontContent>({
      query: (content) => ({ url: '/storefront', method: 'PUT', body: content }),
      transformResponse: (raw: { data: StorefrontResponse }) => raw.data,
      // Don't invalidate the StorefrontContent tag — that would trigger a
      // second GET roundtrip (which on Render free-tier cold start can add
      // 5-15s on top of the PUT itself, making Publish feel like 8-20s).
      // The PUT response already carries the canonical saved content, so we
      // patch the admin + public caches directly from it. Result: Publish
      // feels instant once the server ACKs the write.
      async onQueryStarted(content, { dispatch, queryFulfilled }) {
        // Optimistic patch on both caches so the UI flips to "Published" the
        // moment the cashier clicks the button. Roll back if the PUT fails.
        const optimistic = {
          content,
          version: 0,
          updatedAt: new Date().toISOString(),
        } as StorefrontResponse;
        const adminPatch = dispatch(
          storefrontApi.util.updateQueryData('getAdminStorefront', undefined, () => optimistic),
        );
        const publicPatch = dispatch(
          storefrontApi.util.updateQueryData('getPublicStorefront', undefined, () => optimistic),
        );
        try {
          const { data: saved } = await queryFulfilled;
          // Server confirmed — overwrite optimistic with the authoritative
          // payload (carries the real version number + updatedAt).
          dispatch(storefrontApi.util.updateQueryData('getAdminStorefront', undefined, () => saved));
          dispatch(storefrontApi.util.updateQueryData('getPublicStorefront', undefined, () => saved));
        } catch {
          adminPatch.undo();
          publicPatch.undo();
        }
      },
    }),
    getPublicProducts: build.query<PublicProduct[], { section?: string } | void>({
      query: (arg) => ({
        url: '/website/products',
        params: arg && arg.section ? { section: arg.section } : undefined,
      }),
      transformResponse: (raw: { data: PublicProduct[] }) => raw.data,
      providesTags: [{ type: 'Product', id: 'PUBLIC' }],
    }),
    // Batch availability for the current cart slugs. Time-sensitive (stock
    // changes), so it's never cached — keepUnusedDataFor: 0 + the cart calls it
    // with refetchOnMountOrArgChange. Pass a SORTED slug list so the RTK cache
    // key is stable regardless of cart order.
    getCartAvailability: build.query<CartAvailability[], string[]>({
      query: (slugs) => ({
        url: '/website/products/availability',
        method: 'POST',
        body: { slugs },
      }),
      transformResponse: (raw: { data: CartAvailability[] }) => raw.data,
      keepUnusedDataFor: 0,
    }),
    // Season Sale feed — published products on sale, each carrying its discount
    // (basis points). Drives the storefront "Season Sales" section.
    getPublicSaleItems: build.query<PublicSaleProduct[], void>({
      query: () => ({ url: '/website/sale-items' }),
      transformResponse: (raw: { data: PublicSaleProduct[] }) => raw.data,
      providesTags: [{ type: 'Product', id: 'SALE' }],
    }),
    // Coupons the jeweller opted to advertise. Polled on the same 5-min cadence
    // as the rate, so publishing/unpublishing a code from the admin shows up in
    // an open session without a reload.
    getPublicCoupons: build.query<PublicCoupon[], void>({
      query: () => ({ url: '/website/coupons' }),
      transformResponse: (raw: { data: PublicCoupon[] }) => raw.data,
      providesTags: [{ type: 'Coupon', id: 'PUBLIC' }],
    }),
    getPublicCollections: build.query<PublicCategory[], void>({
      query: () => ({ url: '/website/collections' }),
      transformResponse: (raw: { data: PublicCategory[] }) => raw.data,
      providesTags: [{ type: 'Category', id: 'PUBLIC' }],
    }),
    // Curated inventory collections (cross-category groupings) for the "Shop by
    // Collection" menu. Only collections with ≥1 published product are returned.
    getPublicCollectionsList: build.query<PublicCollection[], void>({
      query: () => ({ url: '/website/collections-list' }),
      transformResponse: (raw: { data: PublicCollection[] }) => raw.data,
      providesTags: [{ type: 'Category', id: 'PUBLIC_COLLECTIONS' }],
    }),
    getCollectionItems: build.query<PublicProduct[], string>({
      query: (slug) => ({ url: `/website/collections/${slug}/items` }),
      transformResponse: (raw: { data: PublicProduct[] }) => raw.data,
      providesTags: (_r, _e, slug) => [{ type: 'Product', id: `COLLECTION:${slug}` }],
    }),
    // Public reviews for a product. Returns aggregate (avg, count, per-star
    // distribution) + a limited list of recent reviews. Author names are
    // already privacy-redacted server-side (first name + last initial +
    // masked phone tail).
    getProductReviews: build.query<
      {
        summary: {
          avg: number;
          count: number;
          distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
        };
        reviews: Array<{
          id: string;
          rating: number;
          title: string | null;
          body: string;
          photos: string[];
          createdAt: string;
          author: { name: string; phoneMasked: string | null };
        }>;
      },
      { slug: string; limit?: number }
    >({
      query: ({ slug, limit }) => ({
        url: `/website/products/${slug}/reviews`,
        params: typeof limit === 'number' ? { limit } : undefined,
      }),
      transformResponse: (raw: {
        data: {
          summary: { avg: number; count: number; distribution: Record<'1' | '2' | '3' | '4' | '5', number> };
          reviews: Array<{
            id: string;
            rating: number;
            title: string | null;
            body: string;
            photos: string[];
            createdAt: string;
            author: { name: string; phoneMasked: string | null };
          }>;
        };
      }) => raw.data,
      providesTags: (_r, _e, a) => [{ type: 'Order', id: `REVIEWS:${a.slug}` }],
    }),
    // Public storefront checkout. Server computes prices from the DB, so client cart
    // pricing can't be tampered with. Creates Order + OrderItems + (if needed) Customer.
    lookupOrder: build.query<
      {
        id: string;
        status: string;
        totalPaise: number;
        subtotalPaise: number;
        shippingPaise: number;
        taxPaise: number;
        paymentMethod: string;
        createdAt: string;
        shiprocketAwb: string | null;
        expectedDeliveryAt: string | null;
        cancelReason: string | null;
        items: Array<{
          id: string;
          qty: number;
          pricePaise: number;
          product?: { name: string; slug: string; images: string[] };
        }>;
        customer?: { name: string; phone: string };
        events: Array<{
          id: string;
          status: string;
          note: string | null;
          location: string | null;
          actorName: string | null;
          createdAt: string;
        }>;
      },
      { id: string; phone: string }
    >({
      query: ({ id, phone }) => ({ url: '/website/orders/lookup', params: { id, phone } }),
      transformResponse: (raw: { data: never }) => raw.data,
    }),
    // List of every order on a phone — drives My Orders on AccountPage.
    // `review` is the customer's prior review (if any) — null on un-reviewed
    // orders so the UI can branch between a "Write a review" CTA and a
    // read-only "Reviewed" pill.
    listOrdersByPhone: build.query<
      Array<{
        id: string;
        status: string;
        totalPaise: number;
        createdAt: string;
        expectedDeliveryAt: string | null;
        paymentMethod: 'cod' | 'razorpay' | 'reserve-at-store';
        paymentStatus: 'PENDING' | 'PAID' | 'FAILED';
        items: Array<{ id: string; qty: number; product?: { name: string; images: string[] } }>;
        review: {
          id: string;
          rating: number;
          title: string | null;
          body: string;
          photos: string[];
          createdAt: string;
        } | null;
      }>,
      // `customerId` (when the visitor is signed in) joins on the immutable
      // Customer PK and is preferred by the server — protects against any
      // phone-format drift between account.phone and the Customer row the
      // order is linked to. `phone` stays as a fallback for the public
      // /store/track lookup which doesn't have customerId in hand.
      { phone: string; customerId?: string }
    >({
      query: ({ phone, customerId }) => ({
        url: '/website/orders/by-phone',
        params: customerId ? { phone, customerId } : { phone },
      }),
      transformResponse: (raw: { data: never }) => raw.data,
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Order' as const, id })),
              { type: 'Order' as const, id: 'BY_PHONE' },
            ]
          : [{ type: 'Order' as const, id: 'BY_PHONE' }],
    }),
    // Loyalty-points balance for the signed-in customer, keyed by phone (with
    // customerId as a fallback). Backs the "Loyalty wallet" card on the account
    // page. `worthPaise` is the rupee value the server computed from the
    // tenant's loyalty config, so the UI just renders it.
    getLoyaltyByPhone: build.query<
      { loyaltyPoints: number; worthPaise: number },
      { phone: string; customerId?: string }
    >({
      query: ({ phone, customerId }) => ({
        url: '/website/customers/loyalty',
        params: customerId ? { phone, customerId } : { phone },
      }),
      transformResponse: (raw: { data: { loyaltyPoints: number; worthPaise: number } }) => raw.data,
      providesTags: [{ type: 'Customer', id: 'LOYALTY' }],
    }),
    // Customer-authored review on a delivered order. Phone is the auth —
    // server verifies it matches the order's customer before accepting.
    createOrderReview: build.mutation<
      { id: string; rating: number; title: string | null; body: string; photos: string[]; createdAt: string },
      { orderId: string; phone: string; rating: number; title?: string; body: string; photos?: string[] }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/website/orders/${orderId}/review`,
        method: 'POST',
        body,
      }),
      transformResponse: (raw: { data: { id: string; rating: number; title: string | null; body: string; photos: string[]; createdAt: string } }) => raw.data,
      // Bump the by-phone listing so the "Write review" → "Reviewed" UI
      // flip happens on the next render without waiting for the 20s poll.
      invalidatesTags: [{ type: 'Order', id: 'BY_PHONE' }],
    }),
    createPublicOrder: build.mutation<
      {
        id: string;
        totalPaise: number;
        expectedDeliveryAt: string | null;
        razorpay: {
          keyId: string;
          orderId: string;
          amountPaise: number;
          currency: 'INR';
          simulated: boolean;
        } | null;
      },
      {
        customer: { name: string; phone: string; email?: string };
        // Items may identify the product by id, slug, or both. Slug is the
        // resilient path — `/website/products` is edge-cached on Vercel, so
        // cached ids can be stale after a reseed or unpublish. The server
        // prefers slug when both are present.
        items: Array<{ productId?: string; slug?: string; qty: number; sizeLabel?: string }>;
        paymentMethod?: 'reserve-at-store' | 'razorpay' | 'cod';
        shippingPaise?: number;
        shippingAddress?: {
          name: string;
          phone: string;
          line1: string;
          line2?: string;
          city: string;
          state: string;
          pincode: string;
        };
        notes?: string;
        saveAddress?: boolean;
        couponCode?: string;
        useLoyaltyPoints?: boolean;
        loyaltyPointsAmount?: number;
      }
    >({
      query: (body) => ({ url: '/website/orders', method: 'POST', body }),
      transformResponse: (raw: {
        data: {
          id: string;
          totalPaise: number;
          expectedDeliveryAt: string | null;
          razorpay: {
            keyId: string;
            orderId: string;
            amountPaise: number;
            currency: 'INR';
            simulated: boolean;
          } | null;
        };
      }) => raw.data,
      invalidatesTags: [{ type: 'Order', id: 'LIST' }],
    }),
    verifyRazorpayPayment: build.mutation<
      { id: string; paymentStatus: 'PAID'; alreadyPaid: boolean },
      {
        orderId: string;
        razorpayOrderId: string;
        razorpayPaymentId: string;
        razorpaySignature: string;
      }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/website/orders/${orderId}/payment/verify`,
        method: 'POST',
        body,
      }),
      transformResponse: (raw: { data: { id: string; paymentStatus: 'PAID'; alreadyPaid: boolean } }) => raw.data,
    }),
    // Sign-in / sign-up for the storefront. Phone is the identity; the server
    // upserts a Customer and (on new signups or high-intent re-engagement)
    // creates a Lead so the sales team can call/message the visitor. Returns
    // the canonical server-side cart + wishlist so the UI hydrates from a
    // single round-trip after auth.
    identifyCustomer: build.mutation<
      {
        customer: { id: string; name: string; phone: string; email: string | null };
        isNew: boolean;
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
        addresses: Array<SavedAddress>;
      },
      {
        phone: string;
        name?: string;
        email?: string;
        pincode?: string;
        dob?: string;
        anniversary?: string;
        intent?: 'buy-now' | 'add-to-cart' | 'wishlist' | 'checkout' | 'browse';
        interest?: string;
        utmSource?: string;
        utmCampaign?: string;
        mergeCart?: Array<{ productId: string; qty: number }>;
        mergeWishlist?: Array<{ productId: string }>;
      }
    >({
      query: (body) => ({ url: '/website/customers/identify', method: 'POST', body }),
      transformResponse: (raw: { data: never }) => raw.data,
      invalidatesTags: [{ type: 'Lead', id: 'LIST' }],
    }),
    // Public lead/enquiry submission. Reservations from the storefront PDP land here as Leads.
    createEnquiry: build.mutation<
      { id: string },
      { source: string; name: string; phone: string; interest?: string; utmSource?: string; utmCampaign?: string }
    >({
      query: (body) => ({ url: '/website/enquiry', method: 'POST', body }),
      transformResponse: (raw: { data: { id: string } }) => raw.data,
      invalidatesTags: [{ type: 'Lead', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetPublicGoldRateQuery,
  useGetPublicStorefrontQuery,
  useGetAdminStorefrontQuery,
  useUpdateStorefrontMutation,
  useGetPublicProductsQuery,
  useGetCartAvailabilityQuery,
  useGetPublicSaleItemsQuery,
  useGetPublicCollectionsQuery,
  useGetPublicCollectionsListQuery,
  useGetPublicCouponsQuery,
  useGetCollectionItemsQuery,
  useCreateEnquiryMutation,
  useIdentifyCustomerMutation,
  useCreatePublicOrderMutation,
  useVerifyRazorpayPaymentMutation,
  useLazyLookupOrderQuery,
  useLookupOrderQuery,
  useListOrdersByPhoneQuery,
  useGetLoyaltyByPhoneQuery,
  useCreateOrderReviewMutation,
  useGetProductReviewsQuery,
} = storefrontApi;
