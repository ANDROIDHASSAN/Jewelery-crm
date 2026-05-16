# Architecture

One repo. Two folders. One process in production. One database.

## High-level

```
                         ┌──────────────────────────────────┐
                         │            Cloudflare            │
                         │     (DNS, SSL, CDN, WAF)         │
                         └────────────────┬─────────────────┘
                                          │
                              ┌───────────▼───────────┐
                              │         Nginx         │
                              │   (SSL, static gzip)  │
                              └───────────┬───────────┘
                                          │
                              ┌───────────▼───────────┐
                              │   PM2 → Node server   │
                              │                       │
                              │  GET /api/*  → API    │
                              │  GET /*      → React  │
                              │             dist/     │
                              └───────────┬───────────┘
                                          │
                ┌─────────────────────────┼─────────────────────────┐
                ▼                         ▼                         ▼
        ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
        │  PostgreSQL  │         │    Redis     │         │ Meilisearch  │
        │              │         │ (cache+queue)│         │  (search)    │
        └──────────────┘         └──────────────┘         └──────────────┘
                                          │
                                          ▼
                              ┌─────────────────────┐
                              │   BullMQ workers    │
                              │  (same Node proc,   │
                              │   separate PM2 app) │
                              └─────────────────────┘
                                          │
                       ┌──────────────────┼──────────────────┐
                       ▼                  ▼                  ▼
                  WhatsApp           Gold rate         Ad APIs / shipping
                  (Meta Cloud)        (MCX cron)        webhooks
```

## Two PM2 apps, one codebase

- `goldos-web` — Express + serves React dist
- `goldos-worker` — same Node project, runs BullMQ consumers + crons (gold rate poller, abandoned cart, WhatsApp follow-ups)

Both read from the same Postgres + Redis. Adding the worker as a separate PM2 entry keeps web latency clean while still being "one codebase, one server."

## Request lifecycle

### Client (React) request → Server

1. RTK Query hook fires (`useGetItemsQuery(...)`)
2. Hits `/api/v1/inventory/items` — same origin in prod, proxied through Vite in dev
3. Express middleware chain:
   - `cors` (dev only; same-origin in prod)
   - `cookie-parser`
   - `pino-http` (request logging, PII redacted)
   - `rate-limit` (per route group)
   - `auth` (JWT verify → `req.user`)
   - `tenant-scope` (puts `tenantId` in AsyncLocalStorage)
4. Route handler validates body with the Zod schema from `shared/schemas.ts`
5. Calls the module's service function
6. Service uses Prisma; Prisma extension auto-injects `tenantId` on every query
7. Response shape: `{ data: ... }` or `{ data: [...], page: { nextCursor, hasMore } }` — see `api-design.md`

### Background job lifecycle

1. Web process calls `queue.add('send-receipt', payload)`
2. Returns 200 immediately
3. Worker process picks up the job
4. On success → ack; on failure → retry with exponential backoff up to 5 times → dead-letter to logged error

## Client architecture

### Folder layout

```
client/src/
├── app/
│   ├── store.ts          Redux store, RTK Query baseApi
│   └── routes.tsx        React Router config
├── features/
│   ├── auth/             authApi.ts, LoginPage.tsx, OtpForm.tsx
│   ├── inventory/        inventoryApi.ts, ItemList.tsx, ItemForm.tsx, BulkImport.tsx
│   ├── pos/              posApi.ts, BillScreen.tsx, ScanInput.tsx
│   ├── finance/
│   ├── crm/
│   ├── ecommerce/        admin side; storefront is a separate route tree
│   ├── analytics/
│   └── storefront/       Public-facing customer pages + business website
├── components/
│   ├── ui/               shadcn primitives (button, input, dialog, sheet, table, etc.)
│   ├── layout/           Sidebar, TopBar, ShopSwitcher
│   └── data/             Reusable DataTable, EmptyState, ErrorState
├── pages/                Thin route components that compose features/
├── lib/
│   ├── money.ts          Money helper (mirrors server)
│   ├── weight.ts
│   ├── date.ts           date-fns wrappers, IST formatting
│   ├── format.ts         number/currency formatters
│   └── api.ts            RTK Query base (fetchBaseQuery + tagTypes)
└── styles/
    ├── globals.css       Tailwind + tokens import
    └── tokens.css        --gold-primary, --ink-900, etc.
```

### RTK Query pattern (every module)

```ts
// features/inventory/inventoryApi.ts
import { baseApi } from '@/app/store';
import { Item, ItemInput } from '@shared/types';

export const inventoryApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getItems: b.query<{ data: Item[]; nextCursor?: string }, { shopId?: string; cursor?: string }>({
      query: (params) => ({ url: '/inventory/items', params }),
      providesTags: (r) =>
        r ? [...r.data.map(({ id }) => ({ type: 'Item' as const, id })), { type: 'Item', id: 'LIST' }]
          : [{ type: 'Item', id: 'LIST' }],
    }),
    createItem: b.mutation<Item, ItemInput>({
      query: (body) => ({ url: '/inventory/items', method: 'POST', body }),
      invalidatesTags: [{ type: 'Item', id: 'LIST' }, 'StockValuation'],
    }),
    // ...
  }),
});

export const { useGetItemsQuery, useCreateItemMutation } = inventoryApi;
```

Every module follows this pattern. Tags are declared once in `baseApi.tagTypes` and reused.

## Server architecture

### Folder layout

```
server/src/
├── modules/
│   ├── auth/
│   │   ├── auth.routes.ts
│   │   ├── auth.service.ts
│   │   └── auth.schema.ts     re-exports from shared/schemas
│   ├── inventory/
│   ├── pos/
│   ├── finance/
│   ├── crm/
│   ├── ecommerce/
│   ├── website/
│   ├── analytics/
│   └── webhooks/              razorpay, whatsapp, shiprocket, ads
├── middleware/
│   ├── auth.ts
│   ├── tenant-scope.ts
│   ├── rate-limit.ts
│   ├── error-handler.ts
│   └── async-context.ts       AsyncLocalStorage setup
├── lib/
│   ├── prisma.ts              Prisma client + tenant extension
│   ├── redis.ts
│   ├── queue.ts               BullMQ queues + connection
│   ├── whatsapp.ts            Meta Cloud API client
│   ├── gold-rate.ts           MCX client + cache reader
│   ├── gst.ts                 The only place GST is calculated
│   ├── money.ts               Mirrors client
│   ├── pdf.ts                 GST invoice generator
│   ├── meili.ts
│   └── s3.ts
├── workers/
│   ├── index.ts               Worker entrypoint (PM2 goldos-worker)
│   ├── gold-rate.cron.ts      Every 5 min
│   ├── abandoned-cart.cron.ts Every 15 min
│   ├── followup.cron.ts       Daily at 09:00 IST
│   └── whatsapp.consumer.ts   BullMQ consumer
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
└── index.ts                   Express boot, mounts modules, serves client/dist
```

### Module convention

Every module has three files:

- `<mod>.routes.ts` — Express router. Validates with Zod, calls service, formats response.
- `<mod>.service.ts` — Business logic. Uses Prisma. Returns plain objects (or throws typed errors).
- `<mod>.schema.ts` — Re-exports the relevant schemas from `shared/schemas.ts` for local use.

No fat controllers. No service classes — plain async functions are fine. Keep it boring.

### Production mode serves the client

In `server/src/index.ts`:

```ts
// API
app.use('/api/v1', apiRouter);

// Static client in prod only
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
  app.get('*', (_, res) => res.sendFile(path.join(__dirname, '../../client/dist/index.html')));
}
```

In dev, Vite proxies `/api` to `http://localhost:4000` and runs its own dev server.

## Data flow examples

### Owner creates a bill on POS tablet

1. Tablet (React PWA) → `useCreateBillMutation(billPayload)` with idempotency key
2. RTK Query POST `/api/v1/pos/bills`
3. Server validates with `BillCreateSchema` from `shared/schemas.ts`
4. Service reads current gold rate from Redis (already cached by cron)
5. Service computes line totals, GST via `lib/gst.ts`, validates against stock
6. Prisma write inside a transaction: insert bill, insert lines, decrement stock, write audit log
7. Service enqueues `send-receipt` job to BullMQ
8. Returns bill JSON; RTK Query updates cache via `invalidatesTags`
9. Worker picks up `send-receipt`, generates PDF, calls WhatsApp Cloud API, logs delivery
10. UI shows "Receipt sent ✓" via WebSocket push from worker → web (Redis pub/sub)

### Customer browses storefront

1. SSR via React 18 streaming? No — Vite SPA is fine for v1, switch to Next.js only if SEO testing demands it. Storefront uses static pre-rendered HTML for top pages (vite-plugin-ssg) + client hydration.
2. Product detail page calls `useGetProductBySlugQuery(slug)`
3. Pricing computed server-side using current gold rate (NOT client-side; price must be authoritative)
4. Add to cart → cart in Redux + persisted to localStorage; on login, merged with server cart

### Background: gold rate refresh

1. `gold-rate.cron.ts` fires every 5 minutes
2. Calls MCX API for 22K/18K/14K/silver/platinum rates
3. Writes to Redis with key `goldrate:<purity>` and `goldrate:meta` (timestamp, stale flag)
4. Pub-subs to `goldrate:updated` channel → connected admin sessions get a WS push to refresh visible prices

## Why monolith here

- Single developer / small team. Coordination cost of multiple services > zero benefit at this scale.
- All modules share the same database and the same domain model. Splitting them buys nothing.
- Latency is lower (in-process function calls vs HTTP between services).
- Deploys are simpler (one artifact, one rollback).
- We can extract a service later if a real bottleneck emerges. We won't, but we could.

## When to revisit this

Only if:
- > 1000 active tenants AND clear performance bottleneck traceable to one module
- A specific module needs a different language/runtime
- Security boundary genuinely requires process isolation (not just "feels safer")

Not before.
