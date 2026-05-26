-- Stock transfer workflow: warehouse <-> shop, shop <-> shop.
-- State machine: PENDING -> APPROVED -> COMPLETED (or REJECTED from PENDING).
-- Item rows are not multiplied; a transfer carries N TransferLine rows, one
-- per Item that's moving. Items stay at source shopId until COMPLETED.

-- 1. Shop.isWarehouse flag
ALTER TABLE "Shop" ADD COLUMN "isWarehouse" BOOLEAN NOT NULL DEFAULT false;

-- 2. TransferStatus enum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'APPROVED', 'COMPLETED', 'REJECTED');

-- 3. Transfer table
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromShopId" TEXT NOT NULL,
    "toShopId" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "requestedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "completedByUserId" TEXT,
    "rejectedByUserId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Transfer_tenantId_idx"             ON "Transfer"("tenantId");
CREATE INDEX "Transfer_tenantId_status_idx"      ON "Transfer"("tenantId", "status");
CREATE INDEX "Transfer_tenantId_fromShopId_idx"  ON "Transfer"("tenantId", "fromShopId");
CREATE INDEX "Transfer_tenantId_toShopId_idx"    ON "Transfer"("tenantId", "toShopId");
CREATE INDEX "Transfer_tenantId_createdAt_idx"   ON "Transfer"("tenantId", "createdAt");

ALTER TABLE "Transfer"
    ADD CONSTRAINT "Transfer_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Transfer"
    ADD CONSTRAINT "Transfer_fromShopId_fkey"
    FOREIGN KEY ("fromShopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Transfer"
    ADD CONSTRAINT "Transfer_toShopId_fkey"
    FOREIGN KEY ("toShopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. TransferLine table
CREATE TABLE "TransferLine" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "TransferLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransferLine_transferId_itemId_key" ON "TransferLine"("transferId", "itemId");
CREATE INDEX "TransferLine_itemId_idx" ON "TransferLine"("itemId");

ALTER TABLE "TransferLine"
    ADD CONSTRAINT "TransferLine_transferId_fkey"
    FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TransferLine"
    ADD CONSTRAINT "TransferLine_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
