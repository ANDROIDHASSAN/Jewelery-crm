-- Phase 3 (inventory meeting changes): collections, diamond details, item description, SKU code.
-- Additive only: two nullable columns and three new tables with their indexes + FKs.
-- No existing rows or queries are affected.

-- AlterTable: SKU category-code prefix.
ALTER TABLE "Category" ADD COLUMN "code" TEXT;

-- AlterTable: master item description (single source of truth).
ALTER TABLE "Item" ADD COLUMN "description" TEXT;

-- CreateTable: curated cross-category collections (Bridal, Festival, ...).
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Item <-> Collection many-to-many (one inventory record, many collections).
CREATE TABLE "ItemCollection" (
    "itemId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ItemCollection_pkey" PRIMARY KEY ("itemId","collectionId")
);

-- CreateTable: one diamond/stone line per row; an item can have several.
CREATE TABLE "ItemDiamond" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "shape" TEXT,
    "caratWeightX100" INTEGER NOT NULL DEFAULT 0,
    "cut" TEXT,
    "clarity" TEXT,
    "color" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "costPaise" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ItemDiamond_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Collection_tenantId_idx" ON "Collection"("tenantId");
CREATE UNIQUE INDEX "Collection_tenantId_slug_key" ON "Collection"("tenantId", "slug");
CREATE INDEX "ItemCollection_tenantId_idx" ON "ItemCollection"("tenantId");
CREATE INDEX "ItemCollection_collectionId_idx" ON "ItemCollection"("collectionId");
CREATE INDEX "ItemDiamond_tenantId_idx" ON "ItemDiamond"("tenantId");
CREATE INDEX "ItemDiamond_itemId_idx" ON "ItemDiamond"("itemId");

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemCollection" ADD CONSTRAINT "ItemCollection_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemCollection" ADD CONSTRAINT "ItemCollection_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemCollection" ADD CONSTRAINT "ItemCollection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemDiamond" ADD CONSTRAINT "ItemDiamond_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemDiamond" ADD CONSTRAINT "ItemDiamond_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
