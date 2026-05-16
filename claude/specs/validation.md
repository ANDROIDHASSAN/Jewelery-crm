# Validation

How we know a module is done. Unit + e2e + a design + manual smoke. New: every UI surface has a **design review step** using Playwright MCP screenshots vs `design-references.md`.

## Universal checks (every feature)

Run from the relevant folder before declaring done:
```
npm run typecheck
npm run lint
npm test
```
All three pass. No `.skip`, no `any`, no commented-out tests.

## Tenant isolation (most critical)

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

## Module 1 — Inventory

**Unit (Vitest):**
- `Money` add/subtract/multiply/divide → no float drift
- `Weight` parse "12.345g" → 12345 mg, round-trip exact
- `Purity` validates only allowed values
- Stock valuation: items × current rate per purity, sum

**E2E (Playwright):**
- Create item → appears in list
- Bulk Excel import 1 valid + 1 invalid → 1 created, row 2 error shown
- Transfer item shop A → shop B (initiate) → audit log entry
- Transfer accept at B → `item.shopId` updates, both shops see correct stock

**Manual smoke:**
- Open Inventory → see seeded items, columns formatted correctly
- Click an item → side sheet opens with detail
- Barcode label print → renders correctly on A4

## Module 2 — E-Commerce

**Unit:**
- Pricing function: weight × goldRate × purity_factor + making + stone = total
- Coupon engine: flat / % / min-cart-value enforcement
- Slug generator: handles unicode, deduplicates

**E2E:**
- Browse → PDP → add to cart → checkout → Razorpay test → order in admin
- Abandoned cart: leave at checkout, simulated +2h → WhatsApp enqueued

**Design review (Playwright MCP):**
- Home, collection, PDP screenshots at 375 / 768 / 1024 / 1440
- Compare against `design-references.md` storefront rules
- Check: serif display fonts present, generous whitespace, no carousel on hero, no popup on landing

**Manual smoke:**
- Lighthouse mobile ≥ 90 on home + PDP
- Order online → inventory decrements in admin

## Module 3 — CRM + Ads

**Unit:**
- UTM parser handles all standard params + missing
- Lead status transitions valid (can't skip NEW → CONVERTED)

**E2E:**
- Website enquiry → lead appears in CRM
- D1 follow-up cron → WhatsApp template enqueued for yesterday's leads
- Meta Ads webhook → lead with `utm_source=facebook` created and assigned

**Manual smoke:**
- Drag a lead "Contacted" → "Interested" → status updates, audit logged

## Module 4 — Finance

**Unit (heaviest tests):**
- GST CGST+SGST intra-state at 3% correct
- GST IGST inter-state correct
- Old gold exchange reduces taxable base correctly
- Making charges included in taxable supply
- P&L = sum(bills.totalPaise) − sum(expenses.amountPaise) per period
- Tally export passes Tally XML schema validation

**E2E:**
- Create 10 bills with varied payment modes → daily report matches sum
- GST summary for last month → matches sum of bill taxes

**Manual smoke:**
- CA opens Tally, imports the XML, no errors, totals match

## Module 5 — POS

**Unit:**
- Bill total = sum(lines) + making + stone + GST − exchange − discount
- Split payment: sum(payments) equals bill total within 1 paise
- IndexedDB queue: add bill offline → reads back identical

**E2E:**
- Online: complete bill → WhatsApp receipt mock called with valid PDF
- Offline: DevTools offline → create bill → go online → bill syncs idempotently within 30s

**Design review:**
- Tablet 1024×768 screenshot
- Three-pane layout correct
- Touch targets ≥ 44px (measured from screenshot)
- Numeric fields mono and large

**Manual smoke (real tablet):**
- Airplane mode → complete bill → reconnect → bill in admin within 30s
- USB barcode scanner → adds item in <1s
- "Send WhatsApp receipt" works

## Module 6 — Business Website

**Unit:**
- i18n routing: `/hi/contact` and `/en/contact` resolve
- SEO meta builder outputs correct OG tags

**E2E:**
- Submit contact form → lead in CRM
- WhatsApp widget click opens prefilled URL

**Design review:**
- Tanishq-level: serif display, editorial grid, generous spacing — verified by Playwright screenshots
- No popup, no carousel, no auto-video

**Manual smoke:**
- Lighthouse mobile ≥ 90 on home, collection, PDP
- Google rich results test passes for product JSON-LD

## Module 7 — Analytics

**Unit:**
- Date range filter inclusive both ends
- YoY aligned to Indian FY (April–March)

**E2E:**
- Seed bills across 3 shops → dashboard shows correct consolidated and per-shop totals
- Live update: create bill via API → SSE pushes within 2s

**Design review:**
- Linear-grade: dense, calm, KPI tiles, no shadows, mono numbers
- Empty states present and content-first

**Manual smoke:**
- Export every report to Excel and PDF → opens in Excel and a PDF reader

## Security checklist (Phase 3 must-pass)

- [ ] OWASP Top 10 scanned (zap-baseline.py against staging)
- [ ] All `$queryRaw` reviewed for tenant filter
- [ ] JWT refresh rotation works (old refresh revoked on use)
- [ ] Rate limits enforced on auth + webhook endpoints
- [ ] CORS allowlist = deployed domains only (none in prod since same-origin)
- [ ] All form inputs Zod-validated server-side
- [ ] Uploads (Excel, images) virus-scanned + size-limited
- [ ] PII redacted in Sentry breadcrumbs
- [ ] DB backups restored to a test instance successfully

## Performance budgets

- API p95 < 300ms for read, < 800ms for write (excluding payment provider calls)
- Storefront LCP < 2.5s on 4G mobile
- POS bill creation total time (scan to receipt sent) < 60s in normal use
- Inventory list with 10k items: page load < 1.5s

## Phase done = all green

Each phase ends only when:
1. Every feature in that phase's section of `features.md` passes unit + e2e
2. Security checklist items relevant to the phase are green
3. Design reviews for every UI surface in the phase pass against `design-references.md`
4. A 30-minute manual demo with the stakeholder runs without breaking
5. Sentry error rate < 1% over the last 24h of staging traffic
