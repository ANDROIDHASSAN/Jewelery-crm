-- New Season Sale offer type: FIXED_PRICE — every item in the campaign sells at
-- exactly discountFlatPaise (GST-inclusive), e.g. a "flat ₹999 sale". Additive
-- enum value; existing campaigns are unaffected.
ALTER TYPE "SaleDiscountType" ADD VALUE 'FIXED_PRICE';
