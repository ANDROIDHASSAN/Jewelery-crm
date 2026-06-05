-- Purchase-order lines can now carry the category they'll be filed under on
-- receive. Additive, nullable column — existing rows and queries unaffected.

-- AlterTable
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "categoryId" TEXT;
