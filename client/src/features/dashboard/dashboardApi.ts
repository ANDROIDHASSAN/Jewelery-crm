// Single round-trip for the admin Dashboard: tiles + 7-day sales series + gold rate.
// Backed by GET /api/v1/analytics/summary.

import { baseApi } from '@/app/store';
import type { ApiOne } from '@goldos/shared/types';

/** Where a rate came from — drives the "live" vs "CMS rate" vs "stale" badge. */
export type RateSource = 'live' | 'cms' | 'live-stale' | 'none';

/**
 * 9K gold, silver and platinum — the only rates any surface quotes. Gold is
 * published at 9K and every gold valuation scales off that basis. A null rate
 * means unconfigured (no API key and a blank CMS field), in which case those
 * pieces are valued at cost.
 */
export interface MetalRatesPayload {
  gold9kPaise: number | null;
  silverPaise: number | null;
  platinum950Paise: number | null;
  goldSource: RateSource;
  silverSource: RateSource;
  platinumSource: RateSource;
  stale: boolean;
  cmsUpdatedAt: string | null;
}

export interface DashboardSummary {
  today: { revenuePaise: number; billCount: number };
  yesterday: { revenuePaise: number; billCount: number };
  leads: { open: number; today: number };
  stock: { valuationPaise: number; itemCount: number };
  sevenDay: Array<{ date: string; revenuePaise: number }>;
  metalRates: MetalRatesPayload;
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
