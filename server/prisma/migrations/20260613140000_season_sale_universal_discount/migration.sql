-- Season Sale: a single universal discount applied to every item in the sale,
-- replacing per-item discounts. Stored on the Tenant alongside seasonSaleBogo.
-- PERCENT uses bps (10% = 1000); FLAT uses paise. The legacy per-item
-- SaleItem.discount* columns are kept (non-destructive) but no longer read.

ALTER TABLE "Tenant" ADD COLUMN "seasonSaleDiscountType"      "SaleDiscountType" NOT NULL DEFAULT 'PERCENT';
ALTER TABLE "Tenant" ADD COLUMN "seasonSaleDiscountBps"       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Tenant" ADD COLUMN "seasonSaleDiscountFlatPaise" INTEGER NOT NULL DEFAULT 0;
