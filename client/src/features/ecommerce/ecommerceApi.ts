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
  // Optional size variants `{ label, weightMg }`. When present the storefront
  // prices the piece per selected size (live metal rate), not off a fixed price.
  sizes?: { label: string; weightMg: number }[] | null;
  isPublished: boolean;
  // Storefront homepage sections this product is featured in (one product can
  // be in several; still a single inventory record).
  sections?: string[];
  createdAt: string;
  // Pulled from the bridged inventory Item (Product.linkedItemId). Surfaces the
  // real stock-keeping id + SKU so the admin table can show the SKU and route
  // "Edit" to the full Edit Item dialog. Null when the product has no link.
  linkedItem?: { id: string; sku: string } | null;
}

export interface AdminOrderItem {
  id: string;
  productId: string;
  qty: number;
  pricePaise: number;
  product?: { id: string; name: string; slug: string; images: string[] } | null;
}

export interface AdminOrderEvent {
  id: string;
  status: OrderStatus;
  note: string | null;
  location: string | null;
  actorName: string | null;
  createdAt: string;
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
  expectedDeliveryAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  customer?: { id: string; name: string; phone: string } | null;
  items?: AdminOrderItem[];
  events?: AdminOrderEvent[];
  shippingName?: string | null;
  shippingPhone?: string | null;
  shippingLine1?: string | null;
  shippingLine2?: string | null;
  shippingCity?: string | null;
  shippingState?: string | null;
  shippingPincode?: string | null;
}


// Live-count snapshot returned by /ecommerce/orders/live-count. The single
// tenant-wide source of truth for every count + revenue figure displayed on
// EcommerceAdminPage — KPI cards, tab badges, board column headers, and the
// pulsing live banner all read from here so they're guaranteed in sync.
export interface OrderLiveCount {
  byStatus: Record<OrderStatus, number>;
  total: number;
  open: number;
  inTransit: number;
  needsAction: number;
  /** Sum of totalPaise across every order in the tenant (paise). */
  revenuePaise: number;
  reservationsTotal: number;
  reservationsOpen: number;
  productsTotal: number;
  productsPublished: number;
  /** ID of the most recently created order — used to deep-link the
   *  "new order arrived" toast to that exact order's drawer. Null when
   *  the tenant hasn't placed any order yet. */
  latestOrderId: string | null;
  /** Timestamp of the latest order — useful for safer delta detection
   *  alongside `total` (id alone can theoretically repeat if records
   *  are deleted and recreated, which we don't do but the type is honest). */
  latestOrderCreatedAt: string | null;
  asOf: string;
}

export interface OrderPatchPayload {
  status?: OrderStatus;
  shiprocketAwb?: string | null;
  note?: string;
  location?: string;
  cancelReason?: string;
  actorName?: string;
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
    // Single order with full event timeline. Used by the admin order drawer
    // so we can render the "what happened when" timeline without overloading
    // the list endpoint.
    getOrderDetail: b.query<ApiOne<AdminOrder>, string>({
      query: (id) => ({ url: `/ecommerce/orders/${id}` }),
      providesTags: (_r, _e, id) => [{ type: 'Order', id }],
    }),
    getOrdersLiveCount: b.query<ApiOne<OrderLiveCount>, void>({
      query: () => ({ url: '/ecommerce/orders/live-count' }),
      providesTags: [{ type: 'Order', id: 'LIVE_COUNT' }],
    }),
    updateOrder: b.mutation<ApiOne<AdminOrder>, { id: string; patch: OrderPatchPayload }>({
      query: ({ id, patch }) => ({ url: `/ecommerce/orders/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: (_r, _e, a) => [
        { type: 'Order', id: a.id },
        { type: 'Order', id: 'LIST' },
        { type: 'Order', id: 'LIVE_COUNT' },
      ],
    }),
  }),
});

export const {
  useGetAdminProductsQuery,
  useCreateAdminProductMutation,
  useUpdateAdminProductMutation,
  useDeleteAdminProductMutation,
  useGetOrdersQuery,
  useGetOrderDetailQuery,
  useGetOrdersLiveCountQuery,
  useUpdateOrderMutation,
} = ecommerceApi;
