// Unit tests for shared/sale.ts — the Season Sale offer math shared by the
// storefront and the POS. Pure functions, no DB.

import { describe, expect, it } from 'vitest';
import {
  applySaleToPrePaise,
  saleLineDiscountPaise,
  computeBogoDiscountPaise,
} from '@goldos/shared/sale';

describe('applySaleToPrePaise', () => {
  it('PERCENT knocks the bps off the pre-GST price', () => {
    expect(applySaleToPrePaise(100_000, { type: 'PERCENT', discountBps: 1000, discountFlatPaise: 0 })).toBe(90_000);
    expect(applySaleToPrePaise(100_000, { type: 'PERCENT', discountBps: 3000, discountFlatPaise: 0 })).toBe(70_000);
  });

  it('PERCENT caps at 90% off', () => {
    // 95% requested → clamped to 90% → 10% of price remains.
    expect(applySaleToPrePaise(100_000, { type: 'PERCENT', discountBps: 9500, discountFlatPaise: 0 })).toBe(10_000);
  });

  it('FLAT subtracts the ₹ amount backed out of 3% GST', () => {
    // ₹1030 inclusive off → ₹1000 pre-GST off.
    expect(applySaleToPrePaise(100_000, { type: 'FLAT', discountFlatPaise: 103_00, discountBps: 0 })).toBe(90_000);
  });

  it('FLAT never goes below zero', () => {
    expect(applySaleToPrePaise(1_000, { type: 'FLAT', discountFlatPaise: 999_00, discountBps: 0 })).toBe(0);
  });

  it('BOGO makes no per-unit change', () => {
    expect(applySaleToPrePaise(100_000, { type: 'BOGO', discountBps: 0, discountFlatPaise: 0 })).toBe(100_000);
  });

  it('FIXED_PRICE sets the price to the fixed amount (pre-GST) regardless of original', () => {
    // ₹999 inclusive target → pre-GST base = round(99900 / 1.03) = 96990.
    expect(applySaleToPrePaise(500_000, { type: 'FIXED_PRICE', discountFlatPaise: 999_00, discountBps: 0 })).toBe(96_990);
    // Applies even when the original is cheaper than the fixed price.
    expect(applySaleToPrePaise(50_000, { type: 'FIXED_PRICE', discountFlatPaise: 999_00, discountBps: 0 })).toBe(96_990);
  });

  it('null offer is a no-op', () => {
    expect(applySaleToPrePaise(100_000, null)).toBe(100_000);
  });
});

describe('saleLineDiscountPaise', () => {
  it('is the difference the offer removes', () => {
    expect(saleLineDiscountPaise(100_000, { type: 'PERCENT', discountBps: 2500, discountFlatPaise: 0 })).toBe(25_000);
    expect(saleLineDiscountPaise(100_000, { type: 'BOGO', discountBps: 0, discountFlatPaise: 0 })).toBe(0);
  });
});

describe('computeBogoDiscountPaise', () => {
  it('frees the cheaper of each pair', () => {
    // [500,400,300,200] → free the 2nd + 4th cheapest of the sorted-desc list
    // (400 and 200) → 600.
    expect(computeBogoDiscountPaise([500_00, 400_00, 300_00, 200_00])).toBe(600_00);
  });

  it('one unit gets nothing free', () => {
    expect(computeBogoDiscountPaise([500_00])).toBe(0);
  });

  it('three units free the single cheaper of the top pair', () => {
    // sorted desc [500,300,100] → free index 1 (300). The lone 3rd stays paid.
    expect(computeBogoDiscountPaise([500_00, 300_00, 100_00])).toBe(300_00);
  });
});
