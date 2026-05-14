# API Design

## Base

- Base URL: `https://api.goldos.in/api/v1` (prod, same host as web, just different path), `http://localhost:4000/api/v1` (dev)
- All endpoints under `/api/v1`. Future v2 lives alongside; no breaking changes in v1.
- All bodies JSON. `Content-Type: application/json`.
- All response timestamps ISO 8601 UTC.

## Auth

- `Authorization: Bearer <accessToken>` on protected endpoints (admin)
- httpOnly cookie `refresh_token` for refresh
- Storefront uses session cookie `customer_session`; checkout flow only requires login for saved addresses.
- Tenant inferred from JWT `tenantId` claim or subdomain (must agree).

## Endpoint structure

```
POST   /api/v1/auth/otp/request        { phone }
POST   /api/v1/auth/otp/verify         { phone, code } -> { accessToken } (sets refresh cookie)
POST   /api/v1/auth/refresh            -> { accessToken }
POST   /api/v1/auth/logout

GET    /api/v1/shops
POST   /api/v1/shops
PATCH  /api/v1/shops/:id

GET    /api/v1/inventory/items?shopId=&categoryId=&search=&cursor=
POST   /api/v1/inventory/items
PATCH  /api/v1/inventory/items/:id
POST   /api/v1/inventory/items/:id/transfer
POST   /api/v1/inventory/items/bulk-import     multipart/form-data
GET    /api/v1/inventory/valuation?shopId=

POST   /api/v1/pos/bills                       { idempotencyKey, ... }
GET    /api/v1/pos/bills?shopId=&from=&to=&cursor=
GET    /api/v1/pos/bills/:id
POST   /api/v1/pos/bills/:id/payment
GET    /api/v1/pos/daily-report?shopId=&date=
POST   /api/v1/pos/sync                        { bills: [...] } offline reconciliation

GET    /api/v1/finance/pl?from=&to=&shopId=
GET    /api/v1/finance/gst-summary?month=
POST   /api/v1/finance/expenses
GET    /api/v1/finance/tally-export?from=&to=  -> XML

GET    /api/v1/ecommerce/products
POST   /api/v1/ecommerce/products
GET    /api/v1/ecommerce/orders?status=&cursor=
PATCH  /api/v1/ecommerce/orders/:id

GET    /api/v1/crm/leads?status=&source=&cursor=
POST   /api/v1/crm/leads
PATCH  /api/v1/crm/leads/:id
POST   /api/v1/crm/whatsapp/broadcast

GET    /api/v1/analytics/dashboard?shopId=&period=
GET    /api/v1/analytics/sales-report?from=&to=&groupBy=
GET    /api/v1/analytics/ad-roi?from=&to=
GET    /api/v1/analytics/staff?from=&to=

GET    /api/v1/website/collections
GET    /api/v1/website/products
POST   /api/v1/website/enquiry                 public, captures lead
GET    /api/v1/website/page/:slug

SSE    /api/v1/events                          server-sent events for live UI updates

POST   /api/v1/webhooks/whatsapp
POST   /api/v1/webhooks/razorpay
POST   /api/v1/webhooks/shiprocket
POST   /api/v1/webhooks/meta-ads
POST   /api/v1/webhooks/google-ads
```

## Response shape

**Success (single):**
```json
{ "data": { ... } }
```

**Success (list, cursor-paginated):**
```json
{ "data": [...], "page": { "nextCursor": "...", "hasMore": true } }
```

**Error:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable summary",
    "fields": { "phone": "Invalid Indian phone number" },
    "traceId": "req-abc123"
  }
}
```

## Status codes

- `200` success with body
- `201` created
- `204` success no body
- `400` validation error (`code: VALIDATION_ERROR`)
- `401` unauthenticated
- `403` not allowed (includes tenant mismatch)
- `404` not found (also used to avoid leaking existence across tenants)
- `409` conflict (idempotency or version)
- `422` business rule violation (e.g. insufficient stock)
- `429` rate limited
- `500` unexpected

## Pagination

Cursor-based on every list endpoint. No offset.
- `?cursor=<opaque>&limit=20` (default 20, max 100)
- Response includes `nextCursor` and `hasMore`.

## Idempotency

Any POST that creates a financial record (bill, payment, refund) accepts:
- Header `Idempotency-Key: <client-uuid>`
- Repeated calls with same key return the original response (24h window).
- Offline POS sync depends on this.

## Rate limits

- Per JWT: 100 req/min default, 1000 req/min super-admin
- Per IP unauth: 30 req/min
- WhatsApp broadcast: 1 per 10 min per tenant

## RTK Query patterns (client side)

### baseApi setup

```ts
// client/src/app/store.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/v1',
    credentials: 'include',          // refresh cookie
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.accessToken;
      if (token) headers.set('Authorization', `Bearer ${token}`);
      return headers;
    },
  }),
  tagTypes: [
    'Tenant','Shop','User',
    'Item','Category','Vendor','PurchaseOrder','StockValuation',
    'Bill','Payment','Customer',
    'Expense','GoldLoan','Payroll','GstSummary',
    'Lead','LeadActivity','WhatsAppMessage',
    'Product','Order','Coupon','Review',
    'AnalyticsDashboard','SalesReport','AdRoi','StaffReport',
    'Page','Enquiry',
  ],
  endpoints: () => ({}),
});
```

### Per-module slice (example: inventory)

```ts
// client/src/features/inventory/inventoryApi.ts
import { baseApi } from '@/app/store';
import type { Item, ItemInput } from '@shared/types';

export const inventoryApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getItems: b.query<{ data: Item[]; page: { nextCursor?: string; hasMore: boolean } },
                      { shopId?: string; cursor?: string }>({
      query: (params) => ({ url: '/inventory/items', params }),
      providesTags: (r) =>
        r ? [...r.data.map(({ id }) => ({ type: 'Item' as const, id })),
             { type: 'Item', id: 'LIST' }]
          : [{ type: 'Item', id: 'LIST' }],
    }),
    createItem: b.mutation<{ data: Item }, ItemInput>({
      query: (body) => ({ url: '/inventory/items', method: 'POST', body }),
      invalidatesTags: [{ type: 'Item', id: 'LIST' }, 'StockValuation'],
    }),
    transferItem: b.mutation<void, { id: string; toShopId: string; reason: string }>({
      query: ({ id, ...body }) => ({ url: `/inventory/items/${id}/transfer`, method: 'POST', body }),
      invalidatesTags: (r, e, a) => [{ type: 'Item', id: a.id }, { type: 'Item', id: 'LIST' }],
    }),
  }),
});

export const { useGetItemsQuery, useCreateItemMutation, useTransferItemMutation } = inventoryApi;
```

### Optimistic updates (use for POS bill creation)

```ts
createBill: b.mutation<Bill, BillInput>({
  query: (body) => ({ url: '/pos/bills', method: 'POST', body,
                      headers: { 'Idempotency-Key': body.idempotencyKey } }),
  async onQueryStarted(arg, { dispatch, queryFulfilled }) {
    // optimistic insert in bill list
    const patch = dispatch(
      posApi.util.updateQueryData('getBills', { shopId: arg.shopId }, (draft) => {
        draft.data.unshift({ ...arg, status: 'PENDING' } as any);
      })
    );
    try { await queryFulfilled; } catch { patch.undo(); }
  },
  invalidatesTags: ['StockValuation', { type: 'Item', id: 'LIST' }],
}),
```

### Live updates via Server-Sent Events

```ts
// client/src/features/realtime/useRealtime.ts
useEffect(() => {
  const es = new EventSource('/api/v1/events', { withCredentials: true });
  es.addEventListener('item.changed', (e) => {
    const { id } = JSON.parse(e.data);
    dispatch(baseApi.util.invalidateTags([{ type: 'Item', id }]));
  });
  es.addEventListener('goldrate.updated', () => {
    dispatch(baseApi.util.invalidateTags(['StockValuation']));
  });
  return () => es.close();
}, [dispatch]);
```

## Versioning

- v1 stable from launch. Breaking changes → v2.
- New optional fields are non-breaking and can ship in v1.
- Deprecation: `X-Deprecation` response header on old path, minimum 90 days before removal.

## Webhooks

All webhooks verify signature. Unsigned = 401. Logged regardless of success.
