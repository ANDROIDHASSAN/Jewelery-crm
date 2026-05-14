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

export interface ExpenseRow {
  id: string;
  category: string;
  amountPaise: number;
  paidAt: string;
  shopId: string;
  notes: string | null;
}

export interface ExpenseByCategory {
  category: string;
  amountPaise: number;
  count: number;
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
    getExpenses: b.query<{ data: ExpenseRow[]; page: { nextCursor?: string; hasMore: boolean } }, { limit?: number; cursor?: string } | void>({
      query: (params) => ({ url: '/finance/expenses', params: params ?? undefined }),
      providesTags: ['Expense'],
    }),
    getExpensesByCategory: b.query<{ data: ExpenseByCategory[] }, { from: string; to: string }>({
      query: (params) => ({ url: '/finance/expenses/by-category', params }),
      providesTags: ['Expense'],
    }),
    createExpense: b.mutation<
      ApiOne<ExpenseRow>,
      { shopId: string; category: string; amountPaise: number; paidAt: string; notes?: string }
    >({
      query: (body) => ({ url: '/finance/expenses', method: 'POST', body }),
      invalidatesTags: ['Expense', 'Bill'],
    }),
  }),
});

export const {
  useGetPlQuery,
  useGetGstSummaryQuery,
  useGetExpensesQuery,
  useGetExpensesByCategoryQuery,
  useCreateExpenseMutation,
} = financeApi;
