// Unit tests for shared/metal-rate — the single valuation formula behind the
// dashboard card, Inventory → Valuation, Analytics → Inventory value and
// /low-margin. Pure math, no DB or Redis.

import { describe, it, expect } from 'vitest';
import {
  derive9kFrom24k,
  isCostBasisMetal,
  metalPurityLabel,
  metalValueOrCostPaise,
  parseRateStringToPaise,
  resolveMetalValuePaise,
  type MetalRates,
} from '@goldos/shared/metal-rate';

// ₹4,710/g 9K, ₹181.73/g silver, ₹32,000/g Pt950.
const RATES: MetalRates = {
  gold9kPaise: 4710_00,
  silverPaise: 181_73,
  platinum950Paise: 32_000_00,
};

describe('parseRateStringToPaise', () => {
  it('parses the free-text formats already stored in live CMS rows', () => {
    // These are the exact shapes seen in the Zehlora CMS today.
    expect(parseRateStringToPaise('14500/g')).toBe(14_500_00);
    expect(parseRateStringToPaise('₹10760/g')).toBe(10_760_00);
    expect(parseRateStringToPaise('₹230.50/g')).toBe(230_50);
    expect(parseRateStringToPaise('13200/g')).toBe(13_200_00);
  });

  it('tolerates Indian digit grouping, spacing and unit variants', () => {
    expect(parseRateStringToPaise('₹1,04,500.50 / gram')).toBe(1_04_500_50);
    expect(parseRateStringToPaise('  4710  ')).toBe(4710_00);
    expect(parseRateStringToPaise('4710 per gram')).toBe(4710_00);
    expect(parseRateStringToPaise('4710/gm')).toBe(4710_00);
  });

  it('returns null for blank / unparseable / non-positive input', () => {
    // Blank is the "not configured, use the feed" signal — must not become 0.
    expect(parseRateStringToPaise('')).toBeNull();
    expect(parseRateStringToPaise('   ')).toBeNull();
    expect(parseRateStringToPaise(null)).toBeNull();
    expect(parseRateStringToPaise(undefined)).toBeNull();
    expect(parseRateStringToPaise('ask in store')).toBeNull();
    expect(parseRateStringToPaise('0')).toBeNull();
    expect(parseRateStringToPaise('-500/g')).toBeNull();
  });
});

describe('derive9kFrom24k', () => {
  it('is 24K scaled by 900/2400', () => {
    // GoldAPI publishes no 9K series, so the poller derives it.
    expect(derive9kFrom24k(12_560_78)).toBe(Math.round((12_560_78 * 900) / 2400));
    expect(derive9kFrom24k(12_000_00)).toBe(4_500_00);
  });
});

describe('resolveMetalValuePaise — gold', () => {
  it('values a 9K piece at exactly the quoted 9K rate', () => {
    // 10g of 9K at ₹4,710/g = ₹47,100. The headline case.
    const v = resolveMetalValuePaise(
      { metalType: 'GOLD', weightMg: 10_000, purityCaratX100: 900 },
      RATES,
    );
    expect(v).toBe(47_100_00);
  });

  it('scales a non-9K piece off the 9K basis', () => {
    // 22K is 2200/900 of the 9K basis.
    const v = resolveMetalValuePaise(
      { metalType: 'GOLD', weightMg: 10_000, purityCaratX100: 2200 },
      RATES,
    );
    expect(v).toBe(Math.round((10_000 * 4710_00 * 2200) / (1000 * 900)));
  });

  it('is equivalent to the old 24K-based math (totals must not move)', () => {
    // The old formula was weight × rate24 × purity/2400. Deriving 9K from 24K
    // and scaling by purity/900 must land on the same number, else every
    // existing valuation total shifts.
    //
    // Publishing a 9K rate means quantizing it to whole paise, which costs up
    // to 0.5 paise per gram. That error is then scaled by grams × purity/900,
    // so the bound grows with both — it is not a flat constant. Worst case here
    // (8.5 g of 24K) is ~12 paise on a ~₹47,000 piece: sub-rupee, and the price
    // of quoting 9K at all.
    const rate24 = 12_560_78;
    const weightMg = 8_500;
    const rates: MetalRates = { ...RATES, gold9kPaise: derive9kFrom24k(rate24) };
    for (const purity of [900, 1400, 1800, 2200, 2400]) {
      const old = Math.round((weightMg * rate24 * purity) / (1000 * 2400));
      const next = resolveMetalValuePaise(
        { metalType: 'GOLD', weightMg, purityCaratX100: purity },
        rates,
      )!;
      const bound = Math.ceil(0.5 * (weightMg / 1000) * (purity / 900)) + 1;
      expect(Math.abs(next - old)).toBeLessThanOrEqual(bound);
      // And it must stay far below one rupee, which is what actually matters.
      expect(Math.abs(next - old)).toBeLessThan(100);
    }
  });

  it('treats DIAMOND as gold — the metal in a diamond ring is gold', () => {
    // Stones are booked separately as ItemDiamond.costPaise and added on top.
    const asDiamond = resolveMetalValuePaise(
      { metalType: 'DIAMOND', weightMg: 5_000, purityCaratX100: 1800 },
      RATES,
    );
    const asGold = resolveMetalValuePaise(
      { metalType: 'GOLD', weightMg: 5_000, purityCaratX100: 1800 },
      RATES,
    );
    expect(asDiamond).toBe(asGold);
  });

  it('falls back to cost when a gold row carries no carat info', () => {
    // purity 0 is the silver sentinel; on a gold row it means "unknown".
    // Guessing a carat would silently invent value.
    expect(
      resolveMetalValuePaise({ metalType: 'GOLD', weightMg: 5_000, purityCaratX100: 0 }, RATES),
    ).toBeNull();
  });

  it('refuses to value a millesimal purity off the gold basis', () => {
    // Pt 950 (9500) mis-filed under a gold category would otherwise scale by
    // 9500/900 ≈ 10.5× — a wildly inflated number.
    expect(
      resolveMetalValuePaise({ metalType: 'GOLD', weightMg: 5_000, purityCaratX100: 9500 }, RATES),
    ).toBeNull();
  });
});

describe('resolveMetalValuePaise — silver', () => {
  it('values silver flat at the silver rate, no purity scaling', () => {
    // 100g at ₹181.73/g = ₹18,173. Silver carries the purity 0 sentinel, so
    // scaling it by purity would zero the line out (a bug we already fixed once).
    const v = resolveMetalValuePaise(
      { metalType: 'SILVER', weightMg: 100_000, purityCaratX100: 0 },
      RATES,
    );
    expect(v).toBe(18_173_00);
  });
});

describe('resolveMetalValuePaise — platinum', () => {
  it('values a Pt 950 piece at exactly the quoted platinum rate', () => {
    const v = resolveMetalValuePaise(
      { metalType: 'PLATINUM', weightMg: 10_000, purityCaratX100: 9500 },
      RATES,
    );
    expect(v).toBe(3_20_000_00);
  });

  it('scales Pt 990 up off the Pt 950 basis', () => {
    const v = resolveMetalValuePaise(
      { metalType: 'PLATINUM', weightMg: 10_000, purityCaratX100: 9900 },
      RATES,
    );
    expect(v).toBe(Math.round((10_000 * 32_000_00 * 9900) / (1000 * 9500)));
  });

  it('falls back to cost when no platinum rate is configured', () => {
    // Platinum has no live feed anywhere — a blank CMS field means no basis.
    const v = resolveMetalValuePaise(
      { metalType: 'PLATINUM', weightMg: 10_000, purityCaratX100: 9500 },
      { ...RATES, platinum950Paise: null },
    );
    expect(v).toBeNull();
  });

  it('never touches the gold rate', () => {
    const v = resolveMetalValuePaise(
      { metalType: 'PLATINUM', weightMg: 10_000, purityCaratX100: 9500 },
      { ...RATES, gold9kPaise: 999_999_00 },
    );
    expect(v).toBe(3_20_000_00);
  });
});

describe('non-precious metals', () => {
  it('are cost-basis', () => {
    expect(isCostBasisMetal('STAINLESS_STEEL')).toBe(true);
    expect(isCostBasisMetal('OTHER')).toBe(true);
    expect(isCostBasisMetal('GOLD')).toBe(false);
    expect(isCostBasisMetal('SILVER')).toBe(false);
    expect(isCostBasisMetal('PLATINUM')).toBe(false);
  });

  it('resolve to no rate basis regardless of weight or purity', () => {
    for (const metalType of ['STAINLESS_STEEL', 'OTHER'] as const) {
      expect(
        resolveMetalValuePaise({ metalType, weightMg: 10_000, purityCaratX100: 2200 }, RATES),
      ).toBeNull();
    }
  });

  it('value at recorded cost via metalValueOrCostPaise', () => {
    const v = metalValueOrCostPaise(
      {
        metalType: 'STAINLESS_STEEL',
        weightMg: 10_000,
        purityCaratX100: 0,
        costPricePaise: 1_250_00,
      },
      RATES,
    );
    expect(v).toBe(1_250_00);
  });
});

describe('metalPurityLabel', () => {
  it('never labels non-precious stock "Silver", whatever its purity', () => {
    // THE bug: purityCaratX100 === 0 is a shared "no carat" sentinel used by
    // BOTH silver and non-precious. Labelling off purity alone rendered 120
    // gold-tone stainless pieces as "Silver" on the inventory chart, the POS
    // catalog and the bill line.
    expect(metalPurityLabel('STAINLESS_STEEL', 0)).toBe('Non-precious');
    expect(metalPurityLabel('OTHER', 0)).toBe('Non-precious');
    // Even if a stray carat got stored on a non-precious row, the metal wins.
    expect(metalPurityLabel('STAINLESS_STEEL', 2200)).toBe('Non-precious');
    expect(metalPurityLabel('OTHER', 900)).toBe('Non-precious');
  });

  it('labels real silver "Silver"', () => {
    expect(metalPurityLabel('SILVER', 0)).toBe('Silver');
    expect(metalPurityLabel('SILVER', 925)).toBe('Silver');
  });

  it('names the karat for gold', () => {
    expect(metalPurityLabel('GOLD', 900)).toBe('9K Gold');
    expect(metalPurityLabel('GOLD', 2200)).toBe('22K Gold');
    expect(metalPurityLabel('GOLD', 1800)).toBe('18K Gold');
    expect(metalPurityLabel('GOLD', 2400)).toBe('24K Gold');
    // Custom alloys the schema explicitly permits.
    expect(metalPurityLabel('GOLD', 2100)).toBe('21K Gold');
    expect(metalPurityLabel('GOLD', 1650)).toBe('16.5K Gold');
  });

  it('labels a diamond piece by its gold setting', () => {
    expect(metalPurityLabel('DIAMOND', 1800)).toBe('18K Gold');
  });

  it('labels platinum by fineness', () => {
    expect(metalPurityLabel('PLATINUM', 9500)).toBe('Pt 950');
    expect(metalPurityLabel('PLATINUM', 9900)).toBe('Pt 990');
    // Missing/zero purity on a platinum row → the Pt 950 default, not "Gold".
    expect(metalPurityLabel('PLATINUM', 0)).toBe('Pt 950');
  });

  it('recognises platinum mis-filed under a gold category', () => {
    // Would otherwise read "95K Gold".
    expect(metalPurityLabel('GOLD', 9500)).toBe('Pt 950');
  });

  it('keeps the legacy silver reading for pre-metalType rows only', () => {
    // A null metalType with no carat is a legacy row; those were silver by
    // convention. An explicit GOLD row with no carat is just gold.
    expect(metalPurityLabel(null, 0)).toBe('Silver');
    expect(metalPurityLabel('GOLD', 0)).toBe('Gold');
  });

  it('does not print 9K gold as "90" or Pt 950 as "95K"', () => {
    // The POS receipt did exactly this: 900 fell into a millesimal branch.
    expect(metalPurityLabel('GOLD', 900)).not.toBe('90');
    expect(metalPurityLabel('PLATINUM', 9500)).not.toBe('95K');
  });
});

describe('metalValueOrCostPaise — the form every valuation surface uses', () => {
  it('prefers the rate basis when one resolves', () => {
    const v = metalValueOrCostPaise(
      { metalType: 'GOLD', weightMg: 10_000, purityCaratX100: 900, costPricePaise: 1_00 },
      RATES,
    );
    expect(v).toBe(47_100_00);
  });

  it('falls back to cost when the gold rate is unconfigured', () => {
    // No API key AND no CMS rate → we must not value gold at zero.
    const v = metalValueOrCostPaise(
      { metalType: 'GOLD', weightMg: 10_000, purityCaratX100: 900, costPricePaise: 30_000_00 },
      { gold9kPaise: null, silverPaise: null, platinum950Paise: null },
    );
    expect(v).toBe(30_000_00);
  });

  it('falls back to cost for a zero/absent weight', () => {
    const v = metalValueOrCostPaise(
      { metalType: 'GOLD', weightMg: 0, purityCaratX100: 900, costPricePaise: 5_000_00 },
      RATES,
    );
    expect(v).toBe(5_000_00);
  });
});
