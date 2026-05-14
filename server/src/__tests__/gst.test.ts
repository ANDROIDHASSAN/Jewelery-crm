// server/src/__tests__/gst.test.ts — GST split correctness per specs/gotchas.md.

import { describe, expect, it } from 'vitest';
import { computeGst, isIntraState } from '../lib/gst.js';

describe('isIntraState', () => {
  it('treats matching state codes as intra', () => {
    expect(isIntraState('27', '27')).toBe(true);
  });
  it('treats mismatched state codes as inter', () => {
    expect(isIntraState('27', '29')).toBe(false);
  });
  it('treats missing customer state as intra (default)', () => {
    expect(isIntraState('27', null)).toBe(true);
  });
});

describe('computeGst — intra-state', () => {
  it('CGST + SGST at 1.5% each, IGST = 0', () => {
    const r = computeGst({
      shopStateCode: '27',
      customerStateCode: '27',
      lines: [{ taxablePaise: 1_00_00_000 }], // ₹1,00,000
    });
    expect(r.cgstPaise).toBe(1_50_000); // ₹1,500
    expect(r.sgstPaise).toBe(1_50_000);
    expect(r.igstPaise).toBe(0);
  });

  it('per-line rounding sums correctly', () => {
    const r = computeGst({
      shopStateCode: '27',
      lines: [{ taxablePaise: 333 }, { taxablePaise: 333 }, { taxablePaise: 333 }],
    });
    // CGST per line at 1.5% of 333 = 4.995 → banker's round to 5 paise (rounds to even when at 0.5 — but 0.005 is below 0.5 by integer math here)
    // Actually applyBps does (333 * 150) / 10000 = 4.995. bankersRound(4.995) = 5 (since 0.995 > 0.5).
    // 3 lines × 5 = 15
    expect(r.cgstPaise).toBe(15);
    expect(r.sgstPaise).toBe(15);
    expect(r.igstPaise).toBe(0);
  });
});

describe('computeGst — inter-state', () => {
  it('IGST at 3%, CGST + SGST = 0', () => {
    const r = computeGst({
      shopStateCode: '27',
      customerStateCode: '29',
      lines: [{ taxablePaise: 1_00_00_000 }],
    });
    expect(r.cgstPaise).toBe(0);
    expect(r.sgstPaise).toBe(0);
    expect(r.igstPaise).toBe(3_00_000); // ₹3,000
  });
});
