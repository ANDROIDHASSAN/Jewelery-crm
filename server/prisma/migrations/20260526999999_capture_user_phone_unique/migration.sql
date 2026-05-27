-- Captures the User(tenantId, phone) unique index that already exists in the
-- live DB but had drifted from Prisma's recorded migration history. The
-- 20260516120000_rbac_and_pos_v2 migration created this index as a *partial*
-- unique (WHERE phone IS NOT NULL); newer Prisma versions compare that
-- against the schema's `@@unique([tenantId, phone])` and report drift even
-- though the constraint exists.
--
-- This migration is intentionally idempotent: every statement uses
-- IF NOT EXISTS / IF EXISTS so it's safe to run against a database that
-- already has the index (which it does — that's the whole point). On a
-- fresh database rebuild from scratch the partial unique created by
-- rbac_and_pos_v2 is left in place; we do not drop it here because the
-- partial form is the intentional schema choice (allow multiple users with
-- NULL phone per tenant) and migrating to a full unique would break that.
--
-- The recorded history is the goal; the DB state must not change.

CREATE UNIQUE INDEX IF NOT EXISTS "User_tenantId_phone_key"
  ON "User" ("tenantId", "phone")
  WHERE "phone" IS NOT NULL;
