// Parity tests for shared/bill-math.ts — the single source of truth the
// client preview and the server's authoritative bill writer share. If the
// two ever diverged again, the cashier would tell the customer a price
// the receipt then contradicts. These tests pin the shared module's math
// down so a careless refactor surfaces as a CI failure.

import { describe, expect, it } from 'vitest';
import {
  computeBillTotals,
  computeMetalValuePaise,
  resolveMakingChargePaise,
} from '@goldos/shared/bill-math';

describe('resolveMakingChargePaise — percentage vs flat per-gram', () => {
  it('PER_GRAM: ₹2/g on a 10g piece → ₹20 (2000 paise), independent of metal value', () => {
    const making = resolveMakingChargePaise({
      metalValuePaise: 59_58_333, // ignored for PER_GRAM
      weightMg: 10_000, // 10 g
      mode: 'PER_GRAM',
      bps: 1200,
      perGramPaise: 200, // ₹2 / g
    });
    expect(making).toBe(2_000); // ₹20
  });

  it('PERCENTAGE: 12% of metal value (matches the legacy bps path)', () => {
    const gold = computeMetalValuePaise(10_000, 2200, 6_50_000);
    const making = resolveMakingChargePaise({
      metalValuePaise: gold,
      weightMg: 10_000,
      mode: 'PERCENTAGE',
      bps: 1200,
      perGramPaise: null,
    });
    expect(making).toBe(Math.round((gold * 1200) / 10_000));
  });

  it('null mode falls back to the percentage path', () => {
    const making = resolveMakingChargePaise({
      metalValuePaise: 100_000,
      weightMg: 5_000,
      mode: null,
      bps: 1000,
      perGramPaise: 500,
    });
    expect(making).toBe(10_000); // 10% of 100000, not the per-gram rate
  });
});

describe('computeBillTotals — single line, intra-state', () => {
  it('22K 10g at ₹6,500/g, 12% making → gold + making + 3% GST split as CGST+SGST', () => {
    const gold = computeMetalValuePaise(10_000, 2200, 6_50_000);
    expect(gold).toBe(59_58_333);
    const making = Math.round((gold * 1200) / 10_000);
    const r = computeBillTotals({
      lines: [{ goldValuePaise: gold, makingPaise: making, stoneChargePaise: 0 }],
      shopStateCode: '06',
      customerStateCode: null,
    });
    expect(r.subtotalPaise).toBe(gold);
    expect(r.makingChargesPaise).toBe(making);
    expect(r.stoneChargesPaise).toBe(0);
    expect(r.igstPaise).toBe(0);
    expect(r.cgstPaise).toBe(r.sgstPaise);
    expect(r.totalPaise).toBe(r.subtotalPaise + r.makingChargesPaise + r.cgstPaise + r.sgstPaise);
  });
});

describe('computeBillTotals — inter-state customer', () => {
  it('routes the full 3% to IGST when shop and customer states differ', () => {
    const gold = computeMetalValuePaise(10_000, 2200, 6_50_000);
    const making = Math.round((gold * 1200) / 10_000);
    const r = computeBillTotals({
      lines: [{ goldValuePaise: gold, makingPaise: making, stoneChargePaise: 0 }],
      shopStateCode: '06',
      customerStateCode: '29',
    });
    expect(r.cgstPaise).toBe(0);
    expect(r.sgstPaise).toBe(0);
    expect(r.igstPaise).toBeGreaterThan(0);
  });
});

describe('computeBillTotals — discount only reduces total', () => {
  it('keeps GST identical with and without a flat discount', () => {
    const gold = computeMetalValuePaise(10_000, 2200, 6_50_000);
    const making = Math.round((gold * 1200) / 10_000);
    const base = computeBillTotals({
      lines: [{ goldValuePaise: gold, makingPaise: making, stoneChargePaise: 0 }],
      shopStateCode: '06',
    });
    const discounted = computeBillTotals({
      lines: [{ goldValuePaise: gold, makingPaise: making, stoneChargePaise: 0 }],
      discountPaise: 5_00_000,
      shopStateCode: '06',
    });
    expect(discounted.cgstPaise + discounted.sgstPaise).toBe(base.cgstPaise + base.sgstPaise);
    expect(discounted.totalPaise).toBe(base.totalPaise - 5_00_000);
  });
});

describe('computeBillTotals — old-gold exchange', () => {
  it('deducts 2% wastage and shrinks the taxable base per line', () => {
    const gold = computeMetalValuePaise(10_000, 2200, 6_50_000);
    const making = Math.round((gold * 1200) / 10_000);
    const noExchange = computeBillTotals({
      lines: [{ goldValuePaise: gold, makingPaise: making, stoneChargePaise: 0 }],
      shopStateCode: '06',
    });
    const withExchange = computeBillTotals({
      lines: [{ goldValuePaise: gold, makingPaise: making, stoneChargePaise: 0 }],
      oldGold: { weightMg: 5_000, purityCaratX100: 2200, ratePerGramPaise: 6_50_000 },
      shopStateCode: '06',
    });
    // Exchange value should be 5g gold-equivalent − 2% wastage.
    const gross = computeMetalValuePaise(5_000, 2200, 6_50_000);
    const wastage = Math.round((gross * 200) / 10_000);
    expect(withExchange.oldGoldValuePaise).toBe(gross - wastage);
    // GST should drop because the taxable base shrunk.
    expect(withExchange.cgstPaise + withExchange.sgstPaise).toBeLessThan(
      noExchange.cgstPaise + noExchange.sgstPaise,
    );
    // Total is reduced by exchange value but also by smaller GST.
    expect(withExchange.totalPaise).toBeLessThan(noExchange.totalPaise);
  });
});

describe('computeBillTotals — per-line GST rate', () => {
  it('defaults to 3% when gstRateBps is omitted (legacy behaviour)', () => {
    const gold = computeMetalValuePaise(10_000, 2200, 6_50_000);
    const r = computeBillTotals({
      lines: [{ goldValuePaise: gold, makingPaise: 0, stoneChargePaise: 0 }],
      shopStateCode: '06',
    });
    // 3% total, split intra as CGST+SGST that add back to the line GST exactly.
    expect(r.cgstPaise + r.sgstPaise).toBe(Math.round((gold * 300) / 10_000));
    expect(r.lineCgstPaise[0]! + r.lineSgstPaise[0]!).toBe(r.cgstPaise + r.sgstPaise);
  });

  it('applies each line its OWN rate and reports a per-line breakdown', () => {
    const g1 = computeMetalValuePaise(10_000, 2200, 6_50_000); // 3% line
    const g2 = 10_00_000; // ₹10,000 taxable at 5%
    const r = computeBillTotals({
      lines: [
        { goldValuePaise: g1, makingPaise: 0, stoneChargePaise: 0, gstRateBps: 300 },
        { goldValuePaise: g2, makingPaise: 0, stoneChargePaise: 0, gstRateBps: 500 },
      ],
      shopStateCode: '06',
    });
    // Line 0 taxed at 3%, line 1 at 5% — computed independently, then summed.
    const line0Gst = Math.round((g1 * 300) / 10_000);
    const line1Gst = Math.round((g2 * 500) / 10_000);
    expect(r.lineCgstPaise[0]! + r.lineSgstPaise[0]!).toBe(line0Gst);
    expect(r.lineCgstPaise[1]! + r.lineSgstPaise[1]!).toBe(line1Gst);
    expect(r.cgstPaise + r.sgstPaise).toBe(line0Gst + line1Gst);
    expect(r.igstPaise).toBe(0);
  });

  it('routes a per-line rate to IGST inter-state', () => {
    const g = 10_00_000;
    const r = computeBillTotals({
      lines: [{ goldValuePaise: g, makingPaise: 0, stoneChargePaise: 0, gstRateBps: 500 }],
      shopStateCode: '06',
      customerStateCode: '29',
    });
    expect(r.cgstPaise).toBe(0);
    expect(r.sgstPaise).toBe(0);
    expect(r.igstPaise).toBe(Math.round((g * 500) / 10_000));
    expect(r.lineIgstPaise[0]!).toBe(r.igstPaise);
  });
});

describe('computeBillTotals — silver fix', () => {
  it('values silver (purity=0) at weight × rate without carat scaling', () => {
    // 50 g silver at ₹95/g (= 9500 paise/g) = ₹4,750 = 475,000 paise
    const v = computeMetalValuePaise(50_000, 0, 9_500);
    expect(v).toBe(475_000);
  });
});

describe('computeBillTotals — multi-line stone charges', () => {
  it('taxes (gold + making + stone) per line', () => {
    const g1 = computeMetalValuePaise(5_000, 2200, 6_50_000);
    const g2 = computeMetalValuePaise(3_000, 1800, 5_25_000);
    const m1 = Math.round((g1 * 1500) / 10_000);
    const m2 = Math.round((g2 * 1800) / 10_000);
    const r = computeBillTotals({
      lines: [
        { goldValuePaise: g1, makingPaise: m1, stoneChargePaise: 2_50_000 },
        { goldValuePaise: g2, makingPaise: m2, stoneChargePaise: 0 },
      ],
      shopStateCode: '06',
    });
    expect(r.stoneChargesPaise).toBe(2_50_000);
    expect(r.cgstPaise + r.sgstPaise).toBeGreaterThan(0);
    expect(r.totalPaise).toBe(
      r.subtotalPaise + r.makingChargesPaise + r.stoneChargesPaise + r.cgstPaise + r.sgstPaise,
    );
  });
});
