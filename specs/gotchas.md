# Gotchas

The things that will silently break the product. Read this before touching POS, inventory, finance, or anything money-adjacent. Also read it before designing the storefront — domain rules drive several UI decisions.

## Money math

- **Never use floats for money.** `0.1 + 0.2 = 0.30000000000000004`. Use paise everywhere as integer. `Money` helper in `client/src/lib/money.ts` and `server/src/lib/money.ts` (identical) is the only correct way. If you find yourself writing `*100` or `/100`, stop and use the helper.
- **Display only converts at the edge.** API returns paise. React component formats to ₹.
- **Rounding rule for GST:** Each line's GST is calculated on that line, rounded to nearest paise (banker's rounding). Bill total GST is sum of line GST — never recompute on the total. Indian GST requires per-line accounting.

## Weight & purity

- **Weight in milligrams (integer).** A 12.345g ring is `12345`. Counter staff enters grams; the form parses to mg.
- **Purity as carat × 100.** 22K = `2200`. 18K = `1800`. Silver = `0`. Always validate purity is allowed.
- **Net vs gross weight.** Jewellery with stones has gross weight (total) and net gold weight (gross − stone). Pricing uses net. Hallmarking is on net. Always store both. `weightMg` = gross, `goldWeightMg` (computed) = `weightMg - stoneWeightMg`.

## Gold rate

- **MCX rate is per 10 grams**, but we store per gram in paise. Always divide by 10 on ingest. Easy bug.
- **Rate has a TTL of 5 minutes.** A bill at 11:59 may use the 11:55 rate. That's correct — we lock the rate on the bill so the customer pays what they saw.
- **Rate is per (purity, type).** 22K rate ≠ 18K rate ≠ silver rate. The poller stores all. Bills read the rate matching the item's purity.
- **MCX downtime is real.** If the cron fails, the last cached rate stays in Redis with `stale: true`. UI shows a warning. Owner can manually set an override via super-admin.
- **Storefront prices are server-computed**, not client. Putting price math in React = customer sees stale prices = trust gone.

## Making charges

- **Per category, set by jeweller** — not a fixed table. Either flat-per-gram or percentage-of-gold-value. Store `makingChargeBps` (basis points for %) or `makingChargeFlatPaisePerGram` for flat. Bill line stores both the rule used and the computed paise.
- **Old gold exchange does NOT subtract making charges.** Customer gets pure gold value back, not making. Standard practice. Don't argue.

## GST

- **Jewellery GST is 3%** (1.5% CGST + 1.5% SGST intra-state, 3% IGST inter-state).
- **Inter-state vs intra-state** is determined by comparing the shop's `gstStateCode` to the customer's billing state. Always derive — never let the user pick.
- **Old gold exchange is GST-neutral.** Exchange value subtracted from taxable base. Only net amount the customer pays is taxed.
- **GST on making charges** — yes, making is taxable supply. Common mistake to exclude.
- **CGST/SGST/IGST split is mutually exclusive.** A bill is either CGST+SGST or IGST, never both.

## Hallmarking (BIS)

- Mandatory for 14K/18K/22K gold jewellery in India.
- States: `PENDING`, `SUBMITTED`, `CERTIFIED`, `EXEMPT` (silver, stone-only).
- `PENDING` items should not appear in the storefront. They can be sold in-store with a staff warning.
- HUID = 6-character alphanumeric. Validate format.

## Old gold exchange flow

1. Customer brings old gold
2. Staff weighs it, determines purity (acid test / karat meter / declared)
3. `today's rate × weight × (purity/24)` = gross old gold value
4. Jeweller deducts wastage (typical 1–3%, configurable per tenant as `oldGoldWastageBps`)
5. Net value subtracted from new bill
6. If net > new bill, difference paid to customer (cash or store credit, per shop policy)
7. Old gold item creates inventory record in "Old Gold for Melting" pseudo-shop, tracked in wastage log

## Multi-shop sync

- One Postgres. Stock decrement on bill is a transaction. "Sync" is just live read consistency.
- POS offline-mode is the only real sync: IndexedDB local writes, replayed via `/api/v1/pos/sync` with idempotency keys.
- Stock transfer between shops is two-phase (initiate at source → accept at destination). Stock is "in transit" between.

## Tenant isolation (the single most important invariant)

- A bug here is a security incident.
- Prisma extension (`server/src/lib/prisma.ts`) reads `tenantId` from `AsyncLocalStorage` and rewrites every Prisma operation to include `tenantId` in where/data.
- **Raw queries (`$queryRaw`) bypass this.** If you write raw SQL, you MUST include `WHERE tenant_id = $1`. Reviewer must verify.
- Cross-tenant joins are impossible by design. Only super-admin endpoints can read across tenants, and they use a separate Prisma client without the extension.
- Test: every list endpoint must have a "tenant A cannot read tenant B" e2e test.

## WhatsApp

- **Meta Cloud API has template approval.** No free-form messages outside a 24h conversation window. All proactive messages (receipts, broadcasts, follow-ups) use pre-approved templates. Template names in env.
- **Phone numbers are E.164** (`+91XXXXXXXXXX`). Validate on entry. `Customer.phone` is source of truth.
- **Twilio is SMS fallback only.** If WhatsApp send fails twice (template missing, user not on WhatsApp, Meta error), enqueue SMS via Twilio. Log both.
- **Don't send WhatsApp from a request handler.** Enqueue via BullMQ. Worker handles retries.

## Offline POS (web PWA)

- **IndexedDB schema mirrors server schema** for entities POS touches: items (read-only local cache), customers (read + sync), bills (write + sync), payments (write + sync).
- Use **Dexie** as the IndexedDB wrapper (simpler than raw IDB).
- Service worker (Workbox) caches the app shell + product images.
- **Conflict resolution:**
  - Bills: server accepts client `idempotencyKey`. Duplicate sync = no-op (server returns the original response).
  - Stock: server is authoritative. If client billed an item already sold, server returns 422; client shows "out of stock" and rolls back the local bill.
- **Network detection in browser is unreliable.** Don't trust `navigator.onLine` alone; attempt a sync ping. If ping fails, queue.
- **Test with DevTools "Offline" mode.** Every PR touching POS gets tested with offline mode on. Real device (tablet) test before phase signoff.

## RTK Query traps

- **Tags must match between providesTags and invalidatesTags.** Typos → cache stays stale → UI lies. Use the literal types from `tagTypes`.
- **Don't use `keepUnusedDataFor: Infinity` carelessly** — memory bloat. Default (60s) is fine for most.
- **Avoid `refetchOnFocus` globally.** Only enable on dashboards that need it. Otherwise it'll thrash on every tab switch.
- **Optimistic updates must `patch.undo()` on error.** Easy to forget — leaves UI showing a state the server rejected.

## Vite + React traps

- **Don't import from `node_modules` outside the resolve config.** Use `@/` (configured in `vite.config.ts` and `tsconfig.json`).
- **Lazy-load module routes.** Storefront and admin should be in separate route bundles; otherwise the storefront ships the entire admin to anonymous visitors.
- **Tailwind purge needs every JSX file.** If a class isn't appearing in prod, it's because the file isn't in `content` glob.

## Express + Prisma traps

- **AsyncLocalStorage must be set before any DB call.** If the tenant middleware runs after a route that uses Prisma, tenant scope is undefined. Order matters: `auth` → `tenant-scope` → route.
- **Don't pass the Prisma client into background workers without resetting context.** Workers run outside the request ALS; they must explicitly set `runWithTenant(tenantId, () => ...)` for every job.
- **Prisma `findUnique` is faster than `findFirst` on indexed unique cols.** Use the right one.
- **Express error handlers must accept 4 args** `(err, req, res, next)` to be recognized as error middleware.

## Files / folders not to touch directly

- `server/src/prisma/migrations/` — never edit committed migrations. Add new.
- `server/src/lib/gst.ts` — central tax calc. Read and use; do not duplicate.
- `server/src/lib/prisma.ts` — Prisma + tenant extension. Touch only with care.
- `server/src/lib/money.ts` and `client/src/lib/money.ts` — must stay byte-identical (or generate from a shared template).
- `shared/schemas.ts` — Zod schemas. Adding fields is fine; changing types is breaking, needs migration.
- `.env.example` — keep every key present (empty value if secret).

## Required env vars

App crashes loud at boot if any are missing:

```
DATABASE_URL
REDIS_URL
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
WHATSAPP_API_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_TEMPLATE_RECEIPT
WHATSAPP_TEMPLATE_OTP
WHATSAPP_TEMPLATE_ABANDONED_CART
TWILIO_ACCOUNT_SID         (SMS fallback)
TWILIO_AUTH_TOKEN
MCX_API_KEY
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
SHIPROCKET_EMAIL
SHIPROCKET_PASSWORD
S3_BUCKET
S3_ACCESS_KEY
S3_SECRET_KEY
S3_ENDPOINT                 (MinIO in dev, AWS in prod)
SENTRY_DSN                  (optional in dev)
```

Server `index.ts` validates these against a Zod schema at boot. Missing = crash with a clear message, not a silent fallback.
