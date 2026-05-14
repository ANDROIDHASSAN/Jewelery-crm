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
  }),
});

export const {
  useGetPublicStorefrontQuery,
  useGetAdminStorefrontQuery,
  useUpdateStorefrontMutation,
} = storefrontApi;
