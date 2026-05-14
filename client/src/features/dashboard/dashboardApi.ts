// Single round-trip for the admin Dashboard: tiles + 7-day sales series + gold rate.
// Backed by GET /api/v1/analytics/summary.

import { baseApi } from '@/app/store';
import type { ApiOne } from '@goldos/shared/types';

export interface DashboardGoldRate {
  purity: number;
  ratePerGramPaise: number;
  stale: boolean;
}

export interface DashboardSummary {
  today: { revenuePaise: number; billCount: number };
  yesterday: { revenuePaise: number; billCount: number };
  leads: { open: number; today: number };
  stock: { valuationPaise: number; itemCount: number };
  sevenDay: Array<{ date: string; revenuePaise: number }>;
  goldRate: DashboardGoldRate[];
  asOf: string;
}

export const dashboardApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getDashboardSummary: b.query<ApiOne<DashboardSummary>, { shopId?: string } | void>({
      query: (params) => ({ url: '/analytics/summary', params: params ?? undefined }),
      providesTags: ['AnalyticsDashboard', 'GoldRate', 'StockValuation'],
    }),
  }),
});

export const { useGetDashboardSummaryQuery } = dashboardApi;
