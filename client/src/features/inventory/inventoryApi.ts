import { baseApi } from '@/app/store';
import type {
  Item,
  ItemInput,
  ApiList,
  ApiOne,
  Category,
  Vendor,
  VendorInput,
  PurchaseOrderCreate,
} from '@goldos/shared/types';

export interface ItemMovementRow {
  id: string;
  itemId: string;
  fromShopId: string | null;
  toShopId: string | null;
  type: 'PURCHASE' | 'TRANSFER' | 'SALE' | 'RETURN' | 'WASTAGE' | 'ADJUSTMENT';
  qty: number;
  reason: string | null;
  performedByUserId: string | null;
  createdAt: string;
}

export interface PurchaseOrderRow {
  id: string;
  vendorId: string;
  status: 'DRAFT' | 'CONFIRMED' | 'RECEIVED' | 'CANCELLED';
  totalPaise: number;
  createdAt: string;
  vendor: { id: string; name: string };
  items: Array<{ id: string; itemSku: string; weightMg: number; purity: number; costPaise: number }>;
}

export interface AuditLogRow {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  userId: string | null;
  createdAt: string;
}

export interface ValuationRow {
  totalPaise: number;
  itemCount: number;
  asOf: string;
  byShop: Array<{ shopId: string; totalPaise: number; itemCount: number }>;
  byCategory: Array<{ categoryId: string; totalPaise: number; itemCount: number }>;
}

export interface LowStockRow {
  threshold: number;
  rows: Array<{ categoryId: string; shopId: string; itemCount: number }>;
}

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
      invalidatesTags: (_r, _e, a) => [
        { type: 'Item', id: a.id },
        { type: 'Item', id: 'LIST' },
        'StockValuation',
      ],
    }),
    recordWastage: b.mutation<ApiOne<ItemMovementRow>, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/inventory/items/${id}/wastage`, method: 'POST', body: { reason } }),
      invalidatesTags: (_r, _e, a) => [
        { type: 'Item', id: a.id },
        { type: 'Item', id: 'LIST' },
        'StockValuation',
      ],
    }),
    getCategories: b.query<ApiList<Category>, void>({
      query: () => '/inventory/categories',
      providesTags: [{ type: 'Category', id: 'LIST' }],
    }),
    updateCategoryMakingCharge: b.mutation<ApiOne<Category>, { id: string; defaultMakingChargeBps: number }>({
      query: ({ id, defaultMakingChargeBps }) => ({
        url: `/inventory/categories/${id}/making-charge`,
        method: 'PATCH',
        body: { defaultMakingChargeBps },
      }),
      invalidatesTags: [{ type: 'Category', id: 'LIST' }],
    }),
    getValuation: b.query<ApiOne<ValuationRow>, { shopId?: string }>({
      query: (params) => ({ url: '/inventory/valuation', params }),
      providesTags: ['StockValuation'],
    }),
    getLowStock: b.query<ApiOne<LowStockRow>, { threshold?: number } | void>({
      query: (params) => ({ url: '/inventory/low-stock', params: params ?? undefined }),
      providesTags: ['StockValuation'],
    }),
    getMovements: b.query<ApiList<ItemMovementRow>, { itemId?: string; type?: string; cursor?: string } | void>({
      query: (params) => ({ url: '/inventory/movements', params: params ?? undefined }),
      providesTags: [{ type: 'Item', id: 'MOVEMENTS' }],
    }),
    getVendors: b.query<ApiList<Vendor>, void>({
      query: () => '/inventory/vendors',
      providesTags: [{ type: 'Vendor', id: 'LIST' }],
    }),
    createVendor: b.mutation<ApiOne<Vendor>, VendorInput>({
      query: (body) => ({ url: '/inventory/vendors', method: 'POST', body }),
      invalidatesTags: [{ type: 'Vendor', id: 'LIST' }],
    }),
    getPurchaseOrders: b.query<ApiList<PurchaseOrderRow>, void>({
      query: () => '/inventory/purchase-orders',
      providesTags: [{ type: 'PurchaseOrder', id: 'LIST' }],
    }),
    createPurchaseOrder: b.mutation<ApiOne<PurchaseOrderRow>, PurchaseOrderCreate>({
      query: (body) => ({ url: '/inventory/purchase-orders', method: 'POST', body }),
      invalidatesTags: [{ type: 'PurchaseOrder', id: 'LIST' }],
    }),
    getAuditLog: b.query<ApiList<AuditLogRow>, { entityType?: string; entityId?: string; cursor?: string } | void>({
      query: (params) => ({ url: '/inventory/audit', params: params ?? undefined }),
      providesTags: [{ type: 'Item', id: 'AUDIT' }],
    }),
  }),
});

export const {
  useGetItemsQuery,
  useCreateItemMutation,
  useUpdateItemMutation,
  useTransferItemMutation,
  useRecordWastageMutation,
  useGetCategoriesQuery,
  useUpdateCategoryMakingChargeMutation,
  useGetValuationQuery,
  useGetLowStockQuery,
  useGetMovementsQuery,
  useGetVendorsQuery,
  useCreateVendorMutation,
  useGetPurchaseOrdersQuery,
  useCreatePurchaseOrderMutation,
  useGetAuditLogQuery,
} = inventoryApi;
