# Data Model

Multi-tenant single-database design. Every tenant-scoped table has a `tenantId`. Tenant isolation is enforced by Prisma extension reading `tenantId` from `AsyncLocalStorage` (set by `tenant-scope` middleware).

## Tenancy

```
Tenant (id, businessName, gstNumber, phone, ownerEmail, plan, brandPrimary, logoUrl, createdAt)
  └─ Shop (id, tenantId, name, address, gstStateCode, phone, isActive)
       └─ User (id, tenantId, shopId?, name, phone, role, passwordHash?, isActive)
            roles: OWNER | MANAGER | BILLING | VIEWER
```

Tenant resolution at request time:
1. Subdomain → `tenant.goldos.in` → `tenantId` lookup (cached)
2. JWT claim → `tenantId` in token
3. Both must agree. Mismatch = 403.

## Core domain

### Inventory

```
Category (id, tenantId, name, parentId, metalType, defaultMakingChargeBps)
  └─ Item (id, tenantId, shopId, categoryId, sku, barcodeData,
           weightMg, purityCaratX100, stoneWeightMg?,
           hallmarkStatus, hallmarkRef?,
           costPricePaise, makingChargeBps?, status, createdAt)

ItemMovement (id, tenantId, itemId, fromShopId?, toShopId?,
              type, qty, reason, performedByUserId, createdAt)
  types: PURCHASE | TRANSFER | SALE | RETURN | WASTAGE | ADJUSTMENT

Vendor (id, tenantId, name, gstNumber?, phone, address, outstandingPaise)
PurchaseOrder (id, tenantId, vendorId, status, totalPaise, createdAt)
  └─ PurchaseOrderItem (id, poId, itemSku, weightMg, purity, costPaise)
```

### Sales / POS

```
Customer (id, tenantId, phone, name, dob?, anniversary?,
          tags[], loyaltyPoints, totalSpendPaise, lastVisitAt)

Bill (id, tenantId, shopId, billNumber, customerId?,
      subtotalPaise, makingChargesPaise, stoneChargesPaise,
      cgstPaise, sgstPaise, igstPaise,
      oldGoldValuePaise, discountPaise,
      totalPaise, paymentStatus,
      idempotencyKey,  -- offline POS reconciliation
      createdByUserId, createdAt, syncedAt)
  └─ BillLine (id, billId, itemId, weightMg, purityCaratX100,
               ratePerGramPaise, makingChargeBps, stoneChargePaise,
               linePaise)

Payment (id, billId, mode, amountPaise, referenceId?, createdAt)
  modes: CASH | UPI | CARD | CHEQUE | GOLD_EXCHANGE | LOYALTY

OldGoldExchange (id, billId, weightMg, purityCaratX100,
                 ratePerGramPaise, valuePaise)
```

### Finance

```
Expense (id, tenantId, shopId, category, amountPaise, paidAt, notes)
GoldLoan (id, tenantId, customerId, principalPaise, interestRateBps,
          pledgedWeightMg, status, dueAt)
  └─ GoldLoanRepayment (id, loanId, amountPaise, paidAt)
Payroll (id, tenantId, userId, month, basePaise, commissionPaise, advancePaise, netPaise, paidAt)
```

### CRM

```
Lead (id, tenantId, source, customerId?, name, phone,
      interest, status, assignedToUserId?, utmSource?, utmCampaign?,
      createdAt, updatedAt)
  statuses: NEW | CONTACTED | INTERESTED | NEGOTIATION | CONVERTED | LOST

LeadActivity (id, leadId, type, notes, performedByUserId, createdAt)
WhatsAppMessage (id, tenantId, leadId?, customerId?, templateName,
                 body, status, sentAt, deliveredAt)
```

### E-Commerce

```
Product (id, tenantId, name, slug, categoryId, descriptionMd,
         images[], weightMg, purityCaratX100, makingChargeBps,
         basePricePaise, stoneChargePaise, isPublished)

Order (id, tenantId, customerId, status, shippingAddressId,
       subtotalPaise, shippingPaise, taxPaise, totalPaise,
       paymentMethod, razorpayOrderId?, shiprocketAwb?, createdAt)
  └─ OrderItem (id, orderId, productId, qty, pricePaise)
```

### Audit

```
AuditLog (id, tenantId, userId?, entityType, entityId, action,
          beforeJson?, afterJson?, ip, userAgent, createdAt)
```

(Plain table for v1; can be moved to TimescaleDB hypertable when volume warrants.)

## Conventions

- **All IDs are CUIDs** (collision-safe, sortable). No incrementing PKs except `Bill.billNumber` (per-shop sequence).
- **All money in paise** (`Int` if always under 2B paise = ₹2 crore, else `BigInt`). Column name ends in `Paise`.
- **All weight in mg**. Column name ends in `Mg`.
- **All purity as carat × 100** (22K = 2200, 18K = 1800, silver = 0).
- **All rates in basis points** (1% = 100 bps). Column name ends in `Bps`.
- **All timestamps UTC**, `DateTime` in Prisma. Display converts to IST.
- **Soft-delete via `isActive` or `status`**, never hard-delete tenant data.
- **Indexes:** every `tenantId` column is indexed. Composite indexes on `(tenantId, shopId)` for shop-scoped reads.

## Migration discipline

- Forward-only in shared environments. Never edit a committed migration.
- Every new tenant-scoped table includes `tenantId`.
- Every new tenant-scoped table is added to the Prisma tenant extension's auto-scope list in the same PR.
