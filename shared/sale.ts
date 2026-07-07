// shared/sale.ts — THE single source of truth for Season Sale offer math.
// Imported byte-identical by the storefront (server + client) AND the POS
// (server bill writer + cashier preview), so a sale piece is struck the same
// price everywhere. Extracted from website.routes.ts when Season Sales moved
// from one universal discount to multiple simultaneous campaigns.
//
// A campaign carries ONE offer (PERCENT / FLAT / BOGO) and a set of member
// items. An item belongs to at most one campaign, so its effective offer is
// unambiguous. These helpers operate on the resolved per-item offer.

export type SaleOfferType = 'PERCENT' | 'FLAT' | 'BOGO' | 'FIXED_PRICE';

export interface SaleOffer {
  type: SaleOfferType;
  /** PERCENT: basis points off the pre-GST price (10% = 1000). */
  discountBps: number;
  /** FLAT: paise off the GST-inclusive price. FIXED_PRICE: the target
   *  GST-inclusive price every item in the campaign sells at (e.g. ₹999). */
  discountFlatPaise: number;
}

/**
 * Apply a Season Sale offer to a PRE-GST line price.
 *   PERCENT — scales the base (a % off pre-GST == the same % off the
 *     GST-inclusive price, since GST is a flat 3% on top).
 *   FLAT — a ₹ amount off the GST-INCLUSIVE price, so we back the 3% GST out of
 *     it before subtracting, keeping the charged total in lockstep with the
 *     struck price shown to the customer.
 *   BOGO — no per-unit price change (handled separately as a free unit).
 * Integer paise throughout. Returns the reduced pre-GST price.
 */
export function applySaleToPrePaise(prePaise: number, offer?: SaleOffer | null): number {
  if (!offer || prePaise <= 0) return prePaise;
  if (offer.type === 'PERCENT') {
    const bps = Math.max(0, Math.min(9000, offer.discountBps));
    return Math.round(prePaise * (1 - bps / 10_000));
  }
  if (offer.type === 'FLAT') {
    const flatPre = Math.round(Math.max(0, offer.discountFlatPaise) / 1.03);
    return Math.max(0, prePaise - flatPre);
  }
  if (offer.type === 'FIXED_PRICE') {
    // The line's price BECOMES the fixed inclusive price, regardless of its
    // original value — back the 3% GST out so GST-on-top lands on that price.
    return Math.round(Math.max(0, offer.discountFlatPaise) / 1.03);
  }
  return prePaise;
}

/**
 * The pre-GST discount amount an offer knocks off a line (0 for BOGO). Handy
 * when the caller wants the discount as a separate figure (receipt line, or to
 * scale the metal/making/stone components proportionally).
 */
export function saleLineDiscountPaise(prePaise: number, offer?: SaleOffer | null): number {
  return Math.max(0, prePaise - applySaleToPrePaise(prePaise, offer));
}

/**
 * Buy-1-Get-1 within a single BOGO campaign: across the eligible units, the
 * cheaper of each pair is free. `unitPaise` is the (already per-item-discounted)
 * pre-GST price of each eligible unit. Returns the total value of the free
 * units. Pair only WITHIN one campaign — you can't earn a free unit from
 * campaign B by buying from campaign A.
 */
export function computeBogoDiscountPaise(unitPaise: number[]): number {
  const sorted = [...unitPaise].sort((a, b) => b - a); // most expensive first
  let discount = 0;
  for (let i = 1; i < sorted.length; i += 2) discount += sorted[i]!; // free the 2nd of each pair
  return discount;
}
