// RTK Query slice for the admin "Offline Shops" monitor. Strict reads only.

import { baseApi } from '@/app/store';

export interface CounterSummary {
  shopId: string;
  shopName: string;
  registerStatus: 'OPEN' | 'CLOSED';
  openSessionId: string | null;
  openedAt: string | null;
  openedByUserId: string | null;
  openedByName: string | null;
  openingFloatPaise: number;
  billsCountToday: number;
  revenueTodayPaise: number;
  cashSalesTodayPaise: number;
  digitalSalesTodayPaise: number;
  refundsTodayPaise: number;
  activeParkedBills: number;
  activeRepairs: number;
  activeEstimates: number;
  activeAdvancesPaise: number;
}

export interface CounterBillRow {
  id: string;
  billNumber: string;
  shopId: string;
  totalPaise: number;
  paymentStatus: string;
  voidedAt: string | null;
  createdAt: string;
  customer: { name: string; phone: string } | null;
  shop: { name: string };
}

export interface CounterSessionRow {
  id: string;
  shopId: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
  openingFloatPaise: number;
  countedCashPaise: number | null;
  expectedCashPaise: number | null;
  variancePaise: number | null;
  shop: { name: string };
  openedBy: { name: string };
  _count: { bills: number };
}

export interface CounterStaffRow {
  userId: string;
  userName: string;
  roleSlug: string | null;
  shopId: string;
  billCount: number;
  revenuePaise: number;
}

export const counterApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    counterSummary: b.query<{ data: CounterSummary[] }, void>({
      query: () => '/counter/summary',
      // Cheap query, the dashboard polls every 60s so day-end variances appear live.
      providesTags: ['RegisterSession'],
    }),
    counterBills: b.query<{ data: CounterBillRow[] }, { shopId?: string; limit?: number } | void>({
      query: (params) => ({ url: '/counter/bills', params: params ?? {} }),
      providesTags: ['Bill'],
    }),
    counterSessions: b.query<{ data: CounterSessionRow[] }, void>({
      query: () => '/counter/sessions',
      providesTags: ['RegisterSession'],
    }),
    counterStaff: b.query<{ data: CounterStaffRow[] }, void>({
      query: () => '/counter/staff',
      providesTags: ['StaffReport'],
    }),
  }),
});

export const {
  useCounterSummaryQuery,
  useCounterBillsQuery,
  useCounterSessionsQuery,
  useCounterStaffQuery,
} = counterApi;
