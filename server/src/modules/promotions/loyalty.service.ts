// Loyalty points service. Balance lives on Customer.loyaltyPoints (Int);
// LoyaltyTransaction is the append-only audit log used for expiry checks.
//
// Earn rate : 1 point per Rs.100 spent  →  1 pt per 10 000 paise
// Point value: 1 point = 1 paise  (100 pts = Rs.1)
// Minimum redeem : 500 points
// Maximum per cart: 20 % of subtotal
// Expiry: 12-month inactivity window (checked lazily at redemption time)

import { rawPrisma } from '../../lib/prisma.js';

// Default constants — used as fallback when no tenant config is available
export const EARN_RATE_PAISE = 10_000; // 1 pt per this many paise
export const POINT_VALUE_PAISE = 1;    // 1 pt = 1 paise
export const MIN_REDEEM_POINTS = 500;
export const MAX_REDEEM_PCT = 20;      // max % of subtotal payable by points
export const EXPIRY_DAYS = 365;

export interface LoyaltyConfig {
  earnRatePaise: number;
  pointValuePaise: number;
  minRedeemPoints: number;
  maxRedeemPct: number;
  expiryDays: number;
}

export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  earnRatePaise: EARN_RATE_PAISE,
  pointValuePaise: POINT_VALUE_PAISE,
  minRedeemPoints: MIN_REDEEM_POINTS,
  maxRedeemPct: MAX_REDEEM_PCT,
  expiryDays: EXPIRY_DAYS,
};

export async function fetchLoyaltyConfig(tenantId: string): Promise<LoyaltyConfig> {
  const t = await rawPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      loyaltyEarnRatePaise: true,
      loyaltyPointValuePaise: true,
      loyaltyMinRedeemPoints: true,
      loyaltyMaxRedeemPct: true,
      loyaltyExpiryDays: true,
    },
  });
  if (!t) return DEFAULT_LOYALTY_CONFIG;
  return {
    earnRatePaise: t.loyaltyEarnRatePaise,
    pointValuePaise: t.loyaltyPointValuePaise,
    minRedeemPoints: t.loyaltyMinRedeemPoints,
    maxRedeemPct: t.loyaltyMaxRedeemPct,
    expiryDays: t.loyaltyExpiryDays,
  };
}

export function computeEarnable(netPaidPaise: number, cfg?: LoyaltyConfig): number {
  return Math.floor(netPaidPaise / (cfg?.earnRatePaise ?? EARN_RATE_PAISE));
}

export function pointsToPaise(points: number, cfg?: LoyaltyConfig): number {
  return points * (cfg?.pointValuePaise ?? POINT_VALUE_PAISE);
}

export function maxRedeemablePoints(subtotalPaise: number, balance: number, cfg?: LoyaltyConfig): number {
  const cap = Math.floor((subtotalPaise * (cfg?.maxRedeemPct ?? MAX_REDEEM_PCT)) / 100);
  return Math.min(balance, cap);
}

export async function getBalance(customerId: string): Promise<number> {
  const c = await rawPrisma.customer.findUnique({
    where: { id: customerId },
    select: { loyaltyPoints: true },
  });
  return c?.loyaltyPoints ?? 0;
}

// Lazily expire points when 12 months of inactivity detected.
// Returns true if expiry was performed.
async function expireIfInactive(customerId: string, tenantId: string, cfg?: LoyaltyConfig): Promise<boolean> {
  const last = await rawPrisma.loyaltyTransaction.findFirst({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (!last) return false;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (cfg?.expiryDays ?? EXPIRY_DAYS));
  if (last.createdAt > cutoff) return false;

  const balance = await getBalance(customerId);
  if (balance <= 0) return false;

  await rawPrisma.$transaction([
    rawPrisma.customer.update({
      where: { id: customerId },
      data: { loyaltyPoints: 0 },
    }),
    rawPrisma.loyaltyTransaction.create({
      data: {
        tenantId,
        customerId,
        type: 'EXPIRE',
        points: -balance,
        note: 'Expired due to 12 months of inactivity',
      },
    }),
  ]);
  return true;
}

export interface RedemptionValidation {
  valid: boolean;
  error?: string;
  pointsToUse: number;
  discountPaise: number;
  balanceAfter: number;
}

export async function validateRedemption(
  customerId: string,
  tenantId: string,
  pointsRequested: number,
  subtotalAfterCouponPaise: number,
  cfg?: LoyaltyConfig,
): Promise<RedemptionValidation> {
  const c = cfg ?? DEFAULT_LOYALTY_CONFIG;
  await expireIfInactive(customerId, tenantId, c);
  const balance = await getBalance(customerId);

  if (balance < c.minRedeemPoints) {
    return {
      valid: false,
      error: `You need at least ${c.minRedeemPoints} points to redeem. Current balance: ${balance}`,
      pointsToUse: 0,
      discountPaise: 0,
      balanceAfter: balance,
    };
  }

  const maxByPct = Math.floor((subtotalAfterCouponPaise * c.maxRedeemPct) / 100);
  const maxPoints = Math.min(balance, maxByPct);
  const pointsToUse = Math.min(pointsRequested, maxPoints);

  if (pointsToUse < c.minRedeemPoints) {
    return {
      valid: false,
      error: `Maximum redeemable on this order is ${maxPoints} points (${c.maxRedeemPct}% cart limit)`,
      pointsToUse: 0,
      discountPaise: 0,
      balanceAfter: balance,
    };
  }

  return {
    valid: true,
    pointsToUse,
    discountPaise: pointsToPaise(pointsToUse, c),
    balanceAfter: balance - pointsToUse,
  };
}

// Called inside the order-create transaction. tx is the Prisma transaction client.
export async function redeemPointsInTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  customerId: string,
  tenantId: string,
  orderId: string,
  points: number,
): Promise<void> {
  await tx.customer.update({
    where: { id: customerId },
    data: { loyaltyPoints: { decrement: points } },
  });
  await tx.loyaltyTransaction.create({
    data: {
      tenantId,
      customerId,
      orderId,
      type: 'REDEEM',
      points: -points,
      note: `Redeemed on order ${orderId.slice(-6).toUpperCase()}`,
    },
  });
}

// Called after order moves to DELIVERED. Fire-and-forget safe — failure only
// means points aren't credited, which the admin can fix via ADMIN_ADJUST.
export async function creditEarnedPoints(
  orderId: string,
  customerId: string,
  tenantId: string,
  netPaidPaise: number,
  cfg?: LoyaltyConfig,
): Promise<number> {
  const c = cfg ?? await fetchLoyaltyConfig(tenantId);
  const points = computeEarnable(netPaidPaise, c);
  if (points <= 0) return 0;

  const [order] = await rawPrisma.$transaction([
    rawPrisma.order.update({
      where: { id: orderId },
      data: { loyaltyPointsEarned: points },
      select: { id: true },
    }),
    rawPrisma.customer.update({
      where: { id: customerId },
      data: { loyaltyPoints: { increment: points } },
    }),
    rawPrisma.loyaltyTransaction.create({
      data: {
        tenantId,
        customerId,
        orderId,
        type: 'EARN',
        points,
        note: `Earned on order ${orderId.slice(-6).toUpperCase()} (₹${Math.round(netPaidPaise / 100)})`,
      },
    }),
  ]);
  void order; // suppress unused warning
  return points;
}

// Refund redeemed points on cancel/return.
export async function refundRedeemedPoints(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  orderId: string,
  customerId: string,
  tenantId: string,
  pointsToRefund: number,
): Promise<void> {
  if (pointsToRefund <= 0) return;
  await tx.customer.update({
    where: { id: customerId },
    data: { loyaltyPoints: { increment: pointsToRefund } },
  });
  await tx.loyaltyTransaction.create({
    data: {
      tenantId,
      customerId,
      orderId,
      type: 'REFUND',
      points: pointsToRefund,
      note: `Points refunded on order ${orderId.slice(-6).toUpperCase()} cancel/return`,
    },
  });
}

// Reverse earned points when an order is cancelled/returned after delivery.
export async function reverseEarnedPoints(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  orderId: string,
  customerId: string,
  tenantId: string,
  pointsEarned: number,
): Promise<void> {
  if (pointsEarned <= 0) return;
  await tx.customer.update({
    where: { id: customerId },
    data: { loyaltyPoints: { decrement: pointsEarned } },
  });
  await tx.loyaltyTransaction.create({
    data: {
      tenantId,
      customerId,
      orderId,
      type: 'ADMIN_ADJUST',
      points: -pointsEarned,
      note: `Reversed earned points on order ${orderId.slice(-6).toUpperCase()} cancel/return`,
    },
  });
}
