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
      // Optimistic update — the CRM pipeline drag-and-drop was waiting on the
      // server PATCH + a full LIST refetch, which on Render free-tier added
      // 1-5s of latency per card move. Patch the cache directly so the card
      // jumps to the new column instantly; roll back if the PATCH fails.
      async onQueryStarted({ id, ...patch }, { dispatch, queryFulfilled }) {
        // The CrmPage subscribes to getLeads() with no args; tag the same key.
        const undo = dispatch(
          crmApi.util.updateQueryData('getLeads', undefined, (draft) => {
            const lead = draft.data.find((l) => l.id === id);
            if (lead) {
              if (patch.status !== undefined) lead.status = patch.status;
              if (patch.assignedToUserId !== undefined) lead.assignedToUserId = patch.assignedToUserId;
            }
          }),
        );
        try {
          await queryFulfilled;
          // Server confirmed — keep the optimistic patch. Polling (30s) and
          // the pinpoint Lead-id invalidation below reconcile any drift.
        } catch {
          undo.undo();
        }
      },
      // Only invalidate the SINGLE Lead row, not the LIST. Previously
      // invalidating LIST forced a full re-fetch of every lead after every
      // drag, which is what made the UI feel sluggish.
      invalidatesTags: (_r, _e, a) => [{ type: 'Lead', id: a.id }],
    }),
    sendBroadcast: b.mutation<
      ApiOne<{ queued: number; recipients: Array<{ id: string; name: string; phone: string }> }>,
      { audience: 'ALL' | LeadStatus; template: string; message: string }
    >({
      query: (body) => ({ url: '/crm/broadcasts', method: 'POST', body }),
      invalidatesTags: [{ type: 'Lead', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetLeadsQuery,
  useCreateLeadMutation,
  useUpdateLeadMutation,
  useSendBroadcastMutation,
} = crmApi;
