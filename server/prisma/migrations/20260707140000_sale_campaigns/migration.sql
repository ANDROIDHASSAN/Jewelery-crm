-- Season Sales v2: multiple simultaneous campaigns.
--
-- Was: one universal discount on the Tenant + a flat SaleItem membership list.
-- Now: a SaleCampaign holds one offer (PERCENT / FLAT / BOGO) over a set of
-- items; many campaigns run at once (one admin tab each). SaleItem.campaignId
-- links each item to its campaign. The offer applies on storefront AND POS.
--
-- Backfill preserves existing data: each tenant that currently has sale items
-- gets one "Season Sale" campaign carrying its existing universal offer, and
-- every existing SaleItem is attached to it. The legacy Tenant.seasonSale*
-- columns are left in place (unread) so this migration is non-destructive.

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "campaignId" TEXT;

-- CreateTable
CREATE TABLE "SaleCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discountType" "SaleDiscountType" NOT NULL DEFAULT 'PERCENT',
    "discountBps" INTEGER NOT NULL DEFAULT 0,
    "discountFlatPaise" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaleCampaign_tenantId_idx" ON "SaleCampaign"("tenantId");

-- CreateIndex
CREATE INDEX "SaleItem_campaignId_idx" ON "SaleItem"("campaignId");

-- AddForeignKey
ALTER TABLE "SaleCampaign" ADD CONSTRAINT "SaleCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SaleCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one "Season Sale" campaign per tenant with existing sale items,
-- carrying that tenant's current universal offer (BOGO wins if its toggle was on).
INSERT INTO "SaleCampaign" ("id", "tenantId", "name", "discountType", "discountBps", "discountFlatPaise", "isActive", "sortOrder", "createdAt")
SELECT gen_random_uuid()::text, t."id", 'Season Sale',
       CASE WHEN t."seasonSaleBogo" THEN 'BOGO'::"SaleDiscountType" ELSE t."seasonSaleDiscountType" END,
       t."seasonSaleDiscountBps", t."seasonSaleDiscountFlatPaise", true, 0, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "SaleItem" si WHERE si."tenantId" = t."id");

-- Attach every existing membership to its tenant's new campaign.
UPDATE "SaleItem" si
SET "campaignId" = sc."id"
FROM "SaleCampaign" sc
WHERE sc."tenantId" = si."tenantId" AND si."campaignId" IS NULL;
