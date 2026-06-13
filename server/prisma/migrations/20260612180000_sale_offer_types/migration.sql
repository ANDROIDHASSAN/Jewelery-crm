-- Season Sale offer types: percentage off (existing), flat ₹ off, or BOGO.
CREATE TYPE "SaleDiscountType" AS ENUM ('PERCENT', 'FLAT', 'BOGO');

ALTER TABLE "SaleItem" ADD COLUMN "discountType" "SaleDiscountType" NOT NULL DEFAULT 'PERCENT';
ALTER TABLE "SaleItem" ADD COLUMN "discountFlatPaise" INTEGER NOT NULL DEFAULT 0;
