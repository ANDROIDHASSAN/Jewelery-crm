import { baseApi } from '@/app/store';
import type { ApiList, ApiOne, ProductInput } from '@goldos/shared/types';
import type { OrderStatus } from '@goldos/shared/constants';

// Product surface returned by the server — mirrors Prisma Product.
export interface AdminProduct {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  descriptionMd: string;
  basePricePaise: number;
  stoneChargePaise: number;
  weightMg: number;
  purityCaratX100: number;
  makingChargeBps: number;
  categoryId: string;
  images: string[];
  isPublished: boolean;
  createdAt: string;
}

export interface AdminOrderItem {
  id: string;
  productId: string;
  qty: number;
  pricePaise: number;
}

// Order shape from /ecommerce/orders — includes customer + items.
export interface AdminOrder {
  id: string;
  tenantId: string;
  customerId: string;
  status: OrderStatus;
  subtotalPaise: number;
  shippingPaise: number;
  taxPaise: number;
  totalPaise: number;
  paymentMethod: string;
  shiprocketAwb: string | null;
  createdAt: string;
  customer?: { id: string; name: string; phone: string } | null;
  items?: AdminOrderItem[];
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
      invalidatesTags: [{ type: 'Product', id: 'LIST' }, { type: 'Product', id: 'PUBLIC' }],
    }),
    updateAdminProduct: b.mutation<ApiOne<AdminProduct>, { id: string; patch: Partial<ProductInput> }>({
      query: ({ id, patch }) => ({ url: `/ecommerce/products/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: (_r, _e, a) => [
        { type: 'Product', id: a.id },
        { type: 'Product', id: 'LIST' },
        { type: 'Product', id: 'PUBLIC' },
      ],
    }),
    deleteAdminProduct: b.mutation<void, string>({
      query: (id) => ({ url: `/ecommerce/products/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Product', id: 'LIST' }, { type: 'Product', id: 'PUBLIC' }],
    }),
    getOrders: b.query<ApiList<AdminOrder>, { status?: OrderStatus; cursor?: string } | void>({
      query: (params) => ({ url: '/ecommerce/orders', params: params ?? undefined }),
      providesTags: (r) =>
        r
          ? [
              ...r.data.map(({ id }) => ({ type: 'Order' as const, id })),
              { type: 'Order' as const, id: 'LIST' },
            ]
          : [{ type: 'Order' as const, id: 'LIST' }],
    }),
    updateOrder: b.mutation<ApiOne<AdminOrder>, { id: string; patch: { status?: OrderStatus; shiprocketAwb?: string | null } }>({
      query: ({ id, patch }) => ({ url: `/ecommerce/orders/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: (_r, _e, a) => [{ type: 'Order', id: a.id }, { type: 'Order', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetAdminProductsQuery,
  useCreateAdminProductMutation,
  useUpdateAdminProductMutation,
  useDeleteAdminProductMutation,
  useGetOrdersQuery,
  useUpdateOrderMutation,
} = ecommerceApi;
