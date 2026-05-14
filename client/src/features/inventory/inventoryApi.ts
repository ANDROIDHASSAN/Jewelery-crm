import { baseApi } from '@/app/store';
import type { Item, ItemInput, ApiList, ApiOne, Category } from '@goldos/shared/types';

export const inventoryApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getItems: b.query<ApiList<Item>, { shopId?: string; categoryId?: string; cursor?: string; search?: string }>({
      query: (params) => ({ url: '/inventory/items', params }),
      providesTags: (r) =>
        r
          ? [
              ...r.data.map(({ id }) => ({ type: 'Item' as const, id })),
              { type: 'Item' as const, id: 'LIST' },
            ]
          : [{ type: 'Item' as const, id: 'LIST' }],
    }),
    createItem: b.mutation<ApiOne<Item>, ItemInput>({
      query: (body) => ({ url: '/inventory/items', method: 'POST', body }),
      invalidatesTags: [{ type: 'Item', id: 'LIST' }, 'StockValuation'],
    }),
    updateItem: b.mutation<ApiOne<Item>, { id: string; patch: Partial<ItemInput> }>({
      query: ({ id, patch }) => ({ url: `/inventory/items/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: (_r, _e, a) => [{ type: 'Item', id: a.id }, { type: 'Item', id: 'LIST' }],
    }),
    transferItem: b.mutation<void, { id: string; toShopId: string; reason: string }>({
      query: ({ id, ...body }) => ({ url: `/inventory/items/${id}/transfer`, method: 'POST', body }),
      invalidatesTags: (_r, _e, a) => [{ type: 'Item', id: a.id }, { type: 'Item', id: 'LIST' }],
    }),
    getCategories: b.query<ApiList<Category>, void>({
      query: () => '/inventory/categories',
      providesTags: [{ type: 'Category', id: 'LIST' }],
    }),
    getValuation: b.query<ApiOne<{ totalPaise: number; itemCount: number; asOf: string }>, { shopId?: string }>({
      query: (params) => ({ url: '/inventory/valuation', params }),
      providesTags: ['StockValuation'],
    }),
  }),
});

export const {
  useGetItemsQuery,
  useCreateItemMutation,
  useUpdateItemMutation,
  useTransferItemMutation,
  useGetCategoriesQuery,
  useGetValuationQuery,
} = inventoryApi;
