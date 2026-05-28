import { baseApi } from '@/app/store';
import type { ApiList, ApiOne, Shop } from '@goldos/shared/types';

export type ShopTypeFilter = 'WAREHOUSE' | 'RETAIL';

export const shopsApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getShops: b.query<ApiList<Shop>, { type?: ShopTypeFilter } | void>({
      query: (params) => ({ url: '/shops', params: params ?? undefined }),
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
    updateShop: b.mutation<ApiOne<Shop>, { id: string; patch: Partial<Omit<Shop, 'id' | 'tenantId'>> }>({
      query: ({ id, patch }) => ({
        url: `/shops/${id}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: (_r, _e, a) => [
        { type: 'Shop', id: a.id },
        { type: 'Shop', id: 'LIST' },
      ],
    }),
    // Soft-delete (server flips isActive=false). Pulls the row off the
    // list-level cache so it disappears immediately.
    deleteShop: b.mutation<void, string>({
      query: (id) => ({ url: `/shops/${id}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, id) => [
        { type: 'Shop', id },
        { type: 'Shop', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetShopsQuery,
  useGetShopQuery,
  useCreateShopMutation,
  useUpdateShopMutation,
  useDeleteShopMutation,
} = shopsApi;
