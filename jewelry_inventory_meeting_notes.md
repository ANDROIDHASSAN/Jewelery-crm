# Meeting Notes: Jewelry Inventory System Changes

**Meeting:** Walkthrough of Inventory & Catalog Management System
**Participants:** Speaker 1 (Developer) · Speaker 2 (Client)
**Topic:** Jewelry Platform — Category, Item & Storefront Updates

---

## Summary

Walkthrough of the inventory/category management system. Covered category and sub-category creation, item-level configuration (metal type, purity, making charges, stone details), and website storefront sync. Client requested several new features and raised issues with current system behavior.

---

## Decisions & Confirmations

| # | Topic | Decision |
|---|-------|----------|
| 1 | **Category structure** | 3 main categories: 18K GOLD TONE(Stainless Steel type metal), 9 K FINE GOLD, 925 STERLING SILVER. Sub-categories: Rings, Bracelets, Earrings, Necklaces/Chains.etc |
| 2 | **Making charge default** | Set to ₹ /per gram for all main categories. Both flat per-gram and percentage options to be supported. Item-level overrides allowed. |
| 3 | **Default purity** | Purity selector should default to 9 carat. Options for 9, 14, and 18 carat to remain. |
| 4 | **Category delete rule** | A category/sub-category cannot be deleted if it has existing items. System must show a notification with item count before deletion. |
| 5 | **Storefront visibility toggle** | Items can be hidden from the storefront via a checkbox in the e-commerce section of the admin panel, without deleting the item from inventory. |
| 6 | **Category sync to website nav** | Main categories sync to website navigation via the "Sync from Categories" button. Takes ~10 seconds to reflect on the storefront. |

---

## Feature Requests

### 1. Collections option on categories *(New Feature)*
- A **Collections** field must be available when adding or editing a category or item.
- Examples: Bridal Collection, Festival Collection, Corporate Collection.
- Collections can mix items across categories and metal types.

### 2. Stainless Steel as metal type *(New Feature)*
- Add **Stainless Steel** as a metal type option in the item add/edit form.
- Should reflect as a non-precious metal in the purity field.

### 3. Barcode / QR scanner support *(New Feature)*
- For warehouse operations and item distribution, scanning support is required so staff don't need to manually enter item root/lot numbers.
- To be scoped and logged as a separate feature ticket.

### 4. Diamond details fields *(New Feature)*
- Items with diamonds need dedicated fields for:
  - Diamond weight
  - Cut
  - Clarity
  - Color (4 Cs grading)
- Multiple diamond shapes/grades per item should be supported.
- Client will share a cut/clarity grading chart.

### 5. Making charge — flat per-gram input *(New Feature)*
- Add a **"Making Charge per gram"** field on category settings that accepts a flat rupee amount (e.g. ₹2/gram).
- Should co-exist alongside the existing percentage-based making charge option.

### 6. Sub-category manual sort / priority ordering *(New Feature)*
- Sub-categories currently appear in alphabetical order.
- Client wants manual priority ordering so high-priority categories (e.g. Necklaces, Chains) appear at the top regardless of name.

---

## Issues / Bugs Noted

### Bug 1 — Non-precious metal showing in gold sub-categories
- In the item add form under 18 Karat Gold, the purity field shows "Non-precious" in 3 out of 4 sub-categories.
- Should only appear for stainless steel / non-gold items.
- **Action:** Investigate and fix.

### Bug 2 — Duplicate sub-category names allowed
- The system currently allows adding a sub-category with the same name (e.g. "Rings" added twice).
- Both appear in the list with no warning or deduplication.
- **Action:** Add duplicate name validation and/or warning.

---

## Action Items

| # | Action | Owner |
|---|--------|-------|
| 1 | Add "Collections" field to category and item add/edit forms | Dev |
| 2 | Add Stainless Steel as a metal type option in item form | Dev |
| 3 | Scope and log barcode/QR scanner as a new feature ticket | Dev |
| 4 | Add diamond detail fields (weight, cut, clarity, color) to item form | Dev |
| 5 | Add per-gram making charge flat-amount input to category settings | Dev |
| 6 | Set default purity selector to 9 carat | Dev |
| 7 | Add manual priority ordering for sub-categories | Dev |
| 8 | Fix: Non-precious metal purity showing incorrectly in gold sub-categories | Dev |
| 9 | Add duplicate sub-category name validation/warning | Dev |


---


