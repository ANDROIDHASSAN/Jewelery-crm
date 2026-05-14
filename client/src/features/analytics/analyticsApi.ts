import { baseApi } from '@/app/store';
import type { ApiList, ApiOne } from '@goldos/shared/types';

export interface AnalyticsDashboard {
  period: 'today' | 'week' | 'month';
  revenuePaise: number;
  billCount: number;
  newLeads: number;
  asOf: string;
}

export interface StaffRow {
  userId: string | null;
  billCount: number;
  revenuePaise: number;
}

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
  }),
});

export const { useGetAnalyticsDashboardQuery, useGetStaffReportQuery } = analyticsApi;
