// client/src/app/store.ts — Redux store + RTK Query baseApi.
// All tagTypes declared once. Refresh-on-401 wrapping. Per specs/api-design.md § RTK Query.

import { configureStore } from '@reduxjs/toolkit';
import {
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
  createApi,
  fetchBaseQuery,
} from '@reduxjs/toolkit/query/react';
import { authReducer, logout, setAccessToken } from '@/features/auth/authSlice';
import { storefrontContentReducer } from '@/features/storefront/storefrontContentSlice';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: '/api/v1',
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return headers;
  },
});

const baseQueryWithRefresh: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  let result = await rawBaseQuery(args, api, extraOptions);
  if (result.error && result.error.status === 401) {
    const refresh = await rawBaseQuery(
      { url: '/auth/refresh', method: 'POST' },
      api,
      extraOptions,
    );
    if (refresh.data) {
      const next = (refresh.data as { data: { accessToken: string } }).data.accessToken;
      api.dispatch(setAccessToken(next));
      result = await rawBaseQuery(args, api, extraOptions);
    } else {
      api.dispatch(logout());
    }
  }
  return result;
};

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithRefresh,
  tagTypes: [
    'Tenant',
    'Shop',
    'User',
    'Item',
    'Category',
    'Vendor',
    'PurchaseOrder',
    'StockValuation',
    'Bill',
    'Payment',
    'Customer',
    'Expense',
    'GoldLoan',
    'Payroll',
    'GstSummary',
    'Lead',
    'LeadActivity',
    'WhatsAppMessage',
    'Product',
    'Order',
    'Coupon',
    'Review',
    'AnalyticsDashboard',
    'SalesReport',
    'AdRoi',
    'StaffReport',
    'Page',
    'Enquiry',
    'GoldRate',
    'StorefrontContent',
  ],
  endpoints: () => ({}),
});

export const store = configureStore({
  reducer: {
    auth: authReducer,
    storefrontContent: storefrontContentReducer,
    [baseApi.reducerPath]: baseApi.reducer,
  },
  middleware: (getDefault) => getDefault().concat(baseApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
