// Mirrors server money invariants. These two files must produce identical results.

import { describe, expect, it } from 'vitest';
import { formatPaise, parseRupeesToPaise, applyBps, bankersRound } from '@/lib/money';

describe('client money (byte-identical to server)', () => {
  it('formatPaise — Indian grouping', () => {
    expect(formatPaise(12_450_050)).toBe('₹1,24,500.50');
    expect(formatPaise(0)).toBe('₹0.00');
  });
  it('parseRupeesToPaise', () => {
    expect(parseRupeesToPaise('₹1,00,000')).toBe(1_00_00_000);
  });
  it('applyBps + bankersRound', () => {
    expect(applyBps(1_00_00_000, 150)).toBe(1_50_000);
    expect(bankersRound(2.5)).toBe(2);
    expect(bankersRound(3.5)).toBe(4);
  });
});
