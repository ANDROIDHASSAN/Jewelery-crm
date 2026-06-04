// shared/constants.ts — roles, statuses, GST rates, purity values, permission catalog.

// --------------------------------------------------------------------------
// Roles & Permissions
// --------------------------------------------------------------------------

// Built-in role slugs. Custom roles created by a super-admin live in the Role
// table with `isSystem=false` and any free-form slug. Built-ins are seeded
// per-tenant on tenant creation so a super-admin can rename/re-permission
// their own copy of e.g. "Accountant" without affecting other tenants.
export const ROLE_SLUGS = ['SUPER_ADMIN', 'ACCOUNTANT', 'EMPLOYEE', 'POS_USER'] as const;
export type RoleSlug = (typeof ROLE_SLUGS)[number];

export const ROLE_DISPLAY: Record<RoleSlug, { name: string; description: string }> = {
  SUPER_ADMIN: {
    name: 'Super Admin',
    description: 'Full access across every module and user/role management.',
  },
  ACCOUNTANT: {
    name: 'Accountant',
    description: 'Stock, finance, accounting, and reports — read-write within those modules.',
  },
  EMPLOYEE: {
    name: 'Employee',
    description: 'Stock, e-commerce, leads, and reports for day-to-day showroom staff.',
  },
  POS_USER: {
    name: 'POS Cashier',
    description: 'Offline POS only. Billing, customer lookup, parked bills, day-close. Subdomain access only.',
  },
};

/**
 * Permission catalog. Each entry has two human-facing strings:
 *   - `label`: short, user-friendly title (sentence case, what shows in tables
 *              / checkboxes / pickers). Example: "Create a sale bill".
 *   - `description`: a one-line hint with the *consequence* of granting it.
 *              Example: "Cashier can ring up customers at the counter".
 * `key` stays the dot-notation internal identifier — used in code, JWTs, DB
 * lookups, audit logs. Never shown as the primary label.
 *
 * Order matters: this is the canonical seed order so migrations stay stable.
 */
export const PERMISSIONS = [
  // Dashboard ------------------------------------------------------------
  { key: 'dashboard.view', module: 'dashboard', action: 'view',
    label: 'View admin dashboard',
    description: 'Sees the home dashboard with key business metrics.' },

  // Inventory ------------------------------------------------------------
  { key: 'inventory.read', module: 'inventory', action: 'read',
    label: 'View stock & inventory',
    description: 'Browse items, categories, vendors, stock value.' },
  { key: 'inventory.write', module: 'inventory', action: 'write',
    label: 'Add or edit stock',
    description: 'Create / edit items, categories, vendors and their details.' },
  { key: 'inventory.delete', module: 'inventory', action: 'delete',
    label: 'Delete stock entries',
    description: 'Permanently remove items or categories from inventory.' },
  { key: 'inventory.transfer', module: 'inventory', action: 'transfer',
    label: 'Transfer stock between shops',
    description: 'Move items from one branch to another.' },
  { key: 'inventory.wastage', module: 'inventory', action: 'wastage',
    label: 'Record wastage / melt items',
    description: 'Log items melted, lost, or damaged in display.' },
  { key: 'inventory.purchase_order', module: 'inventory', action: 'purchase_order',
    label: 'Manage purchase orders',
    description: 'Place orders to vendors, mark received, settle bills.' },
  { key: 'inventory.hallmark', module: 'inventory', action: 'hallmark',
    label: 'Manage hallmark / BIS status',
    description: 'Update BIS HUID and certification status on items.' },

  // POS / Billing --------------------------------------------------------
  { key: 'pos.access', module: 'pos', action: 'access',
    label: 'Access POS counter',
    description: 'Sign in to the offline POS app on the shop tablet.' },
  { key: 'pos.bill_create', module: 'pos', action: 'bill_create',
    label: 'Create a sale bill',
    description: 'Ring up a customer and post a new bill.' },
  { key: 'pos.bill_void', module: 'pos', action: 'bill_void',
    label: 'Void a bill',
    description: 'Cancel a posted bill within the 24-hour window.' },
  { key: 'pos.refund', module: 'pos', action: 'refund',
    label: 'Process returns & refunds',
    description: 'Refund part or all of a posted bill.' },
  { key: 'pos.discount', module: 'pos', action: 'discount',
    label: 'Apply manual discounts',
    description: 'Override the auto-discount cap on a bill.' },
  { key: 'pos.exchange', module: 'pos', action: 'exchange',
    label: 'Accept old-gold exchange',
    description: 'Receive old gold against the bill total.' },
  { key: 'pos.estimate', module: 'pos', action: 'estimate',
    label: 'Create estimates (kachi parchi)',
    description: 'Hand the customer a rate-locked quote.' },
  { key: 'pos.advance', module: 'pos', action: 'advance',
    label: 'Take advance / booking',
    description: 'Receive an advance receipt against a future order.' },
  { key: 'pos.repair', module: 'pos', action: 'repair',
    label: 'Open repair / job-work tickets',
    description: 'Intake pieces for polish, sizing, repair.' },
  { key: 'pos.parked_bill', module: 'pos', action: 'parked_bill',
    label: 'Park & resume bills',
    description: 'Set a cart aside to serve the next customer.' },
  { key: 'pos.day_open', module: 'pos', action: 'day_open',
    label: 'Open the till for the day',
    description: 'Count the morning float and start the session.' },
  { key: 'pos.day_close', module: 'pos', action: 'day_close',
    label: 'Close the till at end of day',
    description: 'Reconcile cash, record variance, lock the session.' },
  { key: 'pos.cash_drawer', module: 'pos', action: 'cash_drawer',
    label: 'Manage cash drawer',
    description: 'Record pay-ins, pay-outs and bank deposits.' },
  { key: 'pos.monitor', module: 'pos', action: 'monitor',
    label: 'Monitor offline shops',
    description: 'Read-only view of every shop’s till sessions, bills, variances and cashier activity from the admin panel. Does NOT allow ringing up customers.' },

  // Finance --------------------------------------------------------------
  { key: 'finance.read', module: 'finance', action: 'read',
    label: 'View finance & accounting',
    description: 'Browse expenses, gold loans, payroll, GST reports.' },
  { key: 'finance.expense_write', module: 'finance', action: 'expense_write',
    label: 'Record expenses',
    description: 'Add or edit shop expenses (rent, salary, electricity etc.).' },
  { key: 'finance.goldloan_write', module: 'finance', action: 'goldloan_write',
    label: 'Manage gold loans',
    description: 'Issue, track and close customer gold-loan agreements.' },
  { key: 'finance.payroll_write', module: 'finance', action: 'payroll_write',
    label: 'Run staff payroll',
    description: 'Calculate and pay monthly salaries + commissions.' },
  { key: 'finance.ledger_export', module: 'finance', action: 'ledger_export',
    label: 'Export GST ledger',
    description: 'Download GSTR-ready ledger as CSV / Excel.' },

  // CRM / Leads ----------------------------------------------------------
  { key: 'crm.read', module: 'crm', action: 'read',
    label: 'View customers & leads',
    description: 'Browse the customer book and lead pipeline.' },
  { key: 'crm.write', module: 'crm', action: 'write',
    label: 'Edit customers & leads',
    description: 'Update lead status, add activities, edit customer details.' },
  { key: 'crm.assign', module: 'crm', action: 'assign',
    label: 'Re-assign leads',
    description: 'Reassign leads to a different staff member.' },
  { key: 'crm.whatsapp_send', module: 'crm', action: 'whatsapp_send',
    label: 'Send WhatsApp messages',
    description: 'Queue WhatsApp templates to customers / leads.' },

  // E-commerce -----------------------------------------------------------
  { key: 'ecommerce.read', module: 'ecommerce', action: 'read',
    label: 'View online catalog & orders',
    description: 'Browse storefront products and online orders.' },
  { key: 'ecommerce.product_write', module: 'ecommerce', action: 'product_write',
    label: 'Publish & edit products',
    description: 'Add new products, edit prices, hide / publish listings.' },
  { key: 'ecommerce.order_fulfil', module: 'ecommerce', action: 'order_fulfil',
    label: 'Fulfil online orders',
    description: 'Confirm, pack, ship and deliver online orders.' },

  // Website / CMS --------------------------------------------------------
  { key: 'website.read', module: 'website', action: 'read',
    label: 'View website content',
    description: 'See the public storefront copy and images.' },
  { key: 'website.write', module: 'website', action: 'write',
    label: 'Edit website content',
    description: 'Update homepage banners, locations, story, rates.' },

  // Analytics & Reports --------------------------------------------------
  { key: 'reports.view', module: 'reports', action: 'view',
    label: 'View reports & analytics',
    description: 'Sales, stock, staff performance, ad-ROI dashboards.' },
  { key: 'reports.export', module: 'reports', action: 'export',
    label: 'Download reports',
    description: 'Export dashboards and reports as CSV / PDF.' },

  // Settings / Admin -----------------------------------------------------
  { key: 'settings.read', module: 'settings', action: 'read',
    label: 'View business settings',
    description: 'See tenant + branding configuration.' },
  { key: 'settings.write', module: 'settings', action: 'write',
    label: 'Edit business settings',
    description: 'Change tenant name, GST, brand colours, logo.' },
  { key: 'users.read', module: 'users', action: 'read',
    label: 'View team members',
    description: 'See the staff list and their roles.' },
  { key: 'users.write', module: 'users', action: 'write',
    label: 'Manage team members',
    description: 'Add, edit, deactivate staff accounts.' },
  { key: 'users.reset_password', module: 'users', action: 'reset_password',
    label: 'Reset team passwords',
    description: 'Issue a new temporary password for any staff account.' },
  { key: 'roles.read', module: 'roles', action: 'read',
    label: 'View roles',
    description: 'See the roles list and which permissions each carries.' },
  { key: 'roles.write', module: 'roles', action: 'write',
    label: 'Manage roles',
    description: 'Create custom roles, edit permission sets, delete roles.' },
  { key: 'roles.assign', module: 'roles', action: 'assign',
    label: 'Assign roles & overrides',
    description: 'Set role on a user and grant per-user permission overrides.' },
  { key: 'shops.read', module: 'shops', action: 'read',
    label: 'View shops',
    description: 'See all branch shops and their addresses.' },
  { key: 'shops.write', module: 'shops', action: 'write',
    label: 'Manage shops',
    description: 'Add, edit, or deactivate a branch shop.' },
  { key: 'audit.read', module: 'audit', action: 'read',
    label: 'View audit log',
    description: 'Browse the trail of who-did-what across the business.' },
] as const;

/**
 * Human-friendly module headers used by the Team & Roles screen. Keeps the
 * UI free of internal dot-notation strings.
 */
export const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  inventory: 'Stock & Inventory',
  pos: 'Point of Sale (Offline)',
  finance: 'Finance & Accounting',
  crm: 'Customers & Leads (CRM)',
  ecommerce: 'Online Store (E-commerce)',
  website: 'Public Website',
  reports: 'Reports & Analytics',
  settings: 'Business Settings',
  users: 'Team Members',
  roles: 'Roles & Permissions',
  shops: 'Branch Shops',
  audit: 'Audit Log',
};

/**
 * Stable display order for module groups in the UI. Anything missing here
 * falls through to alphabetical at the end so newly-added modules still
 * render (just lower priority).
 */
export const MODULE_ORDER: readonly string[] = [
  'dashboard',
  'inventory',
  'pos',
  'finance',
  'crm',
  'ecommerce',
  'website',
  'reports',
  'settings',
  'shops',
  'users',
  'roles',
  'audit',
];

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];
export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSIONS.map((p) => p.key) as readonly PermissionKey[];

/**
 * Default permission grants per built-in role. Custom roles start with the
 * permissions copied from whichever role the super-admin "based on" + manual
 * additions. SUPER_ADMIN always implicitly holds every permission — the
 * resolver short-circuits on that role, so this map only lists the others
 * explicitly for clarity and seeding.
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<RoleSlug, PermissionKey[]> = {
  SUPER_ADMIN: PERMISSION_KEYS.slice(), // full access; resolver still uses this for seeding the RolePermission table

  ACCOUNTANT: [
    'dashboard.view',
    'inventory.read',
    'inventory.write',
    'inventory.purchase_order',
    'inventory.hallmark',
    'finance.read',
    'finance.expense_write',
    'finance.goldloan_write',
    'finance.payroll_write',
    'finance.ledger_export',
    'reports.view',
    'reports.export',
    'shops.read',
    // Read-only window into every shop's POS for reconciliation /
    // variance tracking. Does NOT grant the right to ring up a bill.
    'pos.monitor',
  ],

  EMPLOYEE: [
    'dashboard.view',
    'inventory.read',
    'inventory.write',
    'inventory.transfer',
    'ecommerce.read',
    'ecommerce.product_write',
    'ecommerce.order_fulfil',
    'crm.read',
    'crm.write',
    'crm.whatsapp_send',
    'reports.view',
    'shops.read',
  ],

  POS_USER: [
    'pos.access',
    'pos.bill_create',
    'pos.estimate',
    'pos.parked_bill',
    'pos.exchange',
    'pos.advance',
    'pos.repair',
    'pos.day_open',
    'pos.day_close',
    'pos.cash_drawer',
    // Read-only stock so cashier can lookup items, but no edits.
    'inventory.read',
  ],
};

// --------------------------------------------------------------------------
// Domain enums (unchanged from earlier versions)
// --------------------------------------------------------------------------

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
  'STORE_CREDIT',
  'ADVANCE',
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

// Metal types. STAINLESS_STEEL is a non-precious metal (e.g. "18K Gold Tone"
// fashion jewellery): it is never priced off the gold/silver rate — it uses the
// stored base/cost price like DIAMOND/PLATINUM/OTHER do.
export const METAL_TYPES = [
  'GOLD',
  'SILVER',
  'DIAMOND',
  'PLATINUM',
  'STAINLESS_STEEL',
  'OTHER',
] as const;
export type MetalType = (typeof METAL_TYPES)[number];

// Allowed purity values (carat × 100). Silver = 0. Platinum coded as 9500.
// 900 = 9K (client default for "9K Fine Gold"); 1400 = 14K; 1800 = 18K.
export const PURITY_VALUES = [2400, 2200, 1800, 1400, 900, 0, 9500] as const;
export type Purity = (typeof PURITY_VALUES)[number];

// Making charge can be a percentage of metal value (basis points) or a flat
// rupee amount per gram of weight. PERCENTAGE is the default so existing rows
// (which only have a bps value) keep their current behaviour.
export const MAKING_CHARGE_MODES = ['PERCENTAGE', 'PER_GRAM'] as const;
export type MakingChargeMode = (typeof MAKING_CHARGE_MODES)[number];

// Storefront homepage sections a product can be featured in. One product (one
// inventory record) can belong to several at once. M3 FR#1. The exact list is a
// client decision (open item) — refining it here is a non-breaking change as
// long as the Prisma enum stays in sync.
export const STOREFRONT_SECTIONS = [
  'NEW_ARRIVAL',
  'BEST_SELLER',
  'FEATURED',
  'TRENDING',
  'DEAL',
] as const;
export type StorefrontSection = (typeof STOREFRONT_SECTIONS)[number];

// Human labels for the section enum (admin multi-select + storefront headings).
export const STOREFRONT_SECTION_LABELS: Record<StorefrontSection, string> = {
  NEW_ARRIVAL: 'New Arrivals',
  BEST_SELLER: 'Best Sellers',
  FEATURED: 'Featured',
  TRENDING: 'Trending',
  DEAL: 'Deals',
};

// Diamond 4 Cs — defaults use the GIA industry-standard scales. These drive the
// item form dropdowns; the client may refine the allowed values from their own
// grading chart (the DB stores them as free-form strings, so refining the list
// here is a non-breaking change). M1 FR#4.
export const DIAMOND_SHAPES = [
  'ROUND',
  'PRINCESS',
  'CUSHION',
  'OVAL',
  'EMERALD',
  'PEAR',
  'MARQUISE',
  'RADIANT',
  'ASSCHER',
  'HEART',
  'BAGUETTE',
  'OTHER',
] as const;
export type DiamondShape = (typeof DIAMOND_SHAPES)[number];

// Cut grade (GIA): Excellent → Poor.
export const DIAMOND_CUTS = ['EX', 'VG', 'GD', 'FR', 'PR'] as const;
export type DiamondCut = (typeof DIAMOND_CUTS)[number];

// Clarity grade (GIA): Flawless → Included.
export const DIAMOND_CLARITIES = [
  'FL',
  'IF',
  'VVS1',
  'VVS2',
  'VS1',
  'VS2',
  'SI1',
  'SI2',
  'I1',
  'I2',
  'I3',
] as const;
export type DiamondClarity = (typeof DIAMOND_CLARITIES)[number];

// Colour grade (GIA): D (colourless) → Z (light yellow).
export const DIAMOND_COLORS = [
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O-Z',
] as const;
export type DiamondColor = (typeof DIAMOND_COLORS)[number];

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

// Transfer workflow: PENDING (requested) -> APPROVED (items in transit) ->
// COMPLETED (received at destination). REJECTED is terminal from PENDING.
export const TRANSFER_STATUSES = ['PENDING', 'APPROVED', 'COMPLETED', 'REJECTED'] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

// --------------------------------------------------------------------------
// POS — offline shop operations
// --------------------------------------------------------------------------

export const REGISTER_SESSION_STATUSES = ['OPEN', 'CLOSED'] as const;
export type RegisterSessionStatus = (typeof REGISTER_SESSION_STATUSES)[number];

export const PARKED_BILL_STATUSES = ['ACTIVE', 'RESUMED', 'ABANDONED'] as const;
export type ParkedBillStatus = (typeof PARKED_BILL_STATUSES)[number];

export const ESTIMATE_STATUSES = ['DRAFT', 'SENT', 'CONVERTED', 'EXPIRED'] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

export const REPAIR_STATUSES = [
  'INTAKE',
  'IN_WORKSHOP',
  'READY',
  'DELIVERED',
  'CANCELLED',
] as const;
export type RepairStatus = (typeof REPAIR_STATUSES)[number];

export const ADVANCE_STATUSES = ['ACTIVE', 'CONSUMED', 'REFUNDED'] as const;
export type AdvanceStatus = (typeof ADVANCE_STATUSES)[number];

export const CASH_MOVEMENT_TYPES = ['PAY_IN', 'PAY_OUT', 'OPENING_FLOAT', 'DEPOSIT'] as const;
export type CashMovementType = (typeof CASH_MOVEMENT_TYPES)[number];

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
  '06': 'Haryana',
} as const;
