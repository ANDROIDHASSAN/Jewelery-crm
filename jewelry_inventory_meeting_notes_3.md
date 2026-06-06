# Meeting Notes: Admin Panel Walkthrough — CRM, Analytics, POS & Storefront

**Meeting:** Admin Panel Feature Walkthrough
**Participants:** Speaker 1 (Developer) · Speaker 2 (Client)
**Topic:** CRM / Lead Pipeline, Analytics, POS, Reservations, Inventory & Storefront Sync
**Note:** ⚠️ Audio dropout in several sections — notes reflect only recoverable content.

---

## Summary

Developer walked through the admin panel covering: CRM lead pipeline, WhatsApp broadcast, ad campaign integration, analytics (revenue, P&L, staff performance), POS with park bills and reservations, inventory transfer, and storefront category/collection display. Client raised multiple feature requests and bugs during the walkthrough.

---

## Sections Covered

### 1. CRM — Lead Pipeline

- Leads are auto-generated when a user signs up or adds a product to cart on the website.
- Leads from **WhatsApp, Instagram, Facebook** will also flow into the CRM once APIs are integrated.
- Lead pipeline has **drag-and-drop Kanban view**: New → Contacted → Interested → Negotiation → Converted.
- **Follow-ups section** planned — will show all contacts reached out to, upcoming follow-ups, and status.
- **Conversion funnel report** available — shows how many leads converted at each stage.
- Channels view shows lead source (website, Instagram Ads, Meta Ads, etc.).

> **Client note:** Meta/Google Ads integration must be done after storefront goes live. API keys from client required to connect.

---

### 2. WhatsApp Broadcast

- Pre-built templates available:
  - Festive Offer
  - New Collection
  - Rate Update
  - Birthday / Anniversary (mentioned partially)
- Admin can select a template and send broadcast to **all leads** via WhatsApp Business account.
- Client must set up WhatsApp Business account and connect it before broadcast works.
- Follow-up messages can also be sent from this section.

---

### 3. Analytics

- **Real-time dashboard** with filters: Today, Last 7 Days, Last 30 Days, Last 90 Days.
- Shows: Revenue, Number of Bills, Sales Trend (date-wise graph), New Leads count.
- **P&L (Profit & Loss)** section with Daily / Weekly / Monthly filters; shop-wise filter also available.
- **Staff leaderboard** — staff performance visible per shop.
- **Top Products** — currently shows item-wise best sellers. *(See feature request below for category-wise view.)*
- **Inventory Valuation** — category-wise valuation of current stock. Updates instantly when items are transferred or re-categorised.
- **Low Stock** section — currently shows item + sub-category. Client wants main category to appear as well.

---

### 4. POS — Point of Sale

- **Park Bills feature:** If billing is in progress and a VIP customer arrives, the current bill can be parked and a new billing session started. Parked bills are visible on the dashboard.
- **Reservation orders** placed from the storefront appear in:
  - Dashboard (reserved bill view)
  - Channels → E-commerce → Orders
  - Reservations section
- Reserved items are held for the customer to pay in-store.

---

### 5. Inventory Transfer

- Stock transfers between branches are managed by admin.
- Admin marks transfer as complete once stock physically arrives at the destination branch.
- **Bug reported:** POS shows double inventory for items that exist in multiple branches. *(Carried over from previous meeting.)*

---

### 6. Storefront — Category & Collection Display

- Website navigation syncs from Categories via the **"Sync from Categories"** button.
- Client wants a single item to appear in **multiple sections** of the website simultaneously:
  - Main category page
  - Collections
  - New Arrivals
  - Best Sellers
  - *(Up to ~6 locations mentioned)*
- **Key concern from client:** Even if an item appears in 6 places on the storefront, it should exist only **once** in the admin panel inventory — no duplication of stock records.

---

### 7. SKU / Item Number Prefix

- Client wants a **SKU prefix format** that includes the category code + item number.
- To be formatted and confirmed.
- Item slips/receipts should always include **item name and item description**.
- Currently, description exists in the e-commerce channel section but not centrally — client wants it set once and reflected everywhere.

---

### 8. Meta Ads Expense Auto-fetch

- Client wants Meta Ads spend to be **automatically fetched** into the Expenses / Ledger section.
- Currently, expenses can be booked manually in the ledger.
- Auto-fetch of Meta Ads costs via API integration requested.

---

## Feature Requests

| # | Feature | Detail |
|---|---------|--------|
| 1 | **Item visible in multiple storefront sections** | One item should show in category, collections, new arrivals, best sellers, etc. — but remain a single inventory record in admin. Dev noted: "Show in multi-categories in storefront only; in admin panel always show only once." |
| 2 | **Main category label in Low Stock view** | Low Stock currently shows item + sub-category. Main category name should also be shown. |
| 3 | **Category-wise analytics in Top Products** | Top Products currently item-wise. Client wants main category view as primary focus. |
| 4 | **POS — store-specific inventory filter** | POS should show only the stock of the selected/logged-in store, not all stores combined (to fix double-display issue). |
| 5 | **Item description — single source of truth** | Item description set once in inventory/item master should reflect on website, receipts, and all other places automatically. |
| 6 | **SKU prefix with category code** | Auto-generate SKU in format: [Category Code] + [Item Number]. Format to be finalised. |
| 7 | **Meta Ads expense auto-fetch** | Pull Meta Ads spend automatically into the ledger/expenses section via API. |
| 8 | **Auto flash / inquiry form on website visit** | When a user opens the website, an auto pop-up/inquiry form should appear to capture contact details. Requires user to provide info voluntarily — not automatic. |
| 9 | **Category-wise POS product listing** | POS product selection should show main category → sub-category → items (dropdown flow), not a flat list. |

---

## Bugs Noted

| # | Bug | Detail |
|---|-----|--------|
| 1 | **Purity auto-changing to Silver/Non-Precious** | Item entered as Gold Tone is being detected/saved as Silver. Root cause: purity is currently fixed to "Non-Precious" globally. Fix pending from previous meeting. |
| 2 | **Double inventory in POS** | Items appearing twice in POS because they exist in multiple branches. Needs store-specific inventory filter in POS. |
| 3 | **Item category not showing correctly in analytics** | Item added under "18 Karat Gold Tone" showing as "General" in inventory valuation because sub-category was not properly selected during item creation. Not a bug — user error, but UI should guide better. |
| 4 | **Item edit/delete not working for transferred items** | Client reported that a transferred item could not be edited or deleted. Dev confirmed delete is intentionally disabled for items with activity; edit should work — to be checked. |

---

## Action Items

| # | Action | Owner |
|---|--------|-------|
| 1 | Allow single item to appear in multiple storefront sections without duplicating inventory record | Dev |
| 2 | Add main category label to Low Stock view | Dev |
| 3 | Add main category as primary grouping in Top Products / Analytics | Dev |
| 4 | Add store-specific inventory filter in POS | Dev |
| 5 | Make item description single-source: set once, reflect everywhere | Dev |
| 6 | Define and implement SKU prefix format (category code + item number) | Dev + Client |
| 7 | Integrate Meta Ads API for auto-fetch of ad spend into ledger | Dev (post storefront launch) |
| 8 | Add website inquiry pop-up / auto flash form | Dev |
| 9 | Add main category → sub-category dropdown flow in POS product selection | Dev |
| 10 | Fix purity defaulting to Non-Precious for gold items | Dev *(carried over)* |
| 11 | Investigate transferred item edit/delete issue | Dev |
| 12 | Connect Meta / Google Ads API keys for CRM lead integration | Client (post storefront) |
| 13 | Set up WhatsApp Business account and connect for broadcast | Client |

---

> **Note:** Audio dropout was significant in this session. Some details — particularly around distributions, purchase orders, and the promo/voucher section mentioned at the end — were not recoverable. Client mentioned a promo/coupon feature to be handled separately later.
