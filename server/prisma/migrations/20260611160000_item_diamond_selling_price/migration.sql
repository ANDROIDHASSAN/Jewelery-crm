-- Add sellingPricePaise to ItemDiamond for per-row selling price tracking
ALTER TABLE "ItemDiamond" ADD COLUMN "sellingPricePaise" INTEGER;
