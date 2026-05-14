-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'BILLING', 'VIEWER');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('STARTER', 'GROWTH', 'SCALE');

-- CreateEnum
CREATE TYPE "MetalType" AS ENUM ('GOLD', 'SILVER', 'DIAMOND', 'PLATINUM', 'OTHER');

-- CreateEnum
CREATE TYPE "HallmarkStatus" AS ENUM ('PENDING', 'SUBMITTED', 'CERTIFIED', 'EXEMPT');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('IN_STOCK', 'IN_TRANSIT', 'SOLD', 'MELTED');

-- CreateEnum
CREATE TYPE "ItemMovementType" AS ENUM ('PURCHASE', 'TRANSFER', 'SALE', 'RETURN', 'WASTAGE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'PLACED', 'PARTIAL', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'UPI', 'CARD', 'CHEQUE', 'GOLD_EXCHANGE', 'LOYALTY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'PARTIAL', 'REFUNDED');

-- CreateEnum
CREATE TYPE "GoldLoanStatus" AS ENUM ('ACTIVE', 'PARTIALLY_REPAID', 'CLOSED', 'DEFAULTED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'INTERESTED', 'NEGOTIATION', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "gstNumber" TEXT,
    "phone" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'STARTER',
    "brandPrimary" TEXT NOT NULL DEFAULT '#C99B2A',
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "gstStateCode" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shopId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "passwordHash" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "metalType" "MetalType" NOT NULL,
    "defaultMakingChargeBps" INTEGER NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcodeData" TEXT NOT NULL,
    "weightMg" INTEGER NOT NULL,
    "purityCaratX100" INTEGER NOT NULL,
    "stoneWeightMg" INTEGER,
    "hallmarkStatus" "HallmarkStatus" NOT NULL DEFAULT 'PENDING',
    "hallmarkRef" TEXT,
    "costPricePaise" INTEGER NOT NULL,
    "makingChargeBps" INTEGER,
    "status" "ItemStatus" NOT NULL DEFAULT 'IN_STOCK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "fromShopId" TEXT,
    "toShopId" TEXT,
    "type" "ItemMovementType" NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT,
    "performedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstNumber" TEXT,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "outstandingPaise" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "totalPaise" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "itemSku" TEXT NOT NULL,
    "weightMg" INTEGER NOT NULL,
    "purity" INTEGER NOT NULL,
    "costPaise" INTEGER NOT NULL,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dob" TIMESTAMP(3),
    "anniversary" TIMESTAMP(3),
    "tags" TEXT[],
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "totalSpendPaise" INTEGER NOT NULL DEFAULT 0,
    "lastVisitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "customerId" TEXT,
    "subtotalPaise" INTEGER NOT NULL,
    "makingChargesPaise" INTEGER NOT NULL DEFAULT 0,
    "stoneChargesPaise" INTEGER NOT NULL DEFAULT 0,
    "cgstPaise" INTEGER NOT NULL DEFAULT 0,
    "sgstPaise" INTEGER NOT NULL DEFAULT 0,
    "igstPaise" INTEGER NOT NULL DEFAULT 0,
    "oldGoldValuePaise" INTEGER NOT NULL DEFAULT 0,
    "discountPaise" INTEGER NOT NULL DEFAULT 0,
    "totalPaise" INTEGER NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillLine" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "weightMg" INTEGER NOT NULL,
    "purityCaratX100" INTEGER NOT NULL,
    "ratePerGramPaise" INTEGER NOT NULL,
    "makingChargeBps" INTEGER NOT NULL DEFAULT 0,
    "stoneChargePaise" INTEGER NOT NULL DEFAULT 0,
    "linePaise" INTEGER NOT NULL,

    CONSTRAINT "BillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OldGoldExchange" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "weightMg" INTEGER NOT NULL,
    "purityCaratX100" INTEGER NOT NULL,
    "ratePerGramPaise" INTEGER NOT NULL,
    "valuePaise" INTEGER NOT NULL,

    CONSTRAINT "OldGoldExchange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldLoan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "principalPaise" INTEGER NOT NULL,
    "interestRateBps" INTEGER NOT NULL,
    "pledgedWeightMg" INTEGER NOT NULL,
    "status" "GoldLoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "dueAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoldLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldLoanRepayment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoldLoanRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payroll" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "basePaise" INTEGER NOT NULL,
    "commissionPaise" INTEGER NOT NULL DEFAULT 0,
    "advancePaise" INTEGER NOT NULL DEFAULT 0,
    "netPaise" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Payroll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "customerId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "interest" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "assignedToUserId" TEXT,
    "utmSource" TEXT,
    "utmCampaign" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "notes" TEXT,
    "performedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT,
    "customerId" TEXT,
    "templateName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "WhatsAppMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "descriptionMd" TEXT NOT NULL,
    "images" TEXT[],
    "weightMg" INTEGER NOT NULL,
    "purityCaratX100" INTEGER NOT NULL,
    "makingChargeBps" INTEGER NOT NULL,
    "basePricePaise" INTEGER NOT NULL,
    "stoneChargePaise" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "subtotalPaise" INTEGER NOT NULL,
    "shippingPaise" INTEGER NOT NULL DEFAULT 0,
    "taxPaise" INTEGER NOT NULL DEFAULT 0,
    "totalPaise" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "razorpayOrderId" TEXT,
    "shiprocketAwb" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "pricePaise" INTEGER NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_ownerEmail_key" ON "Tenant"("ownerEmail");

-- CreateIndex
CREATE INDEX "Tenant_ownerEmail_idx" ON "Tenant"("ownerEmail");

-- CreateIndex
CREATE INDEX "Shop_tenantId_idx" ON "Shop"("tenantId");

-- CreateIndex
CREATE INDEX "Shop_tenantId_isActive_idx" ON "Shop"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_phone_key" ON "User"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "Category_tenantId_idx" ON "Category"("tenantId");

-- CreateIndex
CREATE INDEX "Item_tenantId_idx" ON "Item"("tenantId");

-- CreateIndex
CREATE INDEX "Item_tenantId_shopId_idx" ON "Item"("tenantId", "shopId");

-- CreateIndex
CREATE INDEX "Item_tenantId_categoryId_idx" ON "Item"("tenantId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_tenantId_sku_key" ON "Item"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "ItemMovement_tenantId_idx" ON "ItemMovement"("tenantId");

-- CreateIndex
CREATE INDEX "ItemMovement_tenantId_itemId_idx" ON "ItemMovement"("tenantId", "itemId");

-- CreateIndex
CREATE INDEX "ItemMovement_tenantId_createdAt_idx" ON "ItemMovement"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Vendor_tenantId_idx" ON "Vendor"("tenantId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_tenantId_idx" ON "PurchaseOrder"("tenantId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_tenantId_vendorId_idx" ON "PurchaseOrder"("tenantId", "vendorId");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_poId_idx" ON "PurchaseOrderItem"("poId");

-- CreateIndex
CREATE INDEX "Customer_tenantId_idx" ON "Customer"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_phone_key" ON "Customer"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "Bill_tenantId_idx" ON "Bill"("tenantId");

-- CreateIndex
CREATE INDEX "Bill_tenantId_shopId_idx" ON "Bill"("tenantId", "shopId");

-- CreateIndex
CREATE INDEX "Bill_tenantId_createdAt_idx" ON "Bill"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_tenantId_idempotencyKey_key" ON "Bill"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_shopId_billNumber_key" ON "Bill"("shopId", "billNumber");

-- CreateIndex
CREATE INDEX "BillLine_billId_idx" ON "BillLine"("billId");

-- CreateIndex
CREATE INDEX "Payment_billId_idx" ON "Payment"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "OldGoldExchange_billId_key" ON "OldGoldExchange"("billId");

-- CreateIndex
CREATE INDEX "Expense_tenantId_idx" ON "Expense"("tenantId");

-- CreateIndex
CREATE INDEX "Expense_tenantId_shopId_paidAt_idx" ON "Expense"("tenantId", "shopId", "paidAt");

-- CreateIndex
CREATE INDEX "GoldLoan_tenantId_idx" ON "GoldLoan"("tenantId");

-- CreateIndex
CREATE INDEX "GoldLoan_tenantId_customerId_idx" ON "GoldLoan"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "GoldLoanRepayment_loanId_idx" ON "GoldLoanRepayment"("loanId");

-- CreateIndex
CREATE INDEX "Payroll_tenantId_idx" ON "Payroll"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Payroll_tenantId_userId_month_key" ON "Payroll"("tenantId", "userId", "month");

-- CreateIndex
CREATE INDEX "Lead_tenantId_idx" ON "Lead"("tenantId");

-- CreateIndex
CREATE INDEX "Lead_tenantId_status_idx" ON "Lead"("tenantId", "status");

-- CreateIndex
CREATE INDEX "LeadActivity_leadId_idx" ON "LeadActivity"("leadId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_tenantId_idx" ON "WhatsAppMessage"("tenantId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_tenantId_status_idx" ON "WhatsAppMessage"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");

-- CreateIndex
CREATE INDEX "Product_tenantId_isPublished_idx" ON "Product"("tenantId", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_slug_key" ON "Product"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "Order_tenantId_idx" ON "Order"("tenantId");

-- CreateIndex
CREATE INDEX "Order_tenantId_status_idx" ON "Order"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entityType_entityId_idx" ON "AuditLog"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemMovement" ADD CONSTRAINT "ItemMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemMovement" ADD CONSTRAINT "ItemMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillLine" ADD CONSTRAINT "BillLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillLine" ADD CONSTRAINT "BillLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OldGoldExchange" ADD CONSTRAINT "OldGoldExchange_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldLoan" ADD CONSTRAINT "GoldLoan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldLoan" ADD CONSTRAINT "GoldLoan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldLoanRepayment" ADD CONSTRAINT "GoldLoanRepayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "GoldLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
