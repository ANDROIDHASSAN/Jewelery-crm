# Features

This is the canonical list. A feature isn't done unless it does what's described here. New request not on this list → ask before building.

Each module: features → "done means" → links to spec details.

---

## Module 1 — Stock & Inventory

**Done means:** Jeweller can model full inventory across all shops, see live valuation at today's gold rate, transfer stock between shops with audit, never sells what they don't have.

- Multi-store inventory sync (live)
- Product catalog with category tree (Gold / Silver / Diamond / Bridal / Daily / Festive)
- Weight (mg) + purity (22K/18K/14K/silver/platinum) tracking per item
- Barcode + QR per item (auto-generated, printable label)
- Stock transfer between shops with approval flow + audit trail
- Vendor / supplier records with outstanding payment tracker
- Purchase order creation, tracking, receipt
- Live gold rate (MCX) cached in Redis, 5-min TTL
- Stock valuation report (items × current gold rate, live)
- Low-stock alerts (per-item threshold, dashboard widget)
- Hallmarking status per item (BIS: pending / submitted / certified / exempt)
- Stone & gem separate tracking (carat, type, certificate ref)
- Wastage & melting log
- Bulk Excel import with row-level error reporting
- Making charges configurable per category (flat or %)
- Full audit trail on every inventory movement

---

## Module 2 — E-Commerce Store (customer-facing storefront)

**Done means:** Customers discover, browse, and buy jewellery online from a custom-branded store; orders flow into the same inventory and analytics as in-store sales. **Storefront design quality must match Tanishq / CaratLane** — see `design-references.md`.

- Custom domain online store, brand colors per tenant
- Hero section + featured collections (editable from admin)
- Product listing with filters: metal, occasion, price range, weight range
- Product detail page with 360° image viewer + zoom
- Gold-rate-linked pricing (server-side computed, refreshes on rate change)
- Custom collections (Wedding, Festive, Daily Wear, Silver)
- Wishlist / favourites (requires customer login)
- Cart (add/remove/update qty, persisted)
- Checkout: address → payment → confirm
- Razorpay integration (UPI / card / netbanking)
- COD option with configurable order-value limit
- Abandoned cart recovery (WhatsApp at +2 hours)
- Customer order tracking page
- Shipping integration: Shiprocket primary, Delhivery fallback
- Customer reviews with admin moderation
- Discount + coupon engine (flat / % / festive code)
- SEO meta tags, OpenGraph, JSON-LD product schema
- Mobile-first responsive design
- Order status WhatsApp notifications (placed / shipped / out for delivery / delivered)

---

## Module 3 — Lead CRM + Ads

**Done means:** Every inquiry from any channel lands in one inbox, no lead is forgotten, owner knows which campaign produces which rupee of revenue.

- Unified lead inbox (WhatsApp + Instagram DM + Facebook + Google Ads + website form)
- Lead pipeline kanban: New → Contacted → Interested → Negotiation → Converted / Lost
- UTM tracking on every lead
- Website enquiry → CRM auto-capture webhook
- Customer tagging (VIP / Wholesale / Retail / custom)
- Auto WhatsApp follow-up sequences (D1, D3, D7 templates)
- Bulk WhatsApp broadcast (festive offers, with template approval)
- Birthday + anniversary alert automation
- Lead assignment to staff + notifications
- Follow-up reminder calendar (staff to-do)
- Meta Ads API (FB + Instagram lead forms)
- Google Ads API (lead extensions, conversion tracking)
- UTM-to-lead attribution
- Ad spend vs conversions report
- Lead source analytics dashboard
- Full customer profile (purchase history, preferences)
- Loyalty points (earn % on purchase, redeem at POS)
- Customer segmentation (high-value / dormant / new)
- Re-engagement trigger (90 days no purchase)

---

## Module 4 — Finance & Accounting

**Done means:** Owner sees real P&L per shop and consolidated, GST is filing-ready, CA can export everything to Tally in one click.

- Daily sales summary per shop + consolidated
- Multi-shop P&L statement
- Expense tracking by category
- Payroll (staff base + commission + advance)
- Gold loan tracking (pledge amount, interest, repayment schedule)
- Vendor payment records
- Bank account sync (manual reconciliation v1; auto v2)
- CGST/SGST/IGST auto-calc on every transaction
- GST filing summary (monthly + quarterly)
- Tally export (XML / CSV)
- Financial year reports
- Advance payment management
- Cash/UPI/Card daily reconciliation

---

## Module 5 — Point of Sale (POS)

**Done means:** Staff completes a sale — scan, bill, payment, WhatsApp receipt — in under 60 seconds, **even with no internet** (PWA with IndexedDB queue).

- Fast touch-optimised billing screen (web PWA, tablet-first, 1024×768+)
- Installable as PWA (add to home screen)
- Barcode scan via webcam (zxing/quagga in browser) or USB barcode scanner (keyboard wedge)
- Live gold rate on every bill (read from Redis cache via API)
- Making + stone charges per category, auto-applied
- Old gold exchange flow (weight → purity → valuation → deduction)
- GST auto-calc (CGST + SGST intra-state, IGST inter-state)
- Multiple payment modes (cash / UPI / card / cheque / gold-exchange / split / loyalty)
- Customer lookup at billing (phone number search)
- Walk-in customer support
- Loyalty points apply + redeem
- Hold bill & resume
- Staff login + role-based access
- Daily cash drawer report
- Receipt via WhatsApp + SMS fallback (PDF GST invoice)
- Thermal printer support (WebUSB or print to system default with thermal CSS)
- **Offline mode**: IndexedDB stores pending bills, service worker syncs when back online
- Conflict resolution on sync (server-authoritative on stock; idempotent on bill ID)

---

## Module 6 — Business Website

**Done means:** Jeweller has a Google-rankable, mobile-fast brand website with WhatsApp chat and contact forms wired into CRM. **Look and feel matches premium Indian jewellery brands.**

- Custom domain (subdomain in v1: `<tenant>.goldos.in`, full custom v2)
- Homepage: cinematic hero + featured collections
- About Us page (editable via admin)
- Shop locations with Google Maps embed
- WhatsApp chat widget (floating, opens chat with prefilled message)
- Trust badges (Hallmark certified, established year, GST registered)
- Blog / Articles CMS for SEO content
- Instagram feed (Meta Graph API)
- Google Business Profile sync
- Lighthouse mobile ≥ 90
- Multi-language: Hindi + English (i18next)
- Contact form → auto-capture into CRM as lead
- Festive offer banners (admin-editable)
- SSL + Cloudflare CDN

---

## Module 7 — Reports & Analytics

**Done means:** Owner opens one screen and sees everything: today's sales, profit, top products, ad ROI, staff performance — for any shop, any date range. **Visual quality of dashboards matches Linear / Vercel** — see `design-references.md`.

- Real-time sales dashboard (Server-Sent Events for live updates; WS optional later)
- Shop-wise performance comparison
- Top-selling products + categories
- Inventory valuation (live)
- Customer acquisition cost
- Daily / weekly / monthly P&L toggle
- Festive season YoY trend
- Scheduled email reports
- Low-margin product alert
- Ad ROI per campaign
- Staff sales leaderboard
- GST filing summary auto-compiled monthly
- Gold rate impact analysis
- Custom date range on every report
- Export to Excel + PDF

---

## Cross-cutting features

- **Auth:** OTP login via WhatsApp; JWT access (15min) + refresh (7d httpOnly cookie); RBAC (OWNER/MANAGER/BILLING/VIEWER)
- **Multi-tenancy:** every API request scoped by `tenantId` (subdomain or JWT claim, must agree)
- **Multi-shop:** ShopSwitcher component in admin header; "All shops" consolidated view
- **Audit log:** every write goes into an `audit_logs` table (later moved to TimescaleDB hypertable when volume warrants)
- **Notifications:** in-app (Redis pub/sub → SSE) + WhatsApp + email; per-type preferences
- **Super-admin panel** (Anantkamal team): tenant onboarding, feature flags, usage metrics, support tickets

## Feature flags (super-admin per tenant)

`ecommerce_enabled`, `website_enabled`, `ads_integration_enabled`, `tally_export_enabled`, `multi_language_enabled`, `gold_loan_enabled`
