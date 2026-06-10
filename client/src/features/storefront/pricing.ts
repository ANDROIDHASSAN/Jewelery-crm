// Shared storefront pricing + material labels — ONE source of truth so the
// collection grid, search results, related cards and the product page all show
// the same number (the GST-INCLUSIVE price the customer actually pays) and the
// same material label. Mirrors the server price math in ecommerce.routes /
// website.routes and the 3% GST in shared/bill-math.
//
// NOTE: ProductDetailPage keeps its own inline copy of this math because it
// also drives the live-rate pill + price breakdown; keep the two in sync.

import type { PublicProduct } from './storefrontApi';

// Fallback 22K rate used only before the live /website/gold-rate feed lands.
export const FALLBACK_RATE_PER_GRAM_22K_PAISE = 6420_00;
// 3% GST on jewellery (CGST+SGST intra-state, or IGST inter-state — both 3%).
// Matches shared/bill-math TOTAL_GST_BPS.
export const STOREFRONT_GST_BPS = 300;

export type StorefrontRate = { purity: number; ratePerGramPaise: number; stale?: boolean };
export type StorefrontRates = StorefrontRate[] | undefined;

// The product fields the price/label helpers read. PublicProduct satisfies it.
type PricedProduct = Pick<
  PublicProduct,
  | 'metalType'
  | 'purityCaratX100'
  | 'weightMg'
  | 'basePricePaise'
  | 'fixedPricePaise'
  | 'makingChargeBps'
  | 'makingChargeMode'
  | 'makingChargePerGramPaise'
  | 'stoneChargePaise'
>;

export interface StorefrontPrice {
  metalValuePaise: number;
  makingPaise: number;
  stoneChargePaise: number;
  /** metal + making + stone, before GST. */
  subtotalPaise: number;
  gstPaise: number;
  /** GST-inclusive — what the customer pays. */
  totalPaise: number;
  /** Effective per-gram rate used (0 for fixed / non-precious). */
  ratePerGramPaise: number;
  /** Rate to surface in the "today's rate" pill (0 = hide). */
  displayRatePerGramPaise: number;
  /** True when an exact-purity live rate was found. */
  exactRate: boolean;
  isFixed: boolean;
  /** Gold/silver with a usable live rate — show the rate pill + breakdown. */
  isLiveRated: boolean;
}

export function computeStorefrontPrice(p: PricedProduct, rates: StorefrontRates): StorefrontPrice {
  const findRate = (purity: number): number | undefined =>
    rates?.find((r) => r.purity === purity)?.ratePerGramPaise || undefined;
  const live22 = findRate(2200);
  const liveSilver = findRate(0);
  const exact = findRate(p.purityCaratX100);

  // A fixed selling price is the all-in (GST-inclusive) tag price — bypass the
  // live metal-rate calc for every metal type and price off the pre-GST base.
  const isFixed = p.fixedPricePaise != null;
  const isGold = !isFixed && (p.metalType === 'GOLD' || p.metalType === 'DIAMOND' || p.metalType === null);
  const isSilver = !isFixed && p.metalType === 'SILVER';

  let metalValuePaise = 0;
  let ratePerGramPaise = 0;
  let displayRatePerGramPaise = 0;
  if (isGold) {
    ratePerGramPaise = exact ?? live22 ?? FALLBACK_RATE_PER_GRAM_22K_PAISE;
    displayRatePerGramPaise = exact ?? ratePerGramPaise;
    metalValuePaise = exact
      ? Math.round((p.weightMg * exact) / 1000)
      : Math.round((p.weightMg * ratePerGramPaise * p.purityCaratX100) / (1000 * 2200));
  } else if (isSilver) {
    ratePerGramPaise = liveSilver ?? 0;
    displayRatePerGramPaise = ratePerGramPaise;
    metalValuePaise = Math.round((p.weightMg * ratePerGramPaise) / 1000);
  } else {
    // Fixed price OR non-precious → basePricePaise is the pre-GST base.
    metalValuePaise = p.basePricePaise;
  }

  // Fixed-priced pieces carry no separate making charge — the inclusive price
  // already covers everything; only GST is added.
  let makingPaise = 0;
  if (!isFixed) {
    if (p.makingChargeMode === 'PER_GRAM' && p.makingChargePerGramPaise != null) {
      makingPaise = Math.round((p.makingChargePerGramPaise * p.weightMg) / 1000);
    } else if (p.makingChargeBps > 0 && metalValuePaise > 0) {
      makingPaise = Math.round((metalValuePaise * p.makingChargeBps) / 10000);
    }
  }

  const subtotalPaise = metalValuePaise + makingPaise + p.stoneChargePaise;
  const gstPaise = Math.round((subtotalPaise * STOREFRONT_GST_BPS) / 10000);
  const totalPaise = subtotalPaise + gstPaise;
  return {
    metalValuePaise,
    makingPaise,
    stoneChargePaise: p.stoneChargePaise,
    subtotalPaise,
    gstPaise,
    totalPaise,
    ratePerGramPaise,
    displayRatePerGramPaise,
    exactRate: exact != null,
    isFixed,
    isLiveRated: (isGold || isSilver) && displayRatePerGramPaise > 0,
  };
}

// GST-inclusive price the customer pays, in paise. Convenience wrapper over
// computeStorefrontPrice().totalPaise for cards, sorting and price filters.
export function storefrontTotalPaise(p: PricedProduct, rates?: StorefrontRates): number {
  return computeStorefrontPrice(p, rates).totalPaise;
}

// Compact material label for a product-card subtitle. Non-precious pieces are
// NOT hallmarked and must never be labelled "Silver" just for carrying no carat
// — stainless-steel "gold tone" fashion jewellery is the common case.
//   gold/diamond  → "22K hallmarked" (carat-aware; 9K → "9K hallmarked")
//   silver        → "Silver hallmarked"
//   platinum      → "Pt 950 hallmarked"
//   stainless     → "Gold tone" (no hallmark)
//   other/unknown → "" (caller shows just the weight)
export function productMetaLabel(p: Pick<PublicProduct, 'metalType' | 'purityCaratX100'>): string {
  switch (p.metalType) {
    case 'STAINLESS_STEEL':
      return 'Gold tone';
    case 'OTHER':
      return '';
    case 'SILVER':
      return 'Silver hallmarked';
    case 'PLATINUM':
      return 'Pt 950 hallmarked';
    default: {
      // GOLD / DIAMOND / null (legacy). Carat-bearing only.
      if (p.purityCaratX100 === 9500) return 'Pt 950 hallmarked';
      if (p.purityCaratX100 === 0) return ''; // no carat info — don't fake "Silver"
      const k = p.purityCaratX100 / 100;
      return `${Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)}K hallmarked`;
    }
  }
}

// Longer material label for spec tables / the PDP header "Metal" value.
//   gold     → "22K · BIS Hallmarked"
//   silver   → "Silver · BIS Hallmarked"
//   platinum → "Pt 950 · BIS Hallmarked"
//   stainless→ "Gold tone · Plated"
//   other    → "Fashion"
export function productMaterialLabel(p: Pick<PublicProduct, 'metalType' | 'purityCaratX100'>): string {
  switch (p.metalType) {
    case 'STAINLESS_STEEL':
      return 'Gold tone · Plated';
    case 'OTHER':
      return 'Fashion';
    case 'SILVER':
      return 'Silver · BIS Hallmarked';
    case 'PLATINUM':
      return 'Pt 950 · BIS Hallmarked';
    default: {
      if (p.purityCaratX100 === 9500) return 'Pt 950 · BIS Hallmarked';
      if (p.purityCaratX100 === 0) return 'Fashion';
      const k = p.purityCaratX100 / 100;
      return `${Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)}K · BIS Hallmarked`;
    }
  }
}

// True for non-precious pieces (stainless steel / other) — used to gate
// hallmark/BIS/live-rate UI that only applies to real precious metals.
export function isNonPrecious(p: Pick<PublicProduct, 'metalType'>): boolean {
  return p.metalType === 'STAINLESS_STEEL' || p.metalType === 'OTHER';
}
