// Analytics RTK Query slice — one hook per reports.* endpoint.

import { baseApi } from '@/app/store';
import type { ApiList, ApiOne } from '@goldos/shared/types';
import type { MetalRatesPayload } from '@/features/dashboard/dashboardApi';

// ---------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------

export interface AnalyticsDashboard {
  period: 'today' | 'week' | 'month';
  revenuePaise: number;
  billCount: number;
  newLeads: number;
  asOf: string;
}

export interface StaffRow {
  userId: string | null;
  userName: string | null;
  userRole: string | null;
  billCount: number;
  revenuePaise: number;
}

// Sales channel for the top-products family of reports.
//   'online' — storefront / e-commerce orders
//   'pos'    — in-store counter bills
export type TopChannel = 'online' | 'pos';

export interface TopProductRow {
  productId: string;
  name: string;
  slug: string;
  mainCategoryId?: string | null;
  mainCategoryName?: string | null;
  qty: number;
  orderCount: number;
  revenuePaise: number;
}

export interface TopCategoryRow {
  categoryId: string;
  name: string;
  // Only populated for the sub-category view — the main category this
  // sub-category sits under (null when the sub IS a top-level category).
  parentName?: string | null;
  qty: number;
  orderCount: number;
  revenuePaise: number;
}

export interface TopCollectionRow {
  collectionId: string;
  name: string;
  qty: number;
  orderCount: number;
  revenuePaise: number;
}

export interface ShopPerformanceRow {
  shopId: string;
  shopName: string;
  revenuePaise: number;
  gstPaise: number;
  expensePaise: number;
  netProfitPaise: number;
  billCount: number;
  profitPct: number;
  sharePct: number;
}

export interface VendorPurchaseRow {
  vendorId: string;
  vendorName: string;
  gstNumber: string | null;
  purchasePaise: number;
  gstPaise: number;
  taxablePaise: number;
  paidPaise: number;
  poCount: number;
  sharePct: number;
}

export interface ExpenseTrendRow {
  bucket: string;
  label: string;
  totalPaise: number;
  marketingPaise: number;
  otherPaise: number;
}

export interface StockTransferRoute {
  fromShopId: string;
  fromShopName: string;
  toShopId: string;
  toShopName: string;
  transferCount: number;
  quantity: number;
  weightMg: number;
}
export interface StockTransferItem {
  itemId: string;
  sku: string;
  name: string;
  quantity: number;
  weightMg: number;
}
export interface StockTransferReport {
  from: string;
  to: string;
  routes: StockTransferRoute[];
  topItems: StockTransferItem[];
  totals: { transferCount: number; quantity: number; weightMg: number };
}

export interface InventoryValuationAgg {
  count: number;
  weightMg: number;
  costPaise: number;
  marketPaise: number;
  unrealizedProfitPaise: number;
}

// Hierarchical node types for the Main → Sub → Items tree. The server
// derives the structure from Category.parentId so categories that pre-date
// the tree CMS (parent === null) appear as their own root with a single
// "(general)" sub.
export interface InventoryValuationItem extends InventoryValuationAgg {
  productName: string;
  itemId: string;
}

export interface InventoryValuationSub extends InventoryValuationAgg {
  subCategoryId: string;
  subCategoryName: string;
  items: InventoryValuationItem[];
}

export interface InventoryValuationMain extends InventoryValuationAgg {
  mainCategoryId: string;
  mainCategoryName: string;
  metalType: string;
  subs: InventoryValuationSub[];
}

export interface InventoryValuation {
  asOf: string;
  total: InventoryValuationAgg;
  byShop: Array<InventoryValuationAgg & { shopId: string; shopName: string }>;
  byCategory: Array<InventoryValuationAgg & {
    categoryId: string;
    categoryName: string;
    metalType: string;
  }>;
  byProduct: Array<InventoryValuationAgg & {
    productKey: string;
    productName: string;
    categoryName: string;
    metalType: string;
  }>;
  /** Hierarchical Main → Sub → Items breakdown. */
  categoryTree: InventoryValuationMain[];
  /** The rate basis this valuation ran on — 9K gold, silver, Pt 950. */
  metalRates: MetalRatesPayload;
}

export interface CustomerAcquisition {
  from: string;
  to: string;
  bySource: Array<{ source: string; leadCount: number; sharePct: number }>;
  byStatus: Array<{ status: string; count: number }>;
  totals: {
    totalLeads: number;
    converted: number;
    lost: number;
    conversionPct: number;
    newCustomers: number;
    returningCustomers: number;
    newRevenuePaise: number;
    returningRevenuePaise: number;
  };
}

export interface PlByPeriodRow {
  bucket: string;
  revenuePaise: number;
  netRevenuePaise: number;
  gstPaise: number;
  expensePaise: number;
  netProfitPaise: number;
  billCount: number;
}

export interface PlByPeriod {
  granularity: 'day' | 'week' | 'month';
  rows: PlByPeriodRow[];
}

export interface FestiveTrendRow {
  monthIdx: number;
  monthLabel: string;
  currentRevenuePaise: number;
  previousRevenuePaise: number;
  currentBills: number;
  previousBills: number;
  isFestive: boolean;
}

export interface FestiveTrend {
  currentYear: number;
  previousYear: number;
  series: FestiveTrendRow[];
}

export interface LowMarginItem {
  itemId: string;
  sku: string;
  shopName: string;
  categoryName: string;
  weightMg: number;
  purityCaratX100: number;
  costPricePaise: number;
  marketPaise: number;
  marginPaise: number;
  marginPct: number;
}

export interface LowMarginReport {
  thresholdPct: number;
  flaggedCount: number;
  flaggedValuePaise: number;
  items: LowMarginItem[];
}

export interface GstSummaryRow {
  month: string;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalGstPaise: number;
  taxableRevenuePaise: number;
  billCount: number;
}

export interface GstSummary {
  from: string;
  to: string;
  monthly: GstSummaryRow[];
}

export interface AdRoiCampaign {
  campaign: string;
  leadCount: number;
  convertedCount: number;
  attributedRevenuePaise: number;
  conversionPct: number;
}

export interface AdRoiReport {
  from: string;
  to: string;
  totals: {
    spendPaise: number;
    attributedRevenuePaise: number;
    roiX: number | null;
  };
  campaigns: AdRoiCampaign[];
}

export interface GoldRateImpactPoint {
  date: string;
  /** Derived from the stored 24K rate — 9K is the rate we publish. */
  rate9KPaise: number;
  revenuePaise: number;
  billCount: number;
}

export interface GoldRateImpact {
  from: string;
  to: string;
  series: GoldRateImpactPoint[];
  meta: { rateChangePct: number; totalRevenuePaise: number; observationCount: number };
}

export interface ScheduledReport {
  id: string;
  reportType: 'daily-sales' | 'weekly-pl' | 'monthly-gst' | 'inventory-valuation';
  frequency: 'daily' | 'weekly' | 'monthly';
  recipients: string[];
  createdAt: string;
}

export interface RepeatOrderSeriesPoint {
  bucket: string;
  posRepeatOrders: number;
  posRepeatCustomers: number;
  ecomRepeatOrders: number;
  ecomRepeatCustomers: number;
  totalRepeatOrders: number;
}

export interface RepeatOrderByShop {
  shopId: string;
  shopName: string;
  repeatOrders: number;
  repeatCustomers: number;
}

export interface RepeatOrdersReport {
  from: string;
  to: string;
  granularity: 'month' | 'quarter' | 'year';
  series: RepeatOrderSeriesPoint[];
  byShop: RepeatOrderByShop[];
  totals: {
    posRepeatOrders: number;
    ecomRepeatOrders: number;
    totalRepeatOrders: number;
  };
}

export interface ReturnsSeriesPoint {
  bucket: string;
  posCount: number;
  posAmountPaise: number;
  ecomReturnCount: number;
  ecomCancelCount: number;
  ecomAmountPaise: number;
  totalCount: number;
}

export interface ReturnsByShop {
  shopId: string;
  shopName: string;
  count: number;
  amountPaise: number;
}

export interface ReturnsReport {
  from: string;
  to: string;
  granularity: 'month' | 'quarter' | 'year';
  series: ReturnsSeriesPoint[];
  byShop: ReturnsByShop[];
  totals: {
    posCount: number;
    posAmountPaise: number;
    ecomReturnCount: number;
    ecomCancelCount: number;
    ecomAmountPaise: number;
    totalCount: number;
  };
}

// Month-by-month sales pivot, broken down by sub-category and by item,
// combining POS bills + online orders. `byMonth` is keyed by the YYYY-MM
// strings listed in `months`; a missing key means no sales that month.
export interface MonthlyPivotCell {
  qty: number;
  revenuePaise: number;
}
export interface MonthlySubcategoryRow {
  categoryId: string | null;
  name: string;
  mainCategoryName: string | null;
  byMonth: Record<string, MonthlyPivotCell>;
  totalQty: number;
  totalRevenuePaise: number;
}
export interface MonthlyItemRow {
  name: string;
  subCategoryName: string | null;
  byMonth: Record<string, MonthlyPivotCell>;
  totalQty: number;
  totalRevenuePaise: number;
}
export interface MonthlyCategoryItem {
  from: string;
  to: string;
  months: string[];
  subcategories: MonthlySubcategoryRow[];
  items: MonthlyItemRow[];
}

// ---------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------

export const analyticsApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getAnalyticsDashboard: b.query<
      ApiOne<AnalyticsDashboard>,
      { period?: 'today' | 'week' | 'month'; shopId?: string } | void
    >({
      query: (params) => ({ url: '/analytics/dashboard', params: params ?? undefined }),
      providesTags: ['AnalyticsDashboard'],
    }),
    getStaffReport: b.query<ApiList<StaffRow>, { from: string; to: string }>({
      query: (params) => ({ url: '/analytics/staff', params }),
      providesTags: ['StaffReport'],
    }),
    getMonthlyCategoryItem: b.query<
      ApiOne<MonthlyCategoryItem>,
      { from?: string; to?: string; shopId?: string } | void
    >({
      query: (params) => ({ url: '/analytics/monthly-category-item', params: params ?? undefined }),
      providesTags: ['SalesReport'],
    }),
    getTopProducts: b.query<
      { data: TopProductRow[]; groupBy?: 'product' | 'category' | 'subcategory' | 'collection'; channel?: TopChannel },
      { from?: string; to?: string; limit?: number; channel?: TopChannel } | void
    >({
      query: (params) => ({ url: '/analytics/top-products', params: params ?? undefined }),
      providesTags: ['SalesReport'],
    }),
    // Category-wise best sellers (M3 FR#3) — rolls product sales up to the main
    // category. Uses the same endpoint with groupBy=category.
    getTopCategories: b.query<
      { data: TopCategoryRow[]; groupBy: 'category'; channel?: TopChannel },
      { from?: string; to?: string; limit?: number; channel?: TopChannel } | void
    >({
      query: (params) => ({
        url: '/analytics/top-products',
        params: { ...(params ?? {}), groupBy: 'category' },
      }),
      providesTags: ['SalesReport'],
    }),
    // Sub-category best sellers — rolls product sales up to the LEAF category
    // (the sub under the main). Same endpoint with groupBy=subcategory.
    getTopSubcategories: b.query<
      { data: TopCategoryRow[]; groupBy: 'subcategory'; channel?: TopChannel },
      { from?: string; to?: string; limit?: number; channel?: TopChannel } | void
    >({
      query: (params) => ({
        url: '/analytics/top-products',
        params: { ...(params ?? {}), groupBy: 'subcategory' },
      }),
      providesTags: ['SalesReport'],
    }),
    // Collection best sellers — rolls sales up by the curated Collection(s) a
    // piece belongs to. A piece can be in several, so revenues may overlap.
    getTopCollections: b.query<
      { data: TopCollectionRow[]; groupBy: 'collection'; channel?: TopChannel },
      { from?: string; to?: string; limit?: number; channel?: TopChannel } | void
    >({
      query: (params) => ({
        url: '/analytics/top-products',
        params: { ...(params ?? {}), groupBy: 'collection' },
      }),
      providesTags: ['SalesReport'],
    }),
    getShopPerformance: b.query<
      { data: { from: string; to: string; rows: ShopPerformanceRow[]; totalRevenuePaise: number } },
      { from: string; to: string }
    >({
      query: (params) => ({ url: '/analytics/shop-performance', params }),
      providesTags: ['SalesReport'],
    }),
    getVendorPurchases: b.query<
      { data: { from: string; to: string; rows: VendorPurchaseRow[]; totalPurchasePaise: number } },
      { from: string; to: string }
    >({
      query: (params) => ({ url: '/analytics/vendor-purchases', params }),
      providesTags: ['SalesReport'],
    }),
    getExpenseTrend: b.query<
      { data: { months: number; rows: ExpenseTrendRow[] } },
      { months?: number; shopId?: string } | void
    >({
      query: (params) => ({ url: '/analytics/expense-trend', params: params ?? undefined }),
      providesTags: ['SalesReport'],
    }),
    getStockTransfers: b.query<
      { data: StockTransferReport },
      { from: string; to: string; status?: 'PENDING' | 'APPROVED' | 'COMPLETED' | 'REJECTED' }
    >({
      query: (params) => ({ url: '/analytics/stock-transfers', params }),
      providesTags: ['StockValuation'],
    }),
    getInventoryValuation: b.query<
      ApiOne<InventoryValuation>,
      { shopId?: string } | void
    >({
      query: (params) => ({ url: '/analytics/inventory-valuation', params: params ?? undefined }),
      providesTags: ['StockValuation'],
    }),
    getCustomerAcquisition: b.query<
      ApiOne<CustomerAcquisition>,
      { from: string; to: string }
    >({
      query: (params) => ({ url: '/analytics/customer-acquisition', params }),
      providesTags: ['Lead', 'Customer'],
    }),
    getPlByPeriod: b.query<
      ApiOne<PlByPeriod>,
      { granularity: 'day' | 'week' | 'month'; from: string; to: string; shopId?: string }
    >({
      query: (params) => ({ url: '/analytics/pl-by-period', params }),
      providesTags: ['Bill', 'Expense'],
    }),
    getFestiveTrend: b.query<ApiOne<FestiveTrend>, void>({
      query: () => ({ url: '/analytics/festive-trend' }),
      providesTags: ['SalesReport'],
    }),
    getLowMargin: b.query<
      ApiOne<LowMarginReport>,
      { thresholdPct?: number; limit?: number } | void
    >({
      query: (params) => ({ url: '/analytics/low-margin', params: params ?? undefined }),
      providesTags: ['Item'],
    }),
    getGstSummaryRange: b.query<
      ApiOne<GstSummary>,
      { from: string; to: string; shopId?: string }
    >({
      query: (params) => ({ url: '/analytics/gst-summary', params }),
      providesTags: ['GstSummary'],
    }),
    getAdRoi: b.query<ApiOne<AdRoiReport>, { from: string; to: string }>({
      query: (params) => ({ url: '/analytics/ad-roi', params }),
      providesTags: ['AdRoi'],
    }),
    getGoldRateImpact: b.query<ApiOne<GoldRateImpact>, void>({
      query: () => ({ url: '/analytics/gold-rate-impact' }),
      providesTags: ['GoldRate', 'Bill'],
    }),
    getScheduledReports: b.query<{ data: ScheduledReport[] }, void>({
      query: () => ({ url: '/analytics/scheduled-reports' }),
      providesTags: ['SalesReport'],
    }),
    createScheduledReport: b.mutation<
      ApiOne<ScheduledReport>,
      { reportType: ScheduledReport['reportType']; frequency: ScheduledReport['frequency']; recipients: string[] }
    >({
      query: (body) => ({ url: '/analytics/scheduled-reports', method: 'POST', body }),
      invalidatesTags: ['SalesReport'],
    }),
    deleteScheduledReport: b.mutation<void, string>({
      query: (id) => ({ url: `/analytics/scheduled-reports/${id}`, method: 'DELETE' }),
      invalidatesTags: ['SalesReport'],
    }),
    getRepeatOrders: b.query<
      ApiOne<RepeatOrdersReport>,
      { from: string; to: string; granularity: 'month' | 'quarter' | 'year'; shopId?: string }
    >({
      query: (params) => ({ url: '/analytics/repeat-orders', params }),
      providesTags: ['Bill', 'SalesReport'],
    }),
    getReturns: b.query<
      ApiOne<ReturnsReport>,
      { from: string; to: string; granularity: 'month' | 'quarter' | 'year'; shopId?: string }
    >({
      query: (params) => ({ url: '/analytics/returns', params }),
      providesTags: ['Bill', 'SalesReport'],
    }),
  }),
});

export const {
  useGetAnalyticsDashboardQuery,
  useGetStaffReportQuery,
  useGetMonthlyCategoryItemQuery,
  useLazyGetMonthlyCategoryItemQuery,
  useGetTopProductsQuery,
  useGetTopCategoriesQuery,
  useGetTopSubcategoriesQuery,
  useGetTopCollectionsQuery,
  useGetShopPerformanceQuery,
  useGetVendorPurchasesQuery,
  useGetExpenseTrendQuery,
  useGetStockTransfersQuery,
  useGetInventoryValuationQuery,
  useGetCustomerAcquisitionQuery,
  useGetPlByPeriodQuery,
  useGetFestiveTrendQuery,
  useGetLowMarginQuery,
  useGetGstSummaryRangeQuery,
  useGetAdRoiQuery,
  useGetGoldRateImpactQuery,
  useGetScheduledReportsQuery,
  useCreateScheduledReportMutation,
  useDeleteScheduledReportMutation,
  useGetRepeatOrdersQuery,
  useGetReturnsQuery,
} = analyticsApi;
