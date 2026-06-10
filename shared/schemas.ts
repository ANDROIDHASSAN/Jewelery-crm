// shared/schemas.ts — single source of validation truth (server validates incoming,
// client validates forms; same Zod schemas, both sides).

import { z } from 'zod';
import {
  ITEM_MOVEMENT_TYPES,
  HALLMARK_STATUSES,
  PAYMENT_MODES,
  LEAD_STATUSES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  PURCHASE_ORDER_STATUSES,
  GOLD_LOAN_STATUSES,
  TRANSFER_STATUSES,
  METAL_TYPES,
  MAKING_CHARGE_MODES,
  STOREFRONT_SECTIONS,
} from './constants.js';

// --- Primitives ---

export const CuidSchema = z.string().min(20).max(40); // CUIDs are 25 chars; allow some slack
export const PaiseSchema = z.number().int().nonnegative();
export const MgSchema = z.number().int().nonnegative();
export const BpsSchema = z.number().int().min(0).max(10_000);
// Purity stored as carat × 100 (gold) or millesimal fineness (silver/platinum).
// PURITY_VALUES is the curated quick-pick list (24K/22K/18K/14K/Silver/Pt950)
// that drives presets in dropdowns and the bulk-import parser; the validator
// itself accepts any integer in 0..9999 so jewellers can register custom
// alloys (9K=900, 16K=1600, 21K=2100, 23K=2300, Pt 990=9900) without us
// blocking the save. The client form gates ranges per metal type (gold:
// 1000-2400, silver: 0, platinum: 9500, other: 0) — keeping the boundary
// permissive lets future metal types land without a schema change.
export const PuritySchema = z.number().int().min(0).max(9999);

// E.164 Indian phone: +91 followed by 10 digits starting 6-9.
export const IndianPhoneSchema = z
  .string()
  .regex(/^\+91[6-9]\d{9}$/, 'Phone must be E.164 Indian format: +91XXXXXXXXXX');

// GSTIN: 15-char alphanumeric, state code (2) + PAN (10) + entity (1) + 'Z' + checksum (1).
export const GstinSchema = z
  .string()
  .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d{1}Z[A-Z\d]{1}$/, 'Invalid GSTIN');

// BIS HUID: 6-char alphanumeric.
export const HuidSchema = z.string().regex(/^[A-Z0-9]{6}$/, 'HUID must be 6 alphanumeric chars');

export const IdempotencyKeySchema = z.string().uuid();

// --- Tenancy ---

export const TenantSchema = z.object({
  id: CuidSchema,
  businessName: z.string().min(2).max(120),
  gstNumber: GstinSchema.optional().nullable(),
  phone: IndianPhoneSchema,
  ownerEmail: z.string().email(),
  plan: z.enum(['STARTER', 'GROWTH', 'SCALE']).default('STARTER'),
  brandPrimary: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default('#C99B2A'),
  logoUrl: z.string().url().optional().nullable(),
  createdAt: z.coerce.date(),
});

export const ShopTypeSchema = z.enum(['WAREHOUSE', 'RETAIL']);
export type ShopTypeKind = z.infer<typeof ShopTypeSchema>;

export const ShopSchema = z.object({
  id: CuidSchema,
  tenantId: CuidSchema,
  name: z.string().min(2).max(80),
  address: z.string().min(5).max(400),
  gstStateCode: z.string().regex(/^\d{2}$/),
  phone: IndianPhoneSchema,
  isActive: z.boolean().default(true),
  // A warehouse stocks inventory but doesn't sell from POS. Used as a source
  // node in the transfer workflow. `type` is the canonical field; the legacy
  // `isWarehouse` boolean mirrors it for backward compatibility.
  isWarehouse: z.boolean().default(false),
  type: ShopTypeSchema.default('RETAIL'),
});

export const ShopInputSchema = ShopSchema.omit({ id: true, tenantId: true });

// Password rules — what we enforce both client-side and server-side for any
// new password (including admin-set initial passwords). Keep these together
// so client validation matches the server's argon2 hashing pre-check exactly.
export const PasswordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/\d/, 'Password must contain a digit');

export const UserSchema = z.object({
  id: CuidSchema,
  tenantId: CuidSchema,
  shopId: CuidSchema.optional().nullable(),
  roleId: CuidSchema,
  name: z.string().min(2).max(80),
  email: z.string().email().max(160),
  phone: IndianPhoneSchema.optional().nullable(),
  isActive: z.boolean().default(true),
  mustChangePassword: z.boolean().default(false),
  totpEnabled: z.boolean().default(false),
  lastLoginAt: z.coerce.date().optional().nullable(),
  createdAt: z.coerce.date(),
});

// Super-admin creates a new staff user. Password is generated server-side
// or supplied here as a temp password; user is forced to change on first login.
export const UserCreateSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(160),
  phone: IndianPhoneSchema.optional().nullable(),
  shopId: CuidSchema.optional().nullable(),
  roleId: CuidSchema,
  initialPassword: PasswordSchema.optional(), // if omitted, server generates one and returns it
});

export const UserUpdateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  phone: IndianPhoneSchema.optional().nullable(),
  shopId: CuidSchema.optional().nullable(),
  roleId: CuidSchema.optional(),
  isActive: z.boolean().optional(),
});

// --- Auth ---

export const LoginSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(1).max(256),
  // Optional TOTP — required server-side when the user has 2FA enabled.
  totpCode: z.string().regex(/^\d{6}$/).optional(),
  // Optional backup code (8-character alphanumeric) if a user has lost
  // their authenticator.
  backupCode: z.string().regex(/^[A-Z0-9]{8}$/).optional(),
});

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export const ResetPasswordSchema = z.object({
  userId: CuidSchema,
  newPassword: PasswordSchema.optional(), // server can generate
  forceChangeOnNextLogin: z.boolean().default(true),
});

export const Totp2faSetupVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'TOTP must be 6 digits'),
});

// Legacy phone-OTP schemas (kept for backward compat with existing tests).
export const OtpRequestSchema = z.object({ phone: IndianPhoneSchema });
export const OtpVerifySchema = z.object({
  phone: IndianPhoneSchema,
  code: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

// --- RBAC: roles & permissions ---

export const PermissionKeySchema = z.string().regex(/^[a-z_]+\.[a-z_]+$/, 'Permission key must look like module.action');

export const RoleCreateSchema = z.object({
  name: z.string().min(2).max(60),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Role slug must be UPPER_SNAKE_CASE'),
  description: z.string().max(400).optional().nullable(),
  permissionKeys: z.array(PermissionKeySchema).max(200),
});

export const RoleUpdateSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  description: z.string().max(400).optional().nullable(),
  permissionKeys: z.array(PermissionKeySchema).max(200).optional(),
});

export const UserPermissionOverrideSchema = z.object({
  userId: CuidSchema,
  grants: z.array(PermissionKeySchema).max(200).default([]),
  denies: z.array(PermissionKeySchema).max(200).default([]),
  reason: z.string().max(400).optional().nullable(),
});

// --- Inventory ---

export const CategorySchema = z.object({
  id: CuidSchema,
  tenantId: CuidSchema,
  name: z.string().min(2).max(80),
  parentId: CuidSchema.optional().nullable(),
  metalType: z.enum(METAL_TYPES),
  defaultMakingChargeBps: BpsSchema,
  // Making-charge mode + flat per-gram rate (paise/gram). PERCENTAGE uses
  // defaultMakingChargeBps; PER_GRAM uses defaultMakingChargePerGramPaise.
  makingChargeMode: z.enum(MAKING_CHARGE_MODES).default('PERCENTAGE'),
  defaultMakingChargePerGramPaise: PaiseSchema.optional().nullable(),
  // Manual priority order within a parent (lower = higher).
  sortOrder: z.number().int().default(0),
  // Short SKU prefix code (e.g. RNG). Uppercase alphanumeric, 1–8 chars.
  code: z
    .string()
    .regex(/^[A-Z0-9]{1,8}$/, 'Code must be 1–8 uppercase letters/digits')
    .optional()
    .nullable(),
});

export const CategoryInputSchema = CategorySchema.omit({ id: true, tenantId: true });

// --- Collections (cross-category groupings) ---

export const CollectionSchema = z.object({
  id: CuidSchema,
  tenantId: CuidSchema,
  name: z.string().min(2).max(80),
  slug: z.string().min(1).max(100),
  description: z.string().max(2000).optional().nullable(),
  sortOrder: z.number().int().default(0),
  createdAt: z.coerce.date(),
});

export const CollectionInputSchema = CollectionSchema.omit({
  id: true,
  tenantId: true,
  createdAt: true,
  slug: true,
}).extend({
  // Slug is derived server-side from the name when omitted.
  slug: z.string().min(1).max(100).optional(),
});

// --- Diamond detail line (one stone group on an item) ---

export const ItemDiamondSchema = z.object({
  id: CuidSchema.optional(),
  shape: z.string().max(40).optional().nullable(),
  // Carat × 100 (1.05ct → 105). Kept permissive (string scale stored as int).
  caratWeightX100: z.number().int().nonnegative().default(0),
  cut: z.string().max(20).optional().nullable(),
  clarity: z.string().max(20).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  count: z.number().int().min(1).max(1000).default(1),
  costPaise: PaiseSchema.default(0),
});

export const ItemSchema = z.object({
  id: CuidSchema,
  tenantId: CuidSchema,
  shopId: CuidSchema,
  categoryId: CuidSchema,
  sku: z.string().min(2).max(60),
  barcodeData: z.string().min(2).max(80),
  name: z.string().min(1).max(160).optional().nullable(),
  // Master item description (single source of truth) — propagated to the
  // storefront Product and shown on slips/receipts. M3 FR#5.
  description: z.string().max(4000).optional().nullable(),
  // First image is the catalog hero. In prod these are Cloudinary URLs
  // (a few hundred chars); in dev / when Cloudinary isn't configured the
  // client falls back to base64 data URLs which can be tens of KB each.
  // Total payload is bounded by the Express JSON body parser (1 MB) so we
  // don't add a tight per-URL cap here.
  images: z.array(z.string().url()).max(8).default([]),
  weightMg: MgSchema,
  purityCaratX100: PuritySchema,
  stoneWeightMg: MgSchema.optional().nullable(),
  hallmarkStatus: z.enum(HALLMARK_STATUSES),
  hallmarkRef: HuidSchema.optional().nullable(),
  costPricePaise: PaiseSchema,
  // Fixed selling price the customer pays — GST-INCLUSIVE (the final tag /
  // online price). When set it overrides the live metal-rate calculation in
  // both POS and the storefront for ALL metal types. Null = price by live
  // weight×rate (gold/silver) or basePrice (non-precious), as before. Cost
  // price stays internal (COGS / analytics) and is never shown to customers.
  sellingPricePaise: PaiseSchema.optional().nullable(),
  makingChargeBps: BpsSchema.optional().nullable(),
  // Item-level making-charge override. When makingChargeMode is null the item
  // inherits its category's mode + rate. PER_GRAM uses makingChargePerGramPaise.
  makingChargeMode: z.enum(MAKING_CHARGE_MODES).optional().nullable(),
  makingChargePerGramPaise: PaiseSchema.optional().nullable(),
  status: z.enum(['IN_STOCK', 'IN_TRANSIT', 'SOLD', 'MELTED']).default('IN_STOCK'),
  // Hybrid stock model — see schema.prisma comment on Item for the long form.
  isSerialized: z.boolean().default(true),
  quantityOnHand: z.number().int().nonnegative().default(1),
  createdAt: z.coerce.date(),
});

export const ItemInputSchema = ItemSchema.omit({
  id: true,
  tenantId: true,
  createdAt: true,
  status: true,
}).extend({
  // Opt-in toggle on the create form: when true, the server also creates a
  // linked storefront Product so the piece appears on the public catalog
  // immediately. Defaults to false so legacy callers + bulk-import (which
  // don't know about this) keep their current behavior.
  publishToWebsite: z.boolean().optional().default(false),
  // Write-time only: collection memberships + diamond detail lines. The server
  // syncs the ItemCollection join and ItemDiamond rows; neither is an Item
  // column. Optional so legacy callers + bulk-import keep working.
  collectionIds: z.array(CuidSchema).max(50).optional(),
  diamonds: z.array(ItemDiamondSchema).max(50).optional(),
});

// AddStock — used by POST /inventory/items/:id/add-stock.
// Behavior depends on the target Item's `isSerialized` flag:
//   - serialized: clones `quantity` new Item rows with auto-generated SKUs.
//   - lot:        increments the existing row's quantityOnHand by `quantity`.
// `costPricePaise` is an optional override applied only to newly-created
// serialized clones (lot items keep their existing cost price).
export const AddStockSchema = z.object({
  quantity: z.number().int().positive().max(10_000),
  reason: z.string().max(200).optional(),
  costPricePaise: z.number().int().nonnegative().optional(),
});
export type AddStockInput = z.infer<typeof AddStockSchema>;

export const ItemMovementSchema = z.object({
  id: CuidSchema,
  tenantId: CuidSchema,
  itemId: CuidSchema,
  fromShopId: CuidSchema.optional().nullable(),
  toShopId: CuidSchema.optional().nullable(),
  type: z.enum(ITEM_MOVEMENT_TYPES),
  qty: z.number().int().positive().default(1),
  reason: z.string().max(400).optional().nullable(),
  performedByUserId: CuidSchema.optional().nullable(),
  createdAt: z.coerce.date(),
});

// --- Stock transfer workflow ---
// State machine: PENDING -> APPROVED -> COMPLETED, or PENDING -> REJECTED.
// One Transfer carries many items via TransferLine; quantity = lines.length.

export const TransferStatusSchema = z.enum(TRANSFER_STATUSES);

// Per-line input for a transfer. Quantity defaults to 1 — the only legal
// value for serialized items, and the lot-item lines must specify a positive
// integer no larger than that source row's quantityOnHand (enforced server-side).
export const TransferLineInputSchema = z.object({
  itemId: CuidSchema,
  quantity: z.number().int().positive().max(10_000).default(1),
});

export const TransferCreateSchema = z
  .object({
    fromShopId: CuidSchema,
    toShopId: CuidSchema,
    // Cap at 200 items per transfer to keep the approve/complete txn bounded.
    // Two shapes accepted for backward compatibility:
    //   - itemIds: [id, id, ...]                — every line quantity=1
    //   - lines:   [{ itemId, quantity }, ...]  — explicit per-line quantity
    // Exactly one must be present.
    itemIds: z.array(CuidSchema).min(1).max(200).optional(),
    lines: z.array(TransferLineInputSchema).min(1).max(200).optional(),
    reason: z.string().min(1).max(400),
    notes: z.string().max(1000).optional().nullable(),
  })
  .refine((v) => v.fromShopId !== v.toShopId, {
    message: 'fromShopId and toShopId must differ',
    path: ['toShopId'],
  })
  .refine((v) => Boolean(v.itemIds) !== Boolean(v.lines), {
    message: 'Provide exactly one of itemIds or lines',
    path: ['lines'],
  });

export const TransferRejectSchema = z.object({
  rejectionReason: z.string().min(1).max(400),
});

export const TransferLineSchema = z.object({
  id: CuidSchema,
  transferId: CuidSchema,
  itemId: CuidSchema,
  quantity: z.number().int().positive().default(1),
});

export const TransferSchema = z.object({
  id: CuidSchema,
  tenantId: CuidSchema,
  fromShopId: CuidSchema,
  toShopId: CuidSchema,
  status: TransferStatusSchema,
  reason: z.string(),
  notes: z.string().nullable(),
  requestedByUserId: z.string().nullable(),
  approvedByUserId: z.string().nullable(),
  completedByUserId: z.string().nullable(),
  rejectedByUserId: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  createdAt: z.coerce.date(),
  approvedAt: z.coerce.date().nullable(),
  completedAt: z.coerce.date().nullable(),
  rejectedAt: z.coerce.date().nullable(),
});

export const VendorSchema = z.object({
  id: CuidSchema,
  tenantId: CuidSchema,
  name: z.string().min(2).max(120),
  gstNumber: GstinSchema.optional().nullable(),
  phone: IndianPhoneSchema,
  address: z.string().max(400),
  outstandingPaise: PaiseSchema.default(0),
});

export const VendorInputSchema = VendorSchema.omit({
  id: true,
  tenantId: true,
  outstandingPaise: true,
});

export const PurchaseOrderSchema = z.object({
  id: CuidSchema,
  tenantId: CuidSchema,
  vendorId: CuidSchema,
  status: z.enum(PURCHASE_ORDER_STATUSES),
  totalPaise: PaiseSchema,
  createdAt: z.coerce.date(),
});

export const PurchaseOrderItemInputSchema = z.object({
  itemSku: z.string().min(2).max(60),
  // Category this line will be filed under on receive (main or sub category id).
  categoryId: CuidSchema.optional().nullable(),
  weightMg: MgSchema,
  purity: PuritySchema,
  costPaise: PaiseSchema,
  // qty > 1 → lot item on receive (isSerialized=false, quantityOnHand=quantity).
  quantity: z.number().int().min(1).max(10000).default(1),
});

export const PurchaseOrderCreateSchema = z.object({
  vendorId: CuidSchema,
  items: z.array(PurchaseOrderItemInputSchema).min(1).max(200),
});

export const WastageInputSchema = z.object({
  itemId: CuidSchema,
  reason: z.string().min(1).max(400),
});

// --- POS / Sales ---

export const CustomerSchema = z.object({
  id: CuidSchema,
  tenantId: CuidSchema,
  phone: IndianPhoneSchema,
  name: z.string().min(2).max(120),
  dob: z.coerce.date().optional().nullable(),
  anniversary: z.coerce.date().optional().nullable(),
  tags: z.array(z.string().min(1).max(40)).default([]),
  loyaltyPoints: z.number().int().nonnegative().default(0),
  totalSpendPaise: PaiseSchema.default(0),
  lastVisitAt: z.coerce.date().optional().nullable(),
});

export const CustomerInputSchema = CustomerSchema.omit({
  id: true,
  tenantId: true,
  loyaltyPoints: true,
  totalSpendPaise: true,
  lastVisitAt: true,
});

export const BillLineInputSchema = z.object({
  itemId: CuidSchema,
  weightMg: MgSchema,
  purityCaratX100: PuritySchema,
  makingChargeBps: BpsSchema.optional(),
  stoneChargePaise: PaiseSchema.default(0),
});

export const PaymentInputSchema = z.object({
  mode: z.enum(PAYMENT_MODES),
  amountPaise: PaiseSchema,
  referenceId: z.string().max(120).optional().nullable(),
});

export const OldGoldExchangeInputSchema = z.object({
  weightMg: MgSchema,
  purityCaratX100: PuritySchema,
});

export const BillCreateSchema = z.object({
  shopId: CuidSchema,
  customerId: CuidSchema.optional().nullable(),
  lines: z.array(BillLineInputSchema).min(1),
  discountPaise: PaiseSchema.default(0),
  oldGoldExchange: OldGoldExchangeInputSchema.optional().nullable(),
  payments: z.array(PaymentInputSchema).min(1),
  idempotencyKey: IdempotencyKeySchema,
});

export const BillSchema = z.object({
  id: CuidSchema,
  tenantId: CuidSchema,
  shopId: CuidSchema,
  billNumber: z.string(),
  customerId: CuidSchema.optional().nullable(),
  subtotalPaise: PaiseSchema,
  makingChargesPaise: PaiseSchema,
  stoneChargesPaise: PaiseSchema,
  cgstPaise: PaiseSchema,
  sgstPaise: PaiseSchema,
  igstPaise: PaiseSchema,
  oldGoldValuePaise: PaiseSchema,
  discountPaise: PaiseSchema,
  totalPaise: PaiseSchema,
  paymentStatus: z.enum(PAYMENT_STATUSES),
  idempotencyKey: IdempotencyKeySchema,
  createdAt: z.coerce.date(),
  syncedAt: z.coerce.date().optional().nullable(),
});

// --- Finance ---

export const ExpenseClassificationSchema = z.enum(['REVENUE', 'CAPITAL']);

export const ExpenseInputSchema = z.object({
  shopId: CuidSchema,
  category: z.string().min(1).max(60),
  amountPaise: PaiseSchema,
  paidAt: z.coerce.date(),
  notes: z.string().max(400).optional().nullable(),
  receiptUrl: z.string().url().max(2048).optional().nullable(),
  classification: ExpenseClassificationSchema.default('REVENUE'),
  isRecurring: z.boolean().default(false),
  recurringIntervalDays: z.number().int().min(1).max(366).optional().nullable(),
  paymentMode: z.enum(PAYMENT_MODES).optional().nullable(),
  vendorId: CuidSchema.optional().nullable(),
  bankAccountId: CuidSchema.optional().nullable(),
});

export const ExpenseUpdateSchema = ExpenseInputSchema.partial();

export const GoldLoanSchema = z.object({
  id: CuidSchema,
  tenantId: CuidSchema,
  customerId: CuidSchema,
  principalPaise: PaiseSchema,
  interestRateBps: BpsSchema,
  pledgedWeightMg: MgSchema,
  status: z.enum(GOLD_LOAN_STATUSES),
  dueAt: z.coerce.date(),
});

export const GoldLoanInputSchema = z.object({
  customerId: CuidSchema,
  principalPaise: PaiseSchema,
  interestRateBps: BpsSchema,
  pledgedWeightMg: MgSchema,
  dueAt: z.coerce.date(),
});

export const GoldLoanRepaymentInputSchema = z.object({
  loanId: CuidSchema,
  amountPaise: PaiseSchema,
  paidAt: z.coerce.date(),
});

export const PayrollInputSchema = z.object({
  userId: CuidSchema,
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM'),
  basePaise: PaiseSchema,
  commissionPaise: PaiseSchema.default(0),
  advancePaise: PaiseSchema.default(0),
  paidAt: z.coerce.date().optional().nullable(),
});

export const VendorPaymentInputSchema = z.object({
  vendorId: CuidSchema,
  shopId: CuidSchema.optional().nullable(),
  amountPaise: PaiseSchema,
  paymentMode: z.enum(PAYMENT_MODES),
  referenceId: z.string().max(120).optional().nullable(),
  paidAt: z.coerce.date(),
  notes: z.string().max(400).optional().nullable(),
  bankAccountId: CuidSchema.optional().nullable(),
});

export const BankAccountInputSchema = z.object({
  nickname: z.string().min(2).max(80),
  bankName: z.string().min(2).max(80),
  accountLast4: z.string().regex(/^\d{4}$/, 'Last 4 digits only'),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC').optional().nullable(),
  type: z.enum(['CURRENT', 'SAVINGS', 'OD', 'CC', 'OTHER']).default('CURRENT'),
  openingBalancePaise: z.number().int().default(0),
});

export const BankTransactionInputSchema = z.object({
  accountId: CuidSchema,
  direction: z.enum(['CREDIT', 'DEBIT']),
  amountPaise: PaiseSchema,
  balancePaise: z.number().int().optional().nullable(),
  description: z.string().min(1).max(240),
  referenceId: z.string().max(120).optional().nullable(),
  occurredAt: z.coerce.date(),
});

export const ReconciliationInputSchema = z.object({
  shopId: CuidSchema,
  reconciledDate: z.coerce.date(),
  countedCashPaise: z.number().int().default(0),
  settledUpiPaise: z.number().int().default(0),
  settledCardPaise: z.number().int().default(0),
  notes: z.string().max(400).optional().nullable(),
});

// --- CRM ---

export const LeadInputSchema = z.object({
  source: z.string().min(1).max(40),
  customerId: CuidSchema.optional().nullable(),
  name: z.string().min(2).max(120),
  phone: IndianPhoneSchema,
  interest: z.string().max(400).optional().nullable(),
  utmSource: z.string().max(80).optional().nullable(),
  utmCampaign: z.string().max(80).optional().nullable(),
});

export const LeadSchema = LeadInputSchema.extend({
  id: CuidSchema,
  tenantId: CuidSchema,
  status: z.enum(LEAD_STATUSES),
  assignedToUserId: CuidSchema.optional().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// --- E-Commerce ---

export const ProductInputSchema = z.object({
  name: z.string().min(2).max(160),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case'),
  categoryId: CuidSchema,
  descriptionMd: z.string().max(20_000),
  images: z.array(z.string().url()).min(1).max(20),
  weightMg: MgSchema,
  purityCaratX100: PuritySchema,
  makingChargeBps: BpsSchema,
  basePricePaise: PaiseSchema,
  stoneChargePaise: PaiseSchema.default(0),
  isPublished: z.boolean().default(false),
  // Write-time only: storefront homepage sections this product is featured in
  // (New Arrivals, Best Sellers, …). Synced to ProductSection rows; not a
  // Product column. One product → many sections, still one inventory record.
  sections: z.array(z.enum(STOREFRONT_SECTIONS)).max(10).optional(),
});

export const OrderSchema = z.object({
  id: CuidSchema,
  tenantId: CuidSchema,
  customerId: CuidSchema,
  status: z.enum(ORDER_STATUSES),
  subtotalPaise: PaiseSchema,
  shippingPaise: PaiseSchema,
  taxPaise: PaiseSchema,
  totalPaise: PaiseSchema,
  paymentMethod: z.string().max(40),
  razorpayOrderId: z.string().max(80).optional().nullable(),
  shiprocketAwb: z.string().max(80).optional().nullable(),
  createdAt: z.coerce.date(),
});

// --- Storefront content (public website CMS) ---
// One row per tenant; the entire homepage is driven from this blob.

export const StoreLocationSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  address: z.string().min(1).max(400),
  phone: z.string().min(1).max(60),
  hours: z.string().min(1).max(120),
  // Accept either a URL or an inline data URL from the CMS uploader (same
  // precedent as brand.logo). 2.5 MB cap protects the DB from oversized blobs.
  image: z.string().min(1).max(2_500_000),
});

export const CollectionTileSchema = z.object({
  slug: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  tagline: z.string().min(1).max(200),
  img: z.string().min(1).max(2048),
});

// One slide of the homepage hero carousel (CMS-managed). `image` is required;
// everything else is optional so a slide can be just an image + a "Shop Now"
// button that links to a collection (or product). `headline` is an optional
// short overlay; the main editorial copy still lives in the `hero` block.
export const HeroSlideSchema = z.object({
  image: z.string().min(1).max(2048),
  headline: z.string().max(160).optional().default(''),
  ctaLabel: z.string().max(60).optional().default('Shop Now'),
  ctaHref: z.string().max(2048).optional().default('/store/collections'),
});

// New homepage section sub-schemas (CMS-editable). All optional with sensible
// defaults so existing DB rows continue to validate after this expansion.

export const ShopByOccasionTileSchema = z.object({
  name: z.string().min(1).max(60),
  slug: z.string().min(1).max(80),
  count: z.number().int().nonnegative().max(99999),
  img: z.string().min(1).max(2048),
});

export const BrowseCategoryTileSchema = z.object({
  label: z.string().min(1).max(60),
  slug: z.string().min(1).max(80),
  img: z.string().min(1).max(2048),
});

export const ReelTileSchema = z.object({
  handle: z.string().min(1).max(60),
  caption: z.string().min(1).max(160),
  poster: z.string().min(1).max(2048),
  slug: z.string().min(1).max(80),
});

export const DealCardSchema = z.object({
  slug: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(60),
  priceLabel: z.string().min(1).max(40),
  badge: z.enum(['NEW', 'SALE', 'OUT']),
  img: z.string().min(1).max(2048),
});

export const TestimonialCardSchema = z.object({
  quote: z.string().min(1).max(800),
  author: z.string().min(1).max(120),
  city: z.string().min(1).max(80),
  occasion: z.string().min(1).max(120),
});

export const DoorCardSchema = z.object({
  eyebrow: z.string().min(1).max(80),
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(400),
  href: z.string().min(1).max(2048),
  img: z.string().min(1).max(2048),
});

export const TrustBadgeSchema = z.object({
  icon: z.enum(['shield', 'sparkles', 'award']),
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(400),
});

export const FooterLinkSchema = z.object({
  label: z.string().min(1).max(60),
  href: z.string().min(1).max(2048),
});

export const SectionLabelsSchema = z.object({
  categoriesEyebrow: z.string().max(80),
  categoriesTitle: z.string().max(240),
  categoriesSub: z.string().max(400),
  occasionEyebrow: z.string().max(80),
  occasionTitle: z.string().max(240),
  occasionSub: z.string().max(400),
  reelsEyebrow: z.string().max(80),
  reelsTitle: z.string().max(240),
  reelsSub: z.string().max(400),
  reviewsEyebrow: z.string().max(80),
  reviewsTitle: z.string().max(240),
  reviewsSub: z.string().max(400),
  trustEyebrow: z.string().max(80),
  visitEyebrow: z.string().max(80),
  visitTitle: z.string().max(240),
  visitSub: z.string().max(400),
  visitCtaLabel: z.string().max(60),
  visitCtaHref: z.string().max(2048),
  dealsEyebrow: z.string().max(80),
  dealsTitle: z.string().max(240),
  dealsSub: z.string().max(400),
  dealsCtaLabel: z.string().max(60),
  dealsCtaHref: z.string().max(2048),
  newsletterEyebrow: z.string().max(80),
  newsletterTitle: z.string().max(240),
  newsletterSub: z.string().max(400),
});

export const StorefrontContentSchema = z.object({
  brand: z.object({
    name: z.string().min(1).max(120),
    tagline: z.string().min(1).max(400),
    logo: z.string().max(2_500_000).default(''),
    // CMS-controlled tab/SEO surface. All optional so legacy content rows
    // continue to validate. DocumentHead reads these and falls back to brand
    // defaults when blank.
    favicon: z.string().max(2_500_000).optional().default(''),
    siteTitle: z.string().max(160).optional().default(''),
    metaDescription: z.string().max(320).optional().default(''),
    metaKeywords: z.string().max(320).optional().default(''),
    ogImage: z.string().max(2_500_000).optional().default(''),
  }),
  hero: z.object({
    eyebrow: z.string().max(120),
    title: z.string().min(1).max(240),
    subtitle: z.string().max(600),
    ctaLabel: z.string().max(60),
    ctaHref: z.string().max(2048),
    secondaryCtaLabel: z.string().max(60),
    secondaryCtaHref: z.string().max(2048),
    image: z.string().max(2048),
    // New: optional video that plays on the right hero panel (falls back
    // to `image` as the poster + when not provided).
    videoSrc: z.string().max(2048).optional().default(''),
  }),
  // Homepage hero carousel — CMS-managed rotating banners, each with its own
  // "Shop Now" CTA. Optional + default [] so legacy content rows keep
  // validating; the storefront falls back to the single `hero` block when empty.
  heroSlides: z.array(HeroSlideSchema).max(8).optional().default([]),
  rates: z.object({
    g22: z.string().max(40),
    g18: z.string().max(40),
    silver: z.string().max(40),
    updatedAt: z.string().max(80),
  }),
  collections: z.array(CollectionTileSchema).max(20),
  story: z.object({
    eyebrow: z.string().max(80),
    title: z.string().max(240),
    body: z.string().max(2000),
    image: z.string().max(2048),
  }),
  testimonial: z.object({
    quote: z.string().max(1200),
    author: z.string().max(160),
  }),
  locations: z.array(StoreLocationSchema).max(20),
  whatsappNumber: z.string().regex(/^\d{0,15}$/, 'Digits only, up to 15'),

  // --- New CMS-editable sections (all optional with defaults) ---
  shopByOccasion: z.array(ShopByOccasionTileSchema).max(12).optional().default([]),
  browseCategories: z.array(BrowseCategoryTileSchema).max(24).optional().default([]),
  reels: z.array(ReelTileSchema).max(12).optional().default([]),
  deals: z.array(DealCardSchema).max(16).optional().default([]),
  testimonialsRow1: z.array(TestimonialCardSchema).max(12).optional().default([]),
  testimonialsRow2: z.array(TestimonialCardSchema).max(12).optional().default([]),
  doorCards: z.array(DoorCardSchema).max(2).optional().default([]),
  trustBadges: z.array(TrustBadgeSchema).max(6).optional().default([]),
  pressLogos: z.array(z.string().min(1).max(80)).max(10).optional().default([]),
  footerShop: z.array(FooterLinkSchema).max(10).optional().default([]),
  footerVisit: z.array(FooterLinkSchema).max(10).optional().default([]),
  footerHelp: z.array(FooterLinkSchema).max(10).optional().default([]),
  footerEmail: z.string().max(160).optional().default(''),
  copyrightLine: z.string().max(400).optional().default(''),
  sectionLabels: SectionLabelsSchema.partial().optional().default({}),
  // Top navigation menu shown in the storefront header. Empty array means
  // "fall back to the hardcoded default" so storefronts that haven't opened
  // the CMS yet keep their existing nav. Each entry maps a `label` to an
  // `href` (relative path or external https URL). `end: true` makes the
  // active-link match exact (used by /store/collections so it doesn't
  // stay highlighted on every sub-collection).
  navMenu: z
    .array(
      z.object({
        label: z.string().min(1).max(40),
        href: z.string().min(1).max(400),
        end: z.boolean().optional(),
      }),
    )
    .max(12)
    .optional()
    .default([]),
  // Storefront sidebar filter config (Filters tab in Website CMS).
  //   groups            — master list of filter facets available across
  //                       collection pages. Each has a stable key (so per-
  //                       collection overrides can reference it), a human
  //                       label, and an options list. Predicates for each
  //                       label live in CollectionPage's FILTER_PREDICATES.
  //   perCollection     — slug → ordered group-key list. Override for a
  //                       specific collection page. Missing slug = fall back
  //                       to defaultGroupKeys. Empty array = hide all
  //                       filters on that page.
  //   defaultGroupKeys  — group keys shown on any collection without a
  //                       per-collection override.
  //
  // The whole block is optional so legacy content rows (saved before this
  // landed in the schema) don't fail validation; defaults match the slice's
  // DEFAULT_CONTENT.filters so the public storefront keeps showing the
  // baseline metal/weight/price/purity/occasion strip out of the box.
  filters: z
    .object({
      groups: z
        .array(
          z.object({
            key: z.string().min(1).max(60),
            label: z.string().min(1).max(80),
            options: z.array(z.string().min(1).max(80)).max(40),
          }),
        )
        .max(20),
      perCollection: z.record(z.string(), z.array(z.string().min(1).max(60)).max(20)),
      defaultGroupKeys: z.array(z.string().min(1).max(60)).max(20),
    })
    .optional(),

  // Social media URLs surfaced in the storefront footer. Each is an optional
  // URL string; empty strings render as no-op (the footer hides the icon).
  // Stored verbatim so users can paste full URLs (https://instagram.com/...)
  // or WhatsApp wa.me links — we do no normalisation server-side.
  socials: z
    .object({
      instagram: z.string().max(400).optional().default(''),
      facebook: z.string().max(400).optional().default(''),
      youtube: z.string().max(400).optional().default(''),
      whatsapp: z.string().max(400).optional().default(''),
    })
    .optional()
    .default({ instagram: '', facebook: '', youtube: '', whatsapp: '' }),

  // Invoice layout CMS — drives both POS receipts and e-commerce order
  // invoices. Every visible string on the branded A4 invoice is editable
  // here so the layout adapts to a tenant's identity without code changes.
  // The PDF renderer falls back to sensible defaults when fields are blank.
  invoiceLayout: z
    .object({
      // --- Brand band (top-left of the invoice) ---
      brandSubTagline: z.string().max(80).optional().default('FINE JEWELLERY'),
      brandEstablishedLine: z.string().max(80).optional().default('HARYANA · SINCE 1972'),

      // --- Hero block (under the brand band, left column) ---
      heroHeadline: z.string().max(160).optional().default('Heirlooms, made for the modern bride.'),
      heroBody: z.string().max(400).optional().default('Handcrafted with love in Haryana, our jewellery is priced transparently against today’s MCX rate — weight × rate + making, nothing hidden.'),
      heroImage: z.string().max(2_500_000).optional().default(''),

      // --- Tax-invoice block (top-right) ---
      invoiceTitle: z.string().max(40).optional().default('TAX INVOICE'),
      invoiceNumberPrefix: z.string().max(40).optional().default(''),

      // --- Business details column ---
      businessAddress: z.string().max(400).optional().default(''),
      businessEmail: z.string().max(160).optional().default(''),

      // --- Thank-you block (under the totals card) ---
      thankYouTitle: z.string().max(160).optional().default('Thank you for choosing us.'),
      thankYouBody: z.string().max(400).optional().default('We appreciate your trust in our craftsmanship.'),

      // --- Payment details column ---
      bankName: z.string().max(120).optional().default(''),
      bankAccountNumber: z.string().max(60).optional().default(''),
      bankIfsc: z.string().max(40).optional().default(''),
      upiId: z.string().max(120).optional().default(''),

      // --- Terms (multi-line, bullet-rendered) ---
      termsAndConditions: z.string().max(2000).optional().default(''),

      // --- Footer ribbon + contact bar ---
      footerRibbon: z.string().max(160).optional().default('HEIRLOOMS TODAY, MEMORIES FOREVER.'),
      contactWebsite: z.string().max(160).optional().default(''),
      contactPhone: z.string().max(60).optional().default(''),
      contactAddressLine: z.string().max(240).optional().default(''),

      // --- Display toggles ---
      showLogo: z.boolean().optional().default(true),
      showHeroImage: z.boolean().optional().default(true),
      showAmountInWords: z.boolean().optional().default(true),
      showUpiQr: z.boolean().optional().default(true),
      showStamp: z.boolean().optional().default(true),

      // --- Visual accent (single hex) used for headlines, totals card,
      //     ribbon bar. Defaults to a warm peach/copper drawn from the
      //     reference design. ---
      accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#C7895A'),

      // --- Legacy fields kept so older content rows continue to validate. ---
      headerNote: z.string().max(400).optional().default(''),
      footerNote: z.string().max(400).optional().default(''),
      signatoryName: z.string().max(160).optional().default(''),
    })
    .optional()
    .default({
      brandSubTagline: 'FINE JEWELLERY',
      brandEstablishedLine: 'HARYANA · SINCE 1972',
      heroHeadline: 'Heirlooms, made for the modern bride.',
      heroBody: 'Handcrafted with love in Haryana, our jewellery is priced transparently against today’s MCX rate — weight × rate + making, nothing hidden.',
      heroImage: '',
      invoiceTitle: 'TAX INVOICE',
      invoiceNumberPrefix: '',
      businessAddress: '',
      businessEmail: '',
      thankYouTitle: 'Thank you for choosing us.',
      thankYouBody: 'We appreciate your trust in our craftsmanship.',
      bankName: '',
      bankAccountNumber: '',
      bankIfsc: '',
      upiId: '',
      termsAndConditions: 'Goods once sold will not be taken back or exchanged.\nAny damages must be reported within 3 days of delivery.\nPrices are subject to change with MCX rate fluctuations.',
      footerRibbon: 'HEIRLOOMS TODAY, MEMORIES FOREVER.',
      contactWebsite: '',
      contactPhone: '',
      contactAddressLine: '',
      showLogo: true,
      showHeroImage: true,
      showAmountInWords: true,
      showUpiQr: true,
      showStamp: true,
      accentColor: '#C7895A',
      headerNote: '',
      footerNote: '',
      signatoryName: '',
    }),
});

export type StorefrontContent = z.infer<typeof StorefrontContentSchema>;

// --- POS: register sessions, parked bills, estimates, repairs, advances ---

export const OpenRegisterSchema = z.object({
  shopId: CuidSchema,
  openingFloatPaise: PaiseSchema,
  notes: z.string().max(400).optional().nullable(),
});

export const CloseRegisterSchema = z.object({
  countedCashPaise: PaiseSchema,
  notes: z.string().max(400).optional().nullable(),
});

export const CashMovementInputSchema = z.object({
  shopId: CuidSchema,
  type: z.enum(['PAY_IN', 'PAY_OUT', 'DEPOSIT']),
  amountPaise: PaiseSchema.refine((n) => n > 0, 'Amount must be positive'),
  reason: z.string().min(1).max(200),
});

export const ParkedBillInputSchema = z.object({
  shopId: CuidSchema,
  customerLabel: z.string().min(1).max(120),
  customerPhone: IndianPhoneSchema.optional().nullable(),
  draft: z.record(z.unknown()), // BillCreateSchema shape — validated when resumed
});

export const EstimateInputSchema = z.object({
  shopId: CuidSchema,
  customerId: CuidSchema.optional().nullable(),
  customerLabel: z.string().min(1).max(120),
  customerPhone: IndianPhoneSchema.optional().nullable(),
  lines: z.array(BillLineInputSchema).min(1).max(60),
  validDays: z.number().int().min(1).max(30).default(7),
});

export const RepairIntakeSchema = z.object({
  shopId: CuidSchema,
  customerId: CuidSchema.optional().nullable(),
  customerName: z.string().min(1).max(120),
  customerPhone: IndianPhoneSchema,
  itemDescription: z.string().min(1).max(400),
  weightInMg: MgSchema.refine((n) => n > 0, 'Weight must be positive'),
  purityCaratX100: PuritySchema,
  problem: z.string().min(1).max(800),
  estimatedCostPaise: PaiseSchema,
  advancePaise: PaiseSchema.default(0),
  promisedAt: z.coerce.date().optional().nullable(),
  notes: z.string().max(800).optional().nullable(),
});

export const RepairUpdateSchema = z.object({
  status: z.enum(['INTAKE', 'IN_WORKSHOP', 'READY', 'DELIVERED', 'CANCELLED']).optional(),
  weightOutMg: MgSchema.optional().nullable(),
  finalCostPaise: PaiseSchema.optional().nullable(),
  notes: z.string().max(800).optional().nullable(),
});

export const AdvanceInputSchema = z.object({
  shopId: CuidSchema,
  customerId: CuidSchema,
  amountPaise: PaiseSchema.refine((n) => n > 0, 'Amount must be positive'),
  lockRates: z.boolean().default(false),
  validDays: z.number().int().min(1).max(365).default(90),
  notes: z.string().max(400).optional().nullable(),
});

export const RefundInputSchema = z.object({
  billId: CuidSchema,
  amountPaise: PaiseSchema.refine((n) => n > 0, 'Amount must be positive'),
  reason: z.string().min(1).max(400),
});

export const VoidBillSchema = z.object({
  reason: z.string().min(3).max(400),
});

// --- API response envelopes ---

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string()).optional(),
    traceId: z.string().optional(),
  }),
});

export const PageSchema = z.object({
  nextCursor: z.string().optional(),
  hasMore: z.boolean(),
});
