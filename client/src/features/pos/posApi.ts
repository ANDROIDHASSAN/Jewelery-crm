import { baseApi } from '@/app/store';
import type { Bill, BillCreate, ApiList, ApiOne, Customer, Item } from '@goldos/shared/types';

export const posApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getBills: b.query<ApiList<Bill>, { shopId?: string; cursor?: string }>({
      query: (params) => ({ url: '/pos/bills', params }),
      providesTags: (r) =>
        r
          ? [...r.data.map(({ id }) => ({ type: 'Bill' as const, id })), { type: 'Bill' as const, id: 'LIST' }]
          : [{ type: 'Bill' as const, id: 'LIST' }],
    }),
    createBill: b.mutation<ApiOne<Bill>, BillCreate>({
      query: (body) => ({
        url: '/pos/bills',
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': body.idempotencyKey },
      }),
      // 'Advance' so a redeemed advance drops off the customer's active list.
      invalidatesTags: ['StockValuation', 'Advance', { type: 'Bill', id: 'LIST' }, { type: 'Item', id: 'LIST' }],
    }),
    findCustomer: b.query<ApiOne<Customer> | { data: null }, { phone: string }>({
      query: ({ phone }) => ({ url: '/pos/customers/lookup', params: { phone } }),
    }),
    getGoldRate: b.query<ApiOne<{ purity: number; ratePerGramPaise: number; stale: boolean; asOf: string }[]>, void>({
      query: () => '/pos/gold-rate',
      providesTags: ['GoldRate'],
    }),
    findItemByBarcode: b.query<ApiOne<Item>, { code: string }>({
      query: ({ code }) => ({ url: '/pos/items/by-barcode', params: { code } }),
    }),
    // POS-accessible contact typeahead (advance receipts). Reachable with
    // pos.access — cashiers have no finance perm. Returns real Customers plus
    // CRM Leads not yet converted (source distinguishes them); picking a lead
    // creates the Customer on submit.
    searchPosCustomers: b.query<
      { data: { id: string; name: string; phone: string; source: 'customer' | 'lead' }[] },
      { q?: string; limit?: number } | void
    >({
      query: (params) => ({ url: '/pos/customers/search', params: params ?? undefined }),
      providesTags: ['Customer'],
    }),
  }),
});

export const {
  useGetBillsQuery,
  useCreateBillMutation,
  useLazyFindCustomerQuery,
  useGetGoldRateQuery,
  useLazyFindItemByBarcodeQuery,
  useSearchPosCustomersQuery,
} = posApi;
