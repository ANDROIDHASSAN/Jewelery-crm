-- Phase 4 (storefront): one product in many homepage sections, single inventory record.
-- Additive only: a new enum + one new table with indexes + FKs. Existing rows/queries unaffected.

-- CreateEnum
CREATE TYPE "StorefrontSection" AS ENUM ('NEW_ARRIVAL', 'BEST_SELLER', 'FEATURED', 'TRENDING', 'DEAL');

-- CreateTable
CREATE TABLE "ProductSection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "section" "StorefrontSection" NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductSection_tenantId_idx" ON "ProductSection"("tenantId");
CREATE INDEX "ProductSection_tenantId_section_idx" ON "ProductSection"("tenantId", "section");
CREATE UNIQUE INDEX "ProductSection_productId_section_key" ON "ProductSection"("productId", "section");

-- AddForeignKey
ALTER TABLE "ProductSection" ADD CONSTRAINT "ProductSection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductSection" ADD CONSTRAINT "ProductSection_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
