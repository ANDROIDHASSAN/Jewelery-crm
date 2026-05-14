// shared/constants.ts — roles, statuses, GST rates, purity values

export const ROLES = ['OWNER', 'MANAGER', 'BILLING', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export const ITEM_MOVEMENT_TYPES = [
  'PURCHASE',
  'TRANSFER',
  'SALE',
  'RETURN',
  'WASTAGE',
  'ADJUSTMENT',
] as const;
export type ItemMovementType = (typeof ITEM_MOVEMENT_TYPES)[number];

export const HALLMARK_STATUSES = ['PENDING', 'SUBMITTED', 'CERTIFIED', 'EXEMPT'] as const;
export type HallmarkStatus = (typeof HALLMARK_STATUSES)[number];

export const PAYMENT_MODES = [
  'CASH',
  'UPI',
  'CARD',
  'CHEQUE',
  'GOLD_EXCHANGE',
  'LOYALTY',
] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'INTERESTED',
  'NEGOTIATION',
  'CONVERTED',
  'LOST',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'PARTIAL', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// Allowed purity values (carat × 100). Silver = 0. Platinum coded as 9500.
export const PURITY_VALUES = [2400, 2200, 1800, 1400, 0, 9500] as const;
export type Purity = (typeof PURITY_VALUES)[number];

// GST: jewellery is 3% (1.5% CGST + 1.5% SGST intra, 3% IGST inter).
export const GST_RATE_BPS = 300; // 3%
export const CGST_RATE_BPS = 150; // 1.5%
export const SGST_RATE_BPS = 150; // 1.5%
export const IGST_RATE_BPS = 300; // 3%

export const PURCHASE_ORDER_STATUSES = [
  'DRAFT',
  'PLACED',
  'PARTIAL',
  'RECEIVED',
  'CANCELLED',
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const GOLD_LOAN_STATUSES = ['ACTIVE', 'PARTIALLY_REPAID', 'CLOSED', 'DEFAULTED'] as const;
export type GoldLoanStatus = (typeof GOLD_LOAN_STATUSES)[number];

export const TRANSFER_STATUSES = ['INITIATED', 'IN_TRANSIT', 'ACCEPTED', 'REJECTED'] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

// Indian state codes for GST intra/inter derivation (subset; expand as needed).
export const GST_STATE_CODES = {
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '07': 'Delhi',
  '33': 'Tamil Nadu',
  '32': 'Kerala',
  '24': 'Gujarat',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '19': 'West Bengal',
  '36': 'Telangana',
} as const;
