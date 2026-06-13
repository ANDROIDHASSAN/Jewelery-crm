-- Season Sale membership: one row per item on sale, with a per-item percentage
-- discount (basis points). Mirrors ItemCollection but standalone + discount.
CREATE TABLE "SaleItem" (
    "itemId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "discountBps" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("itemId")
);

CREATE INDEX "SaleItem_tenantId_idx" ON "SaleItem"("tenantId");

ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
