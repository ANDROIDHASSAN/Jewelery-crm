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
  AddStock,
} from '@goldos/shared/types';

export interface AddStockResult {
  mode: 'serialized' | 'lot';
  added: number;
  newQuantity?: number;
  newItemIds?: string[];
}

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
  // Server now joins these so transfer / wastage tables can show real names.
  item?: { id: string; sku: string } | null;
  fromShop?: { id: string; name: string } | null;
  toShop?: { id: string; name: string } | null;
}

export interface PurchaseOrderRow {
  id: string;
  vendorId: string;
  status: 'DRAFT' | 'PLACED' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
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

export interface LowStockItem {
  id: string;
  sku: string;
  /** Item display name (Floral pendant). Falls back to SKU when null. */
  name: string | null;
  /** Cloudinary image URLs — first one is the thumbnail. */
  images: string[];
  shopId: string;
  categoryId: string;
  weightMg: number;
  purityCaratX100: number;
  costPricePaise: number;
  hallmarkStatus: 'PENDING' | 'SUBMITTED' | 'CERTIFIED' | 'EXEMPT';
  /** Hybrid stock model — true = one-piece-per-row, false = lot. */
  isSerialized: boolean;
  /** Live count. 1 for IN_STOCK serialized, lot counter, 0 for SOLD/drained. */
  quantityOnHand: number;
  /** Drives the Sold-out badge + sort order. */
  status: 'IN_STOCK' | 'IN_TRANSIT' | 'SOLD' | 'MELTED';
}

export interface LowStockRow {
  threshold: number;
  rows: Array<{ categoryId: string; shopId: string; itemCount: number }>;
  items: LowStockItem[];
}

export const inventoryApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getItems: b.query<ApiList<Item>, { shopId?: string; categoryId?: string; cursor?: string; search?: string; limit?: number }>({
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
    recordWastage: b.mutation<ApiOne<ItemMovementRow>, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/inventory/items/${id}/wastage`, method: 'POST', body: { reason } }),
      invalidatesTags: (_r, _e, a) => [
        { type: 'Item', id: a.id },
        { type: 'Item', id: 'LIST' },
        'StockValuation',
      ],
    }),
    // Add stock to an existing Item (serialized -> clone N rows, lot -> bump
    // quantityOnHand). Server returns { mode, added, newQuantity? } so the
    // toast can confirm exactly what happened.
    addStock: b.mutation<ApiOne<AddStockResult>, { id: string } & AddStock>({
      query: ({ id, ...body }) => ({
        url: `/inventory/items/${id}/add-stock`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, a) => [
        { type: 'Item', id: a.id },
        { type: 'Item', id: 'LIST' },
        { type: 'Item', id: 'MOVEMENTS' },
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
    receivePurchaseOrder: b.mutation<
      ApiOne<PurchaseOrderRow>,
      { id: string; shopId: string; categoryId: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/inventory/purchase-orders/${id}/receive`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [
        { type: 'PurchaseOrder', id: 'LIST' },
        { type: 'Item', id: 'LIST' },
        'StockValuation',
      ],
    }),
    updateVendor: b.mutation<ApiOne<Vendor>, { id: string; patch: Partial<VendorInput> }>({
      query: ({ id, patch }) => ({ url: `/inventory/vendors/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: [{ type: 'Vendor', id: 'LIST' }],
    }),
    deleteVendor: b.mutation<void, string>({
      query: (id) => ({ url: `/inventory/vendors/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Vendor', id: 'LIST' }],
    }),
    getAuditLog: b.query<ApiList<AuditLogRow>, { entityType?: string; entityId?: string; cursor?: string } | void>({
      query: (params) => ({ url: '/inventory/audit', params: params ?? undefined }),
      providesTags: [{ type: 'Item', id: 'AUDIT' }],
    }),
    // Bulk import: send the file via FormData. dryRun=true validates only.
    bulkImportItems: b.mutation<
      ApiOne<{
        dryRun: boolean;
        totalRows: number;
        validRows: number;
        inserted: number;
        duplicates: string[];
        errors: Array<{ row: number; column?: string; message: string }>;
      }>,
      { file: File; dryRun: boolean }
    >({
      query: ({ file, dryRun }) => {
        const form = new FormData();
        form.append('file', file);
        form.append('dryRun', dryRun ? 'true' : 'false');
        return { url: '/inventory/items/bulk-import', method: 'POST', body: form };
      },
      invalidatesTags: [
        { type: 'Item', id: 'LIST' },
        { type: 'Item', id: 'MOVEMENTS' },
        { type: 'Item', id: 'AUDIT' },
        'StockValuation',
      ],
    }),
    getBulkImportTemplate: b.query<
      ApiOne<{ columns: string[]; example: Array<Record<string, string | number>> }>,
      void
    >({
      query: () => '/inventory/items/bulk-import/template',
    }),
  }),
});

export const {
  useGetItemsQuery,
  useCreateItemMutation,
  useUpdateItemMutation,
  useRecordWastageMutation,
  useAddStockMutation,
  useGetCategoriesQuery,
  useUpdateCategoryMakingChargeMutation,
  useGetValuationQuery,
  useGetLowStockQuery,
  useGetMovementsQuery,
  useGetVendorsQuery,
  useCreateVendorMutation,
  useGetPurchaseOrdersQuery,
  useCreatePurchaseOrderMutation,
  useReceivePurchaseOrderMutation,
  useUpdateVendorMutation,
  useDeleteVendorMutation,
  useGetAuditLogQuery,
  useBulkImportItemsMutation,
  useLazyGetBulkImportTemplateQuery,
} = inventoryApi;
