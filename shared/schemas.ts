// shared/schemas.ts — single source of validation truth (server validates incoming,
// client validates forms; same Zod schemas, both sides).

import { z } from 'zod';
import {
  ROLES,
  ITEM_MOVEMENT_TYPES,
  HALLMARK_STATUSES,
  PAYMENT_MODES,
  LEAD_STATUSES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  PURITY_VALUES,
  PURCHASE_ORDER_STATUSES,
  GOLD_LOAN_STATUSES,
} from './constants.js';

// --- Primitives ---

export const CuidSchema = z.string().min(20).max(40); // CUIDs are 25 chars; allow some slack
export const PaiseSchema = z.number().int().nonnegative();
export const MgSchema = z.number().int().nonnegative();
export const BpsSchema = z.number().int().min(0).max(10_000);
export const PuritySchema = z.union(
  PURITY_VALUES.map((v) => z.literal(v)) as unknown as [
    z.ZodLiteral<number>,
    z.ZodLiteral<number>,
    ...z.ZodLiteral<number>[],
  ],
);

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

export const ShopSchema = z.object({
  id: CuidSchema,
  tenantId: CuidSchema,
  name: z.string().min(2).max(80),
  address: z.string().min(5).max(400),
  gstStateCode: z.string().regex(/^\d{2}$/),
  phone: IndianPhoneSchema,
  isActive: z.boolean().default(true),
});

export const ShopInputSchema = ShopSchema.omit({ id: true, tenantId: true });

export const UserSchema = z.object({
  id: CuidSchema,
  tenantId: CuidSchema,
  shopId: CuidSchema.optional().nullable(),
  name: z.string().min(2).max(80),
  phone: IndianPhoneSchema,
  role: z.enum(ROLES),
  isActive: z.boolean().default(true),
});

// --- Auth ---

export const OtpRequestSchema = z.object({ phone: IndianPhoneSchema });
export const OtpVerifySchema = z.object({
  phone: IndianPhoneSchema,
  code: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

// --- Inventory ---

export const CategorySchema = z.object({
  id: CuidSchema,
  tenantId: CuidSchema,
  name: z.string().min(2).max(80),
  parentId: CuidSchema.optional().nullable(),
  metalType: z.enum(['GOLD', 'SILVER', 'DIAMOND', 'PLATINUM', 'OTHER']),
  defaultMakingChargeBps: BpsSchema,
});

export const CategoryInputSchema = CategorySchema.omit({ id: true, tenantId: true });

export const ItemSchema = z.object({
  id: CuidSchema,
  tenantId: CuidSchema,
  shopId: CuidSchema,
  categoryId: CuidSchema,
  sku: z.string().min(2).max(60),
  barcodeData: z.string().min(2).max(80),
  weightMg: MgSchema,
  purityCaratX100: PuritySchema,
  stoneWeightMg: MgSchema.optional().nullable(),
  hallmarkStatus: z.enum(HALLMARK_STATUSES),
  hallmarkRef: HuidSchema.optional().nullable(),
  costPricePaise: PaiseSchema,
  makingChargeBps: BpsSchema.optional().nullable(),
  status: z.enum(['IN_STOCK', 'IN_TRANSIT', 'SOLD', 'MELTED']).default('IN_STOCK'),
  createdAt: z.coerce.date(),
});

export const ItemInputSchema = ItemSchema.omit({
  id: true,
  tenantId: true,
  createdAt: true,
  status: true,
});

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

export const TransferInitiateSchema = z.object({
  itemId: CuidSchema,
  toShopId: CuidSchema,
  reason: z.string().min(1).max(400),
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

export const PurchaseOrderSchema = z.object({
  id: CuidSchema,
  tenantId: CuidSchema,
  vendorId: CuidSchema,
  status: z.enum(PURCHASE_ORDER_STATUSES),
  totalPaise: PaiseSchema,
  createdAt: z.coerce.date(),
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

export const ExpenseInputSchema = z.object({
  shopId: CuidSchema,
  category: z.string().min(1).max(60),
  amountPaise: PaiseSchema,
  paidAt: z.coerce.date(),
  notes: z.string().max(400).optional().nullable(),
});

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
  image: z.string().min(1).max(2048),
});

export const CollectionTileSchema = z.object({
  slug: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  tagline: z.string().min(1).max(200),
  img: z.string().min(1).max(2048),
});

export const StorefrontContentSchema = z.object({
  brand: z.object({
    name: z.string().min(1).max(120),
    tagline: z.string().min(1).max(400),
    logo: z.string().max(2_500_000).default(''),
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
  }),
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
});

export type StorefrontContent = z.infer<typeof StorefrontContentSchema>;

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
