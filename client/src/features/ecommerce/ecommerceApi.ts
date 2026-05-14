import { baseApi } from '@/app/store';
import type { ApiList, ApiOne, Order, ProductInput } from '@goldos/shared/types';
import type { OrderStatus } from '@goldos/shared/constants';

// Product surface returned by the server. Shape mirrors the Prisma Product model.
export interface AdminProduct {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  description: string | null;
  pricePaise: number;
  weightMg: number | null;
  purityCaratX100: number | null;
  category: string | null;
  images: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const ecommerceApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getAdminProducts: b.query<ApiList<AdminProduct>, { search?: string; cursor?: string } | void>({
      query: (params) => ({ url: '/ecommerce/products', params: params ?? undefined }),
      providesTags: (r) =>
        r
          ? [
              ...r.data.map(({ id }) => ({ type: 'Product' as const, id })),
              { type: 'Product' as const, id: 'LIST' },
            ]
          : [{ type: 'Product' as const, id: 'LIST' }],
    }),
    createAdminProduct: b.mutation<ApiOne<AdminProduct>, ProductInput>({
      query: (body) => ({ url: '/ecommerce/products', method: 'POST', body }),
      invalidatesTags: [{ type: 'Product', id: 'LIST' }],
    }),
    getOrders: b.query<ApiList<Order>, { status?: OrderStatus; cursor?: string } | void>({
      query: (params) => ({ url: '/ecommerce/orders', params: params ?? undefined }),
      providesTags: (r) =>
        r
          ? [
              ...r.data.map(({ id }) => ({ type: 'Order' as const, id })),
              { type: 'Order' as const, id: 'LIST' },
            ]
          : [{ type: 'Order' as const, id: 'LIST' }],
    }),
  }),
});

export const {
  useGetAdminProductsQuery,
  useCreateAdminProductMutation,
  useGetOrdersQuery,
} = ecommerceApi;
