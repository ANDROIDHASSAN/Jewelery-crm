-- Optional fixed selling price captured on the PO line; applied to the Item
-- on receive so pricing is set the moment stock lands.
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "sellingPricePaise" INTEGER;

-- Flag to automatically publish the item to the storefront when the PO is received.
-- Only takes effect for items that already have a linked storefront Product.
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "publishToStorefront" BOOLEAN NOT NULL DEFAULT false;
