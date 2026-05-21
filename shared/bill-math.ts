// shared/bill-math.ts — THE single source of truth for POS / storefront
// bill totals. Imported byte-identical by both `server/src/modules/pos`
// (authoritative computation) and `client/src/pos-app` (live cashier
// preview). If these ever diverge again, the cashier's screen will lie to
// the customer at the till — that's the bug we fixed by extracting this.
//
// Rules of the road (kept aligned with claude/specs/gotchas.md):
//   - Money in paise (integer). No float math. Banker's rounding on every
//     bps multiplication so per-line rounding doesn't drift.
//   - GST = 3% on (gold + making + stone), per line.
//   - Old-gold exchange reduces the taxable base, allocated proportionally
//     to each line's share of the bill total (matches the legacy service).
//   - Discount and loyalty redemption reduce the GRAND TOTAL only — they
//     do NOT shrink the taxable base. Reason: the customer's exchange of
//     value is a separate transaction; you can't shave VAT off a goodwill
//     discount. This also matches what BIS/GST inspectors expect.
//   - Intra-state shops emit CGST + SGST (1.5% each). Inter-state shops
//     (shop.gstStateCode != customer.gstStateCode) emit IGST (3%).
//   - Wastage is an OLD-GOLD-EXCHANGE concept only. We deduct 2% wastage
//     when valuing the customer's exchanged jewellery, not when ringing
//     up a fresh sale. (The earlier client UI was applying it to every
//     bill as a separate line — that's the divergence we're killing.)

import { CGST_RATE_BPS, SGST_RATE_BPS, IGST_RATE_BPS } from './constants.js';

// ── Money primitives (identical to client/src/lib/money.ts + server/src/lib/money.ts).
// Duplicated here so this module has no cross-runtime imports.

function bankersRound(n: number): number {
  const floor = Math.floor(n);
  const diff = n - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

export function applyBpsShared(paise: number, bps: number): number {
  return bankersRound((paise * bps) / 10_000);
}

export function sumPaiseShared(values: number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

/**
 * Metal value in paise. Gold = weight × rate × (purity / 24K). Silver is
 * stored as `purityCaratX100 === 0` and uses the per-gram silver rate
 * directly. (The earlier client had a `return 0` for silver — that's why
 * silver lines used to show ₹0 in the catalog.)
 */
export function computeMetalValuePaise(
  weightMg: number,
  purityCaratX100: number,
  ratePerGramPaise: number,
): number {
  if (purityCaratX100 === 0) {
    return bankersRound((weightMg * ratePerGramPaise) / 1000);
  }
  return bankersRound((weightMg * ratePerGramPaise * purityCaratX100) / (1000 * 2400));
}

// ── Bill math --------------------------------------------------------

/** Wastage applied to an exchanged old-gold piece. 2% is the trade standard. */
export const OLD_GOLD_WASTAGE_BPS = 200;

export interface BillMathLine {
  /** Pure-metal value of this line in paise. */
  goldValuePaise: number;
  /** Making charges for this line, paise. (Already computed = bps × goldValue.) */
  makingPaise: number;
  /** Stone / diamond charges added flat to the line, paise. */
  stoneChargePaise: number;
}

export interface OldGoldInput {
  weightMg: number;
  purityCaratX100: number;
  ratePerGramPaise: number;
}

export interface BillMathInput {
  lines: BillMathLine[];
  /** Optional old-gold exchange reducing the taxable base. */
  oldGold?: OldGoldInput | null;
  /** Discount applied to the grand total. Does not affect GST. */
  discountPaise?: number;
  /** Loyalty redemption — same treatment as discount. */
  loyaltyPaise?: number;
  /** Shop's GST state code (2-digit). */
  shopStateCode: string;
  /** Customer's billing-address state code, or null/undefined for walk-in. */
  customerStateCode?: string | null;
}

export interface BillMathResult {
  /** Sum of line gold values, paise. */
  subtotalPaise: number;
  /** Sum of line making charges, paise. */
  makingChargesPaise: number;
  /** Sum of line stone charges, paise. */
  stoneChargesPaise: number;
  /** Net old-gold value applied to the bill (after wastage deduction). */
  oldGoldValuePaise: number;
  /** Per-line taxable amount, same index order as input.lines. */
  lineTaxablePaise: number[];
  /** Per-line full value (gold + making + stone), same index order as input.lines. */
  linePaise: number[];
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  discountPaise: number;
  loyaltyPaise: number;
  /** Grand total in paise. */
  totalPaise: number;
}

/** True if both parties are in the same GST state. Null customer → assume intra. */
export function isIntraStateShared(shopStateCode: string, customerStateCode: string | null | undefined): boolean {
  if (!customerStateCode) return true;
  return shopStateCode === customerStateCode;
}

/**
 * Single source of truth for bill totals. Server uses this to compute the
 * authoritative numbers it writes to Postgres; the client mirrors it for
 * live preview so the cashier sees the same numbers the server will commit.
 */
export function computeBillTotals(input: BillMathInput): BillMathResult {
  const lineValues = input.lines.map((l) => l.goldValuePaise + l.makingPaise + l.stoneChargePaise);
  const subtotalPaise = sumPaiseShared(input.lines.map((l) => l.goldValuePaise));
  const makingChargesPaise = sumPaiseShared(input.lines.map((l) => l.makingPaise));
  const stoneChargesPaise = sumPaiseShared(input.lines.map((l) => l.stoneChargePaise));
  const allLinesTotal = sumPaiseShared(lineValues);

  // Old-gold exchange — pure metal value back, less 2% wastage. Allocated
  // proportionally per line so each line's taxable base shrinks fairly.
  let oldGoldValuePaise = 0;
  if (input.oldGold) {
    const gross = computeMetalValuePaise(
      input.oldGold.weightMg,
      input.oldGold.purityCaratX100,
      input.oldGold.ratePerGramPaise,
    );
    const wastage = applyBpsShared(gross, OLD_GOLD_WASTAGE_BPS);
    oldGoldValuePaise = Math.max(0, gross - wastage);
  }

  const lineTaxablePaise = lineValues.map((linePaise) => {
    if (allLinesTotal === 0) return 0;
    const allocatedExchange = Math.round((oldGoldValuePaise * linePaise) / allLinesTotal);
    return Math.max(0, linePaise - allocatedExchange);
  });

  // GST per line, then sum. Banker's-rounded per-line so totals match
  // line-by-line rounding on the receipt.
  const intra = isIntraStateShared(input.shopStateCode, input.customerStateCode);
  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;
  if (intra) {
    cgstPaise = sumPaiseShared(lineTaxablePaise.map((t) => applyBpsShared(t, CGST_RATE_BPS)));
    sgstPaise = sumPaiseShared(lineTaxablePaise.map((t) => applyBpsShared(t, SGST_RATE_BPS)));
  } else {
    igstPaise = sumPaiseShared(lineTaxablePaise.map((t) => applyBpsShared(t, IGST_RATE_BPS)));
  }

  const discountPaise = Math.max(0, input.discountPaise ?? 0);
  const loyaltyPaise = Math.max(0, input.loyaltyPaise ?? 0);

  const totalPaise =
    subtotalPaise +
    makingChargesPaise +
    stoneChargesPaise +
    cgstPaise +
    sgstPaise +
    igstPaise -
    oldGoldValuePaise -
    discountPaise -
    loyaltyPaise;

  return {
    subtotalPaise,
    makingChargesPaise,
    stoneChargesPaise,
    oldGoldValuePaise,
    lineTaxablePaise,
    linePaise: lineValues,
    cgstPaise,
    sgstPaise,
    igstPaise,
    discountPaise,
    loyaltyPaise,
    totalPaise,
  };
}
