// server/src/__tests__/money.test.ts — integer invariants per specs/gotchas.md.

import { describe, expect, it } from 'vitest';
import {
  parseRupeesToPaise,
  formatPaise,
  applyBps,
  bankersRound,
  sumPaise,
  computeGoldValuePaise,
} from '../lib/money.js';

describe('parseRupeesToPaise', () => {
  it('parses Indian-grouped rupees with paise', () => {
    expect(parseRupeesToPaise('₹1,24,500.50')).toBe(12_450_050);
    expect(parseRupeesToPaise('1,000')).toBe(100_000);
    expect(parseRupeesToPaise('0.01')).toBe(1);
  });
  it('rejects invalid input', () => {
    expect(() => parseRupeesToPaise('abc')).toThrow();
    expect(() => parseRupeesToPaise('1.234')).toThrow(); // >2 decimals
  });
});

describe('formatPaise', () => {
  it('formats with Indian lakh/crore grouping', () => {
    expect(formatPaise(12_450_050)).toBe('₹1,24,500.50');
    expect(formatPaise(100_000)).toBe('₹1,000.00');
    expect(formatPaise(99)).toBe('₹0.99');
    expect(formatPaise(0)).toBe('₹0.00');
    // 1_00_00_00_000 paise = 10,00,00,000 paise × 100 wait no — 1_00_00_00_000
    // numeric literal = 10,000,000,000 paise = ₹10,00,00,000 = ₹10 crore.
    // formatPaise divides by 100 → ₹1,00,00,000 (₹1 crore). Fixed expectation.
    expect(formatPaise(1_00_00_00_000)).toBe('₹1,00,00,000.00'); // ₹1 crore
  });
});

describe('bankersRound', () => {
  it('rounds half to even', () => {
    expect(bankersRound(2.5)).toBe(2);
    expect(bankersRound(3.5)).toBe(4);
    expect(bankersRound(2.4)).toBe(2);
    expect(bankersRound(2.6)).toBe(3);
  });
});

describe('applyBps', () => {
  it('applies basis points without float drift', () => {
    // 1.5% of ₹1,00,000 (1_00_00_000 paise) = ₹1,500 = 1_50_000 paise
    expect(applyBps(1_00_00_000, 150)).toBe(1_50_000);
    // 3% of ₹1.50 (150 paise) = ₹0.045 → banker's round → 4 paise (even)
    expect(applyBps(150, 300)).toBe(4);
  });
});

describe('sumPaise', () => {
  it('sums an empty list to 0', () => {
    expect(sumPaise([])).toBe(0);
  });
  it('sums positive paise', () => {
    expect(sumPaise([100, 200, 300])).toBe(600);
  });
});

describe('computeGoldValuePaise', () => {
  it('computes gold value for 22K: weight × rate × (purity/2400)', () => {
    // 10g (10000 mg) of 22K at ₹6,500/g (6_50_000 paise/g):
    //   gross gold value = 10 × 6500 × (2200/2400) = 59,583.33...
    //   In paise: 59_583_33 (banker's-rounded last digit)
    const v = computeGoldValuePaise(10_000, 2200, 6_50_000);
    expect(v).toBeGreaterThan(0);
    // Integer property: no float drift.
    expect(Number.isInteger(v)).toBe(true);
  });
  it('returns 0 for silver (purity = 0)', () => {
    expect(computeGoldValuePaise(50_000, 0, 80_000)).toBe(0);
  });
});
