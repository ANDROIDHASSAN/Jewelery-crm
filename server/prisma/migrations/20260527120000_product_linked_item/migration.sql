-- Bridge Product (storefront) ↔ Item (inventory) so an admin-created stock
-- row can mirror itself onto the public catalog and the storefront can
-- render a live "Sold out" badge based on the inventory row's status /
-- quantityOnHand.
--
-- Forward-only, additive, safe to deploy with active traffic: the new
-- column is nullable, every existing Product row stays valid, and no
-- existing query path reads it (until the application code does).

ALTER TABLE "Product"
  ADD COLUMN "linkedItemId" TEXT;

-- One Product per Item — same constraint at the DB level so concurrent
-- linkers can't both succeed. Partial unique index keeps NULL rows free
-- (Postgres treats NULLs as distinct in a plain unique, but the explicit
-- partial form makes intent obvious).
CREATE UNIQUE INDEX "Product_linkedItemId_key"
  ON "Product" ("linkedItemId")
  WHERE "linkedItemId" IS NOT NULL;

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_linkedItemId_fkey"
  FOREIGN KEY ("linkedItemId") REFERENCES "Item"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
