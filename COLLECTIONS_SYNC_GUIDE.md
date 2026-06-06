# Collections Sync Guide

This guide explains how the CMS "Shop by occasion" collections sync with Inventory collections, with real-time product counts.

## Overview

The "Shop by occasion" section in the Website CMS now automatically syncs with Collections created in the Inventory module. Product counts are calculated dynamically based on items in each collection.

## Features

✅ **Auto-sync from Inventory** - One-click sync button to pull all inventory collections
✅ **Dynamic product counts** - Automatically calculated from actual items in each collection  
✅ **Image preservation** - Existing images are preserved during sync
✅ **Manual edit** - Still allows manual tile creation and image uploads
✅ **Real-time updates** - Changes in Inventory are reflected in CMS

## How It Works

### 1. **Create Collections in Inventory**
First, create collections in the Inventory module:
- Go to **Inventory** → **Settings** → **Collections**
- Create collections like "Bridal", "Daily wear", "Festive", etc.
- Each collection automatically gets a slug (e.g., "bridal", "daily-wear")

### 2. **Assign Products to Collections**
In Inventory, when adding items:
- Products are automatically assigned to collections
- Product counts are calculated from ItemCollection entries

### 3. **Sync to CMS**
In Website Admin → Collections tab:
1. Click **"Sync from Inventory"** button
2. The CMS automatically:
   - Fetches all collections from Inventory
   - Calculates product counts for each
   - Preserves existing images
   - Updates the shop-by-occasion tiles

4. Click **"Publish"** to save changes to the storefront

## Available Endpoints

### GET `/api/v1/website/sync-collections-from-inventory`
**Returns:** List of all inventory collections with product counts
```json
{
  "data": [
    { "name": "Bridal", "slug": "bridal", "count": 45 },
    { "name": "Daily wear", "slug": "daily-wear", "count": 120 }
  ]
}
```

### POST `/api/v1/website/auto-sync-collections`
**Purpose:** Sync and update storefront content with inventory collections
**Returns:** Updated shop-by-occasion tiles with synced data
```json
{
  "data": {
    "message": "Collections synced successfully",
    "synced": 6,
    "collections": [
      { "name": "Bridal", "slug": "bridal", "count": 45, "img": "..." }
    ]
  }
}
```

## CMS Fields

| Field | Type | Behavior |
|-------|------|----------|
| **Tile name** | Text (editable) | Synced from Inventory, can edit in CMS |
| **Collection slug** | Text (editable) | Synced from Inventory, do not change unless needed |
| **Product count** | Number (read-only) | Auto-calculated from Inventory items |
| **Image** | File upload | Manual upload, preserved across syncs |

## Workflow

```
Inventory (Source of Truth)
    ↓
Create Collections
    ↓
Assign Products to Collections
    ↓
CMS Website Admin
    ↓
Click "Sync from Inventory"
    ↓
Collections + Product Counts Populated
    ↓
Upload Images (Optional)
    ↓
Click "Publish"
    ↓
Live on Storefront
```

## Data Flow

1. **Inventory Module**
   - Collections table: name, slug, description, sortOrder
   - ItemCollection table: links items to collections

2. **Sync Process**
   - Query `Collection` where `tenantId = current`
   - For each collection, COUNT rows in `ItemCollection`
   - Return collections with counts

3. **CMS Storage**
   - StorefrontContent.shopByOccasion array
   - Structure: `{ name, slug, count, img }`
   - Synced whenever "Sync from Inventory" is clicked

4. **Storefront Display**
   - 6-tile grid showing collections
   - Product count shown on each tile
   - Links to collection filter page

## Manual vs Synced

### Synced from Inventory
- ✅ Collection name
- ✅ Collection slug
- ✅ Product count (updated every sync)

### Manual in CMS
- 📸 Collection image (upload locally or paste URL)
- ➕ Add custom tiles not in Inventory (optional)
- 🗑️ Remove tiles from display (sync again to restore)

## Best Practices

1. **Always create collections in Inventory first** - Don't create them in CMS
2. **Sync after adding new collections** - Click "Sync from Inventory" to see them
3. **Upload images in CMS** - Add compelling images after syncing
4. **Publish after changes** - Click "Publish" to make changes live
5. **Don't edit name/slug in CMS** - Sync again if you change names in Inventory

## Sync Behavior

| Scenario | What Happens |
|----------|--------------|
| New collection in Inventory | Appears in CMS after sync, no image yet |
| Collection renamed in Inventory | Name updates in CMS on next sync |
| Product count changes in Inventory | Updates in CMS on next sync |
| Image uploaded in CMS | Preserved across syncs |
| Collection deleted in Inventory | Removed from CMS on next sync |
| Image manually set in CMS | Kept even if collection synced again |

## Troubleshooting

**Q: Product count shows 0 but I have items in that collection**
- A: Items might not be assigned to the collection in Inventory. Check ItemCollection entries.

**Q: My image disappeared after sync**
- A: Images are preserved. Check if the collection slug changed in Inventory.

**Q: Sync button not working**
- A: Check browser console for errors. Ensure you have admin permissions.

**Q: New collection in Inventory not appearing**
- A: Click "Sync from Inventory" again. Sometimes takes 10s for cache to expire.

## Technical Details

### Sync Endpoint Logic
```typescript
1. Get all Collection records for tenantId
2. For each collection:
   - Count ItemCollection entries
   - Preserve existing image from shopByOccasion
3. Merge with current storefront content
4. Update StorefrontContent in database
5. Increment version counter
6. Bust cache
```

### Product Count Query
```sql
SELECT COUNT(*) FROM "ItemCollection"
WHERE "tenantId" = $1 AND "collectionId" = $2
```

### Cache Behavior
- Synced data: Uses current database values
- Storefront CDN: 10-second cache, invalidated on publish
- Changes live within ~10 seconds

## Notes

- **No API key needed** - Sync uses server-side tenant context
- **Atomic updates** - All-or-nothing sync, no partial updates
- **Backward compatible** - Manual collections still work alongside synced ones
- **Version tracking** - StorefrontContent.version incremented on each sync
