-- Hybrid inventory model + ShopType enum.
--
-- Adds:
--   * Item.isSerialized (default true)  — true = unique piece per row,
--                                          false = lot tracked by quantityOnHand.
--   * Item.quantityOnHand (default 1)   — live count for lot items;
--                                          always 1 for serialized rows.
--   * TransferLine.quantity (default 1) — number of units moved per line
--                                          (1 for serialized, N for lot).
--   * ShopType enum + Shop.type         — canonical retail-vs-warehouse field.
--                                          isWarehouse retained for backward
--                                          compatibility; mirrored at write time.
--
-- Defaults make this safe to apply to existing data:
--   - Every existing Item row becomes isSerialized=true / quantityOnHand=1,
--     which matches the historical "one row = one piece" model.
--   - Every existing TransferLine becomes quantity=1, matching prior semantics.
--   - Every existing Shop becomes type='RETAIL' by default; we then promote
--     rows that already have isWarehouse=true to type='WAREHOUSE' so the two
--     fields are consistent on day one.
--
-- To mark a shop as a WAREHOUSE manually (after this migration is applied),
-- run:
--   UPDATE "Shop"
--   SET "type"='WAREHOUSE', "isWarehouse"=true
--   WHERE id='<shopId>';

-- 1. ShopType enum
CREATE TYPE "ShopType" AS ENUM ('WAREHOUSE', 'RETAIL');

-- 2. Shop.type column (default RETAIL) — backfill from isWarehouse so the
--    two fields are aligned for every existing row.
ALTER TABLE "Shop" ADD COLUMN "type" "ShopType" NOT NULL DEFAULT 'RETAIL';
UPDATE "Shop" SET "type" = 'WAREHOUSE' WHERE "isWarehouse" = true;

-- 3. Item hybrid columns.
ALTER TABLE "Item" ADD COLUMN "isSerialized"   BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Item" ADD COLUMN "quantityOnHand" INTEGER NOT NULL DEFAULT 1;

-- 4. TransferLine quantity (defaults to 1 — existing rows = 1 piece per line).
ALTER TABLE "TransferLine" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;

-- 5. Composite index that powers the typical inventory listing path
--    (tenant + shop + category + status + serialized vs lot).
CREATE INDEX "Item_tenantId_shopId_categoryId_status_isSerialized_idx"
  ON "Item" ("tenantId", "shopId", "categoryId", "status", "isSerialized");
