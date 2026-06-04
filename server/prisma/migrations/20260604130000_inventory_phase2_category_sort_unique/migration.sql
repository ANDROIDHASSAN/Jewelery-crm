-- Phase 2 (inventory meeting changes): manual sub-category ordering + duplicate-name guard.
-- Additive: a defaulted column and a unique index. No existing duplicates (verified),
-- so the index creates cleanly.

-- AlterTable: manual priority order within a parent (lower = higher in the list).
ALTER TABLE "Category" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex: category name must be unique within its parent. (Main categories,
-- where parentId IS NULL, are additionally de-duplicated in the service layer
-- since Postgres treats NULLs as distinct in a unique index.)
CREATE UNIQUE INDEX "Category_tenantId_parentId_name_key" ON "Category"("tenantId", "parentId", "name");
