// Analytics RTK Query slice — one hook per reports.* endpoint.

import { baseApi } from '@/app/store';
import type { ApiList, ApiOne } from '@goldos/shared/types';

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

export interface TopProductRow {
  productId: string;
  name: string;
  slug: string;
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
  goldRates: Array<{ purity: number; ratePerGramPaise: number; stale: boolean }>;
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
  rate22KPaise: number;
  rate24KPaise: number;
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
    getTopProducts: b.query<{ data: TopProductRow[] }, { from?: string; to?: string; limit?: number } | void>({
      query: (params) => ({ url: '/analytics/top-products', params: params ?? undefined }),
      providesTags: ['SalesReport'],
    }),
    getShopPerformance: b.query<
      { data: { from: string; to: string; rows: ShopPerformanceRow[]; totalRevenuePaise: number } },
      { from: string; to: string }
    >({
      query: (params) => ({ url: '/analytics/shop-performance', params }),
      providesTags: ['SalesReport'],
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
  }),
});

export const {
  useGetAnalyticsDashboardQuery,
  useGetStaffReportQuery,
  useGetTopProductsQuery,
  useGetShopPerformanceQuery,
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
} = analyticsApi;
