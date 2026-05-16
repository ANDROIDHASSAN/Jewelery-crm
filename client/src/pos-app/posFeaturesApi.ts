// RTK Query slice for the POS shop-owner features. Lives in pos-app/ since
// the POS subdomain is the only place these endpoints are consumed.

import { baseApi } from '@/app/store';

export interface RegisterSession {
  id: string;
  shopId: string;
  openedAt: string;
  openedByUserId: string;
  openingFloatPaise: number;
  closedAt: string | null;
  countedCashPaise: number | null;
  expectedCashPaise: number | null;
  variancePaise: number | null;
  status: 'OPEN' | 'CLOSED';
  notes: string | null;
  bills?: { id: string; billNumber: string; totalPaise: number; payments: { mode: string; amountPaise: number }[] }[];
  cashMovements?: { id: string; type: string; amountPaise: number; reason: string; createdAt: string }[];
}

export interface ParkedBill {
  id: string;
  shopId: string;
  customerLabel: string;
  customerPhone: string | null;
  draft: unknown;
  status: 'ACTIVE' | 'RESUMED' | 'ABANDONED';
  createdAt: string;
}

export interface EstimateRow {
  id: string;
  shopId: string;
  estimateNumber: string;
  customerLabel: string;
  customerPhone: string | null;
  totalPaise: number;
  validUntil: string;
  status: 'DRAFT' | 'SENT' | 'CONVERTED' | 'EXPIRED';
  createdAt: string;
}

export interface RepairRow {
  id: string;
  shopId: string;
  ticketNumber: string;
  customerName: string;
  customerPhone: string;
  itemDescription: string;
  weightInMg: number;
  weightOutMg: number | null;
  status: 'INTAKE' | 'IN_WORKSHOP' | 'READY' | 'DELIVERED' | 'CANCELLED';
  estimatedCostPaise: number;
  finalCostPaise: number | null;
  advancePaise: number;
  promisedAt: string | null;
  createdAt: string;
}

export interface AdvanceRow {
  id: string;
  shopId: string;
  receiptNumber: string;
  customerId: string;
  amountPaise: number;
  validUntil: string | null;
  status: 'ACTIVE' | 'CONSUMED' | 'REFUNDED';
  createdAt: string;
}

export const posFeaturesApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    // Register
    openRegister: b.mutation<{ data: RegisterSession }, { shopId: string; openingFloatPaise: number; notes?: string | null }>({
      query: (body) => ({ url: '/pos-x/register/open', method: 'POST', body }),
      invalidatesTags: ['RegisterSession'],
    }),
    getOpenSession: b.query<{ data: RegisterSession | null }, string>({
      query: (shopId) => ({ url: '/pos-x/register/open', params: { shopId } }),
      providesTags: ['RegisterSession'],
    }),
    expectedCash: b.query<{ data: { expectedCashPaise: number } }, string>({
      query: (sessionId) => `/pos-x/register/${sessionId}/expected-cash`,
    }),
    closeRegister: b.mutation<{ data: RegisterSession }, { id: string; countedCashPaise: number; notes?: string | null }>({
      query: ({ id, ...body }) => ({ url: `/pos-x/register/${id}/close`, method: 'POST', body }),
      invalidatesTags: ['RegisterSession'],
    }),

    // Cash drawer
    recordCashMovement: b.mutation<void, { shopId: string; type: 'PAY_IN' | 'PAY_OUT' | 'DEPOSIT'; amountPaise: number; reason: string }>({
      query: (body) => ({ url: '/pos-x/cash-movements', method: 'POST', body }),
      invalidatesTags: ['RegisterSession'],
    }),

    // Parked bills
    listParked: b.query<{ data: ParkedBill[] }, string>({
      query: (shopId) => ({ url: '/pos-x/parked', params: { shopId } }),
      providesTags: ['ParkedBill'],
    }),
    parkBill: b.mutation<{ data: ParkedBill }, { shopId: string; customerLabel: string; customerPhone?: string | null; draft: unknown }>({
      query: (body) => ({ url: '/pos-x/parked', method: 'POST', body }),
      invalidatesTags: ['ParkedBill'],
    }),
    resumeParked: b.mutation<{ data: unknown }, string>({
      query: (id) => ({ url: `/pos-x/parked/${id}/resume`, method: 'POST' }),
      invalidatesTags: ['ParkedBill'],
    }),
    abandonParked: b.mutation<void, string>({
      query: (id) => ({ url: `/pos-x/parked/${id}/abandon`, method: 'POST' }),
      invalidatesTags: ['ParkedBill'],
    }),

    // Estimates
    listEstimates: b.query<{ data: EstimateRow[] }, { shopId: string; status?: string }>({
      query: ({ shopId, status }) => ({ url: '/pos-x/estimates', params: { shopId, status } }),
      providesTags: ['Estimate'],
    }),
    createEstimate: b.mutation<
      { data: EstimateRow },
      {
        shopId: string;
        customerId?: string | null;
        customerLabel: string;
        customerPhone?: string | null;
        lines: Array<{ itemId: string; weightMg: number; purityCaratX100: number; makingChargeBps?: number; stoneChargePaise: number }>;
        validDays?: number;
      }
    >({
      query: (body) => ({ url: '/pos-x/estimates', method: 'POST', body }),
      invalidatesTags: ['Estimate'],
    }),

    // Repairs
    listRepairs: b.query<{ data: RepairRow[] }, { shopId: string; status?: string }>({
      query: ({ shopId, status }) => ({ url: '/pos-x/repairs', params: { shopId, status } }),
      providesTags: ['Repair'],
    }),
    createRepair: b.mutation<
      { data: RepairRow },
      {
        shopId: string;
        customerId?: string | null;
        customerName: string;
        customerPhone: string;
        itemDescription: string;
        weightInMg: number;
        purityCaratX100: number;
        problem: string;
        estimatedCostPaise: number;
        advancePaise?: number;
        promisedAt?: string | null;
        notes?: string | null;
      }
    >({
      query: (body) => ({ url: '/pos-x/repairs', method: 'POST', body }),
      invalidatesTags: ['Repair'],
    }),
    updateRepair: b.mutation<
      { data: RepairRow },
      { id: string; patch: { status?: string; weightOutMg?: number | null; finalCostPaise?: number | null; notes?: string | null } }
    >({
      query: ({ id, patch }) => ({ url: `/pos-x/repairs/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: ['Repair'],
    }),

    // Advances
    listAdvances: b.query<{ data: AdvanceRow[] }, { shopId?: string; customerId?: string; status?: string }>({
      query: (params) => ({ url: '/pos-x/advances', params }),
      providesTags: ['Advance'],
    }),
    createAdvance: b.mutation<
      { data: AdvanceRow },
      { shopId: string; customerId: string; amountPaise: number; lockRates?: boolean; validDays?: number; notes?: string | null }
    >({
      query: (body) => ({ url: '/pos-x/advances', method: 'POST', body }),
      invalidatesTags: ['Advance'],
    }),
    refundAdvance: b.mutation<void, string>({
      query: (id) => ({ url: `/pos-x/advances/${id}/refund`, method: 'POST' }),
      invalidatesTags: ['Advance'],
    }),

    // Refunds / voids
    voidBill: b.mutation<void, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/pos-x/bills/${id}/void`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Bill'],
    }),
    refundBill: b.mutation<void, { billId: string; amountPaise: number; reason: string }>({
      query: (body) => ({ url: '/pos-x/refunds', method: 'POST', body }),
      invalidatesTags: ['Bill'],
    }),
  }),
});

export const {
  useOpenRegisterMutation,
  useGetOpenSessionQuery,
  useExpectedCashQuery,
  useCloseRegisterMutation,
  useRecordCashMovementMutation,
  useListParkedQuery,
  useParkBillMutation,
  useResumeParkedMutation,
  useAbandonParkedMutation,
  useListEstimatesQuery,
  useCreateEstimateMutation,
  useListRepairsQuery,
  useCreateRepairMutation,
  useUpdateRepairMutation,
  useListAdvancesQuery,
  useCreateAdvanceMutation,
  useRefundAdvanceMutation,
  useVoidBillMutation,
  useRefundBillMutation,
} = posFeaturesApi;
