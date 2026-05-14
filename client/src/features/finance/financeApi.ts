import { baseApi } from '@/app/store';
import type { ApiOne } from '@goldos/shared/types';

export interface PlSummary {
  revenuePaise: number;
  expensePaise: number;
  gstPaise: number;
  netPaise: number;
  from: string;
  to: string;
}

export interface GstSummary {
  month: string;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxableRevenuePaise: number;
  billCount: number;
}

export const financeApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getPl: b.query<ApiOne<PlSummary>, { from: string; to: string; shopId?: string }>({
      query: (params) => ({ url: '/finance/pl', params }),
      providesTags: ['Bill', 'Expense'],
    }),
    getGstSummary: b.query<ApiOne<GstSummary>, { month: string }>({
      query: (params) => ({ url: '/finance/gst-summary', params }),
      providesTags: ['GstSummary'],
    }),
  }),
});

export const { useGetPlQuery, useGetGstSummaryQuery } = financeApi;
