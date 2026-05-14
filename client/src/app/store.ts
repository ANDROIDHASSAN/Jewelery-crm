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
import { shopReducer, persistShopState } from '@/features/storefront/shopSlice';

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
  const currentToken = (api.getState() as RootState).auth.accessToken;
  let result = await rawBaseQuery(args, api, extraOptions);
  if (result.error && result.error.status === 401) {
    // Admin sentinel session has no JWT refresh cookie — surface the 401 instead
    // of bouncing through /auth/refresh (which would also 401 and trigger logout).
    const adminToken = import.meta.env.VITE_ADMIN_API_TOKEN ?? 'admin-session-token';
    if (currentToken === adminToken) return result;
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
  // Hold cached query data for 5 min after the last subscriber unmounts.
  // Lets users navigate around the app without re-fetching anything they've
  // already loaded recently. Polling endpoints still update on their own cadence.
  keepUnusedDataFor: 300,
  // Don't re-fetch every time a component mounts the same query — RTK Query's
  // dedup + cache will serve the existing data instantly. Polling intervals
  // still drive freshness for the screens that opted in.
  refetchOnMountOrArgChange: false,
  // Re-fetch when the tab regains focus / network reconnects, since users
  // come back to the demo after long idle periods.
  refetchOnFocus: true,
  refetchOnReconnect: true,
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
    shop: shopReducer,
    [baseApi.reducerPath]: baseApi.reducer,
  },
  middleware: (getDefault) => getDefault().concat(baseApi.middleware),
});

store.subscribe(() => {
  persistShopState(store.getState().shop);
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
