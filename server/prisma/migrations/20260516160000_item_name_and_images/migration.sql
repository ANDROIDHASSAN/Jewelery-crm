-- Item: add display name + product images array.
-- Both are nullable / default-empty so the migration is safe to apply on a
-- live DB; backfill happens implicitly because Postgres uses the default
-- for existing rows.

ALTER TABLE "Item" ADD COLUMN "name" TEXT;
ALTER TABLE "Item" ADD COLUMN "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
