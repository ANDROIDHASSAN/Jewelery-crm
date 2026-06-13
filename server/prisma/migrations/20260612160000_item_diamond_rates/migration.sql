-- Persist the per-carat rates entered in the diamond purchase/selling rate
-- calculators (₹/ct, in paise) so they pre-fill on re-edit.
ALTER TABLE "ItemDiamond" ADD COLUMN "purchaseRatePaise" INTEGER;
ALTER TABLE "ItemDiamond" ADD COLUMN "sellRatePaise" INTEGER;
