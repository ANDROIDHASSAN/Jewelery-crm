-- Add nullable "gender" ("MEN" / "WOMEN", null = unspecified/unisex) to the
-- inventory Item, its storefront Product mirror, and the PurchaseOrderItem line.
ALTER TABLE "Item" ADD COLUMN "gender" TEXT;
ALTER TABLE "Product" ADD COLUMN "gender" TEXT;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "gender" TEXT;

-- Backfill existing inventory with a random MEN/WOMEN so the storefront
-- "Shop by Gender" filter has data to show immediately (requested for the
-- initial rollout — staff can correct individual pieces from the item editor).
UPDATE "Item"
SET "gender" = CASE WHEN random() < 0.5 THEN 'MEN' ELSE 'WOMEN' END
WHERE "gender" IS NULL;

-- Keep each published Product in lockstep with its linked Item's gender; for
-- legacy products with no linked item, assign a random value too.
UPDATE "Product" p
SET "gender" = i."gender"
FROM "Item" i
WHERE p."linkedItemId" = i."id" AND p."gender" IS NULL;

UPDATE "Product"
SET "gender" = CASE WHEN random() < 0.5 THEN 'MEN' ELSE 'WOMEN' END
WHERE "gender" IS NULL;
