// shared/metal-rate.ts — ONE source of truth for "what is a gram of this worth?".
//
// Two rules drive everything here:
//
//   1. Only 9K gold and silver carry a published rate. The storefront, the
//      dashboard and the POS ticker all quote 9K — never 24K/22K/18K. GoldAPI
//      has no 9K series, so the poller derives it (24K × 900/2400) and writes
//      Redis key `goldrate:900`.
//   2. Rate source precedence is LIVE-WINS: with GOLDAPI_KEY attached the live
//      feed is authoritative everywhere; with no key (or a dead/stale feed) we
//      fall back to the rates an editor typed into Website → Gold rates. This
//      inverts the old CMS-overrides-live behaviour.
//
// Platinum has no feed on any provider we use, so its CMS field is its only
// source — key or no key.
//
// Valuation basis per metal (`resolveMetalValuePaise`):
//   GOLD / DIAMOND / null → 9K rate, scaled to the piece's own purity
//   SILVER                → silver rate, flat (purity is the 0 sentinel)
//   PLATINUM              → CMS platinum rate on a Pt 950 basis, purity-scaled
//   STAINLESS_STEEL/OTHER → recorded cost (no spot basis exists)
//
// DIAMOND rides the gold branch on purpose: a diamond ring's *metal* is gold,
// and the stones are booked separately as ItemDiamond.costPaise which callers
// add on top. This matches how the storefront already prices it (pricing.ts).

/** Gold purity (carat × 100) that every published rate is quoted at. */
export const GOLD_RATE_BASIS_PURITY = 900;
/** Platinum purity (millesimal) the CMS platinum rate is quoted at. */
export const PLATINUM_RATE_BASIS_PURITY = 9500;
/** Silver is stored with this purity sentinel; its rate needs no scaling. */
export const SILVER_PURITY_SENTINEL = 0;

export type MetalTypeLike =
  | 'GOLD'
  | 'SILVER'
  | 'DIAMOND'
  | 'PLATINUM'
  | 'STAINLESS_STEEL'
  | 'OTHER'
  | null;

/** Per-gram rates in paise. `null` = unavailable, caller must fall back to cost. */
export interface MetalRates {
  /** 9K gold, ₹/g in paise. */
  gold9kPaise: number | null;
  /** Silver, ₹/g in paise. */
  silverPaise: number | null;
  /** Platinum on a Pt 950 basis, ₹/g in paise. CMS-only — no live feed exists. */
  platinum950Paise: number | null;
}

/**
 * Parse an editor-typed rate into paise per gram.
 *
 * Deliberately tolerant: these fields have been free-text display strings for
 * their whole life, so real stored values look like `"14500/g"`, `"₹10760/g"`,
 * `"₹1,04,500.50 / gram"`. Anything without a parseable number returns null,
 * which callers read as "not configured".
 */
export function parseRateStringToPaise(input: string | null | undefined): number | null {
  if (typeof input !== 'string') return null;
  // Strip currency, separators, and any trailing unit ("/g", "per gram", "gm").
  const cleaned = input.replace(/[₹,\s]/g, '').replace(/\/?(per)?(gram|gm|g)\.?$/i, '');
  const m = /^(\d+(?:\.\d+)?)$/.exec(cleaned);
  if (!m) return null;
  const rupees = Number(m[1]);
  if (!Number.isFinite(rupees) || rupees <= 0) return null;
  return Math.round(rupees * 100);
}

/** Derive the 9K per-gram rate from a 24K per-gram rate. Both in paise. */
export function derive9kFrom24k(rate24kPaise: number): number {
  return Math.round((rate24kPaise * GOLD_RATE_BASIS_PURITY) / 2400);
}

/** True for metals we value at recorded cost rather than a spot rate. */
export function isCostBasisMetal(metalType: MetalTypeLike): boolean {
  return metalType === 'STAINLESS_STEEL' || metalType === 'OTHER';
}

/** True for metals that quote a live/CMS per-gram rate. */
export function isRateBasisMetal(metalType: MetalTypeLike): boolean {
  return !isCostBasisMetal(metalType);
}

/**
 * Human label for a piece's metal + purity. ONE source of truth — every table,
 * chip, chart, receipt and export must use this.
 *
 * The bug this exists to kill: `purityCaratX100 === 0` is a SHARED sentinel
 * meaning "carries no carat". Both SILVER and non-precious (stainless steel,
 * OTHER) store 0. Any label derived from purity alone therefore renders
 * gold-tone fashion jewellery as "Silver" — which is what the Inventory
 * "items by purity" chart, the POS bill line and the receipt all did.
 *
 * Purity NEVER disambiguates the metal. Only `metalType` does.
 */
export function metalPurityLabel(metalType: MetalTypeLike, purityCaratX100: number): string {
  if (isCostBasisMetal(metalType)) return 'Non-precious';
  if (metalType === 'SILVER') return 'Silver';
  if (metalType === 'PLATINUM') return platinumLabel(purityCaratX100);

  // GOLD / DIAMOND / null. DIAMOND's carat describes its gold setting.
  // A millesimal value under a gold-ish type is a mis-filed platinum piece.
  if (purityCaratX100 >= 9000 && purityCaratX100 <= 9999) return platinumLabel(purityCaratX100);
  if (purityCaratX100 <= 0) {
    // No carat on a gold row. A null metalType here is a legacy row that
    // predates the column — those were silver by convention, so keep that
    // reading rather than inventing "Gold".
    return metalType == null ? 'Silver' : 'Gold';
  }
  if (purityCaratX100 > 2400) return String(purityCaratX100);
  const k = purityCaratX100 / 100;
  return `${Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)}K Gold`;
}

function platinumLabel(purityCaratX100: number): string {
  const fineness =
    purityCaratX100 >= 9000 && purityCaratX100 <= 9999
      ? purityCaratX100 / 10
      : PLATINUM_RATE_BASIS_PURITY / 10;
  return `Pt ${fineness}`;
}

export interface MetalValueInput {
  metalType: MetalTypeLike;
  weightMg: number;
  purityCaratX100: number;
}

/**
 * Metal value of ONE piece, in paise. Returns `null` when no rate basis applies
 * (non-precious) or the needed rate is unconfigured — callers substitute the
 * piece's recorded cost price.
 *
 * Integer-safe: multiply before dividing so we never round a per-gram rate down
 * to the rupee mid-calculation.
 */
export function resolveMetalValuePaise(item: MetalValueInput, rates: MetalRates): number | null {
  const { metalType, weightMg, purityCaratX100 } = item;
  if (!Number.isFinite(weightMg) || weightMg <= 0) return null;

  if (metalType === 'SILVER') {
    if (rates.silverPaise == null) return null;
    return Math.round((weightMg * rates.silverPaise) / 1000);
  }

  if (metalType === 'PLATINUM') {
    if (rates.platinum950Paise == null) return null;
    // Purity is millesimal here (Pt 950 → 9500). Scale off the Pt 950 basis so
    // a Pt 950 piece gets exactly the quoted rate and Pt 990 gets ~4% more.
    const purity = purityCaratX100 > 0 ? purityCaratX100 : PLATINUM_RATE_BASIS_PURITY;
    return Math.round(
      (weightMg * rates.platinum950Paise * purity) / (1000 * PLATINUM_RATE_BASIS_PURITY),
    );
  }

  if (isCostBasisMetal(metalType)) return null;

  // GOLD / DIAMOND / null (legacy rows with no metalType).
  if (rates.gold9kPaise == null) return null;
  // A gold row carrying the silver sentinel has no carat information — we
  // cannot scale it, and guessing would silently invent value. Fall to cost.
  if (purityCaratX100 <= 0) return null;
  // Pt 950 mis-filed under a gold category: purity is millesimal, not carat.
  // Scaling it by /900 would value it at ~10.5× a 24K piece.
  if (purityCaratX100 > 2400) return null;
  return Math.round(
    (weightMg * rates.gold9kPaise * purityCaratX100) / (1000 * GOLD_RATE_BASIS_PURITY),
  );
}

/**
 * Metal value with the cost fallback already applied — the form every valuation
 * surface wants. `costPricePaise` is used whenever no rate basis resolves.
 */
export function metalValueOrCostPaise(
  item: MetalValueInput & { costPricePaise: number },
  rates: MetalRates,
): number {
  const rated = resolveMetalValuePaise(item, rates);
  return rated ?? item.costPricePaise;
}
