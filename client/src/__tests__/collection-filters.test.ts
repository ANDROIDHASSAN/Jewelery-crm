// Filter option labels are CMS free-text, so they must be PARSED, not looked up
// in a hardcoded registry. These cover the exact labels the live Zehlora
// storefront has stored — which is what broke: none of them existed as keys in
// the old FILTER_PREDICATES map, so checking one emptied the grid.

import { describe, it, expect } from 'vitest';
import { matchMetalLabel, parseRangeLabel } from '@/pages/storefront/CollectionPage';
import { productPriceView } from '@/features/storefront/pricing';

const prod = (metalType: string | null, purityCaratX100: number) =>
  ({ metalType, purityCaratX100 }) as Parameters<typeof matchMetalLabel>[1];

describe('parseRangeLabel — the live storefront price buckets', () => {
  it('parses the four labels the admin actually typed', () => {
    expect(parseRangeLabel('Under ₹2,000')).toEqual({ max: 2000 });
    expect(parseRangeLabel('Under ₹10,000')).toEqual({ max: 10000 });
    expect(parseRangeLabel('Under ₹25,000')).toEqual({ max: 25000 });
    expect(parseRangeLabel('₹25,000-₹1,00,000')).toEqual({ min: 25000, max: 100000 });
  });

  it('parses the shipped defaults it replaced', () => {
    expect(parseRangeLabel('Under ₹50,000')).toEqual({ max: 50000 });
    expect(parseRangeLabel('₹50,000 – ₹1,00,000')).toEqual({ min: 50000, max: 100000 });
    expect(parseRangeLabel('Over ₹1,00,000')).toEqual({ min: 100000 });
  });

  it('handles the separators an editor might reasonably type', () => {
    // hyphen, en-dash, em-dash, "to", and spacing variants.
    expect(parseRangeLabel('₹25,000-₹1,00,000')).toEqual({ min: 25000, max: 100000 });
    expect(parseRangeLabel('₹25,000 – ₹1,00,000')).toEqual({ min: 25000, max: 100000 });
    expect(parseRangeLabel('₹25,000 — ₹1,00,000')).toEqual({ min: 25000, max: 100000 });
    expect(parseRangeLabel('₹25,000 to ₹1,00,000')).toEqual({ min: 25000, max: 100000 });
  });

  it('normalises a reversed range', () => {
    expect(parseRangeLabel('₹1,00,000 - ₹25,000')).toEqual({ min: 25000, max: 100000 });
  });

  it('understands Indian shorthand', () => {
    expect(parseRangeLabel('Under ₹2k')).toEqual({ max: 2000 });
    expect(parseRangeLabel('Under 1L')).toEqual({ max: 100000 });
    expect(parseRangeLabel('Over 1 lakh')).toEqual({ min: 100000 });
    expect(parseRangeLabel('Above ₹2cr')).toEqual({ min: 20000000 });
  });

  it('reads the many ways to say a ceiling or a floor', () => {
    expect(parseRangeLabel('Below ₹5,000')).toEqual({ max: 5000 });
    expect(parseRangeLabel('Up to ₹5,000')).toEqual({ max: 5000 });
    expect(parseRangeLabel('Less than ₹5,000')).toEqual({ max: 5000 });
    expect(parseRangeLabel('Above ₹5,000')).toEqual({ min: 5000 });
    expect(parseRangeLabel('More than ₹5,000')).toEqual({ min: 5000 });
    expect(parseRangeLabel('₹5,000+')).toEqual({ min: 5000 });
  });

  it('treats a bare number as a ceiling', () => {
    expect(parseRangeLabel('₹25,000')).toEqual({ max: 25000 });
  });

  it('parses weight labels with the same parser (unit-agnostic)', () => {
    // The caller scales: rupees→paise for price, grams→mg for weight.
    expect(parseRangeLabel('Under 10 g')).toEqual({ max: 10 });
    expect(parseRangeLabel('10 – 20 g')).toEqual({ min: 10, max: 20 });
    expect(parseRangeLabel('Over 40 g')).toEqual({ min: 40 });
  });

  it('returns null for labels with no numbers, so other match paths run', () => {
    // These must fall through to the metal / category / product-name paths.
    expect(parseRangeLabel('Silver')).toBeNull();
    expect(parseRangeLabel('Rings')).toBeNull();
    expect(parseRangeLabel('')).toBeNull();
    expect(parseRangeLabel('Ask in store')).toBeNull();
  });

  it('parses decimals', () => {
    expect(parseRangeLabel('Under ₹2,500.50')).toEqual({ max: 2500.5 });
  });
});

describe('productPriceView — the offer travels with the piece', () => {
  // The real "hoops": non-precious, fixed base of ₹1,650.49 pre-GST → ₹1,700
  // inclusive, on FLAT 30% OFF. Every grid must agree on ₹1,190.
  const hoops = (sale: unknown) =>
    ({
      metalType: 'STAINLESS_STEEL',
      purityCaratX100: 0,
      weightMg: 15_000,
      basePricePaise: 1_65_049,
      fixedPricePaise: null,
      makingChargeBps: 0,
      makingChargeMode: null,
      makingChargePerGramPaise: null,
      stoneChargePaise: 0,
      sale,
    }) as Parameters<typeof productPriceView>[0];

  it('applies a PERCENT offer and reports the strike + badge', () => {
    const v = productPriceView(
      hoops({ type: 'PERCENT', discountBps: 3000, discountFlatPaise: 0, bogo: false }),
    );
    expect(v.originalPaise).toBe(1_70_000);
    expect(v.finalPaise).toBe(1_19_000);
    expect(v.discountPaise).toBe(51_000);
    expect(v.hasStrike).toBe(true);
    expect(v.badge).toBe('FLAT 30% OFF');
  });

  it('is identical whether the card is in the Sale row or a category grid', () => {
    // Same product object, same call — there is only one code path now. This is
    // the bug: the Season Sale row showed ₹1,190 and the Demifine showcase
    // showed ₹1,700 for the same piece, because only the former applied the offer.
    const sale = { type: 'PERCENT' as const, discountBps: 3000, discountFlatPaise: 0, bogo: false };
    expect(productPriceView(hoops(sale)).finalPaise).toBe(
      productPriceView(hoops(sale)).finalPaise,
    );
    expect(productPriceView(hoops(sale)).finalPaise).not.toBe(
      productPriceView(hoops(null)).finalPaise,
    );
  });

  it('leaves a piece with no offer untouched', () => {
    const v = productPriceView(hoops(null));
    expect(v.finalPaise).toBe(1_70_000);
    expect(v.originalPaise).toBe(1_70_000);
    expect(v.discountPaise).toBe(0);
    expect(v.hasStrike).toBe(false);
    expect(v.badge).toBeNull();
  });

  it('badges BOGO without cutting the per-unit price', () => {
    // The free piece depends on cart pairing, so the unit price must not drop —
    // but the badge still has to show on every grid.
    const v = productPriceView(
      hoops({ type: 'BOGO', discountBps: 0, discountFlatPaise: 0, bogo: true }),
    );
    expect(v.finalPaise).toBe(1_70_000);
    expect(v.discountPaise).toBe(0);
    expect(v.hasStrike).toBe(false);
    expect(v.bogo).toBe(true);
    expect(v.badge).toBe('BUY 1 GET 1 FREE');
  });

  it('BOGO wins the badge over a concurrent price cut', () => {
    const v = productPriceView(
      hoops({ type: 'PERCENT', discountBps: 3000, discountFlatPaise: 0, bogo: true }),
    );
    expect(v.finalPaise).toBe(1_19_000);
    expect(v.badge).toBe('BUY 1 GET 1 FREE');
  });

  it('applies a FLAT ₹-off offer', () => {
    const v = productPriceView(
      hoops({ type: 'FLAT', discountBps: 0, discountFlatPaise: 50_000, bogo: false }),
    );
    expect(v.finalPaise).toBe(1_20_000);
    expect(v.discountPaise).toBe(50_000);
  });

  it('never reports a negative discount', () => {
    // A FIXED_PRICE offer set ABOVE the computed price.
    const v = productPriceView(
      hoops({ type: 'FIXED_PRICE', discountBps: 0, discountFlatPaise: 2_50_000, bogo: false }),
    );
    expect(v.discountPaise).toBe(0);
  });
});

describe('matchMetalLabel', () => {
  it('never matches non-precious stock as Silver', () => {
    // purity 0 is a shared "no carat" sentinel — stainless steel carries it too.
    expect(matchMetalLabel('Silver', prod('STAINLESS_STEEL', 0))).toBe(false);
    expect(matchMetalLabel('Silver', prod('OTHER', 0))).toBe(false);
    expect(matchMetalLabel('Silver', prod('SILVER', 0))).toBe(true);
    // Legacy rows with no metalType and purity 0 were silver by convention.
    expect(matchMetalLabel('Silver', prod(null, 0))).toBe(true);
  });

  it('matches gold-tone / non-precious labels', () => {
    expect(matchMetalLabel('Gold tone', prod('STAINLESS_STEEL', 0))).toBe(true);
    expect(matchMetalLabel('Non-precious', prod('OTHER', 0))).toBe(true);
    expect(matchMetalLabel('Gold tone', prod('GOLD', 900))).toBe(false);
  });

  it('matches carats case-insensitively', () => {
    expect(matchMetalLabel('9K Gold', prod('GOLD', 900))).toBe(true);
    expect(matchMetalLabel('9k gold', prod('GOLD', 900))).toBe(true);
    expect(matchMetalLabel('22K', prod('GOLD', 2200))).toBe(true);
    expect(matchMetalLabel('22K Gold', prod('GOLD', 900))).toBe(false);
  });

  it('matches platinum', () => {
    expect(matchMetalLabel('Platinum', prod('PLATINUM', 9500))).toBe(true);
    expect(matchMetalLabel('Pt 950', prod('PLATINUM', 9500))).toBe(true);
  });

  it('returns null for labels that say nothing about metal', () => {
    // null = "not a metal label" → the caller falls through to category /
    // product-name matching. Distinct from false = "is a metal label, no match".
    expect(matchMetalLabel('Rings', prod('GOLD', 900))).toBeNull();
    expect(matchMetalLabel('Under ₹2,000', prod('GOLD', 900))).toBeNull();
  });
});
