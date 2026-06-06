-- SKU uniqueness is now per (tenant, shop) instead of per tenant globally.
-- This allows the same SKU to exist at multiple shops — required for lot
-- transfers where the source row moves to the destination shop in place.

-- Drop old tenant-wide constraint
DROP INDEX IF EXISTS "Item_tenantId_sku_key";

-- Add new per-shop constraint
CREATE UNIQUE INDEX "Item_tenantId_shopId_sku_key" ON "Item"("tenantId", "shopId", "sku");
