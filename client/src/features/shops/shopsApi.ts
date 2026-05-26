import { baseApi } from '@/app/store';
import type { ApiList, ApiOne, Shop } from '@goldos/shared/types';

export const shopsApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getShops: b.query<ApiList<Shop>, void>({
      query: () => '/shops',
      providesTags: (r) =>
        r
          ? [...r.data.map(({ id }) => ({ type: 'Shop' as const, id })), { type: 'Shop' as const, id: 'LIST' }]
          : [{ type: 'Shop' as const, id: 'LIST' }],
    }),
    getShop: b.query<ApiOne<Shop>, string>({
      query: (id) => `/shops/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Shop' as const, id }],
    }),
    createShop: b.mutation<ApiOne<Shop>, Omit<Shop, 'id' | 'tenantId'>>({
      query: (body) => ({
        url: '/shops',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Shop', id: 'LIST' }],
    }),
  }),
});

export const { useGetShopsQuery, useGetShopQuery, useCreateShopMutation } = shopsApi;

