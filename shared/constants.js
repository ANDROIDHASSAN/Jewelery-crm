// shared/constants.ts — roles, statuses, GST rates, purity values
export const ROLES = ['OWNER', 'MANAGER', 'BILLING', 'VIEWER'];
export const ITEM_MOVEMENT_TYPES = [
    'PURCHASE',
    'TRANSFER',
    'SALE',
    'RETURN',
    'WASTAGE',
    'ADJUSTMENT',
];
export const HALLMARK_STATUSES = ['PENDING', 'SUBMITTED', 'CERTIFIED', 'EXEMPT'];
export const PAYMENT_MODES = [
    'CASH',
    'UPI',
    'CARD',
    'CHEQUE',
    'GOLD_EXCHANGE',
    'LOYALTY',
];
export const LEAD_STATUSES = [
    'NEW',
    'CONTACTED',
    'INTERESTED',
    'NEGOTIATION',
    'CONVERTED',
    'LOST',
];
export const ORDER_STATUSES = [
    'PENDING',
    'CONFIRMED',
    'PACKED',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'RETURNED',
];
export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'PARTIAL', 'REFUNDED'];
// Allowed purity values (carat × 100). Silver = 0. Platinum coded as 9500.
export const PURITY_VALUES = [2400, 2200, 1800, 1400, 0, 9500];
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
];
export const GOLD_LOAN_STATUSES = ['ACTIVE', 'PARTIALLY_REPAID', 'CLOSED', 'DEFAULTED'];
export const TRANSFER_STATUSES = ['INITIATED', 'IN_TRANSIT', 'ACCEPTED', 'REJECTED'];
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
};
