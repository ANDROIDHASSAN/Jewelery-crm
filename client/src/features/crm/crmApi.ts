import { baseApi } from '@/app/store';
import type { ApiList, ApiOne, Lead, LeadInput } from '@goldos/shared/types';
import type { LeadStatus } from '@goldos/shared/constants';

export const crmApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getLeads: b.query<ApiList<Lead>, { status?: LeadStatus; source?: string; cursor?: string } | void>({
      query: (params) => ({ url: '/crm/leads', params: params ?? undefined }),
      providesTags: (r) =>
        r
          ? [
              ...r.data.map(({ id }) => ({ type: 'Lead' as const, id })),
              { type: 'Lead' as const, id: 'LIST' },
            ]
          : [{ type: 'Lead' as const, id: 'LIST' }],
    }),
    createLead: b.mutation<ApiOne<Lead>, LeadInput>({
      query: (body) => ({ url: '/crm/leads', method: 'POST', body }),
      invalidatesTags: [{ type: 'Lead', id: 'LIST' }],
    }),
    updateLead: b.mutation<
      ApiOne<Lead>,
      { id: string; status?: LeadStatus; assignedToUserId?: string; notes?: string }
    >({
      query: ({ id, ...body }) => ({ url: `/crm/leads/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, a) => [{ type: 'Lead', id: a.id }, { type: 'Lead', id: 'LIST' }],
    }),
  }),
});

export const { useGetLeadsQuery, useCreateLeadMutation, useUpdateLeadMutation } = crmApi;
