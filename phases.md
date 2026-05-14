# Phases

40 days, 3 phases. PERN monolith. Web-only v1.

Day 1 reads CLAUDE.md and every spec. Each subsequent day reads this file, picks the next un-shipped day, plans it, builds it, marks it shipped with notes.

---

## Phase 1 — Core Foundation (Days 1–15)

### D1 — Project scaffold — **SHIPPED 2026-05-14** (commit: pending)
- Init repo, `client/` (Vite + React 18 + TS) and `server/` (Express + TS) folders ✓
- `shared/` folder with first Zod schemas (`Tenant`, `Shop`, **+ full v1 schema for every entity**) ✓
- `docker-compose.yml`: Postgres 15, Redis 7, Meilisearch, MinIO ✓
- Tailwind config with full design tokens from `design-system.md` ✓
- `client/src/styles/tokens.css` with brand + ink + semantic CSS vars ✓
- shadcn-style atoms (Button, Input, Label) wired with brand tokens — full shadcn CLI install deferred to D5 ✓
- GitHub Actions: typecheck + lint + test on PR ✓
- `.env.example` in both folders with every key from `gotchas.md` ✓
- Prisma **full schema** from `data-model.md` (not just Tenant + Shop) — first migration ready to generate ✓
- **Tenant Prisma extension** scaffolded with the load-bearing AsyncLocalStorage read + per-model auto-injection ✓
- One smoke test in each side proving the toolchain works ✓
- **Day 1 over-delivered:** money + GST libraries (byte-identical client/server), RTK Query baseApi with all tag types, refresh-on-401 wrapping, Tanishq-grade LoginPage with OTP flow.

**Carryover into D2:** generate the initial Prisma migration (`prisma migrate dev --name init`) and run the tenant isolation e2e against a real DB. Cannot run in this sandbox session — requires `docker compose up -d`.

---

## Build Everything sprint — scaffolds landed ahead of schedule

The "one-shot build" run landed working scaffolds for the entire 40-day spine. None of these are "shipped" per the validation gate — they need each day's plan→implement→verify loop run against a real DB + Playwright. But every module compiles, every RTK Query slice is wired, every page renders, and the heaviest invariants (money, GST, tenant extension) have tests.

**Landed (server):**
- D6 inventory backend — list/get/create/transfer/categories/valuation routes + service
- D9 POS backend core — bill creation in a single transaction with idempotency, GST per-line, old-gold-exchange-aware
- D11 worker process — BullMQ + WhatsApp consumer + gold-rate cron (5-min poll → Redis with stale flag)
- D13 finance — P&L, GST summary, expense create
- D14 GST split — centralized in `lib/gst.ts`
- D16 ecommerce admin — products/orders endpoints
- D21 website public — collections/products/enquiry (subdomain shim)
- D23 CRM — leads list/create/patch with state-transition validation
- D29 analytics — dashboard + staff leaderboard endpoints
- D38 deploy — `ecosystem.config.cjs`, `infra/nginx/goldos.conf`

**Landed (client):**
- D4 LoginPage — Tanishq-grade editorial split
- D5 admin shell — Sidebar, TopBar, ShopSwitcher, CommandPalette (⌘K), AdminShell layout
- D7 inventory page — DataTable (TanStack), Sheet for item detail, EmptyState, Badge tones, Weight/Purity/Money atoms
- D10 POS page — three-pane tablet layout (cart/search-scan/customer), 44×44 touch targets, mono 24px+ numbers, prominent WhatsApp CTA, offline indicator
- D12 offline queue — localStorage queue + isReallyOnline ping (Dexie wires in real impl)
- D13 finance page — P&L metrics + GST split
- D17 storefront — Tanishq-grade home (single hero, magazine collection TOC, editorial story strip, trust strip), Bluestone-grade PDP (transparent price breakdown), CollectionPage (side-panel filters, asymmetric grid), StorePage
- D19 ecommerce admin page
- D21 storefront layout — header with gold-rate ticker, footer, floating WhatsApp button
- D23 CRM kanban page
- D29 analytics page with MetricCard, top-sellers, staff leaderboard
- D34 PWA manifest

**Not landed (require real environment):**
- Prisma migration files (run `npm run db:migrate` to generate `_init`)
- Real Playwright audit at 4 viewports (manual: run `npm run dev` and inspect)
- Real WhatsApp/Razorpay/Shiprocket/MCX integration (stubbed; credentials gate them)
- Service Worker / Workbox (Day 12 wires it once you've installed the deps)
- Tally XML export (Day 14 task)
- Lighthouse 90+ verification (Day 17/21 task)
- Real OWASP scan, security-review skill execution (Day 33/37/38)

**Recommended workflow from here:**
```
docker compose up -d
cd shared && npm install
cd ../server && npm install && npm run prisma:generate && npm run db:migrate && npm run db:seed
cd ../client && npm install
# Two terminals:
cd server && npm run dev          # :4000
cd client && npm run dev          # :3000

# Sign in at /login with phone +919876543210, OTP 123456.
# Storefront preview: /store
# POS: /pos
```

After verifying locally, run `/next-day` for each day to harden + verify per the spec — this scaffold gives every day a real starting point instead of an empty file.

### D2 — Database schema
- Full Prisma schema from `data-model.md`
- Tenant Prisma extension (`server/src/lib/prisma.ts`) reading from AsyncLocalStorage
- `runWithTenant(id, fn)` helper for workers
- Tests for tenant isolation middleware
- Seed: 1 tenant, 2 shops, 50 items, 3 customers, 1 vendor

### D3 — Auth backend
- JWT access (15min) + refresh (7d, httpOnly cookie)
- RBAC: OWNER, MANAGER, BILLING, VIEWER
- OTP: send via WhatsApp Cloud (template), verify, exchange for JWT
- `auth`, `tenant-scope` middleware
- E2E template: "tenant A cannot read tenant B"

### D4 — Auth frontend
- Redux + RTK Query baseApi (`client/src/app/store.ts`) with all tagTypes from `api-design.md`
- `features/auth/authApi.ts` with `requestOtp`, `verifyOtp`, `refresh`, `logout`
- Login page (Tanishq-level polish; this is the first impression)
- Protected route wrapper using Redux auth slice
- Refresh-on-401 interceptor

### D5 — Shell layout + ShopSwitcher
- Admin shell: fixed sidebar (240px) + main + sticky top bar with ShopSwitcher
- Mobile sidebar collapses into Sheet
- Empty dashboard placeholder
- Cmd+K command palette stub
- Toast system (sonner) wired
- Manual design review: sidebar + topbar look Linear-grade

### D6 — Inventory backend
- Item, Category CRUD with cursor pagination
- Multi-store inventory queries
- Barcode/QR generation (`bwip-js` or `qrcode`)
- Stock transfer API (two-phase)
- MCX gold rate poller (cron in worker process), writes Redis

### D7 — Inventory frontend
- `features/inventory/inventoryApi.ts` (RTK Query)
- DataTable with TanStack Table, cursor pagination, column visibility
- Item create/edit Sheet (slides from right; never modal)
- Bulk Excel import with row-error report
- Stock valuation widget (live via SSE)
- Manual design review against admin rules

### D8 — Vendors + POs + hallmarking
- Vendor CRUD with outstanding-paise tracker
- Purchase order create/track
- Hallmarking status flow per item
- Wastage & melting log
- Stone & gem separate tracking

### D9 — POS backend core
- `POST /pos/bills` with idempotency key
- GST calc via `lib/gst.ts`
- Making + stone charges per category
- Old gold exchange valuation logic
- Payment record (multiple modes)
- Daily cash drawer report endpoint

### D10 — POS web PWA UI
- Three-pane tablet layout (cart left, search/scan center, customer right)
- Webcam barcode (`@zxing/library`) + USB scanner support
- Customer lookup by phone
- Split payment screen
- Hold & resume bill
- PWA manifest + service worker (Workbox)
- Tablet design review at 1024×768

### D11 — Receipt + WhatsApp + thermal print
- BullMQ queue + worker process (`workers/index.ts`)
- WhatsApp Cloud API client with template approval handling
- GST PDF invoice generator (pdfkit)
- SMS fallback via Twilio
- Thermal print via window.print() with thermal CSS, or WebUSB if available
- E2E: scan → pay → WhatsApp PDF arrives (mocked)

### D12 — POS offline mode
- Dexie schema mirroring server entities POS touches
- Workbox service worker caching app shell + images
- Sync queue: pending bills POST to `/pos/sync` with idempotency keys
- Conflict resolution (server-authoritative on stock)
- Offline indicator in top bar
- Test with DevTools offline mode

### D13 — Finance module
- Daily sales summary (per shop + consolidated)
- Multi-shop P&L
- Expense tracking + payroll
- Gold loan tracking

### D14 — GST + Tally export
- CGST/SGST/IGST auto-calc (intra vs inter state)
- GST filing summary (monthly + quarterly)
- Tally XML/CSV export, validated against Tally schema
- Bank reconciliation (manual matching UI)

### D15 — Phase 1 stabilization
- Full E2E: onboarding → inventory → POS → receipt → finance summary
- Load test (100 concurrent bills via k6)
- Fix critical bugs
- Demo to stakeholder
- **Phase 1 sign-off**

## Phase 2 — Sell & Engage (Days 16–28)

### D16 — Ecom catalog backend
- Product CRUD with gold-rate-linked pricing (server-side compute)
- Category/filter endpoints
- 360° image upload to S3 (multi-image per product)
- Meilisearch index sync hook
- Bulk product import

### D17 — Storefront frontend (the design-critical one)
- Storefront route tree separate from admin bundle (lazy-loaded)
- Home: cinematic hero, featured collections, gold rate ticker, lookbook section
- Collection page: editorial grid, side-panel filters, infinite scroll
- PDP: 60/40 split, image gallery, transparent pricing breakdown, sticky mobile CTA
- Wishlist & favourites
- SEO meta + OG + JSON-LD product
- **Design review against Tanishq/Mejuri rules. Iterate until it passes.**

### D18 — Cart & checkout
- Cart in Redux + localStorage persistence
- Checkout flow: address → payment → confirm
- Razorpay integration
- COD with order-value limit config
- Abandoned cart cron (worker) → WhatsApp at +2h

### D19 — Order management
- Admin order dashboard (Linear-grade)
- Side panel for order detail (Sheet)
- Shiprocket integration (label + tracking)
- Delhivery fallback
- Order status WhatsApp templates per status
- Customer order history page

### D20 — Promotions + reviews
- Discount + coupon engine
- Review system with admin moderation
- Google Ads conversion pixel
- Festive collection pages (use editorial template)
- Full purchase flow E2E

### D21 — Business website
- `/website/*` route tree (SSG-style pre-render via vite-plugin-ssg or static export)
- Home: cinematic hero + featured collections (CMS-editable in admin)
- About Us, Shop Locations with Google Maps
- WhatsApp chat widget (bottom-right)
- Trust badges section
- **Design review — must look indistinguishable from a top-tier brand site**

### D22 — Website SEO + integrations
- Google Business Profile sync
- Blog/Articles CMS (admin can create posts)
- Instagram feed (Meta Graph API)
- Lighthouse mobile ≥ 90 verified
- Hindi + English i18n via i18next

### D23 — CRM core
- Unified lead inbox (WhatsApp + Insta + FB + Google + website)
- Kanban pipeline (drag-drop via dnd-kit)
- UTM source tracking
- Website enquiry webhook → CRM auto-capture
- Customer tagging

### D24 — CRM WhatsApp automation
- Auto follow-up sequences (D1/D3/D7 via templates)
- Bulk broadcast UI with template approval flow
- Birthday + anniversary automation
- Lead assignment + notifications
- Follow-up reminder calendar

### D25 — Ad integrations
- Meta Ads API (FB + Insta lead forms)
- Google Ads API
- UTM-to-lead attribution
- Ad spend vs conversions report
- Lead source analytics

### D26 — Customer profile + loyalty
- Full customer profile (purchase history, preferences)
- Loyalty points (earn % on purchase, redeem at POS)
- Customer segmentation
- Re-engagement trigger (90 days)

### D27 — Phase 2 integration testing
- Website → CRM capture
- Ecom order → inventory deduction
- WhatsApp automation E2E
- Ad attribution validation
- Perf test: 1000 concurrent storefront visitors

### D28 — Phase 2 deployment
- Deploy storefront + website to staging
- Custom domain + SSL + Cloudflare CDN
- GA4 + Meta Pixel
- Client walkthrough
- **Phase 2 sign-off**

## Phase 3 — Grow & Scale (Days 29–40)

### D29 — Analytics core
- Real-time sales dashboard (SSE-driven)
- Shop-wise comparison
- Top-selling products + categories
- Daily/weekly/monthly P&L toggle
- Custom date range
- **Design review: dashboard must hit Linear bar**

### D30 — BI reports
- Gold rate impact analysis
- Inventory valuation (live)
- Low-margin alert
- Festive YoY
- Customer acquisition cost

### D31 — Ad ROI + staff
- Ad ROI per campaign
- Staff leaderboard
- GST filing summary (auto monthly)
- Scheduled email reports
- Export to Excel + PDF on every report

### D32 — Automation engine
- Notification service (in-app SSE + WhatsApp + email)
- Rule engine: trigger → condition → action
- Built-in rules: low stock → auto PO; new lead → instant WhatsApp; birthday → offer

### D33 — Hardening
- PgBouncer connection pooling
- Redis caching on hot reads
- Rate limit per user/tenant
- SQL injection / XSS / CSRF audit
- PII encryption at rest

### D34 — PWA polish
- Push notifications (Web Push API + service worker)
- Add-to-home-screen prompt UX
- Forced update banner
- Cross-browser test (Chrome, Safari, Edge)

### D35 — Super-admin panel
- Tenant onboarding/activation
- Per-tenant usage metrics
- Support ticket system
- Feature flag toggles

### D36 — Migration tools
- Excel inventory importer
- Tally data import (XML/CSV)
- Customer import
- 10k+ item dataset stress test

### D37 — Full QA
- Regression across 7 modules
- Cross-browser
- GST accuracy audit
- OWASP Top 10 pen test
- **All design reviews re-run**

### D38 — Production infra (lightweight)
- Single Hetzner / DO box
- Nginx + SSL via Let's Encrypt
- PM2 ecosystem.config.js (web + worker)
- Postgres backups (pg_dump → S3 nightly)
- Sentry + Grafana + Loki wired
- Cloudflare CDN

### D39 — Client UAT + training
- Deploy to production for UAT
- Training sessions (POS + inventory)
- Video walkthroughs per module
- Fix UAT critical + high only
- Load test 1000 concurrent

### D40 — Go live
- Final deploy with zero-downtime PM2 reload
- DNS cutover
- 24h monitoring
- Deliver docs (API, admin, user)
- Setup support SLA
