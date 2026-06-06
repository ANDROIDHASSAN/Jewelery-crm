# Meeting Notes: Jewelry Inventory System — Follow-up Discussion

**Meeting:** Follow-up on Inventory System Changes
**Participants:** Speaker 1 (Developer) · Speaker 2 (Client)
**Note:** ⚠️ Audio quality was poor — large portions of the recording were lost to dropout. Notes below reflect only the recoverable segments.

---

## Summary

Short follow-up discussion continuing from the previous meeting. Topics touched on diamond & gold pricing structure for items, a bug with items showing double in inventory across branches, and a reminder that the client is holding off on entering inventory data until key features (per-gram making charge, stainless steel metal type) are ready.

---

## Points Discussed

### 1. Diamond + Gold pricing structure on a single item
- Example discussed: a ring that contains both gold and a diamond.
- **Client's requirement:** Gold cost and diamond cost should be booked/tracked separately per item.
- Gold is priced at ₹30,000 per carat (purchase price).
- A single item may have multiple diamonds of different shapes and carat weights — each needs to be recorded individually.
- **Outcome:** Developer acknowledged the requirement. To be handled via the diamond detail fields (carried over from previous meeting).

### 2. Bug — Items showing double in inventory (transfer issue)
- Client reported that when transferring items, they appeared duplicated in the inventory list.
- **Root cause (identified by dev):** When an item exists in two branches (e.g. Main Showroom and Kernel Branch), it shows twice in the inventory view — once per branch.
- This is expected behavior given the current multi-branch structure, but needs clearer display/labeling so it doesn't appear as a data error.
- **Action:** Review inventory list view to add branch labels and prevent confusion with actual duplicates.

### 3. Client holding off on inventory entry
- Client confirmed they will **not begin entering inventory data** until the following are implemented:
  - Per-gram making charge option
  - Stainless steel as a metal type
  - Other pending features from the previous meeting
- **Action:** Developer to prioritize and deliver all pending changes together in one release before client starts data entry.

---

## Action Items

| # | Action | Owner |
|---|--------|-------|
| 1 | Implement separate cost fields for gold and diamond on a single item | Dev |
| 2 | Fix/clarify inventory list view for multi-branch items (avoid double-display confusion) | Dev |
| 3 | Deliver all pending features (making charge per gram, stainless steel, collections, diamond fields, etc.) as a single release | Dev |

---

> **Note:** This transcript had significant audio loss. Several important details may be missing. Recommend confirming the above points with the client directly before acting on them.
