// Settings RTK Query slice — workspace/tenant info + integration status.
//
// The /settings page reads tenant via getTenant (cache key 'Tenant'), edits
// via updateTenant (invalidates 'Tenant'), and reads which third-party
// integrations are wired via getIntegrations (env-driven, so cached for the
// duration of the session — the server still reads env vars on every call,
// but they don't change without a redeploy).

import { baseApi } from '@/app/store';

export interface TenantInfo {
  id: string;
  businessName: string;
  gstNumber: string | null;
  phone: string;
  ownerEmail: string;
  plan: 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';
  brandPrimary: string;
  logoUrl: string | null;
  createdAt: string;
}

export interface TenantPatch {
  businessName?: string;
  gstNumber?: string | null;
  phone?: string;
  ownerEmail?: string;
  brandPrimary?: string;
  logoUrl?: string | null;
}

export interface IntegrationStatus {
  key: string;
  name: string;
  description: string;
  connected: boolean;
  link?: string;
  envKeys: string[];
}

export const settingsApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getTenant: b.query<{ data: TenantInfo }, void>({
      query: () => ({ url: '/settings/tenant' }),
      providesTags: ['Tenant'],
    }),
    updateTenant: b.mutation<{ data: TenantInfo }, TenantPatch>({
      query: (body) => ({ url: '/settings/tenant', method: 'PATCH', body }),
      invalidatesTags: ['Tenant'],
    }),
    getIntegrations: b.query<{ data: IntegrationStatus[] }, void>({
      query: () => ({ url: '/settings/integrations' }),
    }),
    backfillPayments: b.mutation<
      { data: { billsBackfilled: number; paymentsCreated: number } },
      void
    >({
      query: () => ({ url: '/settings/_backfill-payments', method: 'POST' }),
      invalidatesTags: ['DailySales', 'FinanceSummary', 'Bill', 'Payment'],
    }),
  }),
});

export const {
  useGetTenantQuery,
  useUpdateTenantMutation,
  useGetIntegrationsQuery,
  useBackfillPaymentsMutation,
} = settingsApi;
