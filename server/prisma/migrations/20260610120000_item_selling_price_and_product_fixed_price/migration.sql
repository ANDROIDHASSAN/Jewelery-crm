-- Add a fixed, GST-inclusive selling price to inventory items. When set it
-- overrides live weight×rate pricing in POS + storefront for every metal type.
-- costPricePaise stays the internal cost used for COGS / analytics.
ALTER TABLE "Item" ADD COLUMN "sellingPricePaise" INTEGER;

-- Mirror the pre-GST taxable base onto the storefront Product so the public
-- pricing surfaces can skip the live metal-rate calc for fixed-priced pieces.
ALTER TABLE "Product" ADD COLUMN "fixedPricePaise" INTEGER;
