// RTK Query slice for the stock-request (replenishment indent) workflow.
// POS cashiers file requests; admins (reviewers) fulfil them via a transfer.

import { baseApi } from '@/app/store';
import type { ApiList, ApiOne, StockRequestCreate } from '@goldos/shared/types';
import type { StockRequestStatus } from '@goldos/shared/constants';

export interface StockRequestLineRow {
  id: string;
  requestId: string;
  categoryId: string | null;
  collectionId: string | null;
  quantity: number;
  note: string | null;
  // Joined names for display — category may carry its parent (main) too.
  category: { id: string; name: string; parent: { id: string; name: string } | null } | null;
  collection: { id: string; name: string } | null;
}

export interface StockRequestRow {
  id: string;
  tenantId: string;
  shopId: string;
  status: StockRequestStatus;
  note: string | null;
  requestedByUserId: string | null;
  reviewedByUserId: string | null;
  reviewNote: string | null;
  fulfilledTransferId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  shop?: { id: string; name: string };
  lines: StockRequestLineRow[];
  _count?: { lines: number };
}

export const stockRequestsApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getStockRequests: b.query<
      ApiList<StockRequestRow>,
      { status?: StockRequestStatus; shopId?: string; cursor?: string } | void
    >({
      query: (params) => ({ url: '/stock-requests', params: params ?? undefined }),
      providesTags: (r) =>
        r
          ? [
              ...r.data.map(({ id }) => ({ type: 'StockRequest' as const, id })),
              { type: 'StockRequest' as const, id: 'LIST' },
            ]
          : [{ type: 'StockRequest' as const, id: 'LIST' }],
    }),
    getStockRequest: b.query<ApiOne<StockRequestRow>, string>({
      query: (id) => `/stock-requests/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'StockRequest', id }],
    }),
    getPendingStockRequestCount: b.query<ApiOne<{ count: number }>, void>({
      query: () => '/stock-requests/pending-count',
      providesTags: [{ type: 'StockRequest', id: 'PENDING_COUNT' }],
    }),
    createStockRequest: b.mutation<ApiOne<StockRequestRow>, StockRequestCreate>({
      query: (body) => ({ url: '/stock-requests', method: 'POST', body }),
      invalidatesTags: [
        { type: 'StockRequest', id: 'LIST' },
        { type: 'StockRequest', id: 'PENDING_COUNT' },
      ],
    }),
    rejectStockRequest: b.mutation<ApiOne<StockRequestRow>, { id: string; reviewNote?: string }>({
      query: ({ id, reviewNote }) => ({
        url: `/stock-requests/${id}/reject`,
        method: 'POST',
        body: { reviewNote },
      }),
      invalidatesTags: (_r, _e, a) => [
        { type: 'StockRequest', id: a.id },
        { type: 'StockRequest', id: 'LIST' },
        { type: 'StockRequest', id: 'PENDING_COUNT' },
      ],
    }),
    cancelStockRequest: b.mutation<ApiOne<StockRequestRow>, string>({
      query: (id) => ({ url: `/stock-requests/${id}/cancel`, method: 'POST' }),
      invalidatesTags: (_r, _e, id) => [
        { type: 'StockRequest', id },
        { type: 'StockRequest', id: 'LIST' },
        { type: 'StockRequest', id: 'PENDING_COUNT' },
      ],
    }),
  }),
});

export const {
  useGetStockRequestsQuery,
  useGetStockRequestQuery,
  useGetPendingStockRequestCountQuery,
  useCreateStockRequestMutation,
  useRejectStockRequestMutation,
  useCancelStockRequestMutation,
} = stockRequestsApi;
