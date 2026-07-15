import { baseApi } from '@/app/store';
import type {
  Item,
  ItemInput,
  ApiList,
  ApiOne,
  Category,
  Collection,
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

// Season Sale campaigns — multiple simultaneous offers, one tab each. A
// campaign holds ONE offer (PERCENT / FLAT / BOGO) over its member items.
export type SaleOfferType = 'PERCENT' | 'FLAT' | 'BOGO' | 'FIXED_PRICE';

// An item's effective offer, resolved from its active campaign (null = not on
// sale). Returned inline on each item so the POS can strike the sale price.
export interface ItemSaleOffer {
  type: SaleOfferType;
  discountBps: number;
  discountFlatPaise: number;
  campaignId: string;
}

export interface SaleCampaignRow {
  id: string;
  name: string;
  discountType: SaleOfferType;
  discountBps: number;
  discountFlatPaise: number;
  isActive: boolean;
  sortOrder: number;
  itemCount: number;
}

export interface SaleCampaignInput {
  name: string;
  discountType: SaleOfferType;
  discountBps: number;
  discountFlatPaise: number;
  isActive: boolean;
}

export interface SaleCampaignItem {
  id: string;
  sku: string;
  name: string | null;
  images: string[];
  weightMg: number;
  purityCaratX100: number;
  status: string;
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
  // Purchase (input) GST entered against the vendor invoice.
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  gstInterState: boolean;
  // Where the stock landed on receive (null for legacy / unreceived POs).
  receivedShopId: string | null;
  receivedAt: string | null;
  vendor: { id: string; name: string };
  items: Array<{
    id: string;
    itemSku: string;
    categoryId: string | null;
    name: string | null;
    weightMg: number;
    purity: number;
    costPaise: number;
    quantity: number;
    makingChargeBps: number | null;
    sellingPricePaise: number | null;
    hsnCode: string | null;
    gstRateBps: number | null;
    // Full item-detail fields persisted on the line — needed to pre-fill the
    // Edit PO form so every field (incl. diamonds) round-trips.
    publishToStorefront: boolean;
    description: string | null;
    images: string[];
    hallmarkStatus: string | null;
    hallmarkRef: string | null;
    stoneWeightMg: number | null;
    makingChargeMode: 'PERCENTAGE' | 'PER_GRAM' | null;
    makingChargePerGramPaise: number | null;
    isSerialized: boolean;
    gender: 'MEN' | 'WOMEN' | null;
    collectionIds: string[];
    diamondsJson: Array<{
      shape?: string | null;
      caratWeightX100?: number;
      cut?: string | null;
      clarity?: string | null;
      color?: string | null;
      count?: number;
      costPaise?: number;
      sellingPricePaise?: number | null;
      purchaseRatePaise?: number | null;
      sellRatePaise?: number | null;
    }>;
    specs: Array<{ label: string; value: string }>;
  }>;
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
  /**
   * The rate basis behind `totalPaise`. Gold is valued at the 9K rate scaled to
   * each piece's purity, silver at the silver rate, platinum at the Pt 950 rate;
   * everything else at cost. A null rate means unconfigured → those pieces fell
   * back to cost.
   */
  rateBasis: {
    gold9kPaise: number | null;
    silverPaise: number | null;
    platinum950Paise: number | null;
    goldSource: 'live' | 'cms' | 'live-stale' | 'none';
    stale: boolean;
  };
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
  /** Main (parent) category — shown alongside the sub-category (M3 FR#2). */
  mainCategoryId: string | null;
  mainCategoryName: string | null;
  /** Sub-category name (null when the item sits directly on a main category). */
  subCategoryName: string | null;
  /** The item's own category name (sub or main). */
  categoryName: string | null;
}

export interface LowStockRow {
  threshold: number;
  rows: Array<{
    categoryId: string;
    shopId: string;
    itemCount: number;
    mainCategoryId: string | null;
    mainCategoryName: string | null;
    subCategoryName: string | null;
    categoryName: string | null;
  }>;
  items: LowStockItem[];
}

export const inventoryApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getItems: b.query<ApiList<Item & { sale?: ItemSaleOffer | null }>, { shopId?: string; categoryId?: string; cursor?: string; search?: string; limit?: number }>({
      query: (params) => ({ url: '/inventory/items', params }),
      providesTags: (r) =>
        r
          ? [
              ...r.data.map(({ id }) => ({ type: 'Item' as const, id })),
              { type: 'Item' as const, id: 'LIST' },
            ]
          : [{ type: 'Item' as const, id: 'LIST' }],
    }),
    // Single item with its extras (collectionIds, diamonds, sizes, isPublished) —
    // used to open the full Edit Item dialog from the E-commerce catalog, where
    // only the linked item id is to hand.
    getItem: b.query<ApiOne<Item>, string>({
      query: (id) => ({ url: `/inventory/items/${id}` }),
      providesTags: (_r, _e, id) => [{ type: 'Item', id }],
    }),
    createItem: b.mutation<ApiOne<Item>, ItemInput>({
      query: (body) => ({ url: '/inventory/items', method: 'POST', body }),
      // Publishing to the website creates a linked storefront Product, so also
      // refresh the e-commerce catalog + public storefront feeds (shared baseApi
      // tags) — this is what lets the E-commerce "Add product" flow, which reuses
      // AddItemDialog, show the new piece without waiting for the 10s poll.
      invalidatesTags: [
        { type: 'Item', id: 'LIST' },
        'StockValuation',
        { type: 'Product', id: 'LIST' },
        { type: 'Product', id: 'PUBLIC' },
      ],
    }),
    updateItem: b.mutation<ApiOne<Item>, { id: string; patch: Partial<ItemInput> }>({
      query: ({ id, patch }) => ({ url: `/inventory/items/${id}`, method: 'PATCH', body: patch }),
      // Edits sync the linked storefront Product (name, price, sizes, publish), so
      // refresh the e-commerce catalog + public feeds too (shared baseApi tags).
      invalidatesTags: (_r, _e, a) => [
        { type: 'Item', id: a.id },
        { type: 'Item', id: 'LIST' },
        { type: 'Product', id: 'LIST' },
        { type: 'Product', id: 'PUBLIC' },
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
    // Delete an item. Hard-deletes (removes the row + stock) when the piece was
    // never sold; falls back to a soft delete (MELTED) only if it has sales
    // history. Blocked for SOLD items.
    deleteItem: b.mutation<ApiOne<{ hardDeleted: boolean }>, string>({
      query: (id) => ({ url: `/inventory/items/${id}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'Item', id }, { type: 'Item', id: 'LIST' }, 'StockValuation'],
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
    // Main / sub category management. parentId=null = top-level (main)
    // category; parentId=<id> = sub-category under that main.
    createCategory: b.mutation<
      ApiOne<Category>,
      {
        name: string;
        parentId: string | null;
        metalType: 'GOLD' | 'SILVER' | 'DIAMOND' | 'PLATINUM' | 'STAINLESS_STEEL' | 'OTHER';
        defaultMakingChargeBps: number;
        makingChargeMode?: 'PERCENTAGE' | 'PER_GRAM';
        defaultMakingChargePerGramPaise?: number | null;
        code?: string | null;
      }
    >({
      query: (body) => ({ url: '/inventory/categories', method: 'POST', body }),
      invalidatesTags: [{ type: 'Category', id: 'LIST' }],
    }),
    updateCategory: b.mutation<
      ApiOne<Category>,
      {
        id: string;
        patch: {
          name?: string;
          parentId?: string | null;
          metalType?: 'GOLD' | 'SILVER' | 'DIAMOND' | 'PLATINUM' | 'STAINLESS_STEEL' | 'OTHER';
          defaultMakingChargeBps?: number;
          makingChargeMode?: 'PERCENTAGE' | 'PER_GRAM';
          defaultMakingChargePerGramPaise?: number | null;
          code?: string | null;
        };
      }
    >({
      query: ({ id, patch }) => ({ url: `/inventory/categories/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: [{ type: 'Category', id: 'LIST' }],
    }),
    deleteCategory: b.mutation<void, string>({
      query: (id) => ({ url: `/inventory/categories/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Category', id: 'LIST' }, { type: 'Item', id: 'LIST' }],
    }),
    // Persist manual sub-category ordering (drag / up-down reorder).
    reorderCategories: b.mutation<ApiList<Category>, { orders: Array<{ id: string; sortOrder: number }> }>({
      query: (body) => ({ url: '/inventory/categories/reorder', method: 'PATCH', body }),
      invalidatesTags: [{ type: 'Category', id: 'LIST' }],
    }),
    // Collections (cross-category groupings — Bridal, Festival, …).
    getCollections: b.query<ApiList<Collection>, void>({
      query: () => '/inventory/collections',
      providesTags: [{ type: 'Collection', id: 'LIST' }],
    }),
    createCollection: b.mutation<ApiOne<Collection>, { name: string; description?: string | null; sortOrder?: number }>({
      query: (body) => ({ url: '/inventory/collections', method: 'POST', body }),
      invalidatesTags: [{ type: 'Collection', id: 'LIST' }],
    }),
    updateCollection: b.mutation<
      ApiOne<Collection>,
      { id: string; patch: { name?: string; description?: string | null; sortOrder?: number } }
    >({
      query: ({ id, patch }) => ({ url: `/inventory/collections/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: [{ type: 'Collection', id: 'LIST' }],
    }),
    deleteCollection: b.mutation<void, string>({
      query: (id) => ({ url: `/inventory/collections/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Collection', id: 'LIST' }, { type: 'Item', id: 'LIST' }],
    }),
    listCollectionItems: b.query<ApiList<Item>, string>({
      query: (collectionId) => `/inventory/collections/${collectionId}/items`,
      providesTags: (_, __, collectionId) => [{ type: 'Item', id: collectionId }],
    }),
    addItemsToCollection: b.mutation<ApiOne<{ message: string; added: number; skipped: number }>, { collectionId: string; itemIds: string[] }>({
      query: ({ collectionId, itemIds }) => ({
        url: `/inventory/collections/${collectionId}/items`,
        method: 'POST',
        body: { itemIds },
      }),
      invalidatesTags: (_, __, { collectionId }) => [{ type: 'Item', id: collectionId }],
    }),
    removeItemFromCollection: b.mutation<void, { collectionId: string; itemId: string }>({
      query: ({ collectionId, itemId }) => ({ url: `/inventory/collections/${collectionId}/items/${itemId}`, method: 'DELETE' }),
      invalidatesTags: (_, __, { collectionId }) => [{ type: 'Item', id: collectionId }],
    }),
    // Season Sale campaigns — multiple simultaneous offers (one tab each). The
    // 'LIST' tag also covers item prices so a campaign edit refreshes the grid.
    getSaleCampaigns: b.query<ApiList<SaleCampaignRow>, void>({
      query: () => '/inventory/sale-campaigns',
      providesTags: [{ type: 'SaleItem', id: 'CAMPAIGNS' }],
    }),
    createSaleCampaign: b.mutation<ApiOne<SaleCampaignRow>, SaleCampaignInput>({
      query: (body) => ({ url: '/inventory/sale-campaigns', method: 'POST', body }),
      invalidatesTags: [{ type: 'SaleItem', id: 'CAMPAIGNS' }],
    }),
    updateSaleCampaign: b.mutation<ApiOne<SaleCampaignRow>, { id: string; body: Partial<SaleCampaignInput> }>({
      query: ({ id, body }) => ({ url: `/inventory/sale-campaigns/${id}`, method: 'PATCH', body }),
      invalidatesTags: [
        { type: 'SaleItem', id: 'CAMPAIGNS' },
        { type: 'SaleItem', id: 'LIST' },
      ],
    }),
    deleteSaleCampaign: b.mutation<void, string>({
      query: (id) => ({ url: `/inventory/sale-campaigns/${id}`, method: 'DELETE' }),
      invalidatesTags: [
        { type: 'SaleItem', id: 'CAMPAIGNS' },
        { type: 'SaleItem', id: 'LIST' },
      ],
    }),
    getSaleCampaignItems: b.query<ApiList<SaleCampaignItem>, string>({
      query: (campaignId) => `/inventory/sale-campaigns/${campaignId}/items`,
      providesTags: (_r, _e, campaignId) => [{ type: 'SaleItem', id: `CAMP-${campaignId}` }],
    }),
    addItemsToCampaign: b.mutation<
      ApiOne<{ added: number; moved: number; skipped: number }>,
      { campaignId: string; itemIds: string[] }
    >({
      query: ({ campaignId, itemIds }) => ({
        url: `/inventory/sale-campaigns/${campaignId}/items`,
        method: 'POST',
        body: { itemIds },
      }),
      invalidatesTags: (_r, _e, { campaignId }) => [
        { type: 'SaleItem', id: `CAMP-${campaignId}` },
        { type: 'SaleItem', id: 'CAMPAIGNS' },
        { type: 'SaleItem', id: 'LIST' },
      ],
    }),
    removeItemFromCampaign: b.mutation<void, { campaignId: string; itemId: string }>({
      query: ({ campaignId, itemId }) => ({
        url: `/inventory/sale-campaigns/${campaignId}/items/${itemId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { campaignId }) => [
        { type: 'SaleItem', id: `CAMP-${campaignId}` },
        { type: 'SaleItem', id: 'CAMPAIGNS' },
        { type: 'SaleItem', id: 'LIST' },
      ],
    }),
    // Suggest the next SKU ([CODE]-[seq]) for a category — prefills the form.
    getSkuSuggestion: b.query<ApiOne<{ sku: string; code: string | null }>, string>({
      query: (categoryId) => ({ url: '/inventory/sku-suggestion', params: { categoryId } }),
    }),
    getValuation: b.query<ApiOne<ValuationRow>, { shopId?: string }>({
      query: (params) => ({ url: '/inventory/valuation', params }),
      providesTags: ['StockValuation'],
    }),
    getLowStock: b.query<
      ApiOne<LowStockRow>,
      { threshold?: number; includeSerialized?: boolean } | void
    >({
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
    // Edit an existing PO (vendor + lines + GST). Update body mirrors create.
    updatePurchaseOrder: b.mutation<ApiOne<PurchaseOrderRow>, { id: string } & PurchaseOrderCreate>({
      query: ({ id, ...body }) => ({ url: `/inventory/purchase-orders/${id}`, method: 'PATCH', body }),
      invalidatesTags: [{ type: 'PurchaseOrder', id: 'LIST' }],
    }),
    deletePurchaseOrder: b.mutation<void, string>({
      query: (id) => ({ url: `/inventory/purchase-orders/${id}`, method: 'DELETE' }),
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
    setPurchaseOrderGst: b.mutation<
      ApiOne<PurchaseOrderRow>,
      { id: string; interState: boolean; cgstPaise: number; sgstPaise: number; igstPaise: number }
    >({
      query: ({ id, ...body }) => ({
        url: `/inventory/purchase-orders/${id}/gst`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: [{ type: 'PurchaseOrder', id: 'LIST' }],
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
        poCount?: number;
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
    // Bulk import purchase orders — rows grouped into POs by (Vendor, PO Ref).
    bulkImportPurchaseOrders: b.mutation<
      ApiOne<{
        dryRun: boolean;
        totalRows: number;
        validRows: number;
        inserted: number;
        duplicates: string[];
        poCount?: number;
        errors: Array<{ row: number; column?: string; message: string }>;
      }>,
      { file: File; dryRun: boolean }
    >({
      query: ({ file, dryRun }) => {
        const form = new FormData();
        form.append('file', file);
        form.append('dryRun', dryRun ? 'true' : 'false');
        return { url: '/inventory/purchase-orders/bulk-import', method: 'POST', body: form };
      },
      invalidatesTags: ['PurchaseOrder'],
    }),
    getPoBulkImportTemplate: b.query<
      ApiOne<{ columns: string[]; example: Array<Record<string, string | number>> }>,
      void
    >({
      query: () => '/inventory/purchase-orders/bulk-import/template',
    }),
  }),
});

export const {
  useGetItemsQuery,
  useGetItemQuery,
  useCreateItemMutation,
  useUpdateItemMutation,
  useRecordWastageMutation,
  useDeleteItemMutation,
  useAddStockMutation,
  useGetCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useReorderCategoriesMutation,
  useGetCollectionsQuery,
  useCreateCollectionMutation,
  useUpdateCollectionMutation,
  useDeleteCollectionMutation,
  useListCollectionItemsQuery,
  useAddItemsToCollectionMutation,
  useRemoveItemFromCollectionMutation,
  useGetSaleCampaignsQuery,
  useCreateSaleCampaignMutation,
  useUpdateSaleCampaignMutation,
  useDeleteSaleCampaignMutation,
  useGetSaleCampaignItemsQuery,
  useAddItemsToCampaignMutation,
  useRemoveItemFromCampaignMutation,
  useLazyGetSkuSuggestionQuery,
  useUpdateCategoryMakingChargeMutation,
  useGetValuationQuery,
  useGetLowStockQuery,
  useGetMovementsQuery,
  useGetVendorsQuery,
  useCreateVendorMutation,
  useGetPurchaseOrdersQuery,
  useCreatePurchaseOrderMutation,
  useUpdatePurchaseOrderMutation,
  useDeletePurchaseOrderMutation,
  useReceivePurchaseOrderMutation,
  useSetPurchaseOrderGstMutation,
  useUpdateVendorMutation,
  useDeleteVendorMutation,
  useGetAuditLogQuery,
  useBulkImportItemsMutation,
  useLazyGetBulkImportTemplateQuery,
  useBulkImportPurchaseOrdersMutation,
  useLazyGetPoBulkImportTemplateQuery,
} = inventoryApi;
