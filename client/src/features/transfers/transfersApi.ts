// RTK Query slice for the stock-transfer workflow.
// Tags: Transfer (this slice) + Item (state-machine mutations move stock).

import { baseApi } from '@/app/store';
import type { ApiList, ApiOne, TransferCreate } from '@goldos/shared/types';
import type { TransferStatus } from '@goldos/shared/constants';

export interface TransferShopRef {
  id: string;
  name: string;
  isWarehouse: boolean;
}

export interface TransferItemRef {
  id: string;
  sku: string;
  name: string | null;
  weightMg: number;
  purityCaratX100: number;
  status: 'IN_STOCK' | 'IN_TRANSIT' | 'SOLD' | 'MELTED';
  shopId: string;
  images: string[];
}

export interface TransferLineRow {
  id: string;
  transferId: string;
  itemId: string;
  // 1 for serialized lines, N for lot lines. Defaults to 1 server-side.
  quantity: number;
  item: TransferItemRef;
}

export interface TransferRow {
  id: string;
  tenantId: string;
  fromShopId: string;
  toShopId: string;
  status: TransferStatus;
  reason: string;
  notes: string | null;
  requestedByUserId: string | null;
  approvedByUserId: string | null;
  completedByUserId: string | null;
  rejectedByUserId: string | null;
  rejectionReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  completedAt: string | null;
  rejectedAt: string | null;
  fromShop?: TransferShopRef;
  toShop?: TransferShopRef;
  _count?: { lines: number };
}

export interface TransferDetail extends TransferRow {
  lines: TransferLineRow[];
}

export interface TransferableItem {
  id: string;
  sku: string;
  name: string | null;
  weightMg: number;
  purityCaratX100: number;
  costPricePaise: number;
  images: string[];
  // Hybrid stock fields — drive the LOT/UNIQUE badge and the per-line
  // quantity input in the transfer composer.
  isSerialized: boolean;
  quantityOnHand: number;
}

export const transfersApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getTransfers: b.query<
      ApiList<TransferRow>,
      { status?: TransferStatus; fromShopId?: string; toShopId?: string; cursor?: string } | void
    >({
      query: (params) => ({ url: '/transfers', params: params ?? undefined }),
      providesTags: (r) =>
        r
          ? [
              ...r.data.map(({ id }) => ({ type: 'Transfer' as const, id })),
              { type: 'Transfer' as const, id: 'LIST' },
            ]
          : [{ type: 'Transfer' as const, id: 'LIST' }],
    }),
    getTransfer: b.query<ApiOne<TransferDetail>, string>({
      query: (id) => `/transfers/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Transfer', id }],
    }),
    getTransferableItems: b.query<ApiList<TransferableItem>, { shopId: string; cursor?: string }>({
      query: (params) => ({ url: '/transfers/transferable-items', params }),
      // Tied to Item tag so a sale/new-item correctly busts the eligible pool.
      providesTags: [{ type: 'Item', id: 'TRANSFERABLE' }],
    }),
    createTransfer: b.mutation<ApiOne<TransferDetail>, TransferCreate>({
      query: (body) => ({ url: '/transfers', method: 'POST', body }),
      invalidatesTags: [
        { type: 'Transfer', id: 'LIST' },
        { type: 'Item', id: 'TRANSFERABLE' },
      ],
    }),
    approveTransfer: b.mutation<ApiOne<TransferDetail>, string>({
      query: (id) => ({ url: `/transfers/${id}/approve`, method: 'POST' }),
      invalidatesTags: (_r, _e, id) => [
        { type: 'Transfer', id },
        { type: 'Transfer', id: 'LIST' },
        { type: 'Item', id: 'LIST' },
        { type: 'Item', id: 'TRANSFERABLE' },
        'StockValuation',
      ],
    }),
    completeTransfer: b.mutation<ApiOne<TransferDetail>, string>({
      query: (id) => ({ url: `/transfers/${id}/complete`, method: 'POST' }),
      invalidatesTags: (_r, _e, id) => [
        { type: 'Transfer', id },
        { type: 'Transfer', id: 'LIST' },
        { type: 'Item', id: 'LIST' },
        { type: 'Item', id: 'TRANSFERABLE' },
        'StockValuation',
      ],
    }),
    rejectTransfer: b.mutation<ApiOne<TransferDetail>, { id: string; rejectionReason: string }>({
      query: ({ id, rejectionReason }) => ({
        url: `/transfers/${id}/reject`,
        method: 'POST',
        body: { rejectionReason },
      }),
      invalidatesTags: (_r, _e, a) => [
        { type: 'Transfer', id: a.id },
        { type: 'Transfer', id: 'LIST' },
        { type: 'Item', id: 'TRANSFERABLE' },
        { type: 'Item', id: 'TRANSFERABLE' },
      ],
    }),
  }),
});

export const {
  useGetTransfersQuery,
  useGetTransferQuery,
  useGetTransferableItemsQuery,
  useCreateTransferMutation,
  useApproveTransferMutation,
  useCompleteTransferMutation,
  useRejectTransferMutation,
} = transfersApi;
