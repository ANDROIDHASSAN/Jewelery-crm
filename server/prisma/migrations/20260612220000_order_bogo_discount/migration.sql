-- Sale-wide Buy-1-Get-1 discount on an order (value of the free units),
-- deducted before coupon/loyalty. Order-level, like couponDiscountPaise.
ALTER TABLE "Order" ADD COLUMN "bogoDiscountPaise" INTEGER NOT NULL DEFAULT 0;
