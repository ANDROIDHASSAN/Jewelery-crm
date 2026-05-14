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
  basePricePaise: number;
  stoneChargePaise: number;
  categoryId: string;
  isPublished: boolean;
  createdAt: string;
}

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
}

export const storefrontApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
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
      invalidatesTags: [{ type: 'StorefrontContent', id: 'LIST' }],
    }),
    getPublicProducts: build.query<PublicProduct[], void>({
      query: () => ({ url: '/website/products' }),
      transformResponse: (raw: { data: PublicProduct[] }) => raw.data,
      providesTags: [{ type: 'Product', id: 'PUBLIC' }],
    }),
    getPublicCollections: build.query<PublicCategory[], void>({
      query: () => ({ url: '/website/collections' }),
      transformResponse: (raw: { data: PublicCategory[] }) => raw.data,
      providesTags: [{ type: 'Category', id: 'PUBLIC' }],
    }),
    // Public storefront checkout. Server computes prices from the DB, so client cart
    // pricing can't be tampered with. Creates Order + OrderItems + (if needed) Customer.
    createPublicOrder: build.mutation<
      { id: string; totalPaise: number },
      {
        customer: { name: string; phone: string };
        items: Array<{ productId: string; qty: number }>;
        paymentMethod?: 'reserve-at-store' | 'razorpay' | 'cod';
      }
    >({
      query: (body) => ({ url: '/website/orders', method: 'POST', body }),
      transformResponse: (raw: { data: { id: string; totalPaise: number } }) => raw.data,
      invalidatesTags: [{ type: 'Order', id: 'LIST' }],
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
  useGetPublicStorefrontQuery,
  useGetAdminStorefrontQuery,
  useUpdateStorefrontMutation,
  useGetPublicProductsQuery,
  useGetPublicCollectionsQuery,
  useCreateEnquiryMutation,
  useCreatePublicOrderMutation,
} = storefrontApi;
