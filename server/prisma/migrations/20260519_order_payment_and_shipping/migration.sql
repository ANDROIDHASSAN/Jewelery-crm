-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "razorpayPaymentId" TEXT,
ADD COLUMN     "razorpaySignature" TEXT,
ADD COLUMN     "shippingCity" TEXT,
ADD COLUMN     "shippingLine1" TEXT,
ADD COLUMN     "shippingLine2" TEXT,
ADD COLUMN     "shippingName" TEXT,
ADD COLUMN     "shippingPhone" TEXT,
ADD COLUMN     "shippingPincode" TEXT,
ADD COLUMN     "shippingState" TEXT,
ADD COLUMN     "shiprocketTrackingUrl" TEXT;

-- CreateIndex
CREATE INDEX "Order_tenantId_paymentStatus_idx" ON "Order"("tenantId", "paymentStatus");

-- CreateIndex
CREATE INDEX "Order_razorpayOrderId_idx" ON "Order"("razorpayOrderId");

