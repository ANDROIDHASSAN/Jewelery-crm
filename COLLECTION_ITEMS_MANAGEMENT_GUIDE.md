# Collection Items Management Guide

This guide explains how to manage items within Collections in the Inventory module.

## Overview

Collections allow you to group items across categories and metals. Each collection can contain multiple items, and each item can belong to several collections simultaneously.

**Example Collections:**
- Bridal
- Festival
- Daily wear
- Corporate
- Designer
- New Arrivals

## Available Endpoints

### GET `/api/v1/inventory/collections/:collectionId/items`
**Purpose:** Get all items in a specific collection
**Returns:** List of items with details (SKU, name, images, weight, purity, status)

**Example Response:**
```json
{
  "data": [
    {
      "id": "item-1",
      "sku": "RNG-001",
      "name": "Gold Engagement Ring",
      "images": ["...url..."],
      "weightMg": 5000,
      "purityCaratX100": 2200,
      "status": "IN_STOCK"
    }
  ]
}
```

### POST `/api/v1/inventory/collections/:collectionId/items`
**Purpose:** Add one or more items to a collection
**Requires:** `inventory.write` permission
**Body:**
```json
{
  "itemIds": ["item-1", "item-2", "item-3"]
}
```

**Returns:**
```json
{
  "data": {
    "message": "Added 3 items to collection",
    "added": 3,
    "skipped": 0
  }
}
```

**Notes:**
- Automatically skips items already in the collection
- One item can be in multiple collections
- One collection can have unlimited items

### DELETE `/api/v1/inventory/collections/:collectionId/items/:itemId`
**Purpose:** Remove an item from a collection
**Requires:** `inventory.write` permission
**Returns:** 204 No Content (success)

**Notes:**
- Only removes the relationship, not the item itself
- Item stays in inventory, just removed from this collection
- Item can still be in other collections

## Data Flow

```
Inventory Items Table
    ↓
Collection (created in Collections tab)
    ↓
ItemCollection (join table)
    ↓
Manage Items (add/remove)
    ↓
CMS Auto-Sync
    ↓
Storefront Collections Display
```

## Collection Structure

| Field | Type | Purpose |
|-------|------|---------|
| **id** | UUID | Collection identifier |
| **name** | String | Display name (e.g., "Bridal") |
| **slug** | String | URL-safe identifier (e.g., "bridal") |
| **description** | String | Optional collection description |
| **sortOrder** | Int | Manual ordering priority |

## Item Collection Relationship

The `ItemCollection` join table creates a many-to-many relationship:
- One item → Multiple collections
- One collection → Multiple items

```
Item (inventory record)
  ├── Ring-001
  └── Necklace-001
        ↓ ItemCollection ↓
  Collection (Bridal)
        ↓ ItemCollection ↓
  Collection (Festival)
```

## Workflow Examples

### Example 1: Create a "Bridal" Collection with Items

**Step 1:** Create Collection
- Go to Inventory → Collections
- Enter "Bridal" as collection name
- System auto-generates slug: "bridal"

**Step 2:** Add Items to Collection
```bash
POST /api/v1/inventory/collections/{bridal-id}/items
{
  "itemIds": ["ring-1", "necklace-1", "earring-1", "bangle-1"]
}
```

**Step 3:** Verify Items Added
```bash
GET /api/v1/inventory/collections/{bridal-id}/items
```
Returns: 4 items with details

**Step 4:** Sync to CMS
- Go to Website Admin → Collections
- Click "Sync from Inventory"
- "Bridal" collection appears with count: 4

### Example 2: Move Item to Different Collection

**Step 1:** Remove from Old Collection
```bash
DELETE /api/v1/inventory/collections/{festival-id}/items/{ring-id}
```

**Step 2:** Add to New Collection
```bash
POST /api/v1/inventory/collections/{bridal-id}/items
{
  "itemIds": ["ring-id"]
}
```

### Example 3: Item in Multiple Collections

Item can be in multiple collections simultaneously:

```
Ring-001
  ├── Bridal Collection (via ItemCollection)
  ├── Designer Collection (via ItemCollection)
  └── New Arrivals Collection (via ItemCollection)
```

Add same item to multiple collections:
```bash
POST /api/v1/inventory/collections/{bridal-id}/items
{ "itemIds": ["ring-001"] }

POST /api/v1/inventory/collections/{designer-id}/items
{ "itemIds": ["ring-001"] }
```

## Best Practices

1. **Create collections before adding items**
   - Structure first, then organize items

2. **Use meaningful collection names**
   - "Bridal" not "Collection-1"
   - "Daily wear" not "Regular"

3. **Keep items organized**
   - Don't duplicate items across collections unnecessarily
   - One item in multiple collections is fine

4. **Use sort order for prominence**
   - Lower numbers appear first
   - Bridal (1), Festival (2), Daily wear (3)

5. **Sync regularly to CMS**
   - After adding items, sync to update product counts
   - Counts are auto-calculated, always current

6. **Remove items carefully**
   - Verify before removing
   - Item remains in inventory, just not in collection

## Item Eligibility

Any item in inventory can be added to any collection:
- Gold items, Silver items, Non-precious
- Serialized items, Lot items
- Any status (IN_STOCK, SOLD, etc.)

Items removed from stock but not deleted can still be in collections (for historical reference).

## Database Schema (Reference)

```sql
-- Collection definition
CREATE TABLE "Collection" (
  id UUID PRIMARY KEY,
  tenantId UUID,
  name VARCHAR(200),
  slug VARCHAR(200),
  description TEXT,
  sortOrder INT DEFAULT 0,
  createdAt TIMESTAMP
);

-- Many-to-many join
CREATE TABLE "ItemCollection" (
  itemId UUID,
  collectionId UUID,
  tenantId UUID,
  PRIMARY KEY (itemId, collectionId),
  FOREIGN KEY (itemId) REFERENCES "Item"(id) ON DELETE CASCADE,
  FOREIGN KEY (collectionId) REFERENCES "Collection"(id) ON DELETE CASCADE
);
```

## Cascading Behavior

- **Delete collection** → All ItemCollection entries deleted
- **Delete item** → All ItemCollection entries for that item deleted
- **Remove item from collection** → Only ItemCollection entry deleted, item stays

## Performance Notes

- Collections scale to thousands of items without issue
- Product counts cached and updated on sync
- Queries use indexes on tenantId and collectionId
- Real-time updates available via endpoints

## Troubleshooting

**Q: Item not appearing in collection after adding?**
- A: Verify itemId is correct. Try GET endpoint to confirm.

**Q: Can't remove item from collection?**
- A: Check that itemId and collectionId match exactly. Verify permission.

**Q: Product count not updating in CMS?**
- A: Manual sync required. Go to Website Admin → Collections → "Sync from Inventory".

**Q: Item appears in wrong collection?**
- A: Remove from old, add to new. No bulk-move endpoint yet.

## Future Enhancements

Potential future features:
- Bulk add/remove items to collections
- Collection templates
- Item visibility/status within collections
- Collection-specific pricing (override system)
- Recommended pairings (rings + earrings)
