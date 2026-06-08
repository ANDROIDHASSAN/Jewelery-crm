// Coupon code validation and discount computation service.
// All money in paise; all rates in bps (basis points, 1 bps = 0.01%).

import { rawPrisma } from '../../lib/prisma.js';

export interface CartLineForCoupon {
  productId: string;
  qty: number;
  pricePaise: number;
  categoryId?: string;
}

export interface CouponValidationResult {
  valid: boolean;
  error?: string;
  discountPaise: number;
  freeShipping: boolean;
  stackable: boolean;
  coupon?: {
    id: string;
    code: string;
    type: string;
    stackable: boolean;
  };
}

export async function validateAndComputeCoupon(
  code: string,
  customerId: string | null,
  cartLines: CartLineForCoupon[],
  subtotalPaise: number,
  tenantId: string,
): Promise<CouponValidationResult> {
  const coupon = await rawPrisma.couponCode.findUnique({
    where: { tenantId_code: { tenantId, code: code.toUpperCase().trim() } },
  });

  if (!coupon || !coupon.isActive) {
    return { valid: false, error: 'Invalid or expired coupon code', discountPaise: 0, freeShipping: false, stackable: false };
  }

  const now = new Date();
  if (coupon.validFrom > now) {
    return { valid: false, error: 'Coupon is not yet active', discountPaise: 0, freeShipping: false, stackable: false };
  }
  if (coupon.validUntil && coupon.validUntil < now) {
    return { valid: false, error: 'Coupon has expired', discountPaise: 0, freeShipping: false, stackable: false };
  }

  if (subtotalPaise < coupon.minCartPaise) {
    const minRs = Math.ceil(coupon.minCartPaise / 100);
    return { valid: false, error: `Minimum cart value of ₹${minRs} required for this coupon`, discountPaise: 0, freeShipping: false, stackable: false };
  }

  if (coupon.usageLimitTotal !== null && coupon.usageCount >= coupon.usageLimitTotal) {
    return { valid: false, error: 'This coupon has reached its usage limit', discountPaise: 0, freeShipping: false, stackable: false };
  }

  // Per-customer usage check
  if (customerId && coupon.usageLimitPerCustomer !== null) {
    const usedCount = await rawPrisma.couponUsage.count({
      where: { couponId: coupon.id, customerId },
    });
    if (usedCount >= (coupon.usageLimitPerCustomer ?? 1)) {
      return { valid: false, error: 'You have already used this coupon', discountPaise: 0, freeShipping: false, stackable: false };
    }
  }

  // FIRST_ORDER check
  if (coupon.type === 'FIRST_ORDER' && customerId) {
    const priorOrders = await rawPrisma.order.count({
      where: {
        tenantId,
        customerId,
        status: { notIn: ['CANCELLED', 'RETURNED'] },
      },
    });
    if (priorOrders > 0) {
      return { valid: false, error: 'This coupon is for first-time orders only', discountPaise: 0, freeShipping: false, stackable: false };
    }
  }

  // Product/category scope filtering
  let effectiveSubtotalPaise = subtotalPaise;
  if (coupon.productIds.length > 0 || coupon.categoryIds.length > 0) {
    const scopedLines = cartLines.filter((l) => {
      const inProducts = coupon.productIds.length === 0 || coupon.productIds.includes(l.productId);
      const inCategories = coupon.categoryIds.length === 0 || (l.categoryId && coupon.categoryIds.includes(l.categoryId));
      return inProducts || inCategories;
    });
    if (scopedLines.length === 0) {
      return { valid: false, error: 'Coupon is not applicable to items in your cart', discountPaise: 0, freeShipping: false, stackable: false };
    }
    effectiveSubtotalPaise = scopedLines.reduce((s, l) => s + l.pricePaise * l.qty, 0);
  }

  const meta = { id: coupon.id, code: coupon.code, type: coupon.type, stackable: coupon.stackable };

  if (coupon.type === 'FREE_SHIPPING') {
    return { valid: true, discountPaise: 0, freeShipping: true, stackable: coupon.stackable, coupon: meta };
  }

  if (coupon.type === 'PERCENT' || coupon.type === 'FIRST_ORDER') {
    if (coupon.valueBps > 0) {
      let disc = Math.round((effectiveSubtotalPaise * coupon.valueBps) / 10_000);
      if (coupon.maxDiscountPaise !== null) disc = Math.min(disc, coupon.maxDiscountPaise);
      return { valid: true, discountPaise: disc, freeShipping: false, stackable: coupon.stackable, coupon: meta };
    }
    // FIRST_ORDER with flat paise value
    const disc = Math.min(coupon.valuePaise, effectiveSubtotalPaise);
    return { valid: true, discountPaise: disc, freeShipping: false, stackable: coupon.stackable, coupon: meta };
  }

  if (coupon.type === 'FIXED') {
    const disc = Math.min(coupon.valuePaise, effectiveSubtotalPaise);
    return { valid: true, discountPaise: disc, freeShipping: false, stackable: coupon.stackable, coupon: meta };
  }

  if (coupon.type === 'BXGY') {
    const cfg = coupon.bxgyJson as { buyQty?: number; getQty?: number; productId?: string } | null;
    if (!cfg) {
      return { valid: false, error: 'Invalid BXGY coupon configuration', discountPaise: 0, freeShipping: false, stackable: false };
    }
    const buyQty = cfg.buyQty ?? 1;
    const getQty = cfg.getQty ?? 1;
    const eligible = cfg.productId
      ? cartLines.filter((l) => l.productId === cfg.productId)
      : cartLines;
    const totalQty = eligible.reduce((s, l) => s + l.qty, 0);
    const sets = Math.floor(totalQty / (buyQty + getQty));
    if (sets === 0) {
      return { valid: false, error: `Add ${buyQty + getQty} qualifying items for this offer`, discountPaise: 0, freeShipping: false, stackable: false };
    }
    // Lowest unit price × getQty × sets as the free item value
    const sortedPrices = eligible.map((l) => l.pricePaise).sort((a, b) => a - b);
    const freeItemPaise = sortedPrices[0] ?? 0;
    const disc = freeItemPaise * getQty * sets;
    return { valid: true, discountPaise: disc, freeShipping: false, stackable: coupon.stackable, coupon: meta };
  }

  return { valid: false, error: 'Unknown coupon type', discountPaise: 0, freeShipping: false, stackable: false };
}

// Called inside the order-create transaction.
export async function recordCouponUsageInTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  couponId: string,
  orderId: string,
  customerId: string,
  tenantId: string,
  discountPaise: number,
): Promise<void> {
  await tx.couponUsage.create({
    data: { tenantId, couponId, orderId, customerId, discountPaise },
  });
  await tx.couponCode.update({
    where: { id: couponId },
    data: { usageCount: { increment: 1 } },
  });
}

// Reverse a coupon slot on cancel/return.
export async function reverseCouponUsageInTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  orderId: string,
): Promise<void> {
  const usage = await tx.couponUsage.findUnique({ where: { orderId }, select: { id: true, couponId: true } });
  if (!usage) return;
  await tx.couponUsage.delete({ where: { id: usage.id } });
  await tx.couponCode.update({
    where: { id: usage.couponId },
    data: { usageCount: { decrement: 1 } },
  });
}
