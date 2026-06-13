-- CreateEnum
CREATE TYPE "StockRequestStatus" AS ENUM ('PENDING', 'FULFILLED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "StockRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "status" "StockRequestStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "requestedByUserId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewNote" TEXT,
    "fulfilledTransferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "StockRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockRequestLine" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "categoryId" TEXT,
    "collectionId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,

    CONSTRAINT "StockRequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockRequest_fulfilledTransferId_key" ON "StockRequest"("fulfilledTransferId");

-- CreateIndex
CREATE INDEX "StockRequest_tenantId_idx" ON "StockRequest"("tenantId");

-- CreateIndex
CREATE INDEX "StockRequest_tenantId_status_idx" ON "StockRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "StockRequest_tenantId_shopId_idx" ON "StockRequest"("tenantId", "shopId");

-- CreateIndex
CREATE INDEX "StockRequest_tenantId_createdAt_idx" ON "StockRequest"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "StockRequestLine_requestId_idx" ON "StockRequestLine"("requestId");

-- AddForeignKey
ALTER TABLE "StockRequest" ADD CONSTRAINT "StockRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRequest" ADD CONSTRAINT "StockRequest_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRequest" ADD CONSTRAINT "StockRequest_fulfilledTransferId_fkey" FOREIGN KEY ("fulfilledTransferId") REFERENCES "Transfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRequestLine" ADD CONSTRAINT "StockRequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "StockRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRequestLine" ADD CONSTRAINT "StockRequestLine_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRequestLine" ADD CONSTRAINT "StockRequestLine_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
