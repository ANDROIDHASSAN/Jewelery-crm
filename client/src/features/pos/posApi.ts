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
    // Create a customer from the counter when a lookup finds no match. The
    // server also mirrors the new customer into the CRM as a walk-in lead, so
    // invalidate 'Customer' to refresh the POS contact typeahead. Returns the
    // customer plus `created` (false when the phone was already on file).
    createPosCustomer: b.mutation<
      { data: { customer: Customer; created: boolean } },
      { name: string; phone: string; email?: string | null }
    >({
      query: (body) => ({ url: '/pos/customers', method: 'POST', body }),
      invalidatesTags: ['Customer'],
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
  useCreatePosCustomerMutation,
  useGetGoldRateQuery,
  useLazyFindItemByBarcodeQuery,
  useSearchPosCustomersQuery,
} = posApi;
