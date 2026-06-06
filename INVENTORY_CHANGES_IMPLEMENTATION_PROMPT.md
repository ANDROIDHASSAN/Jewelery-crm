# Gold OS — Client Meeting Change Requests: Phase-Wise Implementation Prompt

> **Source notes:** `jewelry_inventory_meeting_notes.md` (M1), `jewelry_inventory_meeting_notes_2.md` (M2), `jewelry_inventory_meeting_notes_3.md` (M3).
> **How to use this doc:** Each phase below is a self-contained prompt. Hand one phase at a time to Claude Code. Do the phases in order — later phases depend on schema added in earlier ones. After each phase: `npm run typecheck && npm test && npm run lint`, plus the Playwright UI check the CLAUDE.md "verify before done" rule requires.

---

## Codebase grounding (verified — read before starting)

The notes describe behaviour; here is how the system actually models it today. Do **not** re-derive this — it's been checked against the repo.

**Schema** — `server/prisma/schema.prisma`
- `Category` (line 352): `id, tenantId, name, parentId (self-ref tree "CategoryTree"), metalType (enum), defaultMakingChargeBps`. **No** sort-order, **no** code/prefix, **no** collection link, **no** flat per-gram charge.
- `Item` (line 369): `shopId, categoryId, sku, barcodeData, name?, images[], weightMg, purityCaratX100, stoneWeightMg?, hallmarkStatus, hallmarkRef?, costPricePaise, makingChargeBps?, status, isSerialized, quantityOnHand`. **No** description field, **no** diamond detail (only a single `stoneWeightMg`), **no** collection link, **no** separate gold/diamond cost.
- `Product` (line ~1170): storefront mirror. `linkedItemId @unique` (one-to-one to Item), `isPublished`, `descriptionMd`, `categoryId`. Auto-created when an item is saved with `publishToWebsite=true`.
- `MetalType` enum (line ~313): `GOLD | SILVER | DIAMOND | PLATINUM | OTHER`. **No STAINLESS_STEEL.**

**Shared (single source of truth for validation)** — `shared/`
- `constants.ts:369` — `PURITY_VALUES = [2400, 2200, 1800, 1400, 0, 9500]` (carat×100; Silver=0, Pt=9500). **No 900 (9K).**
- `schemas.ts:200` — `CategorySchema` / `CategoryInputSchema`. `schemas.ts:211` — `ItemSchema` / `ItemInputSchema` (`publishToWebsite` opt-in at :249). `BpsSchema` = basis points (percentage making charge).

**Server modules**
- Inventory routes `server/src/modules/inventory/inventory.routes.ts` (items :40–152, categories :169–223). Service `inventory.service.ts` — `createItem` (:53), `updateItem` (:121), `deleteItem` (:154, soft-delete → MELTED), `addStock` (:226, SKU suffix gen), `listCategories/createCategory/updateCategory/deleteCategory` (:390–512), `computeValuation/computeLowStock` (:514+).
  - `deleteCategory` **already** blocks on items/children (`CATEGORY_HAS_ITEMS`, `CATEGORY_HAS_CHILDREN`) — but does **not** return the item count.
  - Categories are returned as a **flat list ordered by name**; client builds the tree.
- Analytics `server/src/modules/analytics/analytics.routes.ts` — Top Products groups by `productId` (item-wise, :238); Low Stock selects `categoryId` but **not** the parent/main category name (:631–645); Inventory Valuation already builds a main→sub→item tree (:454–584).
- Finance `server/src/modules/finance/finance.routes.ts` — `POST /finance/expenses` (:602) is the insertion point for Meta Ads auto-fetch.
- CRM `server/src/modules/crm/crm.routes.ts` + `server/src/modules/website/website.routes.ts:1625` (`POST /website/enquiry` already creates a NEW lead — the popup just needs a UI).

**Client**
- Inventory feature `client/src/features/inventory/inventoryApi.ts` (RTK Query hooks for items/categories/valuation/low-stock). Item add/edit + category management components live in `client/src/features/inventory/` and `client/src/pages/`.
- POS `client/src/pos-app/PosCounterPage.tsx` — already fetches with `{ shopId: user.shopId }` (:185) and builds an `itemsByCategory` count map (:238). The **admin inventory list** is where multi-branch "double display" actually shows.

**Hard rules that constrain every phase** (from CLAUDE.md): money in **paise (int)**, weight in **milligrams (int)**, purity in **carat×100 (int)**; validation lives in `shared/schemas.ts` (same schema client+server); every tenant-scoped query goes through tenant middleware; migrations are **forward-only** (never edit a committed one); RTK Query is the only client HTTP layer and every mutation declares `invalidatesTags`; any UI work loads `.claude/skills/frontend-design.md` first and follows `claude/specs/design-system.md`.

---

## Phase map (sequence & rationale)

The client **will not begin entering inventory until the data-entry blockers ship together as one release** (M2 §3). So Phases 1–3 = **Release A (data-entry unblock)** and should ship as one deployment. Phases 4–6 = **Release B (admin/storefront/analytics polish)**. Phase 7 = lead capture. Phase 8 = client-dependent integrations (post storefront launch).

| Phase | Theme | Ships in | Maps to |
|-------|-------|----------|---------|
| 1 | Metal, purity & making-charge foundation | Release A | M1 #2,#3,#5, M1 Bug1, M3 Bug1 |
| 2 | Category management correctness | Release A | M1 #4,#6, M1 Bug2 |
| 3 | Item enrichment: collections, diamonds, costs, description, SKU | Release A | M1 #1,#4 (diamonds), M2 #1, M3 #5,#6 |
| 4 | Storefront: visibility + multi-section single-record | Release B | M1 #5, M3 #1 |
| 5 | POS: store filter + category dropdown + branch labels | Release B | M2 #2, M3 #4,#9, M3 Bug2,Bug4 |
| 6 | Analytics: category-first views | Release B | M3 #2,#3 |
| 7 | Website lead-capture popup | Release B/C | M3 #8 |
| 8 | Integrations & scanner (client-blocked, post-launch) | Release C | M1 #3, M3 #7, M3 §1 items 12–13 |

---

## PHASE 1 — Metal type, purity & making-charge foundation

**Goal:** Make the three client metal categories (18K Gold Tone = stainless steel, 9K Fine Gold, 925 Sterling Silver) representable, default purity to 9K, support flat per-gram making charge alongside percentage, and kill the "Non-precious everywhere" purity bug. **This is the top data-entry blocker (M2 §3).**

### 1A. Stainless Steel metal type (M1 FR#2, M3 action — non-precious)
- Add `STAINLESS_STEEL` to the `MetalType` enum in `server/prisma/schema.prisma`, the `z.enum([...])` in `shared/schemas.ts` (`CategorySchema.metalType`), and any `METAL_TYPES` list in `shared/constants.ts`. New Prisma migration (forward-only).
- Stainless steel is **non-precious**: it must not be priced off the gold/silver rate. In `ecommerce`/valuation pricing (`server/src/modules/ecommerce/ecommerce.routes.ts` live-pricing block, and `computeValuation`), treat `STAINLESS_STEEL` like `OTHER` → use `basePricePaise`/`costPricePaise`, never a metal-rate recompute.
- Item add/edit form: add Stainless Steel to the metal-type selector. When selected, the purity field shows **"Non-precious"** (and only then).

### 1B. Purity default 9K + correct options (M1 FR#3, M1 Bug1, M3 Bug1)
- Add `900` (9 carat) to `PURITY_VALUES` in `shared/constants.ts`. Keep `1400` (14K) and `1800` (18K). Confirmed client options: **9, 14, 18 carat**, plus existing 22K/24K/Silver/Pt as needed.
- **Default the purity selector to 9 carat (900)** in the item add form.
- **Bug fix (M1 Bug1 / M3 Bug1):** purity currently resolves to "Non-precious" globally / in 3 of 4 gold sub-categories. Root cause to find in the item form's purity-options logic — purity options must derive from the **selected category's `metalType`**, not a global constant:
  - `GOLD` → carat options (9/14/18/22/24), default 9K.
  - `SILVER` → 925 / fineness, label "Silver".
  - `STAINLESS_STEEL` / `OTHER` → "Non-precious" only.
  - Add a unit/integration test asserting a GOLD sub-category never offers "Non-precious" and a STAINLESS_STEEL category only offers it.

### 1C. Per-gram flat making charge (M1 Decision#2, FR#5, M2 §3)
Today making charge is **percentage only** (`defaultMakingChargeBps` on Category, `makingChargeBps?` on Item). Add a flat **₹/gram** option that co-exists.
- Schema (`Category` and `Item` in `schema.prisma`, mirrored in `shared/schemas.ts`):
  - `makingChargeMode` enum `PERCENTAGE | PER_GRAM` (default `PERCENTAGE` to preserve existing rows).
  - `makingChargePerGramPaise Int?` (paise per gram — integer, hard rule). Category gets a default; Item gets an optional override (null = inherit category).
- Centralise the math: extend `shared/bill-math.ts` (and `server/src/lib/gst.ts` consumers / valuation / live pricing) so making-charge resolves as:
  - `PERCENTAGE` → `applyBps(metalValue, bps)` (existing path).
  - `PER_GRAM` → `round(weightMg * perGramPaise / 1000)` (mg → g). **Never float-multiply a price** — keep integer paise.
- Item-level override beats category default (existing precedence for bps; apply the same to per-gram).
- Category settings UI: a mode toggle (Percentage % ⇄ Flat ₹/g) with the matching input. Item form: same toggle as an optional override.
- Tests: per-gram on a known weight produces the exact paise; switching modes doesn't corrupt the other field.

**Validation for Phase 1:** create the three client categories; confirm a 9K Fine Gold ring defaults to 9 carat, a Stainless Steel item shows only "Non-precious", and a category with ₹2/g making charge prices a 10g piece at ₹20 making.

---

## PHASE 2 — Category management correctness

**Goal:** Manual sub-category ordering, no duplicate names, and a delete confirmation that shows the item count.

### 2A. Sub-category manual sort / priority order (M1 FR#6)
- Add `sortOrder Int @default(0)` to `Category` (`schema.prisma` + `shared/schemas.ts`). New migration.
- `listCategories` (`inventory.service.ts:390`): order by `sortOrder ASC, name ASC` (stable tiebreak) instead of `name` only.
- Add an endpoint to persist reordering, e.g. `PATCH /inventory/categories/reorder` taking `[{ id, sortOrder }]` scoped to one parent. Add the RTK Query mutation + `invalidatesTags: ['Category']`.
- Client: drag-to-reorder (or up/down) on the sub-category list under each main category. High-priority subs (Necklaces, Chains) can be pinned to top regardless of name.

### 2B. Duplicate sub-category name validation (M1 Bug2)
- Enforce uniqueness of `name` within `(tenantId, parentId)` — a sub-category name must be unique among its siblings (and main-category names unique among `parentId = null`).
- DB: add `@@unique([tenantId, parentId, name])` on `Category` (migration). Note Postgres treats NULL parentId rows as distinct under a plain unique index — if main-category dedup matters, enforce it in the service layer too.
- Service (`createCategory`/`updateCategory`): pre-check for an existing sibling with the same trimmed, case-insensitive name; return a clear error (`CATEGORY_DUPLICATE_NAME`) instead of relying on the DB throw.
- Client: surface the warning inline on the add/edit form; don't silently create a second "Rings".

### 2C. Delete rule with item count (M1 Decision#4)
- `deleteCategory` already blocks with `CATEGORY_HAS_ITEMS` / `CATEGORY_HAS_CHILDREN`. Extend the error payload to include **counts**: `{ code: 'CATEGORY_HAS_ITEMS', itemCount, childCount }` (count items across the sub-tree if a main category).
- Client: on delete, show a confirmation/notification like *"Cannot delete 'Rings' — 12 items still assigned. Reassign or remove them first."* No deletion when count > 0.

---

## PHASE 3 — Item enrichment: collections, diamonds, costs, description, SKU

**Goal:** Everything that makes an item record complete enough for the client to start data entry: collections, full diamond grading with separate cost, a single-source description, and a category-prefixed SKU. (M2 §3 wants these in the same release as Phases 1–2.)

### 3A. Collections (M1 FR#1)
Collections are **cross-category, cross-metal** groupings (Bridal, Festival, Corporate) — an item can be in one or several. This is a new concept, separate from the `Category` tree.
- New `Collection` model: `id, tenantId, name, slug, description?, sortOrder, createdAt`. New join `ItemCollection` (`itemId, collectionId`, `@@id([itemId, collectionId])`, tenant-scoped) for many-to-many. (Mirror to storefront `Product` in Phase 4.)
- Zod schemas in `shared/schemas.ts`; constants if a fixed seed list is wanted.
- Server: CRUD routes under inventory (or a small `collections` module) + attach/detach on items. RTK Query slice + hooks; mutations invalidate `['Collection','Item']`.
- Client: a **Collections multi-select** on the category **and** item add/edit forms (M1 FR#1 says both). Item-level membership is the source of truth; category-level is a convenience to bulk-tag.

### 3B. Diamond / stone details — multiple per item (M1 FR#4, M2 §1)
Today there's only a single `stoneWeightMg`. Client needs **multiple diamonds per item**, each with the 4 Cs, and **gold vs diamond cost booked separately**.
- New `ItemDiamond` model: `id, tenantId, itemId, shape?, caratWeightX100 Int (carat×100), cut?, clarity?, color?, count Int @default(1), costPaise Int`. Use string enums for cut/clarity/color seeded from the grading chart the **client will share** (M1 FR#4) — leave the enum values as a TODO placeholder noting the chart dependency; don't invent grades.
- Keep legacy `stoneWeightMg` for back-compat or migrate it into a single `ItemDiamond` row.
- **Separate cost tracking (M2 §1):** keep `costPricePaise` as the **metal (gold) cost**; sum `ItemDiamond.costPaise` as the **diamond cost**. Valuation/pricing = gold value (rate-based) + Σ diamond cost. Surface both as distinct lines, never merged. (Note M2's "₹30,000 per carat" is a *purchase* price the client books per diamond — it's data the user enters in `costPaise`, not a formula to hardcode.)
- Client: a repeatable "Diamonds" sub-form on the item add/edit page (add/remove rows; each row weight + cut + clarity + colour + count + cost). Show in the item detail and on slips.
- Tests: an item with 2 diamonds of different shapes persists both; total cost = gold cost + Σ diamond cost.

### 3C. Item description — single source of truth (M3 FR#5)
- Add `descriptionMd` (or `description`) to `Item` (`schema.prisma` + `shared/schemas.ts`). This becomes the **master** description set once in inventory.
- In `createItem`/`updateItem` (`inventory.service.ts:53/121`), propagate `Item.description` → linked `Product.descriptionMd` (the Product mirror sync already copies name/images at :131–148 — extend it). The e-commerce tab description field should read from / write back to this master, not hold a separate copy.
- Item slips/receipts must always include **item name + description** (M3 §7). Ensure the receipt/invoice template pulls both.

### 3D. SKU prefix with category code (M3 FR#6)
- Add `code String?` to `Category` (short prefix, e.g. `RNG`, `NCK`; validate uppercase alnum, unique per tenant). Migration + Zod.
- SKU generation: when creating an item, auto-suggest/generate `"[CategoryCode]-[Sequence]"` (e.g. `RNG-00012`). Keep SKU user-editable (it's free-form today and `@@unique([tenantId, sku])`), but default it from the category code + next sequence. Confirm the exact format with the client before finalising (M3 action #6 is Dev **+ Client**) — leave the separator/zero-padding as a single config constant so it's trivial to change.
- The serialized `addStock` suffix generator (`inventory.service.ts:246`) stays as-is for clones.

**Validation for Phase 3 (and Release A as a whole):** a single ring with gold + 2 diamonds, in the Bridal collection, 9K default purity, ₹/g making charge, a `RNG-xxxxx` SKU, one master description, published to the storefront — saved as **one** inventory record. This is the end-to-end data-entry path the client is waiting on.

---

## PHASE 4 — Storefront: visibility toggle + multi-section single-record

**Goal:** Hide items from the storefront without deleting them, and let one item appear in many storefront sections while staying a **single** admin inventory record (M3's key concern).

### 4A. Storefront visibility toggle (M1 Decision#5)
- `Product.isPublished` already exists. Expose it as a **checkbox in the e-commerce section** of the item admin ("Show on storefront"). Unchecking hides from storefront but **keeps the inventory item**. Wire the mutation + `invalidatesTags`.

### 4B. One item in multiple sections, one inventory record (M3 FR#1, Decision: "multi-categories in storefront only; in admin always once")
- Sections today (`New Arrivals`, `Best Sellers`, `Collections`, occasions, deals) live as **CMS tiles** in the StorefrontContent blob, not as per-product links. To place a single product in up to ~6 sections:
  - Add a `ProductSection` join: `productId, sectionType (enum: COLLECTION | NEW_ARRIVAL | BEST_SELLER | OCCASION | DEAL | FEATURED ...), sectionRef? (slug), displayOrder`. Tenant-scoped, `@@id` or unique on `(productId, sectionType, sectionRef)`.
  - Reuse Phase 3A `Collection` for the COLLECTION section type.
- Server: storefront read endpoints (`website.routes.ts`) resolve each section by querying `ProductSection` → `Product` (one row per product) instead of duplicating product data per tile.
- Admin: a multi-select "Show in sections" control on the product/e-commerce tab. **Critical invariant (M3 §6, §"single inventory record"):** adding a product to N sections creates N `ProductSection` rows but **never** a second `Item`/`Product`. Add a test asserting inventory count is unchanged when a product is added to 6 sections.
- "Sync from Categories" button behaviour (M1 Decision#6, ~10s to reflect): keep, and make clear it only maps **main categories** to nav.

---

## PHASE 5 — POS: store filter, category dropdown, branch labels

**Goal:** Kill the "double inventory" confusion and make POS product selection category-driven.

### 5A. Store-specific inventory filter (M2 §2, M3 FR#4, M3 Bug2)
- Root cause (confirmed): an item present in two branches is **two `Item` rows** (one per `shopId`) — correct by design, but it reads as a duplicate. POS `PosCounterPage.tsx` already passes `{ shopId: user.shopId }` (:185) so the **POS counter** is mostly correct; the fix targets where it *isn't* scoped:
  - **Admin inventory list:** add an explicit **branch/store filter** (dropdown) and a **branch label column/badge** so two-branch items read as "Main Showroom" vs "Kernel Branch", not duplicates (M2 §2 action).
  - Ensure every POS item query is hard-scoped to the active shop; if a "show all shops" view exists, label each row with its branch and never sum the same physical piece twice.
- Add a test: listing inventory filtered to Shop A returns only Shop A rows.

### 5B. Category → sub-category → item dropdown in POS (M3 FR#9)
- POS product selection should flow **main category → sub-category → items** (cascading dropdown), not a flat list. The `Category` tree + `itemsByCategory` map already exist (`PosCounterPage.tsx:238`); restructure the picker into the cascade. Keep search as a shortcut.

### 5C. Transferred-item edit/delete (M3 Bug4)
- Confirm: delete is **intentionally disabled** for items with activity (soft-delete rule), but **edit should work**. Investigate why a transferred item couldn't be edited; fix so edit is allowed on IN_TRANSIT/transferred items (only hard-delete/SOLD stays blocked). Add a regression test.

---

## PHASE 6 — Analytics: category-first views

**Goal:** Surface **main category** where today only sub-category/item appears.

### 6A. Main category in Low Stock (M3 FR#2)
- `computeLowStock` / Low Stock select (`analytics.routes.ts:631–645`) returns `categoryId` but not the parent name. Add `category.parent.id` + `category.parent.name` (main category) to the select/response. Show main category alongside item + sub-category in the Low Stock UI.

### 6B. Category-wise Top Products (M3 FR#3)
- Top Products groups by `productId` (`analytics.routes.ts:238`). Add a **main-category grouping** as the primary view: either a new `GET /analytics/top-categories` (group `orderItem` by `product.category.parent.id`) or extend the response with parent-category roll-ups. Client wants main category as the **primary focus**, item-wise as a drill-down.
- Inventory Valuation already has the main→sub→item tree (:454–584) — no change; the M3 "showing as General" note is **user error** (sub-category not picked), so add a UI guard: make sub-category selection **required** (or warn) on item create so items don't fall into "General".

---

## PHASE 7 — Website lead-capture popup (M3 FR#8)

**Goal:** An opt-in inquiry popup on the storefront that captures contact details into the CRM.
- Backend already exists: `POST /website/enquiry` (`website.routes.ts:1625`) creates a NEW lead. **No backend change needed** beyond setting a distinct `source` (e.g. `website-popup`).
- Build a storefront modal/flash form (name + phone + interest) shown on visit. **Must be voluntary** — user submits their own info; no silent/automatic capture (M3 explicitly: "Requires user to provide info voluntarily — not automatic"). Respect a dismiss + don't-nag (cookie/localStorage) UX.
- POST to `/website/enquiry` via RTK Query with `source: 'website-popup'`; new lead lands in the CRM pipeline at NEW with the source tag for channel reporting.

---

## PHASE 8 — Integrations & scanner (client-blocked / post-launch)

These depend on client-supplied credentials or are explicitly post-launch. Scope and ticket them; don't block Releases A/B.

### 8A. Meta Ads expense auto-fetch (M3 FR#7, action #7 — post storefront launch)
- Insertion point exists: `POST /finance/expenses` (`finance.routes.ts:602`). Build a worker (BullMQ, per CLAUDE.md cron pattern in `server/src/workers/`) that pulls Meta Ads spend via the Marketing API and inserts expense rows with `category: 'Meta Ads'`, `classification: 'REVENUE'`, `bankAccountId`, `receiptUrl`. Idempotent per day/campaign. **Needs client API keys** (M3 action #12, after storefront live).

### 8B. Meta/Google Ads → CRM lead integration (M3 §1, action #12 — client + post-launch)
- Leads from WhatsApp/Instagram/Facebook/Google Ads flow into CRM once APIs are connected. Wire ingestion to create leads with the correct `source`/`utmSource`. **Blocked on client API keys**; must be after storefront goes live (client note M3 §1).

### 8C. WhatsApp Business broadcast connection (M3 §2, action #13 — client)
- Broadcast templates + send already scaffolded (`crm.routes.ts` `POST /crm/broadcasts`, BullMQ per hard-rule #5). **Blocked on client** setting up & connecting a WhatsApp Business account. Document the connect steps; no code change until credentials exist.

### 8D. Barcode / QR scanner (M1 FR#3 — "scope and log as separate ticket")
- Warehouse scanning so staff scan root/lot numbers instead of typing. `Item.barcodeData` already exists and there's a barcode lookup route in POS. Scope: hardware/keyboard-wedge vs camera (PWA `BarcodeDetector`), which screens (inventory add, POS, transfers), and offline behaviour. **Log as its own feature ticket** before building.

---

## Cross-cutting checklist (apply every phase)

- [ ] Schema change? → new **forward-only** Prisma migration; mirror the field in `shared/schemas.ts` (Zod) and `shared/constants.ts`; never edit a committed migration.
- [ ] Money in **paise (int)**, weight in **mg (int)**, purity **carat×100 (int)**. No `parseFloat` on a price; making-charge math stays integer.
- [ ] Every new query tenant-scoped (middleware / explicit `tenantId`). No cross-tenant leak.
- [ ] Client: RTK Query only; every mutation declares `invalidatesTags`; matching tags on queries.
- [ ] UI work: load `.claude/skills/frontend-design.md` + follow `claude/specs/design-system.md` (Tanishq storefront / Linear admin). Verify in browser via Playwright before declaring done.
- [ ] `npm run typecheck && npm test && npm run lint` green; a test or manual demo path per feature.
- [ ] Touching auth/tenant/payment/PII → run `/security-review`.

## Open items to confirm with client before coding
1. **SKU format** — exact prefix/separator/zero-padding (M3 action #6 is Dev **+ Client**).
2. **Diamond grading chart** — cut/clarity/colour enum values (M1 FR#4: "client will share a cut/clarity grading chart"). Don't invent grades.
3. **Stainless Steel purity label** — confirm "Non-precious" is the desired display, and whether "18K Gold Tone" should read as a metal-type or a category name.
4. **Storefront section list** — the exact ~6 sections an item can appear in (M3 FR#1).
5. M2 audio was lossy — re-confirm the separate gold/diamond cost booking and multi-branch display expectations directly (M2 closing note).
