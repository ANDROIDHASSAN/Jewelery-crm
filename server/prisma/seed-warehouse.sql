-- One-time helper: flip an existing Shop to WAREHOUSE so the transfer
-- workflow has a source node. NOT part of the migration history — run
-- this manually once per environment (psql or Neon SQL console).
--
-- Strategy:
--   1. List all shops + their current type so you can see what you have.
--   2. Try to promote any shop whose name contains "warehouse" (case-insensitive).
--   3. If nothing matched, the second SELECT prints a reminder telling you
--      to pick a shop by ID and re-run the UPDATE manually.
--
-- The UPDATE keeps `type` and the legacy `isWarehouse` boolean in lockstep
-- so older code paths reading `isWarehouse` keep working.
--
-- Usage (Neon SQL editor or psql connected to your DB):
--   \i server/prisma/seed-warehouse.sql
-- or copy-paste the statements one block at a time.

-- 1. List shops so you know what's there.
SELECT id, name, "type", "isWarehouse"
FROM "Shop"
ORDER BY name;

-- 2. Try the convention-based promotion. RETURNING shows what changed (if anything).
UPDATE "Shop"
SET "type" = 'WAREHOUSE',
    "isWarehouse" = true
WHERE "name" ILIKE '%warehouse%'
  AND "type" <> 'WAREHOUSE'
RETURNING id, name, "type", "isWarehouse";

-- 3. If the UPDATE above returned 0 rows, pick a shop ID from step (1) and
--    run this manual version with the right id:
--
--      UPDATE "Shop"
--      SET "type" = 'WAREHOUSE', "isWarehouse" = true
--      WHERE id = '<paste-shop-id-here>'
--      RETURNING id, name, "type", "isWarehouse";
--
--    No "warehouse"-named shop exists yet — pick the central one (or
--    create a new shop via the admin UI / `POST /api/v1/shops` with
--    `type: 'WAREHOUSE'`) before re-running.
