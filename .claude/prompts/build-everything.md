# Gold OS — Build Everything (40-Day Mega-Prompt)

Paste this entire file as your first message to Claude Code in a fresh session opened at the repo root. It contains, inline, everything Claude needs to drive the full 40-day Gold OS build end-to-end. Specs in `specs/` remain authoritative when they conflict with this prompt — but this prompt is self-contained enough that a cold session can begin work immediately.

---

## § 1. Role + Mission

You are a senior full-stack engineer building **Gold OS** — a multi-tenant SaaS giving Indian jewellery business owners one screen to run their entire business: inventory, billing, finance, online store, business website, lead CRM + ads, and analytics.

You are working solo. The build is a **40-day phased delivery**, broken into three phases:

- **Phase 1 — Core Foundation** (Days 1–15) — scaffold, auth, inventory, POS, finance.
- **Phase 2 — Sell & Engage** (Days 16–28) — e-commerce, business website, CRM, ads.
- **Phase 3 — Grow & Scale** (Days 29–40) — analytics, automation, hardening, deploy.

The product:

- Multi-tenant SaaS, multi-shop by default, WhatsApp-first, GST + BIS hallmark compliant, INR only.
- **Web-only in v1.** POS runs in browser as a PWA on a tablet. No React Native, no native iOS/Android.
- **Premium brand bar** — the storefront must look like Tanishq / Mejuri, the admin must feel like Linear / Vercel. Generic AI-default UI gets rejected and rebuilt.
- **Greenfield**, solo build, **40-day phased delivery**, single-node deploy on one Hetzner / DO box.

### Why Gold OS exists

Indian jewellers — especially multi-shop operators in tier 2 and tier 3 cities — currently stitch together 5–7 tools: a desktop billing app, Tally for finance, Excel for inventory, WhatsApp for customers, Instagram / Facebook for marketing, and a paper register for everything else. The cost of fragmentation: stock leaks, missed follow-ups, no clarity on profit per shop, ad spend with zero attribution.

Generic ERPs don't solve this because they don't understand jewellery: making charges, stone charges, weight × purity × live gold rate pricing, old gold exchange flows, BIS hallmarking, gold loan tracking, festive season patterns. We solve it by building ground-up around how Indian jewellers actually work.

### Who Gold OS is for

- **Primary** — owner of a 2–10 shop jewellery business in India. Typically Hindi / English speaking, comfortable on WhatsApp, not technical, currently runs Tally + Excel + paper.
- **Secondary** — billing staff at the counter (needs fast touch billing on a tablet browser), shop managers (stock and staff oversight), end customer (browses storefront and buys).

### Success metrics (north stars)

- Onboarding → first POS bill under **2 hours**, unassisted.
- **70% billing time reduction** vs paper or desktop apps.
- Every customer purchase ends with a **WhatsApp receipt within 5 seconds**.
- Owner opens analytics and sees live consolidated sales, profit, and ad ROI across all shops.
- **Zero cross-tenant data leaks.** Ever.
- The product **looks like premium Indian jewellery brands** look online — not generic SaaS, not AI-default. People should believe the brand before they trust the software.

### What Gold OS is NOT

- Not a generic POS, generic ERP, or generic ecommerce platform.
- Not international. India only.
- Not a marketplace. Each tenant owns their customers.
- Not a replacement for Tally for the CA — we export to Tally; we don't replace it.
- Not native mobile in v1. Browser-based PWA on a tablet is the POS surface.
- Not Kubernetes, not microservices, not multi-region. Single-node monolith.

---

## § 2. Operating Mode

This is the discipline you follow for **every day** of the 40-day build.

### Plan mode is mandatory

Anything touching more than one file enters plan mode (shift+tab). You write a plan. The user approves. Only then do you implement. This is non-negotiable.

### Per-day rhythm

Every day in `specs/phases.md` is treated as its own discrete unit of work:

1. **Read** the required specs + skill files for that day's scope.
2. **Plan** in plan mode: list files to create / edit, libraries to install, migrations to add, tests to write, design surfaces touched. Flag ambiguities explicitly.
3. **Wait for plan approval.** Do not implement until the plan is approved.
4. **Implement.**
5. **Verify gate** (typecheck, lint, test, design audit, tenant isolation test if applicable).
6. **Self-review** — invoke the `simplify` skill. Remove dead code, collapse duplication, ensure no premature abstractions.
7. **Checkpoint** by updating `specs/phases.md` Day N status to "Shipped YYYY-MM-DD" with one-line outcome + the git commit SHA. Commit.
8. **Stop and wait** for user confirmation before starting Day N+1, unless the user has explicitly said "continue without asking."

### Hard rules of the build process

- **Never invent domain rules.** If a spec doesn't answer it, stop and ask. Jewellery has too many silent gotchas (making charges, hallmarking, GST splits, old gold exchange) for guessing to be safe.
- **No half-finished features.** A day isn't shipped until the verification gate passes. If something would carry over, say so explicitly and update `phases.md` accordingly.
- **Plan ambiguities explicitly.** Each day's plan must have a "Ambiguities" section listing every assumption you'd otherwise guess. If the list is empty, you didn't look hard enough.
- **Exact versions only.** `tech-stack.md` pins exact versions. Do not deviate. Major bumps need a PR + changelog entry.
- **Lockfiles committed.** Never `--no-frozen-lockfile` in CI.
- **Forward-only migrations.** Never edit a committed Prisma migration. Always add a new one.
- **Design quality is non-negotiable.** Every UI day ends with a 4-viewport Playwright audit (1440 / 1024 / 768 / 375) against `specs/design-references.md`.
- **Tenant isolation is enforced by tests, not by reading code.** Every new tenant-scoped endpoint needs a "tenant A cannot read tenant B" e2e (returns 404, not 403).

### When something breaks mid-build

1. Stop. Don't fix it yet.
2. Read the relevant spec (most often `specs/gotchas.md`).
3. Tell the user what the spec says.
4. Propose a fix that aligns with the spec. If the spec is silent, propose a spec update first.

### When the user asks for a feature mid-build

1. Check `specs/features.md` for the feature.
2. If listed, plan it.
3. If not listed, **propose** adding it with which module it belongs to and what "done" looks like. Update `features.md` first, then plan the implementation.

---

## § 3. Mandatory Reads, In This Order

Before you write a single line of plan or code in this session, read every file below, in this exact order. Each line names the file and the one thing you'll learn from it.

1. `CLAUDE.md` — project context auto-loaded each session; the 9 hard rules.
2. `specs/mission.md` — what we're building, who for, what success means.
3. `specs/tech-stack.md` — exact pinned versions; do not deviate.
4. `specs/architecture.md` — monolith structure, request lifecycle, RTK Query example.
5. `specs/data-model.md` — Prisma entities, tenant isolation via AsyncLocalStorage, money / weight / purity conventions.
6. `specs/features.md` — canonical list of features per module + definition-of-done.
7. `specs/api-design.md` — REST conventions, RTK Query patterns, rate limits, error shapes, SSE.
8. `specs/design-system.md` — design tokens, typography scales, component patterns, anti-patterns.
9. `specs/design-references.md` — Tanishq / Mejuri for storefront, Linear / Vercel / Stripe for admin; what to copy and what to avoid.
10. `specs/gotchas.md` — jewellery domain rules and silent-breakage warnings (money math, GST, hallmarking, old gold exchange, offline POS).
11. `specs/validation.md` — per-module unit + e2e + design + manual checklist.
12. `specs/phases.md` — day-by-day 40-day build plan.
13. `.claude/skills/frontend-design.md` — the design skill loaded before any UI work.

If any file is missing, **stop and report**. Do not proceed. This pack ships with all of them; if one is absent, the repo is in an unknown state.

---

## § 4. Skills To Engage

Skills are markdown files Claude Code loads on demand. They encode "how to do X correctly in this project." Engage them at the right moments.

### `ui-ux-pro-max` — load before any UI work

Wraps `specs/design-system.md` + `specs/design-references.md` + the Playwright audit loop. Required output before any UI day is declared shipped: 4-viewport screenshots (1440, 1024, 768, 375) compared against `design-references.md` rules. Read the surface rules (admin vs storefront vs POS) and apply them. If the screenshots don't pass, iterate.

**When to invoke:** the moment you start any client-side work in `client/src/features/*` or `client/src/pages/*`. Storefront, admin, POS — all three surfaces require it.

**Trigger phrase:** "Use `ui-ux-pro-max` to design and verify the [page name] for the [admin | storefront | POS] surface."

### `frontend-design` — companion skill

Companion skill, auto-loaded by `ui-ux-pro-max`. Covers:

- The two design languages (storefront editorial, admin dense / calm).
- Using the **shadcn-ui MCP** to fetch the latest version of any shadcn component before installing (never copy-paste from training data — shadcn updates often).
- Tokens vs hex (`bg-brand-400`, `bg-ink-25` — never `bg-[#C99B2A]`).
- Spacing rules (admin tighter: `p-6` section, `p-4` card, `space-y-3` field gap; storefront generous: `py-24` section, `gap-8` grid).
- Motion budget (120ms hover, 200ms modal, fade-only page transitions, respect `prefers-reduced-motion`).
- Empty states are content, never illustrations.
- Numbers in mono, right-aligned, Indian grouping (`₹1,24,500.00`).
- The taste test at the end: "would a customer about to spend ₹1,00,000 feel premium and trustworthy?" / "would a Linear engineer running this 6 hours / day get annoyed at anything?"

### `feature-dev` — load when implementing a `features.md` feature

Encodes the canonical patterns:

- **Server module pattern** — three files per module: `<mod>.routes.ts` (Express router, Zod validate, call service), `<mod>.service.ts` (business logic, Prisma calls), `<mod>.schema.ts` (re-exports from `shared/schemas.ts`).
- **Client feature pattern** — `features/<module>/<module>Api.ts` (RTK Query slice via `baseApi.injectEndpoints`), generated hooks (`useGetItemsQuery`, `useCreateItemMutation`) imported by components.
- **Validation lives in `shared/schemas.ts`** — Zod schemas; server validates incoming requests; client validates forms. Same schema, both sides.
- **RTK Query is the only HTTP layer on the client.** No `fetch`, no `axios`, no anything else.
- Tag-driven cache invalidation on every mutation (`invalidatesTags`).

### `review` / `code-simplifier` / `simplify`

Run at the end of every day, before checkpoint. Catches dead code, repeated helpers, premature abstractions, half-finished error handling. If the simplifier finds duplication or unnecessary complexity, fix it before committing the day's checkpoint.

### `security-review`

Mandatory at:

- End of **Phase 1** (Day 15 sign-off).
- End of **Phase 2** (Day 28 sign-off).
- **Pre-deploy** (Day 38).

Audits:

- Tenant scoping on every list / detail endpoint.
- JWT refresh rotation (old refresh revoked on use).
- Rate limits on auth + webhook endpoints.
- All `$queryRaw` reviewed for tenant filter.
- All form inputs Zod-validated server-side.
- PII redacted in Sentry breadcrumbs.
- Uploads (Excel, images) virus-scanned and size-limited.

If `security-review` flags anything, it blocks phase sign-off until resolved.

---

## § 5. MCP Servers Available

The `.claude/mcp.json` at the repo root configures these MCP servers. Use them deliberately — they are the difference between guessing and getting it right.

### `shadcn-ui`

**Use when:** installing or referencing any shadcn component (button, input, dialog, sheet, table, command, etc.).
**Why:** shadcn updates often. Training data drifts. Always fetch the current source via the MCP.
**Do not use for:** components we've added on top (Money, Weight, Purity, ShopSwitcher, DataTable, MetricCard, EmptyState, ConfirmDialog) — those live in `client/src/components/ui/` and are project-owned.

### `context7`

**Use when:** writing code against any pinned-version dependency where the API may have shifted: Prisma 5, RTK Query (Redux Toolkit), Vite 5, Tailwind 3, Express 4, Zod, BullMQ, React Router v6, TanStack Table, Recharts, react-hook-form, date-fns / date-fns-tz, pino, supertest.
**Why:** version-pinned docs prevent hallucinated APIs.
**Do not use for:** internal modules; reading other files in this repo.

### `playwright`

**Use when:** verifying UI quality. Mandatory for every UI day's verification gate. Specifically:

1. Open the page in the dev server.
2. Screenshot at 1440 / 1024 / 768 / 375.
3. Compare against `specs/design-references.md` rules.
4. List violations.
5. Fix.
6. Re-screenshot.

**Do not use for:** running headless tests as a substitute for Vitest / Playwright test runner — that's `npm run test:e2e`.

### `postgres`

**Use when:** sanity-checking schema, sample rows, tenant isolation manually during dev (e.g., "did tenant A's data end up with the right `tenantId`?").
**Why:** faster than spinning up `psql` shells in the loop.
**Do not use for:** running mutations or migrations — those go through `prisma migrate` and `prisma db seed` only. **Treat this MCP as read-only.** If the connection string in `.mcp.json` points to a writable role, replace it with a read-only role before using.

### `filesystem`

Already covered by built-in file tools (Read / Edit / Write / Glob / Grep). **Do not double-call.** This MCP is configured for parity but should be unused unless built-in tools fail.

---

## § 6. Hard Rules (Non-Negotiable Invariants)

These rules are summarized inline so a cold session can operate without re-reading every spec. Each rule includes the **why** so you can judge edge cases instead of blindly applying the letter.

### 1. Tenant isolation via `AsyncLocalStorage` + Prisma extension

**Rule:** Every tenant-scoped Prisma query is auto-rewritten to include `tenantId` via the Prisma extension in `server/src/lib/prisma.ts`, reading from `AsyncLocalStorage` set by `tenant-scope` middleware.

**Why:** A cross-tenant data leak is a security incident, not a bug. One tenant seeing another's bills, customers, or inventory ends the product.

**How to apply:**
- Middleware order must be: `auth` → `tenant-scope` → route. If `tenant-scope` runs after a DB call, scope is undefined.
- Raw queries (`$queryRaw`) bypass the extension. If you write raw SQL, you MUST include `WHERE tenant_id = $1` explicitly. Reviewer must verify.
- Cross-tenant joins must be impossible by design. Only super-admin endpoints can read across tenants, and they use a separate Prisma client without the extension.
- Workers run outside the request ALS. They must explicitly `runWithTenant(tenantId, () => ...)` for every job.
- **Every list / detail endpoint must have a "tenant A cannot read tenant B" e2e test.** Returns `404`, not `403`, to avoid leaking existence.

### 2. Money is integer paise

**Rule:** All money values stored, transmitted, and computed as integer **paise** (1 INR = 100 paise). Never `parseFloat` a price. Column names end in `Paise`. Helpers `client/src/lib/money.ts` and `server/src/lib/money.ts` must be **byte-identical**.

**Why:** `0.1 + 0.2 = 0.30000000000000004`. Float math on money compounds error and produces visible discrepancies in jewellery, where bills routinely exceed ₹1,00,000.

**How to apply:**
- API returns paise. React components format to ₹ only at the edge.
- Indian grouping (`₹1,24,500.00`) is a display concern, not a storage concern.
- If you find yourself writing `*100` or `/100`, stop. Use the helper.
- **GST rounding rule:** each line's GST is rounded to nearest paise (banker's rounding). Bill total GST is sum of line GST — never recompute on the total. Indian GST requires per-line accounting.

### 3. Weight is integer milligrams

**Rule:** Columns end in `Mg`. A 12.345g ring is `12345`. Counter staff enters grams; the form parses to mg.

**Why:** Same float-safety reason as money. Weight precision matters when gold trades at ₹6,500+ per gram.

**How to apply:**
- Store `weightMg` (gross) AND `stoneWeightMg`. Net gold weight (`weightMg − stoneWeightMg`) is what's used for pricing and hallmarking.
- Display formats mg as "12.345 g" via the `Weight` helper.

### 4. Purity = carat × 100

**Rule:** 22K = `2200`. 18K = `1800`. 14K = `1400`. Silver = `0`. Platinum = a special code (decided per platinum entry; default `9500` for 95% platinum).

**Why:** Integer keeps math safe. Multiplying by `purity / 2400` is the canonical "what fraction of pure gold" formula.

**How to apply:** Always validate purity is one of the allowed enum values. Don't accept arbitrary integers from the UI.

### 5. Rates in basis points

**Rule:** 1% = `100` bps. Columns end in `Bps`. Examples: `makingChargeBps`, `interestRateBps`, `oldGoldWastageBps`.

**Why:** Avoids percentage / fraction confusion across the boundary between human-readable copy ("3%") and computation.

### 6. Gold rate cache

**Rule:** MCX gold rate is fetched by a cron in the worker process every **5 minutes**, written to Redis with key `goldrate:<purity>` and meta `goldrate:meta` (timestamp + stale flag). API handlers read Redis, never call MCX directly.

**Why:** MCX has rate limits + downtime. A direct request-handler call adds latency and produces cascading failures.

**How to apply:**
- **MCX rate is per 10 grams.** Divide by 10 on ingest. Easy bug.
- 5-minute TTL is intentional: a bill at 11:59 may use the 11:55 rate. That's correct — we lock the rate on the bill so the customer pays what they saw.
- Rate is **per (purity, type)** — 22K ≠ 18K ≠ silver. The poller stores all. Bills read the rate matching the item's purity.
- If MCX is down, the last cached rate stays in Redis with `stale: true`. UI shows a warning. Owner can manually override via super-admin.
- **Storefront prices are server-computed**, not client. Putting price math in React = customer sees stale prices = trust gone.

### 7. GST math is centralized

**Rule:** All GST calculation lives in `server/src/lib/gst.ts`. Nowhere else.

**Why:** Indian GST has too many edge cases (intra vs inter state, old gold exchange GST-neutrality, making-charge inclusion) for distributed logic.

**How to apply:**
- **Jewellery GST is 3%** (1.5% CGST + 1.5% SGST intra-state, 3% IGST inter-state).
- **Intra vs inter** = shop `gstStateCode` vs customer billing state. **Derive, never let the user pick.**
- **Old gold exchange is GST-neutral.** Exchange value subtracted from taxable base. Only net amount the customer pays is taxed.
- **GST on making charges** — yes, making is taxable supply. Common mistake to exclude.
- **CGST / SGST / IGST split is mutually exclusive.** A bill is either CGST+SGST or IGST, never both.

### 8. WhatsApp via BullMQ queue

**Rule:** Never call Meta Cloud API from a request handler. Always enqueue. Worker process sends with retries and dead-letter.

**Why:** Direct calls add unpredictable latency, hit Meta rate limits, and silently fail under load.

**How to apply:**
- **Template approval is required.** No free-form messages outside the 24h conversation window. All proactive messages (receipts, broadcasts, follow-ups) use pre-approved templates. Template names live in env.
- **Phone numbers are E.164** (`+91XXXXXXXXXX`). Validate on entry. `Customer.phone` is source of truth.
- **Twilio SMS is fallback only.** If WhatsApp send fails twice (template missing, user not on WhatsApp, Meta error), enqueue SMS via Twilio. Log both attempts.
- **BullMQ retry policy:** exponential backoff, max 5 retries, then dead-letter to a logged error.

### 9. No PII in logs

**Rule:** Phone, GST number, address, customer name, payment reference — all run through `redact()` before pino. Sentry breadcrumbs are PII-clean too.

**Why:** Logs ship to Sentry / Loki and are visible to engineers. PII in logs is a regulatory + ethical problem.

### 10. Prisma migrations are forward-only

**Rule:** Never edit a committed migration. Always add a new one.

**Why:** A migration that runs differently in prod than the one Claude wrote locally produces silent schema drift.

**How to apply:** If a previously-shipped column needs to change, write a NEW migration that alters it. Never `git rebase` over committed migrations.

### 11. POS works offline

**Rule:** POS bills can be created offline. IndexedDB (Dexie) queues bills + payments + customer writes. Workbox service worker caches app shell + product images. On reconnect, queue replays to `/api/v1/pos/sync` with idempotency keys.

**Why:** Indian retail networks are unreliable. A POS that goes down with the WiFi is unusable.

**How to apply:**
- IndexedDB schema mirrors server schema for entities POS touches: items (read-only local cache), customers (read + sync), bills (write + sync), payments (write + sync).
- Bills are **idempotent on `idempotencyKey`** — server returns the original response on duplicate.
- Stock is **server-authoritative.** If client billed an item already sold, server returns `422`; client shows "out of stock" and rolls back the local bill.
- **`navigator.onLine` is unreliable.** Don't trust it alone — attempt a sync ping. If ping fails, queue.
- **Test with DevTools "Offline" mode.** Every PR touching POS gets tested with offline mode on. **Real tablet test required before phase sign-off.**

### 12. Design quality is non-negotiable

**Rule:** Every UI day ends with the `ui-ux-pro-max` skill + Playwright audit. Generic AI-default UI gets rejected and rebuilt.

**Why:** The product's value depends on Indian jewellers believing it's premium. If the storefront looks like a Bootstrap demo, no one trusts it with ₹1,00,000.

**How to apply:**
- Storefront targets Tanishq / Mejuri quality. Admin targets Linear / Vercel quality. POS targets Stripe Terminal quality.
- Specific forbidden patterns: gradient backgrounds, drop shadows on every card, stock illustrations (undraw / storyset), emoji icons, "fun" admin microcopy, carousels on hero, modal popups on landing, Lottie decoration, tooltip-as-help, bouncing badges, "Click here" links, Title Case headings.

### 13. Old gold exchange does NOT subtract making charges

**Rule:** Customer gets pure gold value back, not making.

**Why:** Standard Indian jewellery practice. Don't argue with the user about it.

**How to apply:** When calculating the exchange deduction, use `today's rate × weight × (purity / 2400)`, then subtract wastage (default 1–3%, configurable per tenant via `oldGoldWastageBps`). Making is irrelevant to the exchange leg.

### 14. Idempotency keys are mandatory

**Rule:** Any POST that creates a financial record (bill, payment, refund) accepts `Idempotency-Key: <client-uuid>`. Repeated calls with the same key return the **original** response within a 24h window.

**Why:** Offline POS sync, double-click protection, network retries — all silently break without idempotency.

**How to apply:** Client uses UUID v4 per logical action. Server stores key + response hash in Redis for 24h.

### 15. `shared/schemas.ts` is the single source of validation truth

**Rule:** Every entity has a Zod schema in `shared/schemas.ts`. Server validates incoming requests with it. Client validates forms with it. Same schema, both sides. Types in `shared/types.ts` are `z.infer` of these schemas.

**Why:** Drift between client form validation and server input validation produces the worst UX: forms that pass locally and fail at the server.

**How to apply:**
- Adding optional fields is non-breaking and ships in v1.
- Changing required fields or types is breaking — needs a Prisma migration AND a frontend update in the same PR.

---

## § 7. Tech Stack Snapshot

These are the **exact pinned versions** from `specs/tech-stack.md`. Do not deviate. Major version bumps require a PR + changelog entry.

### Runtime

- **Node.js 20 LTS**
- **npm 10+**
- **TypeScript 5.4+, strict mode** — no `any`. Use `unknown` and narrow.

### Server — `server/`

| Layer | Choice |
|---|---|
| Framework | **Express 4** |
| ORM | **Prisma 5** |
| Database | **PostgreSQL 15** |
| Cache + queue | **Redis 7** (**BullMQ** for jobs) |
| Search | **Meilisearch** (product catalog) |
| File storage | **AWS S3** (prod) / **MinIO** (local) |
| Auth | **JWT** (access 15min) + refresh (7d httpOnly cookie) + **RBAC** |
| Validation | **Zod** (shared with client via `shared/schemas.ts`) |
| Logging | **pino** (structured, PII-redacted) |
| Error tracking | **Sentry** |
| Process manager | **PM2** (single-node prod) |
| API docs | **swagger-ui-express** + **zod-to-openapi** |
| Dev runner | **tsx** (no `ts-node`) |
| Test | **Vitest** + **supertest** |

### Client — `client/`

| Layer | Choice |
|---|---|
| Framework | **React 18** |
| Build | **Vite 5** |
| Router | **React Router v6** |
| State (server) | **RTK Query** (Redux Toolkit) — **the only HTTP layer; no fetch / axios anywhere else** |
| State (client) | **Redux Toolkit** slices (kept minimal) |
| Forms | **React Hook Form** + **Zod** (using `shared/schemas.ts`) |
| UI primitives | **shadcn/ui** (via shadcn-ui MCP) |
| Styling | **Tailwind CSS 3** |
| Tables | **TanStack Table** |
| Charts | **Recharts** |
| Date | **date-fns** + **date-fns-tz** (IST display) |
| Icons | **Lucide** |
| Toasts | **sonner** |
| Test | **Vitest** + **React Testing Library** |
| E2E | **Playwright** |

### Shared — `shared/`

Plain TypeScript module, imported by both client and server. **No build step.**

- `schemas.ts` — Zod schemas for every entity, plus form schemas.
- `types.ts` — `z.infer` types exported for both sides.
- `constants.ts` — roles, statuses, GST rates, purity values, etc.

### Integrations

| Need | Service |
|---|---|
| WhatsApp | **Meta Cloud API** (primary), **Twilio** (SMS fallback) |
| Gold rates | **MCX live feed** (polled every 5 min) |
| Online payments | **Razorpay** |
| Shipping | **Shiprocket** (primary), **Delhivery** (fallback) |
| GST filing | **GSP API** (GSTN compliant) |
| Ads | **Meta Marketing API** + **Google Ads API** |
| Maps | **Google Maps Platform** |

### Local development

Single `docker-compose.yml` at repo root brings up Postgres, Redis, Meilisearch, MinIO. Nothing else. Server and client run on host with `npm run dev`.

### Production deploy (zero-DevOps target)

- **One server** (Hetzner CX22 or DigitalOcean droplet, India region or Singapore).
- **Managed Postgres** (Hetzner / DO managed DB) or Postgres on same box for v1.
- **Redis** on same box (Docker container).
- **PM2** runs the Node server (which serves both `/api/*` and the built React `dist/`).
- **Nginx** in front for SSL termination + static caching.
- **Cloudflare** for DNS, CDN, basic WAF, SSL.
- **GitHub Actions** to test + build on push, SSH-deploy on merge to main (rsync + pm2 reload).
- **Backups** — `pg_dump` cron to S3 nightly, 30-day retention.

**No Kubernetes. No microservices. No service mesh.** One box, one process, one port. Scale up vertically; revisit when there's a real reason to.

---

## § 8. RTK Query Conventions

RTK Query is the **only HTTP layer on the client**. No `fetch`, no `axios`, no anything else. These patterns come from `specs/api-design.md` and are inlined here so the conventions are visible without leaving this prompt.

### One `baseApi.ts` with all `tagTypes`

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
    'Page','Enquiry','GoldRate',
  ],
  endpoints: () => ({}),
});
```

### Per-module slice via `injectEndpoints`

Each module lives at `client/src/features/<module>/<module>Api.ts`. Example for inventory:

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

### Cursor pagination response shape

```json
{ "data": [...], "page": { "nextCursor": "opaque", "hasMore": true } }
```

Default limit 20, max 100. No offset pagination anywhere.

### Error shape

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

### Status codes

- `200` success with body
- `201` created
- `204` success no body
- `400` validation error (`code: VALIDATION_ERROR`)
- `401` unauthenticated
- `403` not allowed (includes tenant mismatch on super-admin)
- `404` not found (also used to avoid leaking existence across tenants)
- `409` conflict (idempotency or version)
- `422` business rule violation (e.g. insufficient stock)
- `429` rate limited
- `500` unexpected

### Optimistic updates (use for POS bill creation)

Always pair `updateQueryData` with `.undo()` on error:

```ts
createBill: b.mutation<Bill, BillInput>({
  query: (body) => ({ url: '/pos/bills', method: 'POST', body,
                      headers: { 'Idempotency-Key': body.idempotencyKey } }),
  async onQueryStarted(arg, { dispatch, queryFulfilled }) {
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

Open `EventSource` per active session. On event, dispatch `invalidateTags`:

```ts
// client/src/features/realtime/useRealtime.ts
useEffect(() => {
  const es = new EventSource('/api/v1/events', { withCredentials: true });
  es.addEventListener('item.changed', (e) => {
    const { id } = JSON.parse(e.data);
    dispatch(baseApi.util.invalidateTags([{ type: 'Item', id }]));
  });
  es.addEventListener('goldrate.updated', () => {
    dispatch(baseApi.util.invalidateTags(['StockValuation','GoldRate']));
  });
  return () => es.close();
}, [dispatch]);
```

### Idempotency-Key header

Bills, payments, refunds all send a UUID v4 idempotency key. Server returns the original response on duplicate.

### Refresh-on-401

Wrap `fetchBaseQuery` with a custom base query that retries once after calling `/api/v1/auth/refresh`. If refresh fails, dispatch logout and redirect to `/login`.

### Don'ts

- **Never globally enable `refetchOnFocus`.** Per-endpoint only, and only where the user expects fresh-on-return (dashboards).
- **Don't `keepUnusedDataFor: Infinity` carelessly.** Memory bloat. Default (60s) is fine for most.
- **Tags must match between `providesTags` and `invalidatesTags`** — typos leave the cache stale and the UI lying. Use literal types from `tagTypes`.

### Rate limits to design around

- Per JWT: 100 req / min default, 1000 req / min super-admin.
- Per IP unauth: 30 req / min.
- WhatsApp broadcast: 1 per 10 min per tenant.

### Versioning

- v1 is stable from launch. Breaking changes → v2 (lives alongside).
- Optional new fields are non-breaking and ship in v1.
- Deprecation: `X-Deprecation` response header on the old path, minimum 90 days before removal.

---

## § 9. Data Model Snapshot

Verbatim from `specs/data-model.md`. Multi-tenant single-database design. Every tenant-scoped table has a `tenantId`. Tenant isolation is enforced by Prisma extension reading `tenantId` from `AsyncLocalStorage` (set by `tenant-scope` middleware).

### Tenancy

```
Tenant (id, businessName, gstNumber, phone, ownerEmail, plan, brandPrimary, logoUrl, createdAt)
  └─ Shop (id, tenantId, name, address, gstStateCode, phone, isActive)
       └─ User (id, tenantId, shopId?, name, phone, role, passwordHash?, isActive)
            roles: OWNER | MANAGER | BILLING | VIEWER
```

Tenant resolution at request time:

1. Subdomain → `tenant.goldos.in` → `tenantId` lookup (cached).
2. JWT claim → `tenantId` in token.
3. **Both must agree. Mismatch = 403.**

### Inventory

```
Category (id, tenantId, name, parentId, metalType, defaultMakingChargeBps)
  └─ Item (id, tenantId, shopId, categoryId, sku, barcodeData,
           weightMg, purityCaratX100, stoneWeightMg?,
           hallmarkStatus, hallmarkRef?,
           costPricePaise, makingChargeBps?, status, createdAt)

ItemMovement (id, tenantId, itemId, fromShopId?, toShopId?,
              type, qty, reason, performedByUserId, createdAt)
  types: PURCHASE | TRANSFER | SALE | RETURN | WASTAGE | ADJUSTMENT

Vendor (id, tenantId, name, gstNumber?, phone, address, outstandingPaise)
PurchaseOrder (id, tenantId, vendorId, status, totalPaise, createdAt)
  └─ PurchaseOrderItem (id, poId, itemSku, weightMg, purity, costPaise)
```

### Sales / POS

```
Customer (id, tenantId, phone, name, dob?, anniversary?,
          tags[], loyaltyPoints, totalSpendPaise, lastVisitAt)

Bill (id, tenantId, shopId, billNumber, customerId?,
      subtotalPaise, makingChargesPaise, stoneChargesPaise,
      cgstPaise, sgstPaise, igstPaise,
      oldGoldValuePaise, discountPaise,
      totalPaise, paymentStatus,
      idempotencyKey,  -- offline POS reconciliation
      createdByUserId, createdAt, syncedAt)
  └─ BillLine (id, billId, itemId, weightMg, purityCaratX100,
               ratePerGramPaise, makingChargeBps, stoneChargePaise,
               linePaise)

Payment (id, billId, mode, amountPaise, referenceId?, createdAt)
  modes: CASH | UPI | CARD | CHEQUE | GOLD_EXCHANGE | LOYALTY

OldGoldExchange (id, billId, weightMg, purityCaratX100,
                 ratePerGramPaise, valuePaise)
```

### Finance

```
Expense (id, tenantId, shopId, category, amountPaise, paidAt, notes)
GoldLoan (id, tenantId, customerId, principalPaise, interestRateBps,
          pledgedWeightMg, status, dueAt)
  └─ GoldLoanRepayment (id, loanId, amountPaise, paidAt)
Payroll (id, tenantId, userId, month, basePaise, commissionPaise, advancePaise, netPaise, paidAt)
```

### CRM

```
Lead (id, tenantId, source, customerId?, name, phone,
      interest, status, assignedToUserId?, utmSource?, utmCampaign?,
      createdAt, updatedAt)
  statuses: NEW | CONTACTED | INTERESTED | NEGOTIATION | CONVERTED | LOST

LeadActivity (id, leadId, type, notes, performedByUserId, createdAt)
WhatsAppMessage (id, tenantId, leadId?, customerId?, templateName,
                 body, status, sentAt, deliveredAt)
```

### E-Commerce

```
Product (id, tenantId, name, slug, categoryId, descriptionMd,
         images[], weightMg, purityCaratX100, makingChargeBps,
         basePricePaise, stoneChargePaise, isPublished)

Order (id, tenantId, customerId, status, shippingAddressId,
       subtotalPaise, shippingPaise, taxPaise, totalPaise,
       paymentMethod, razorpayOrderId?, shiprocketAwb?, createdAt)
  └─ OrderItem (id, orderId, productId, qty, pricePaise)
```

### Audit

```
AuditLog (id, tenantId, userId?, entityType, entityId, action,
          beforeJson?, afterJson?, ip, userAgent, createdAt)
```

(Plain table for v1; can be moved to a TimescaleDB hypertable when volume warrants.)

### Conventions

- **All IDs are CUIDs** (collision-safe, sortable). No incrementing PKs except `Bill.billNumber` (per-shop sequence).
- **All money in paise** (`Int` if always under 2B paise = ₹2 crore, else `BigInt`). Column name ends in `Paise`.
- **All weight in mg.** Column name ends in `Mg`.
- **All purity as carat × 100** (22K = 2200, 18K = 1800, silver = 0).
- **All rates in basis points** (1% = 100 bps). Column name ends in `Bps`.
- **All timestamps UTC**, `DateTime` in Prisma. Display converts to IST.
- **Soft-delete via `isActive` or `status`**, never hard-delete tenant data.
- **Indexes:** every `tenantId` column is indexed. Composite indexes on `(tenantId, shopId)` for shop-scoped reads.

### Migration discipline

- Forward-only in shared environments. Never edit a committed migration.
- Every new tenant-scoped table includes `tenantId`.
- Every new tenant-scoped table is added to the Prisma tenant extension's auto-scope list in the same PR.

---

## § 10. The 40-Day Phase Plan

This is the spine of the build. Every day is its own discrete unit of work, gated by plan → approve → implement → verify → checkpoint. Day-by-day verbatim from `specs/phases.md`, augmented per day with:

- **Surface** (admin / storefront / both / infra) — drives which design rules apply.
- **Modules touched** — which `features.md` sections you're moving forward.
- **Reads required before plan** — files you must re-read.
- **Skills to engage** — `ui-ux-pro-max`, `feature-dev`, etc.
- **MCPs likely needed** — shadcn-ui for UI, context7 for library APIs, etc.
- **Definition of done** — the gate that must pass before checkpoint.

### Phase 1 — Core Foundation (Days 1–15)

#### Day 1 — Project scaffold

**Surface:** infra
**Modules touched:** none (scaffolding)
**Reads required before plan:** `CLAUDE.md`, `specs/tech-stack.md`, `specs/architecture.md`, `specs/data-model.md` (for Tenant + Shop), `specs/design-system.md` (for tokens), `specs/gotchas.md` (for env keys)
**Skills to engage:** none yet (no UI)
**MCPs likely needed:** shadcn-ui (for base component install), context7 (for current Vite + Prisma docs)

**Deliverables:**
- Init repo, `client/` (Vite + React 18 + TS) and `server/` (Express + TS) folders.
- `shared/` folder with first Zod schema (`Tenant`, `Shop`).
- `docker-compose.yml`: Postgres 15, Redis 7, Meilisearch, MinIO.
- Tailwind config with full design tokens from `design-system.md`.
- `client/src/styles/tokens.css` with brand + ink + semantic CSS vars.
- Install shadcn/ui base components via shadcn CLI (button, input, dialog, sheet, table, command, sonner, ...).
- GitHub Actions: typecheck + lint + test on PR.
- `.env.example` in both folders with every key from `gotchas.md`.
- Prisma init, first migration creating `Tenant` + `Shop`.
- One smoke test in each side proving the toolchain works.

**Definition of done:**
- `npm run typecheck && npm test && npm run lint` green in both folders.
- `docker compose up -d` brings up all four services.
- `phases.md` updated with "Shipped <date>" + commit SHA.

#### Day 2 — Database schema

**Surface:** infra
**Modules touched:** all (foundation)
**Reads required before plan:** `specs/data-model.md`, `specs/gotchas.md` (tenant isolation section)
**Skills to engage:** none
**MCPs likely needed:** context7 (Prisma 5 docs), postgres (sanity-check seed)

**Deliverables:**
- Full Prisma schema from `data-model.md`.
- Tenant Prisma extension (`server/src/lib/prisma.ts`) reading from `AsyncLocalStorage`.
- `runWithTenant(id, fn)` helper for workers.
- Tests for tenant isolation middleware (both list and detail endpoints).
- Seed: 1 tenant, 2 shops, 50 items, 3 customers, 1 vendor.

**Definition of done:**
- Tenant isolation e2e passes (tenant A cannot read tenant B → 404).
- `prisma migrate dev` runs cleanly from scratch.
- Seed produces expected rows (verify via `postgres` MCP).

#### Day 3 — Auth backend

**Surface:** infra + admin
**Modules touched:** auth (cross-cutting)
**Reads required before plan:** `specs/api-design.md` (auth endpoints), `specs/gotchas.md` (WhatsApp + tenant)
**Skills to engage:** `feature-dev`
**MCPs likely needed:** context7 (Express 4, JWT, Zod)

**Deliverables:**
- JWT access (15min) + refresh (7d, httpOnly cookie).
- RBAC: OWNER, MANAGER, BILLING, VIEWER.
- OTP: send via WhatsApp Cloud (template), verify, exchange for JWT.
- `auth`, `tenant-scope` middleware.
- E2E template: "tenant A cannot read tenant B."

**Definition of done:**
- OTP request → verify → JWT issued, refresh cookie set.
- Refresh rotation works (old refresh revoked on use).
- Tenant isolation e2e passes for `/api/v1/shops`.

#### Day 4 — Auth frontend

**Surface:** admin (login)
**Modules touched:** auth
**Reads required before plan:** `specs/api-design.md` (RTK Query baseApi), `specs/design-system.md`, `specs/design-references.md` (admin), `.claude/skills/frontend-design.md`
**Skills to engage:** `ui-ux-pro-max`, `frontend-design`, `feature-dev`
**MCPs likely needed:** shadcn-ui (Button, Input, Form), context7 (RTK Query, React Hook Form), playwright (verify)

**Deliverables:**
- Redux + RTK Query `baseApi` (`client/src/app/store.ts`) with **all** `tagTypes` from § 8.
- `features/auth/authApi.ts` with `requestOtp`, `verifyOtp`, `refresh`, `logout`.
- Login page (Tanishq-level polish; this is the first impression).
- Protected route wrapper using Redux auth slice.
- Refresh-on-401 interceptor.

**Definition of done:**
- Login flow end-to-end works (OTP request, OTP entry, redirect to dashboard).
- Playwright screenshots at 1440 / 1024 / 768 / 375 reviewed against design-references.md.
- No tooltip-as-help, no carousel, no popup, sentence-case headings.

#### Day 5 — Shell layout + ShopSwitcher

**Surface:** admin
**Modules touched:** all (foundation UI)
**Reads required before plan:** `specs/design-system.md`, `specs/design-references.md` (admin layout rules), `.claude/skills/frontend-design.md`
**Skills to engage:** `ui-ux-pro-max`
**MCPs likely needed:** shadcn-ui (Sheet, Command, DropdownMenu, Avatar), playwright

**Deliverables:**
- Admin shell: fixed sidebar (240px) + main + sticky top bar with ShopSwitcher.
- Mobile sidebar collapses into Sheet.
- Empty dashboard placeholder.
- Cmd+K command palette stub (just the dialog and a few static items).
- Toast system (sonner) wired top-right.
- Manual design review: sidebar + topbar look Linear-grade.

**Definition of done:**
- Screenshots at all four viewports reviewed against design-references.md admin section.
- Cmd+K opens, focus traps, Esc closes.
- Sidebar collapses correctly under 1280px.

#### Day 6 — Inventory backend

**Surface:** infra
**Modules touched:** Stock & Inventory
**Reads required before plan:** `specs/features.md` (Module 1), `specs/data-model.md` (Inventory section), `specs/gotchas.md` (gold rate, weight / purity, multi-shop sync)
**Skills to engage:** `feature-dev`
**MCPs likely needed:** context7 (Prisma, BullMQ for cron), postgres (verify shape)

**Deliverables:**
- Item, Category CRUD with cursor pagination.
- Multi-store inventory queries.
- Barcode / QR generation (`bwip-js` or `qrcode`).
- Stock transfer API (two-phase: initiate at source → accept at destination).
- MCX gold rate poller (cron in worker process), writes Redis with `goldrate:<purity>` and `goldrate:meta`.

**Definition of done:**
- All endpoints have `tenant A cannot read tenant B` e2e.
- Cron runs every 5 minutes and writes Redis keys.
- Stock transfer is two-phase with audit log entries.

#### Day 7 — Inventory frontend

**Surface:** admin
**Modules touched:** Stock & Inventory
**Reads required before plan:** `specs/design-system.md` (DataTable, KPI pattern), `specs/design-references.md` (admin), `.claude/skills/frontend-design.md`
**Skills to engage:** `ui-ux-pro-max`, `feature-dev`
**MCPs likely needed:** shadcn-ui (Sheet, Table, Form, Tabs), context7 (TanStack Table cursor pagination), playwright

**Deliverables:**
- `features/inventory/inventoryApi.ts` (RTK Query) with `getItems`, `createItem`, `transferItem`, `bulkImport`.
- DataTable with TanStack Table, cursor pagination, column visibility, sticky header.
- Item create / edit Sheet (slides from right; **never** modal).
- Bulk Excel import with row-error report.
- Stock valuation widget (live via SSE).
- Manual design review against admin rules.

**Definition of done:**
- Create → appears in list (optimistic insert).
- Bulk import 1 valid + 1 invalid → 1 created, row 2 error shown.
- Numbers in mono, right-aligned, Indian grouping.
- Empty state is content (not an illustration).

#### Day 8 — Vendors + POs + hallmarking

**Surface:** admin
**Modules touched:** Stock & Inventory
**Reads required before plan:** `specs/features.md` (vendor / PO / hallmarking bullets), `specs/gotchas.md` (BIS hallmarking section)
**Skills to engage:** `ui-ux-pro-max`, `feature-dev`
**MCPs likely needed:** shadcn-ui, playwright

**Deliverables:**
- Vendor CRUD with outstanding-paise tracker.
- Purchase order create / track.
- Hallmarking status flow per item (PENDING / SUBMITTED / CERTIFIED / EXEMPT).
- Wastage & melting log.
- Stone & gem separate tracking (carat, type, certificate ref).

**Definition of done:**
- HUID validation (6-char alphanumeric).
- PENDING items don't appear in any "publishable" view.
- Vendor outstanding paise updates on PO write.

#### Day 9 — POS backend core

**Surface:** infra
**Modules touched:** POS
**Reads required before plan:** `specs/features.md` (Module 5), `specs/gotchas.md` (money, GST, old gold exchange), `specs/data-model.md` (Bill / BillLine / Payment / OldGoldExchange)
**Skills to engage:** `feature-dev`
**MCPs likely needed:** context7 (Prisma transactions, BullMQ), postgres

**Deliverables:**
- `POST /pos/bills` with idempotency key.
- GST calc via `server/src/lib/gst.ts` (centralized).
- Making + stone charges per category.
- Old gold exchange valuation logic (exchange leg subtracts pure gold value, does NOT subtract making).
- Payment record (multiple modes).
- Daily cash drawer report endpoint.

**Definition of done:**
- Bill creation is a single Prisma transaction (bill + lines + stock decrement + audit log).
- Idempotency: same key → original response (Redis-backed 24h window).
- GST split is correct for intra and inter state (per-line, banker's rounding, total = sum of lines).
- Stock check fails with 422 if insufficient.

#### Day 10 — POS web PWA UI

**Surface:** POS (tablet-first, 1024×768+)
**Modules touched:** POS
**Reads required before plan:** `specs/design-references.md` (POS layout rules), `.claude/skills/frontend-design.md`
**Skills to engage:** `ui-ux-pro-max`, `feature-dev`
**MCPs likely needed:** shadcn-ui (Sheet, Button, Input), context7 (@zxing/library, Workbox), playwright (1024×768 screenshot)

**Deliverables:**
- Three-pane tablet layout (cart left ~300px, search / scan center ~500px, customer right ~280px).
- Webcam barcode (`@zxing/library`) + USB scanner support (keyboard wedge).
- Customer lookup by phone.
- Split payment screen.
- Hold & resume bill.
- PWA manifest + service worker (Workbox shell + images).
- Tablet design review at 1024×768.

**Definition of done:**
- Touch targets ≥ 44×44px (measured from screenshot).
- Numbers in mono, large (24–28px) so they read across the counter.
- "Send WhatsApp receipt" is a single, prominent button after payment.

#### Day 11 — Receipt + WhatsApp + thermal print

**Surface:** infra + POS
**Modules touched:** POS + cross-cutting WhatsApp
**Reads required before plan:** `specs/gotchas.md` (WhatsApp section), `specs/features.md` (POS receipt bullets)
**Skills to engage:** `feature-dev`
**MCPs likely needed:** context7 (BullMQ, pdfkit), shadcn-ui (Dialog for confirm)

**Deliverables:**
- BullMQ queue + worker process (`workers/index.ts`).
- WhatsApp Cloud API client with template approval handling.
- GST PDF invoice generator (`pdfkit`).
- SMS fallback via Twilio (after 2 WhatsApp failures).
- Thermal print via `window.print()` with thermal CSS, or WebUSB if available.
- E2E: scan → pay → WhatsApp PDF arrives (mocked).

**Definition of done:**
- Worker process is a separate PM2 entry (`goldos-worker`).
- WhatsApp failures retried with exponential backoff, dead-letter after 5.
- PDF invoice passes manual visual review (Stripe-receipt-grade).

#### Day 12 — POS offline mode

**Surface:** POS
**Modules touched:** POS
**Reads required before plan:** `specs/gotchas.md` (offline POS section), `specs/architecture.md` (offline sync flow), `specs/validation.md` (POS module)
**Skills to engage:** `feature-dev`
**MCPs likely needed:** context7 (Dexie, Workbox), playwright (offline mode toggle)

**Deliverables:**
- Dexie schema mirroring server entities POS touches.
- Workbox service worker caching app shell + images.
- Sync queue: pending bills POST to `/pos/sync` with idempotency keys.
- Conflict resolution (server-authoritative on stock; 422 rolls back local bill).
- Offline indicator in top bar (ink-700 dot turns warning-500 when offline).
- Test with DevTools offline mode.

**Definition of done:**
- Offline → create bill → online → bill syncs idempotently within 30s.
- `navigator.onLine` not trusted alone — sync ping used.
- Real tablet test passes (airplane mode → bill → reconnect → bill in admin).

#### Day 13 — Finance module

**Surface:** admin
**Modules touched:** Finance & Accounting
**Reads required before plan:** `specs/features.md` (Module 4), `specs/data-model.md` (Expense / GoldLoan / Payroll), `specs/gotchas.md` (money math)
**Skills to engage:** `ui-ux-pro-max`, `feature-dev`
**MCPs likely needed:** shadcn-ui (Tabs, Table, DatePicker), context7 (Recharts), playwright

**Deliverables:**
- Daily sales summary (per shop + consolidated).
- Multi-shop P&L.
- Expense tracking + payroll.
- Gold loan tracking (pledge amount, interest, repayment schedule).

**Definition of done:**
- P&L formula: `sum(bills.totalPaise) − sum(expenses.amountPaise)` per period.
- Live SSE refresh of daily sales.
- Numbers in mono, right-aligned, Indian grouping.

#### Day 14 — GST + Tally export

**Surface:** admin
**Modules touched:** Finance & Accounting
**Reads required before plan:** `specs/gotchas.md` (GST section), `specs/features.md` (Tally export bullet), `specs/validation.md` (Finance section)
**Skills to engage:** `feature-dev`
**MCPs likely needed:** context7 (xmlbuilder2 or fast-xml-parser for Tally XML)

**Deliverables:**
- CGST / SGST / IGST auto-calc (intra vs inter state, derived).
- GST filing summary (monthly + quarterly).
- Tally XML / CSV export, validated against Tally schema.
- Bank reconciliation (manual matching UI).

**Definition of done:**
- CGST + SGST intra-state at 3% correct on edge cases (old gold exchange, making, multiple lines).
- IGST inter-state correct.
- Tally XML passes the Tally importer (manual smoke test by CA).

#### Day 15 — Phase 1 stabilization

**Surface:** all
**Modules touched:** all in Phase 1
**Reads required before plan:** `specs/validation.md` (universal + Phase 1 modules), `specs/phases.md` (entire Phase 1)
**Skills to engage:** `simplify`, `security-review`
**MCPs likely needed:** playwright (full audit), postgres (data validation)

**Deliverables:**
- Full E2E: onboarding → inventory → POS → receipt → finance summary.
- Load test (100 concurrent bills via k6).
- Fix critical bugs.
- Demo to stakeholder.
- `security-review` skill run end-to-end.
- **Phase 1 sign-off.**

**Definition of done:**
- All universal checks green in both folders.
- All Phase 1 module e2e tests green.
- Security checklist (Phase 1 relevant items): tenant scoping, JWT rotation, rate limits, PII redaction, `$queryRaw` audit, Zod server validation — all pass.
- All design reviews for Phase 1 surfaces pass against `design-references.md`.
- 30-minute manual demo with stakeholder runs without breaking.
- Sentry error rate < 1% over last 24h of staging traffic.

### Phase 2 — Sell & Engage (Days 16–28)

#### Day 16 — Ecom catalog backend

**Surface:** infra
**Modules touched:** E-Commerce
**Reads required before plan:** `specs/features.md` (Module 2), `specs/data-model.md` (Product / Order), `specs/gotchas.md` (gold-rate-linked pricing server-side)
**Skills to engage:** `feature-dev`
**MCPs likely needed:** context7 (Meilisearch, S3 SDK), postgres

**Deliverables:**
- Product CRUD with gold-rate-linked pricing (server-side compute).
- Category / filter endpoints.
- 360° image upload to S3 (multi-image per product).
- Meilisearch index sync hook.
- Bulk product import.

**Definition of done:**
- Storefront pricing is computed server-side (price math NOT in React).
- Pricing function: `weight × goldRate × purity_factor + making + stone = total`.
- Search returns within 100ms for 10k-product index.

#### Day 17 — Storefront frontend (the design-critical one)

**Surface:** storefront
**Modules touched:** E-Commerce
**Reads required before plan:** `specs/design-system.md` (storefront scale, patterns), `specs/design-references.md` (Tanishq / Mejuri rules), `.claude/skills/frontend-design.md`
**Skills to engage:** `ui-ux-pro-max`
**MCPs likely needed:** shadcn-ui, playwright (4-viewport audit), context7 (Vite plugin SSG)

**Deliverables:**
- Storefront route tree separate from admin bundle (lazy-loaded so storefront doesn't ship admin to anonymous visitors).
- Home: cinematic hero, featured collections, gold rate ticker (top), lookbook section.
- Collection page: editorial grid, side-panel filters, infinite scroll.
- PDP: 60 / 40 split (image left, info right), image gallery, transparent pricing breakdown, sticky mobile CTA.
- Wishlist & favourites (requires customer login).
- SEO meta + OG + JSON-LD product schema.
- **Design review against Tanishq / Mejuri rules. Iterate until it passes.**

**Definition of done:**
- Serif display fonts (Fraunces) on display headings.
- No carousel on hero. One strong image.
- No popup on landing.
- Generous whitespace (`py-24` desktop section padding).
- Product grid: 2 cols mobile, 3 tablet, 4 desktop. Never 5 or 6.
- Lighthouse mobile ≥ 90 on home + PDP.

#### Day 18 — Cart & checkout

**Surface:** storefront
**Modules touched:** E-Commerce
**Reads required before plan:** `specs/features.md` (cart, checkout, Razorpay, abandoned cart), `specs/api-design.md`
**Skills to engage:** `ui-ux-pro-max`, `feature-dev`
**MCPs likely needed:** shadcn-ui, context7 (Razorpay SDK)

**Deliverables:**
- Cart in Redux + localStorage persistence.
- Checkout flow: address → payment → confirm.
- Razorpay integration (UPI / card / netbanking).
- COD with order-value limit config.
- Abandoned cart cron (worker) → WhatsApp at +2h.

**Definition of done:**
- Razorpay webhook verified by signature; unsigned = 401.
- Abandoned cart: leave at checkout, simulated +2h → WhatsApp enqueued.
- COD respects configured limit.

#### Day 19 — Order management

**Surface:** admin + storefront (customer history)
**Modules touched:** E-Commerce
**Reads required before plan:** `specs/features.md` (order tracking, Shiprocket), `specs/design-references.md` (admin)
**Skills to engage:** `ui-ux-pro-max`, `feature-dev`
**MCPs likely needed:** shadcn-ui, context7 (Shiprocket API)

**Deliverables:**
- Admin order dashboard (Linear-grade).
- Side panel for order detail (Sheet — never modal).
- Shiprocket integration (label + tracking).
- Delhivery fallback.
- Order status WhatsApp templates per status.
- Customer order history page (storefront).

**Definition of done:**
- Order status WhatsApp templates pre-approved (placed / shipped / out-for-delivery / delivered).
- Shiprocket failure falls through to Delhivery automatically.

#### Day 20 — Promotions + reviews

**Surface:** storefront + admin
**Modules touched:** E-Commerce
**Reads required before plan:** `specs/features.md` (discount engine, reviews, Google Ads pixel)
**Skills to engage:** `ui-ux-pro-max`, `feature-dev`
**MCPs likely needed:** shadcn-ui, playwright

**Deliverables:**
- Discount + coupon engine (flat / % / min-cart-value).
- Review system with admin moderation.
- Google Ads conversion pixel.
- Festive collection pages (editorial template).
- Full purchase flow E2E.

**Definition of done:**
- Coupon engine validated for edge cases (stacking, expiry, min-cart).
- Reviews require admin approval before publish.
- Conversion pixel fires on order success.

#### Day 21 — Business website

**Surface:** storefront / business website
**Modules touched:** Business Website
**Reads required before plan:** `specs/features.md` (Module 6), `specs/design-references.md` (storefront), `.claude/skills/frontend-design.md`
**Skills to engage:** `ui-ux-pro-max`
**MCPs likely needed:** shadcn-ui, playwright (4-viewport audit), context7 (Google Maps Platform)

**Deliverables:**
- `/website/*` route tree (SSG-style pre-render via `vite-plugin-ssg` or static export).
- Home: cinematic hero + featured collections (CMS-editable in admin).
- About Us, Shop Locations with Google Maps embed.
- WhatsApp chat widget (bottom-right, 56×56, brand-400, white glyph).
- Trust badges section (Hallmark certified, established year, GST registered).
- **Design review — must look indistinguishable from a top-tier brand site.**

**Definition of done:**
- Lighthouse mobile ≥ 90 on home, about, shop locations.
- Hindi + English routing works (`/hi/contact`, `/en/contact`).

#### Day 22 — Website SEO + integrations

**Surface:** business website
**Modules touched:** Business Website
**Reads required before plan:** `specs/features.md` (Module 6 SEO + i18n + Instagram), `specs/validation.md` (Module 6)
**Skills to engage:** `feature-dev`
**MCPs likely needed:** context7 (i18next, Meta Graph API)

**Deliverables:**
- Google Business Profile sync.
- Blog / Articles CMS (admin can create posts).
- Instagram feed (Meta Graph API).
- Lighthouse mobile ≥ 90 verified.
- Hindi + English i18n via i18next.

**Definition of done:**
- Google rich results test passes for product JSON-LD.
- i18n routing on every page.
- Contact form → CRM auto-capture (lead created with `source: 'website'`).

#### Day 23 — CRM core

**Surface:** admin
**Modules touched:** Lead CRM + Ads
**Reads required before plan:** `specs/features.md` (Module 3), `specs/data-model.md` (Lead / LeadActivity / WhatsAppMessage)
**Skills to engage:** `ui-ux-pro-max`, `feature-dev`
**MCPs likely needed:** shadcn-ui (Tabs, Sheet), context7 (dnd-kit for kanban), playwright

**Deliverables:**
- Unified lead inbox (WhatsApp + Instagram + FB + Google Ads + website form).
- Kanban pipeline (drag-drop via `dnd-kit`).
- UTM source tracking.
- Website enquiry webhook → CRM auto-capture.
- Customer tagging (VIP / Wholesale / Retail / custom).

**Definition of done:**
- Drag a lead "Contacted" → "Interested" → status updates, audit logged.
- Lead status transitions validated (can't skip NEW → CONVERTED).
- Kanban handles 100+ leads without UI lag.

#### Day 24 — CRM WhatsApp automation

**Surface:** admin + infra
**Modules touched:** Lead CRM + Ads
**Reads required before plan:** `specs/gotchas.md` (WhatsApp section), `specs/features.md` (auto follow-ups, broadcast)
**Skills to engage:** `feature-dev`
**MCPs likely needed:** context7 (BullMQ), shadcn-ui

**Deliverables:**
- Auto follow-up sequences (D1 / D3 / D7 via templates).
- Bulk broadcast UI with template approval flow.
- Birthday + anniversary automation.
- Lead assignment + notifications.
- Follow-up reminder calendar.

**Definition of done:**
- D1 follow-up cron fires for yesterday's NEW leads, enqueues WhatsApp.
- Broadcast respects rate limit (1 per 10 min per tenant).
- Birthday automation fires at 09:00 IST.

#### Day 25 — Ad integrations

**Surface:** admin + infra
**Modules touched:** Lead CRM + Ads
**Reads required before plan:** `specs/features.md` (Meta + Google Ads bullets), `specs/api-design.md` (webhooks)
**Skills to engage:** `feature-dev`
**MCPs likely needed:** context7 (Meta Marketing API, Google Ads API)

**Deliverables:**
- Meta Ads API (FB + Instagram lead forms).
- Google Ads API.
- UTM-to-lead attribution.
- Ad spend vs conversions report.
- Lead source analytics.

**Definition of done:**
- Meta Ads webhook → lead with `utm_source=facebook` created and assigned.
- Google Ads webhook → lead with `utm_source=google` created.
- Spend vs revenue report correct for sample data.

#### Day 26 — Customer profile + loyalty

**Surface:** admin + POS
**Modules touched:** Lead CRM + Ads + POS
**Reads required before plan:** `specs/features.md` (customer profile, loyalty, segmentation)
**Skills to engage:** `ui-ux-pro-max`, `feature-dev`
**MCPs likely needed:** shadcn-ui, playwright

**Deliverables:**
- Full customer profile (purchase history, preferences).
- Loyalty points (earn % on purchase, redeem at POS).
- Customer segmentation (high-value / dormant / new).
- Re-engagement trigger (90 days no purchase).

**Definition of done:**
- Loyalty earn ratio and redeem ratio configurable per tenant.
- Re-engagement cron fires for customers `lastVisitAt` > 90 days ago.

#### Day 27 — Phase 2 integration testing

**Surface:** all
**Modules touched:** all Phase 2
**Reads required before plan:** `specs/validation.md` (Phase 2 modules)
**Skills to engage:** `simplify`
**MCPs likely needed:** playwright (full audit), context7 (k6 perf test)

**Deliverables:**
- Website → CRM capture.
- Ecom order → inventory deduction.
- WhatsApp automation E2E.
- Ad attribution validation.
- Perf test: 1000 concurrent storefront visitors.

**Definition of done:**
- All Phase 2 e2e tests green.
- Storefront p95 < 300ms read at 1000 concurrent.

#### Day 28 — Phase 2 deployment

**Surface:** infra
**Modules touched:** deploy
**Reads required before plan:** `specs/tech-stack.md` (deploy section)
**Skills to engage:** `security-review`
**MCPs likely needed:** context7 (PM2, Nginx, Cloudflare APIs)

**Deliverables:**
- Deploy storefront + website to staging.
- Custom domain + SSL + Cloudflare CDN.
- GA4 + Meta Pixel.
- Client walkthrough.
- **Phase 2 sign-off.**

**Definition of done:**
- Staging accessible at custom domain over HTTPS.
- `security-review` skill passes for Phase 2 modules.
- 30-minute client walkthrough without breaking.

### Phase 3 — Grow & Scale (Days 29–40)

#### Day 29 — Analytics core

**Surface:** admin
**Modules touched:** Reports & Analytics
**Reads required before plan:** `specs/features.md` (Module 7), `specs/design-references.md` (admin), `.claude/skills/frontend-design.md`
**Skills to engage:** `ui-ux-pro-max`, `feature-dev`
**MCPs likely needed:** shadcn-ui, context7 (Recharts, SSE), playwright

**Deliverables:**
- Real-time sales dashboard (SSE-driven).
- Shop-wise comparison.
- Top-selling products + categories.
- Daily / weekly / monthly P&L toggle.
- Custom date range.
- **Design review: dashboard must hit Linear bar.**

**Definition of done:**
- SSE live update < 2s after a bill is created.
- KPI cards: white surface, border, mono number, delta color.
- Empty states are content-first.

#### Day 30 — BI reports

**Surface:** admin
**Modules touched:** Reports & Analytics
**Reads required before plan:** `specs/features.md` (Module 7 BI bullets), `specs/gotchas.md` (gold rate impact)
**Skills to engage:** `feature-dev`
**MCPs likely needed:** context7 (Recharts), shadcn-ui

**Deliverables:**
- Gold rate impact analysis.
- Inventory valuation (live).
- Low-margin alert.
- Festive YoY (aligned to Indian FY: April–March).
- Customer acquisition cost.

**Definition of done:**
- YoY alignment correct (FY April–March, not Jan–Dec).
- Low-margin alert triggers at configurable threshold.

#### Day 31 — Ad ROI + staff

**Surface:** admin
**Modules touched:** Reports & Analytics
**Reads required before plan:** `specs/features.md` (Module 7 bullets), `specs/validation.md` (Module 7)
**Skills to engage:** `feature-dev`
**MCPs likely needed:** context7 (Recharts, ExcelJS), shadcn-ui

**Deliverables:**
- Ad ROI per campaign.
- Staff leaderboard.
- GST filing summary (auto monthly).
- Scheduled email reports.
- Export to Excel + PDF on every report.

**Definition of done:**
- Excel export opens in Excel without warnings.
- PDF export opens in a standard PDF reader.
- Scheduled email cron fires at 09:00 IST on schedule day.

#### Day 32 — Automation engine

**Surface:** admin + infra
**Modules touched:** cross-cutting
**Reads required before plan:** `specs/features.md` (cross-cutting + Module 3 automations)
**Skills to engage:** `feature-dev`
**MCPs likely needed:** context7 (BullMQ, SSE), shadcn-ui

**Deliverables:**
- Notification service (in-app SSE + WhatsApp + email).
- Rule engine: trigger → condition → action.
- Built-in rules: low stock → auto PO; new lead → instant WhatsApp; birthday → offer.

**Definition of done:**
- Rule engine handles 100 rules / tenant without UI lag.
- Built-in rules ship enabled-by-default but toggleable.

#### Day 33 — Hardening

**Surface:** infra
**Modules touched:** all
**Reads required before plan:** `specs/validation.md` (security checklist), `specs/gotchas.md` (env vars, tenant)
**Skills to engage:** `security-review`
**MCPs likely needed:** context7 (PgBouncer, Redis), postgres

**Deliverables:**
- PgBouncer connection pooling.
- Redis caching on hot reads.
- Rate limit per user / tenant.
- SQL injection / XSS / CSRF audit.
- PII encryption at rest.

**Definition of done:**
- All `$queryRaw` reviewed for tenant filter.
- Rate limits enforced on auth + webhook endpoints.
- CORS allowlist = deployed domains only.

#### Day 34 — PWA polish

**Surface:** POS + admin
**Modules touched:** PWA
**Reads required before plan:** `specs/features.md` (POS PWA bullets), `specs/gotchas.md` (offline)
**Skills to engage:** `ui-ux-pro-max`, `feature-dev`
**MCPs likely needed:** context7 (Web Push API, Workbox), playwright

**Deliverables:**
- Push notifications (Web Push API + service worker).
- Add-to-home-screen prompt UX.
- Forced update banner.
- Cross-browser test (Chrome, Safari, Edge).

**Definition of done:**
- Push notifications work on Chrome + Safari + Edge.
- A2HS prompt appears at the right moment (not immediately).
- Forced update banner clears stale service worker cache.

#### Day 35 — Super-admin panel

**Surface:** admin (super-admin scope)
**Modules touched:** cross-cutting
**Reads required before plan:** `specs/features.md` (super-admin), `specs/data-model.md` (Tenant)
**Skills to engage:** `ui-ux-pro-max`, `feature-dev`, `security-review`
**MCPs likely needed:** shadcn-ui, playwright

**Deliverables:**
- Tenant onboarding / activation.
- Per-tenant usage metrics.
- Support ticket system.
- Feature flag toggles (`ecommerce_enabled`, `website_enabled`, etc.).

**Definition of done:**
- Super-admin uses a separate Prisma client (no tenant extension).
- Feature flag changes take effect within 1 minute (Redis pub/sub).
- Audit log entry on every super-admin action.

#### Day 36 — Migration tools

**Surface:** admin
**Modules touched:** cross-cutting
**Reads required before plan:** `specs/features.md` (bulk import bullets)
**Skills to engage:** `feature-dev`
**MCPs likely needed:** context7 (ExcelJS), shadcn-ui

**Deliverables:**
- Excel inventory importer.
- Tally data import (XML / CSV).
- Customer import.
- 10k+ item dataset stress test.

**Definition of done:**
- Inventory list with 10k items: page load < 1.5s.
- Bulk import surfaces row-level errors without aborting the batch.

#### Day 37 — Full QA

**Surface:** all
**Modules touched:** all
**Reads required before plan:** `specs/validation.md` (entire file)
**Skills to engage:** `simplify`, `review`, `security-review`
**MCPs likely needed:** playwright (full audit), context7 (k6, zap-baseline.py)

**Deliverables:**
- Regression across 7 modules.
- Cross-browser.
- GST accuracy audit.
- OWASP Top 10 pen test.
- **All design reviews re-run.**

**Definition of done:**
- All universal checks green across all 7 modules.
- OWASP scan clean (zap-baseline.py against staging).
- All design surfaces pass against `design-references.md`.

#### Day 38 — Production infra (lightweight)

**Surface:** infra
**Modules touched:** deploy
**Reads required before plan:** `specs/tech-stack.md` (production deploy section)
**Skills to engage:** `security-review`
**MCPs likely needed:** context7 (PM2, Nginx, Cloudflare, Sentry, Grafana, Loki APIs)

**Deliverables:**
- Single Hetzner / DO box.
- Nginx + SSL via Let's Encrypt.
- PM2 `ecosystem.config.js` (web + worker).
- Postgres backups (`pg_dump` → S3 nightly).
- Sentry + Grafana + Loki wired.
- Cloudflare CDN.

**Definition of done:**
- DB backups restored to a test instance successfully.
- Sentry receives a test error.
- Loki receives a test log.
- Grafana dashboards render staging metrics.

#### Day 39 — Client UAT + training

**Surface:** all
**Modules touched:** all
**Reads required before plan:** `specs/phases.md` (Day 39), `specs/validation.md` (phase done criteria)
**Skills to engage:** all (acceptance)
**MCPs likely needed:** playwright (final audit)

**Deliverables:**
- Deploy to production for UAT.
- Training sessions (POS + inventory).
- Video walkthroughs per module.
- Fix UAT critical + high only (defer mediums).
- Load test 1000 concurrent.

**Definition of done:**
- UAT walkthrough completes without critical bugs.
- 1000-concurrent load test passes API p95 < 300ms read, < 800ms write.

#### Day 40 — Go live

**Surface:** infra
**Modules touched:** deploy
**Reads required before plan:** `specs/phases.md` (Day 40)
**Skills to engage:** `security-review`
**MCPs likely needed:** none (operational)

**Deliverables:**
- Final deploy with zero-downtime PM2 reload.
- DNS cutover.
- 24h monitoring.
- Deliver docs (API, admin, user).
- Setup support SLA.

**Definition of done:**
- Production receives real tenant traffic.
- Sentry error rate < 1% in first 24h.
- Cloudflare cache hit rate > 80% for storefront assets.

---

## § 11. Per-Module Validation Gates

Verbatim from `specs/validation.md`. Use these checklists at the end of every module-level day. Tenant isolation test is universal — every new tenant-scoped endpoint gets it.

### Universal checks (every feature, every day)

From the relevant folder:

```
npm run typecheck
npm run lint
npm test
```

All three pass. **No `.skip`, no `any`, no commented-out tests.**

### Tenant isolation (most critical)

Every new tenant-scoped endpoint gets this test:

```ts
test('tenant A cannot read tenant B data', async () => {
  const a = await seedTenant();
  const b = await seedTenant();
  const itemB = await prisma.item.create({ data: { ...validItem, tenantId: b.id } });
  const tokenA = await loginAs(a.ownerId);

  const res = await request(app)
    .get(`/api/v1/inventory/items/${itemB.id}`)
    .set('Authorization', `Bearer ${tokenA}`);

  expect(res.status).toBe(404);  // 404, not 403 — avoid leaking existence
});
```

### Module 1 — Inventory

**Unit (Vitest):**
- `Money` add / subtract / multiply / divide → no float drift.
- `Weight` parse "12.345g" → 12345 mg, round-trip exact.
- `Purity` validates only allowed values.
- Stock valuation: items × current rate per purity, sum.

**E2E (Playwright):**
- Create item → appears in list.
- Bulk Excel import 1 valid + 1 invalid → 1 created, row 2 error shown.
- Transfer item shop A → shop B (initiate) → audit log entry.
- Transfer accept at B → `item.shopId` updates, both shops see correct stock.

**Manual smoke:**
- Open Inventory → see seeded items, columns formatted correctly.
- Click an item → side sheet opens with detail.
- Barcode label print → renders correctly on A4.

### Module 2 — E-Commerce

**Unit:**
- Pricing function: `weight × goldRate × purity_factor + making + stone = total`.
- Coupon engine: flat / % / min-cart-value enforcement.
- Slug generator: handles unicode, deduplicates.

**E2E:**
- Browse → PDP → add to cart → checkout → Razorpay test → order in admin.
- Abandoned cart: leave at checkout, simulated +2h → WhatsApp enqueued.

**Design review (Playwright MCP):**
- Home, collection, PDP screenshots at 375 / 768 / 1024 / 1440.
- Compare against `design-references.md` storefront rules.
- Check: serif display fonts present, generous whitespace, no carousel on hero, no popup on landing.

**Manual smoke:**
- Lighthouse mobile ≥ 90 on home + PDP.
- Order online → inventory decrements in admin.

### Module 3 — CRM + Ads

**Unit:**
- UTM parser handles all standard params + missing.
- Lead status transitions valid (can't skip NEW → CONVERTED).

**E2E:**
- Website enquiry → lead appears in CRM.
- D1 follow-up cron → WhatsApp template enqueued for yesterday's leads.
- Meta Ads webhook → lead with `utm_source=facebook` created and assigned.

**Manual smoke:**
- Drag a lead "Contacted" → "Interested" → status updates, audit logged.

### Module 4 — Finance (heaviest tests)

**Unit:**
- GST CGST+SGST intra-state at 3% correct.
- GST IGST inter-state correct.
- Old gold exchange reduces taxable base correctly.
- Making charges included in taxable supply.
- P&L = `sum(bills.totalPaise) − sum(expenses.amountPaise)` per period.
- Tally export passes Tally XML schema validation.

**E2E:**
- Create 10 bills with varied payment modes → daily report matches sum.
- GST summary for last month → matches sum of bill taxes.

**Manual smoke:**
- CA opens Tally, imports the XML, no errors, totals match.

### Module 5 — POS

**Unit:**
- Bill total = `sum(lines) + making + stone + GST − exchange − discount`.
- Split payment: `sum(payments) == bill total ± 1 paise`.
- IndexedDB queue: add bill offline → reads back identical.

**E2E:**
- Online: complete bill → WhatsApp receipt mock called with valid PDF.
- Offline: DevTools offline → create bill → go online → bill syncs idempotently within 30s.

**Design review:**
- Tablet 1024×768 screenshot.
- Three-pane layout correct.
- Touch targets ≥ 44px (measured from screenshot).
- Numeric fields mono and large.

**Manual smoke (real tablet):**
- Airplane mode → complete bill → reconnect → bill in admin within 30s.
- USB barcode scanner → adds item in < 1s.
- "Send WhatsApp receipt" works.

### Module 6 — Business Website

**Unit:**
- i18n routing: `/hi/contact` and `/en/contact` resolve.
- SEO meta builder outputs correct OG tags.

**E2E:**
- Submit contact form → lead in CRM.
- WhatsApp widget click opens prefilled URL.

**Design review:**
- Tanishq-level: serif display, editorial grid, generous spacing — verified by Playwright screenshots.
- No popup, no carousel, no auto-video.

**Manual smoke:**
- Lighthouse mobile ≥ 90 on home, collection, PDP.
- Google rich results test passes for product JSON-LD.

### Module 7 — Analytics

**Unit:**
- Date range filter inclusive both ends.
- YoY aligned to Indian FY (April–March).

**E2E:**
- Seed bills across 3 shops → dashboard shows correct consolidated and per-shop totals.
- Live update: create bill via API → SSE pushes within 2s.

**Design review:**
- Linear-grade: dense, calm, KPI tiles, no shadows, mono numbers.
- Empty states present and content-first.

**Manual smoke:**
- Export every report to Excel and PDF → opens in Excel and a PDF reader.

### Security checklist (Phase 3 must-pass)

- [ ] OWASP Top 10 scanned (zap-baseline.py against staging).
- [ ] All `$queryRaw` reviewed for tenant filter.
- [ ] JWT refresh rotation works (old refresh revoked on use).
- [ ] Rate limits enforced on auth + webhook endpoints.
- [ ] CORS allowlist = deployed domains only.
- [ ] All form inputs Zod-validated server-side.
- [ ] Uploads (Excel, images) virus-scanned + size-limited.
- [ ] PII redacted in Sentry breadcrumbs.
- [ ] DB backups restored to a test instance successfully.

### Performance budgets

- API p95 < 300ms for read, < 800ms for write (excluding payment provider calls).
- Storefront LCP < 2.5s on 4G mobile.
- POS bill creation total time (scan to receipt sent) < 60s in normal use.
- Inventory list with 10k items: page load < 1.5s.

### Phase done = all green

Each phase ends only when:

1. Every feature in that phase's section of `features.md` passes unit + e2e.
2. Security checklist items relevant to the phase are green.
3. Design reviews for every UI surface in the phase pass against `design-references.md`.
4. A 30-minute manual demo with the stakeholder runs without breaking.
5. Sentry error rate < 1% over the last 24h of staging traffic.

---

## § 12. Anti-Patterns & Forbidden Choices

These are non-negotiable. Any of these in a PR → reject, rebuild.

### Product scope

- **Multi-currency.** INR only.
- **Generic ecommerce features** (subscriptions, digital goods, marketplace).
- **Per-tenant custom storefront themes.** Brand colors + logo only.
- **Native mobile** (iOS / Android). PWA on tablet is the v1 surface.
- **Kubernetes, microservices, service mesh.** Single-node monolith.
- **Multi-region.** Single India / Singapore region.

### Code

- **Float math** anywhere money / weight / purity touches.
- **`parseFloat` on a price.** Use the `Money` helper.
- **`any` types.** Use `unknown` and narrow.
- **`fetch` or `axios` in `client/`.** RTK Query only.
- **Editing committed Prisma migrations.** Add a new one.
- **shadcn copy-paste from training data.** Always use the shadcn-ui MCP.
- **Mocking the database in integration tests.** Hit Postgres via docker-compose.
- **`--no-frozen-lockfile` in CI.**
- **`refetchOnFocus` globally.** Per-endpoint only.
- **`keepUnusedDataFor: Infinity`.** Default (60s) for most.
- **`$queryRaw` without explicit `tenant_id` filter.**
- **WhatsApp send from a request handler.** Enqueue via BullMQ.
- **Direct MCX call from a route.** Read from Redis only.
- **Storefront price computed in React.** Server-side only.

### Design — both surfaces

- **Carousels on hero.**
- **Auto-playing video.**
- **Modal popups for newsletter / discount on landing.**
- **Lottie animations as decoration.**
- **Generic illustration packs** (undraw, storyset, manypixels).
- **"AI-default" gradient backgrounds** (purple → pink, blue → cyan).
- **Tooltip-as-help-text.** Inline helper text instead.
- **Emoji icons in admin UI.** Use Lucide.
- **Bouncing notification badges.**
- **"Click here to..." link copy.**
- **Title Case headings.** Sentence case is default.
- **Drop shadows on every card.** Borders only in admin.
- **Brand color on more than two surfaces in one viewport.**
- **60+ pixel page padding on admin** (wastes space).
- **Under 64px on storefront** (cramped).
- **"Fun" admin microcopy.** ("Oops!" "Looks like..." — no.)

### POS specific

- **Touch targets under 44×44.**
- **Numbers in proportional font.** Mono only.
- **Spinner for loading.** Skeleton.
- **Toast in the center / bottom.** Top-right (sonner default).

---

## § 13. Operating Protocol (the per-day loop)

This is the exact sequence you follow for every day in `phases.md`. No skipping steps.

### Step 1 — Read

Re-read the day's required specs + skill files. Don't trust memory; specs evolve.

### Step 2 — Plan (in plan mode)

Write a plan covering:

- **Files to create or edit** (full paths, one-line purpose each).
- **Libraries to install** (exact versions, from `tech-stack.md`).
- **Migrations to add** (forward-only, single purpose).
- **Tests to write** (unit + e2e per `validation.md`).
- **Design surfaces touched** (which screens, which viewports, what design rules apply).
- **MCPs to call** (shadcn-ui for which components, context7 for which docs).
- **Ambiguities** — every assumption you'd otherwise guess. If empty, you didn't look hard enough.
- **Risks** — what could go wrong, how you'll catch it.

### Step 3 — Exit plan, implement

After plan approval, implement. Touch only the files in the plan. If you find you need more, stop and update the plan.

### Step 4 — Verify gate

Run **all** of these:

```bash
cd server && npm run typecheck && npm test && npm run lint
cd ../client && npm run typecheck && npm test && npm run lint
```

Plus, conditionally:

- **If UI:** run the dev server, use the `playwright` MCP to screenshot at 1440 / 1024 / 768 / 375, compare against `specs/design-references.md`, list violations, fix.
- **If new tenant-scoped endpoint:** run the cross-tenant e2e (`tenant A cannot read tenant B → 404`).
- **If money / weight / purity touched:** run the integer-math invariant tests.
- **If POS offline touched:** test with DevTools offline mode, and on a real tablet before phase sign-off.
- **If new migration:** verify `prisma migrate dev` runs cleanly from scratch on a fresh DB.

### Step 5 — Self-review (simplify)

Invoke the `simplify` skill. Look for:

- Dead code paths.
- Duplicated helpers between client and server (especially money / weight / date — these must be byte-identical or generated from a shared template).
- Premature abstractions (one-of-a-kind components hidden behind generic interfaces).
- Half-finished error handling (try / catch with no actual recovery).
- Comments that explain WHAT (delete them; the code says what) but never comments that explain WHY (keep those; they're load-bearing).

### Step 6 — Checkpoint

Update `specs/phases.md`:

- Mark Day N as "Shipped YYYY-MM-DD."
- One-line outcome.
- Git commit SHA.

Commit with a message that names the day:

```
Day N — <Title>

<one-line outcome>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### Step 7 — Stop and wait

Do not start Day N+1 until the user says "continue" or runs `/next-day`. The exception: if the user has explicitly said earlier in the session "continue without asking," proceed.

---

## § 14. Bootstrap (Day 0 / Pre-flight)

Before Day 1 begins, verify the local environment is ready. If any check fails, **stop and report**; do not proceed to Day 1.

### Pre-flight checklist

- [ ] **`.claude/mcp.json` exists** with all five servers (shadcn-ui, context7, playwright, postgres, filesystem). The repo currently has `mcp.json` at root — if it hasn't been renamed yet to `.mcp.json`, flag this to the user (Claude Code looks for `.mcp.json` with the dot). Do not auto-rename.
- [ ] **`.claude/skills/frontend-design.md`** is loadable.
- [ ] **`docker compose up -d`** brings up Postgres, Redis, Meilisearch, MinIO.
- [ ] **Postgres reachable** on `localhost:5432` (or via the `postgres` MCP).
- [ ] **`node --version`** ≥ 20.x.
- [ ] **`npm --version`** ≥ 10.x.
- [ ] **`npx tsc --version`** ≥ 5.4.
- [ ] **`ui-ux-pro-max` plugin** is installed and loadable. If not, the design-quality gate will silently no-op. Run `/plugins` (or the equivalent) to verify before first UI day.

### Environment variables

`.env.example` lists every key from `specs/gotchas.md`. For Day 1, the only truly required values are `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`. Real WhatsApp / Twilio / MCX / Razorpay / Shiprocket / S3 / Sentry credentials are needed by the day they're first used (D3 / D6 / D11 / D18 / D19 / D17 / D38 respectively). Until then, mocks / stubs are acceptable but must be marked TODO.

### Repository state

Verify:

- [ ] `CLAUDE.md` is present at repo root.
- [ ] `specs/` folder contains all 11 spec files listed in § 3.
- [ ] `FIRST_PROMPT.md` is preserved (this prompt does not replace it).
- [ ] Git is initialized and `.gitignore` includes `node_modules/`, `dist/`, `.env`, `.env.*`, `coverage/`, `*.log`.

If any of the above fails, report and stop.

---

## § 15. Closing Instruction (the actual "go")

You've read everything in § 3. You understand the operating mode in § 2. You have the hard rules in § 6 internalized. The 40-day spine in § 10 is your roadmap.

Now do this, in this exact order:

### Step A — Master plan

In plan mode, write a **master plan** covering Days 1–40 at one-line-per-day granularity. For each day:

- Title.
- Surface(s).
- One-line scope.
- Skills + MCPs you expect to engage.

This is a top-down view of the whole 40 days so you have the full mental model before starting Day 1.

### Step B — Detailed Day 1 plan

In the same plan, append a **detailed Day 1 plan** following § 13 Step 2 — every file to create, every dep to install, every migration, every test, every ambiguity, every risk.

### Step C — Stop

Do not implement. Wait for the user's approval. The user will say "approved" or "continue" or run `/next-day`. Until then, you are in plan mode.

### Step D — On approval

After approval, implement Day 1 per § 13 Step 3. Run the verification gate per § 13 Step 4. Self-review per § 13 Step 5. Checkpoint `phases.md` per § 13 Step 6.

Then stop. Wait for the user to start Day 2.

### Step E — Days 2 through 40

For each subsequent day:

1. Read the day's required specs (per § 10).
2. Plan in plan mode (§ 13 Step 2).
3. Wait for approval.
4. Implement.
5. Verify.
6. Simplify.
7. Checkpoint.
8. Wait.

At phase boundaries (Days 15, 28, 40), run the phase sign-off block per § 11 ("Phase done = all green").

### Step F — Final delivery (Day 40)

After Day 40:

- Production is receiving real tenant traffic.
- Docs are delivered (API via swagger-ui-express, admin via in-app docs page, user via training videos).
- Sentry error rate < 1% in the first 24h.
- The user gets a one-page handover: deployed URL, super-admin login, monitoring URLs, on-call protocol.

---

## Appendix A — Project Layout (Reference)

```
gold-os/
├── client/                          React 18 + Vite + RTK Query
│   ├── src/
│   │   ├── app/                     Store config, RTK Query base
│   │   │   ├── store.ts
│   │   │   └── routes.tsx
│   │   ├── features/                One folder per module
│   │   │   ├── auth/                authApi.ts, LoginPage.tsx, OtpForm.tsx
│   │   │   ├── inventory/           inventoryApi.ts, ItemList.tsx, ItemForm.tsx, BulkImport.tsx
│   │   │   ├── pos/                 posApi.ts, BillScreen.tsx, ScanInput.tsx
│   │   │   ├── finance/
│   │   │   ├── crm/
│   │   │   ├── ecommerce/           admin side; storefront is a separate route tree
│   │   │   ├── analytics/
│   │   │   ├── realtime/            useRealtime.ts (SSE consumer)
│   │   │   └── storefront/          public-facing customer pages + business website
│   │   ├── components/
│   │   │   ├── ui/                  shadcn primitives + Money / Weight / Purity / ShopSwitcher / DataTable / MetricCard / EmptyState / ConfirmDialog
│   │   │   ├── layout/              Sidebar, TopBar, ShopSwitcher
│   │   │   └── data/                Reusable DataTable, EmptyState, ErrorState
│   │   ├── pages/                   Thin route components that compose features/
│   │   ├── lib/
│   │   │   ├── money.ts             Money helper (mirrors server)
│   │   │   ├── weight.ts
│   │   │   ├── date.ts              date-fns wrappers, IST formatting
│   │   │   ├── format.ts            number / currency formatters
│   │   │   └── api.ts               RTK Query base (fetchBaseQuery + tagTypes)
│   │   └── styles/
│   │       ├── globals.css          Tailwind + tokens import
│   │       └── tokens.css           --brand-*, --ink-*, semantic CSS vars
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── package.json
│
├── server/                          Express + Prisma + Node 20
│   ├── src/
│   │   ├── modules/                 One folder per domain
│   │   │   ├── auth/                auth.routes.ts, auth.service.ts, auth.schema.ts
│   │   │   ├── inventory/
│   │   │   ├── pos/
│   │   │   ├── finance/
│   │   │   ├── crm/
│   │   │   ├── ecommerce/
│   │   │   ├── website/
│   │   │   ├── analytics/
│   │   │   └── webhooks/            razorpay, whatsapp, shiprocket, ads
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   ├── tenant-scope.ts
│   │   │   ├── rate-limit.ts
│   │   │   ├── error-handler.ts
│   │   │   └── async-context.ts     AsyncLocalStorage setup
│   │   ├── lib/
│   │   │   ├── prisma.ts            Prisma client + tenant extension
│   │   │   ├── redis.ts
│   │   │   ├── queue.ts             BullMQ queues + connection
│   │   │   ├── whatsapp.ts          Meta Cloud API client
│   │   │   ├── gold-rate.ts         MCX client + cache reader
│   │   │   ├── gst.ts               THE only place GST is calculated
│   │   │   ├── money.ts             Mirrors client
│   │   │   ├── pdf.ts               GST invoice generator
│   │   │   ├── meili.ts
│   │   │   └── s3.ts
│   │   ├── workers/
│   │   │   ├── index.ts             Worker entrypoint (PM2 goldos-worker)
│   │   │   ├── gold-rate.cron.ts    Every 5 min
│   │   │   ├── abandoned-cart.cron.ts  Every 15 min
│   │   │   ├── followup.cron.ts     Daily at 09:00 IST
│   │   │   └── whatsapp.consumer.ts BullMQ consumer
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── index.ts                 Express boot, mounts modules, serves client/dist
│   └── package.json
│
├── shared/                          Imported by both client and server
│   ├── types.ts                     Inferred from Zod
│   ├── schemas.ts                   Zod schemas (validation rules, single source of truth)
│   └── constants.ts                 Roles, statuses, GST rates, etc.
│
├── specs/                           Read these first (12 files)
├── .claude/                         Skills + slash commands + prompts
│   ├── skills/
│   │   └── frontend-design.md
│   ├── commands/
│   │   ├── next-day.md
│   │   ├── verify.md
│   │   ├── tenant-check.md
│   │   └── design-review.md
│   └── prompts/
│       └── build-everything.md      ← this file
├── .mcp.json                        Claude Code MCP server config
└── docker-compose.yml               Postgres + Redis + Meilisearch + MinIO (local dev only)
```

---

## Appendix B — Daily Commands Cheat Sheet

```bash
# Setup
npm install                          # in client/ and server/ both
docker compose up -d                 # Postgres, Redis, Meilisearch, MinIO
cd server && npm run db:migrate      # apply Prisma migrations
cd server && npm run db:seed         # 1 tenant, 2 shops, ~50 items, sample customers

# Dev
cd server && npm run dev             # Express on :4000, tsx watch
cd client && npm run dev             # Vite on :3000, proxies /api → :4000

# Test
npm test                             # Vitest unit tests (run in either folder)
npm run test:e2e                     # Playwright e2e (root)
npm run typecheck                    # tsc --noEmit

# Quality
npm run lint                         # eslint
npm run format                       # prettier

# Build
cd client && npm run build           # Vite build to dist/
cd server && npm run build           # tsc to dist/
# Server in prod serves client/dist as static + the API. One process. One port.

# Deploy
# Deploy is the Day 38 / 40 task. PM2 reload via GitHub Actions.
```

---

## Appendix C — Required Environment Variables

App crashes loud at boot if any are missing. Server `index.ts` validates these against a Zod schema.

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
TWILIO_ACCOUNT_SID                  (SMS fallback)
TWILIO_AUTH_TOKEN
MCX_API_KEY
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
SHIPROCKET_EMAIL
SHIPROCKET_PASSWORD
S3_BUCKET
S3_ACCESS_KEY
S3_SECRET_KEY
S3_ENDPOINT                         (MinIO in dev, AWS in prod)
SENTRY_DSN                          (optional in dev)
```

Per `gotchas.md`: missing = crash with a clear message, not a silent fallback.

---

## Appendix D — Design Tokens (Copy Into `client/src/styles/tokens.css`)

```css
:root {
  /* Brand ramp — default "Gold OS gold". Per-tenant overrides set --brand-* values. */
  --brand-50:  #FAF5E8;
  --brand-100: #F1E5BE;
  --brand-200: #E6D08D;
  --brand-300: #D7B655;
  --brand-400: #C99B2A;   /* primary */
  --brand-500: #A87F1E;
  --brand-600: #856515;
  --brand-700: #604910;
  --brand-800: #41320A;
  --brand-900: #251D05;

  /* Ink (neutral, warm) — text, surfaces, borders */
  --ink-0:   #FFFFFF;
  --ink-25:  #FAF9F7;     /* page bg (admin) */
  --ink-50:  #F4F2EE;
  --ink-100: #E9E6E0;
  --ink-200: #D8D3CA;
  --ink-300: #B8B1A4;
  --ink-400: #948D80;
  --ink-500: #6E695F;
  --ink-600: #4B4740;
  --ink-700: #322F2A;
  --ink-800: #1F1D1A;     /* primary text */
  --ink-900: #0F0E0C;

  /* Semantic */
  --success-50: #E6F4EA; --success-500: #2E8B57; --success-700: #1E5E3A;
  --warning-50: #FCF1DD; --warning-500: #C68920; --warning-700: #8A5C12;
  --danger-50:  #FBEAEA; --danger-500:  #B53A3A; --danger-700:  #7A2424;
  --info-50:    #E6EFF5; --info-500:    #2E6EA6; --info-700:    #1B4368;

  /* Typography */
  --font-display: 'Fraunces', 'Cormorant Garamond', Georgia, serif;
  --font-sans:    'Inter', system-ui, -apple-system, sans-serif;
  --font-mono:    'JetBrains Mono', ui-monospace, monospace;

  /* Radii */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 20px;
  --radius-full: 9999px;

  /* Shadows — admin uses almost none; storefront uses sparingly */
  --shadow-sm: 0 1px 2px rgba(15, 14, 12, 0.04);
  --shadow-md: 0 4px 12px rgba(15, 14, 12, 0.06);
  --shadow-lg: 0 12px 40px rgba(15, 14, 12, 0.10);

  /* Motion */
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --dur-fast: 120ms;
  --dur: 200ms;
  --dur-slow: 400ms;
}
```

---

## Appendix E — Tailwind Extend Block

```ts
// client/tailwind.config.ts
extend: {
  colors: {
    brand: { 50:'var(--brand-50)', 100:'var(--brand-100)', 200:'var(--brand-200)',
             300:'var(--brand-300)', 400:'var(--brand-400)', 500:'var(--brand-500)',
             600:'var(--brand-600)', 700:'var(--brand-700)', 800:'var(--brand-800)',
             900:'var(--brand-900)' },
    ink:   { 0:'var(--ink-0)', 25:'var(--ink-25)', 50:'var(--ink-50)',
             100:'var(--ink-100)', 200:'var(--ink-200)', 300:'var(--ink-300)',
             400:'var(--ink-400)', 500:'var(--ink-500)', 600:'var(--ink-600)',
             700:'var(--ink-700)', 800:'var(--ink-800)', 900:'var(--ink-900)' },
    success: { 50:'var(--success-50)', 500:'var(--success-500)', 700:'var(--success-700)' },
    warning: { 50:'var(--warning-50)', 500:'var(--warning-500)', 700:'var(--warning-700)' },
    danger:  { 50:'var(--danger-50)',  500:'var(--danger-500)',  700:'var(--danger-700)'  },
    info:    { 50:'var(--info-50)',    500:'var(--info-500)',    700:'var(--info-700)'    },
  },
  fontFamily: {
    display: 'var(--font-display)',
    sans:    'var(--font-sans)',
    mono:    'var(--font-mono)',
  },
  borderRadius: {
    sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', xl: 'var(--radius-xl)',
  },
  boxShadow: {
    sm: 'var(--shadow-sm)', md: 'var(--shadow-md)', lg: 'var(--shadow-lg)',
  },
}
```

---

## Appendix F — Endpoint Index (REST surface)

```
POST   /api/v1/auth/otp/request            { phone }
POST   /api/v1/auth/otp/verify             { phone, code } → { accessToken } (sets refresh cookie)
POST   /api/v1/auth/refresh                → { accessToken }
POST   /api/v1/auth/logout

GET    /api/v1/shops
POST   /api/v1/shops
PATCH  /api/v1/shops/:id

GET    /api/v1/inventory/items?shopId=&categoryId=&search=&cursor=
POST   /api/v1/inventory/items
PATCH  /api/v1/inventory/items/:id
POST   /api/v1/inventory/items/:id/transfer
POST   /api/v1/inventory/items/bulk-import multipart/form-data
GET    /api/v1/inventory/valuation?shopId=

POST   /api/v1/pos/bills                   { idempotencyKey, ... }
GET    /api/v1/pos/bills?shopId=&from=&to=&cursor=
GET    /api/v1/pos/bills/:id
POST   /api/v1/pos/bills/:id/payment
GET    /api/v1/pos/daily-report?shopId=&date=
POST   /api/v1/pos/sync                    { bills: [...] }   offline reconciliation

GET    /api/v1/finance/pl?from=&to=&shopId=
GET    /api/v1/finance/gst-summary?month=
POST   /api/v1/finance/expenses
GET    /api/v1/finance/tally-export?from=&to=  → XML

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
POST   /api/v1/website/enquiry             public, captures lead
GET    /api/v1/website/page/:slug

SSE    /api/v1/events                      server-sent events for live UI updates

POST   /api/v1/webhooks/whatsapp
POST   /api/v1/webhooks/razorpay
POST   /api/v1/webhooks/shiprocket
POST   /api/v1/webhooks/meta-ads
POST   /api/v1/webhooks/google-ads
```

All webhooks **verify signature**. Unsigned = 401. Logged regardless of success.

---

## Appendix G — Slash Commands Available During the Build

These are configured in `.claude/commands/` and were shipped with the starter pack.

- **`/next-day`** — Reads `phases.md`, finds the next un-shipped day, loads relevant specs (and the design skill if there's UI work), and plans before implementing. Use this in lieu of re-pasting this prompt for Day 2 onward.
- **`/verify`** — Runs typecheck + lint + test + design review to verify a day's work.
- **`/tenant-check`** — Audits tenant isolation, critical before declaring done on DB features.
- **`/design-review`** — Playwright screenshots vs `design-references.md` rules.

Built-in skills you can also invoke directly:

- **`/init`** — Regenerate / upgrade `CLAUDE.md` by reading the current codebase. Run after `client/` and `server/` exist (post-D1) to refresh.
- **`/review`** — Code review on a PR.
- **`/security-review`** — Mandatory at Phase 1 (D15), Phase 2 (D28), pre-deploy (D38).
- **`simplify`** — Run at the end of every day before checkpoint.

---

## Appendix H — Final Sanity Checks Before You Start

- [ ] You've read every file in § 3, in order, fully — not skimmed.
- [ ] You can recite the 9 CLAUDE.md hard rules and the 15 inline hard rules in § 6 without looking.
- [ ] You understand which surface is which design language: storefront = editorial / cinematic / Tanishq-Mejuri; admin = dense / calm / Linear-Vercel; POS = three-pane tablet / Stripe-Terminal.
- [ ] You know that money is paise, weight is mg, purity is carat × 100, rates are bps, MCX is per 10g and must be divided by 10 on ingest.
- [ ] You know that tenant isolation is `AsyncLocalStorage` + Prisma extension, that raw queries must include `WHERE tenant_id = $1` explicitly, and that every list / detail endpoint needs a "tenant A → 404" e2e.
- [ ] You know that WhatsApp goes through BullMQ, never from a request handler, and that templates must be pre-approved.
- [ ] You know that POS must work offline via Dexie + Workbox + idempotency keys, and that `navigator.onLine` is not trustworthy.
- [ ] You know that the storefront prices are server-computed, never client.
- [ ] You know the per-day loop in § 13: read → plan → approve → implement → verify → simplify → checkpoint → stop.
- [ ] You know to use `ui-ux-pro-max` + Playwright for every UI day's verification gate.
- [ ] You know to use the **shadcn-ui MCP** every time you reference a shadcn component — never copy-paste from training data.
- [ ] You know to use **context7 MCP** for current Prisma 5 / RTK Query / Vite 5 / Tailwind 3 / Express 4 / Zod / BullMQ / React Router v6 / TanStack Table / Recharts / react-hook-form / date-fns / pino / supertest docs.

If all 12 boxes above check, you're ready. Now do § 15 Step A — the master plan in plan mode. Stop after the plan. Wait for approval.

---

## End of Prompt — Begin Plan Mode Now
