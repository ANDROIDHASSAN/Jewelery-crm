// Integrated billing math — mirrors the arithmetic in pos.service.ts so the
// numbers a cashier sees on screen, the numbers the service stores, and the
// numbers GST reports rely on stay in sync.
//
// We don't spin up Prisma/Redis here. The service-level integration tests live
// in a separate (e2e) job that runs against a real Postgres. These tests pin
// the *pure math*: gold + making + stone + GST = total, with proper paise-level
// rounding and a correct intra-vs-inter GST split.

import { describe, expect, it } from 'vitest';
import { applyBps, computeGoldValuePaise, sumPaise } from '../lib/money.js';
import { computeGst } from '../lib/gst.js';
import { resolveStateCode, splitTaxByPlaceOfSupply } from '@goldos/shared/bill-math';
import { BillCreateSchema, PaymentInputSchema } from '@goldos/shared/schemas';

interface MockLine {
  weightMg: number;
  purityCaratX100: number;
  ratePerGramPaise: number;
  makingBps: number;
  stoneChargePaise: number;
}

/** Mirror of pos.service.ts line computation, kept here to lock the contract. */
function rollupBill(
  lines: MockLine[],
  shopStateCode: string,
  customerStateCode: string | null = null,
  discountPaise = 0,
): {
  subtotal: number; making: number; stone: number;
  cgst: number; sgst: number; igst: number;
  total: number;
} {
  const computed = lines.map((l) => {
    const gold = computeGoldValuePaise(l.weightMg, l.purityCaratX100, l.ratePerGramPaise);
    const making = applyBps(gold, l.makingBps);
    const linePaise = gold + making + l.stoneChargePaise;
    return { gold, making, stone: l.stoneChargePaise, linePaise };
  });
  const subtotal = sumPaise(computed.map((c) => c.gold));
  const making = sumPaise(computed.map((c) => c.making));
  const stone = sumPaise(computed.map((c) => c.stone));
  const gst = computeGst({
    shopStateCode,
    customerStateCode,
    lines: computed.map((c) => ({ taxablePaise: c.linePaise })),
  });
  const total = subtotal + making + stone + gst.cgstPaise + gst.sgstPaise + gst.igstPaise - discountPaise;
  return {
    subtotal, making, stone,
    cgst: gst.cgstPaise, sgst: gst.sgstPaise, igst: gst.igstPaise,
    total,
  };
}

describe('Bill math — single line, intra-state', () => {
  it('22K 10g at ₹6,500/g with 12% making → gold + making + 3% GST', () => {
    const r = rollupBill([
      { weightMg: 10_000, purityCaratX100: 2200, ratePerGramPaise: 6_50_000, makingBps: 1200, stoneChargePaise: 0 },
    ], '06');
    // gold = 10 × 6500 × 22/24 ≈ ₹59,583.33  → 59_58_333 paise
    expect(r.subtotal).toBe(59_58_333);
    // making = 12% of gold = 7_14_999 (banker's rounded)
    expect(r.making).toBe(applyBps(r.subtotal, 1200));
    expect(r.stone).toBe(0);
    // Intra-state → IGST = 0
    expect(r.igst).toBe(0);
    expect(r.cgst).toBe(r.sgst); // symmetric split
    // total = subtotal + making + cgst + sgst
    expect(r.total).toBe(r.subtotal + r.making + r.cgst + r.sgst);
  });
});

describe('Bill math — multi-line with stone charges', () => {
  it('sums line components and applies GST to (gold + making + stone)', () => {
    const r = rollupBill([
      { weightMg: 5_000, purityCaratX100: 2200, ratePerGramPaise: 6_50_000, makingBps: 1500, stoneChargePaise: 2_50_000 },
      { weightMg: 3_000, purityCaratX100: 1800, ratePerGramPaise: 5_25_000, makingBps: 1800, stoneChargePaise: 0 },
    ], '06');
    expect(r.subtotal).toBeGreaterThan(0);
    expect(r.making).toBeGreaterThan(0);
    expect(r.stone).toBe(2_50_000);
    // GST on the full taxable base (gold+making+stone).
    expect(r.cgst + r.sgst).toBeGreaterThan(0);
    expect(r.total).toBe(r.subtotal + r.making + r.stone + r.cgst + r.sgst + r.igst);
  });
});

describe('Bill math — inter-state customer', () => {
  it('routes the full 3% to IGST, leaves CGST + SGST at 0', () => {
    const r = rollupBill([
      { weightMg: 10_000, purityCaratX100: 2200, ratePerGramPaise: 6_50_000, makingBps: 1200, stoneChargePaise: 0 },
    ], /* shop */ '06', /* customer */ '29');
    expect(r.cgst).toBe(0);
    expect(r.sgst).toBe(0);
    expect(r.igst).toBeGreaterThan(0);
  });
});

describe('Bill math — discount reduces total but not GST', () => {
  it('subtracts discount from the final total only', () => {
    const noDiscount = rollupBill([
      { weightMg: 10_000, purityCaratX100: 2200, ratePerGramPaise: 6_50_000, makingBps: 1200, stoneChargePaise: 0 },
    ], '06');
    const withDiscount = rollupBill([
      { weightMg: 10_000, purityCaratX100: 2200, ratePerGramPaise: 6_50_000, makingBps: 1200, stoneChargePaise: 0 },
    ], '06', null, 5_00_000);
    expect(withDiscount.cgst + withDiscount.sgst).toBe(noDiscount.cgst + noDiscount.sgst);
    expect(withDiscount.total).toBe(noDiscount.total - 5_00_000);
  });
});

describe('Split-payment validation', () => {
  const fixture = (payments: unknown[]) => ({
    shopId: 'c'.repeat(25),
    customerId: null,
    lines: [{
      itemId: 'd'.repeat(25),
      weightMg: 5_000,
      purityCaratX100: 2200,
      makingChargeBps: 1200,
      stoneChargePaise: 0,
    }],
    discountPaise: 0,
    oldGoldExchange: null,
    payments,
    idempotencyKey: 'a1b2c3d4-1234-4abc-89ef-0123456789ab',
  });

  it('accepts a single Cash payment', () => {
    const parsed = BillCreateSchema.safeParse(fixture([{ mode: 'CASH', amountPaise: 100_000 }]));
    expect(parsed.success).toBe(true);
  });

  it('accepts a 3-way split (Cash + UPI + Card)', () => {
    const parsed = BillCreateSchema.safeParse(fixture([
      { mode: 'CASH',  amountPaise: 30_000 },
      { mode: 'UPI',   amountPaise: 40_000, referenceId: 'TXN-9988' },
      { mode: 'CARD',  amountPaise: 30_000, referenceId: '1234' },
    ]));
    expect(parsed.success).toBe(true);
  });

  it('rejects an empty payments array', () => {
    const parsed = BillCreateSchema.safeParse(fixture([]));
    expect(parsed.success).toBe(false);
  });

  it('rejects an unknown payment mode', () => {
    const parsed = PaymentInputSchema.safeParse({ mode: 'BITCOIN', amountPaise: 100 });
    expect(parsed.success).toBe(false);
  });
});

describe('resolveStateCode — free-text checkout state → GST code', () => {
  it('maps state names (any case / spacing) to a 2-digit code', () => {
    expect(resolveStateCode('Haryana')).toBe('06');
    expect(resolveStateCode('  haryana ')).toBe('06');
    expect(resolveStateCode('DELHI')).toBe('07');
    expect(resolveStateCode('Maharashtra')).toBe('27');
  });
  it('accepts bare codes, abbreviations and full GSTINs', () => {
    expect(resolveStateCode('06')).toBe('06');
    expect(resolveStateCode('6')).toBe('06');
    expect(resolveStateCode('HR')).toBe('06');
    expect(resolveStateCode('06ABCDE1234F1Z5')).toBe('06');
  });
  it('returns null for blank / unknown values', () => {
    expect(resolveStateCode('')).toBeNull();
    expect(resolveStateCode(null)).toBeNull();
    expect(resolveStateCode('Atlantis')).toBeNull();
  });
});

describe('splitTaxByPlaceOfSupply — e-commerce GST split', () => {
  const HOME = '06'; // Haryana

  it('Haryana customer → CGST + SGST (half each), no IGST', () => {
    const s = splitTaxByPlaceOfSupply(48_375, 'Haryana', HOME);
    expect(s.igstPaise).toBe(0);
    expect(s.cgstPaise + s.sgstPaise).toBe(48_375);
    // Odd totals split without losing a paisa.
    expect(s.cgstPaise).toBe(24_187);
    expect(s.sgstPaise).toBe(24_188);
  });

  it('out-of-state customer → full IGST, no CGST/SGST', () => {
    const s = splitTaxByPlaceOfSupply(48_375, 'Delhi', HOME);
    expect(s.cgstPaise).toBe(0);
    expect(s.sgstPaise).toBe(0);
    expect(s.igstPaise).toBe(48_375);
  });

  it('unresolved / missing state defaults to intra-state (CGST+SGST)', () => {
    const s = splitTaxByPlaceOfSupply(1_000, null, HOME);
    expect(s.igstPaise).toBe(0);
    expect(s.cgstPaise + s.sgstPaise).toBe(1_000);
  });
});
