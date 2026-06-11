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

/**
 * Resolve a making charge to paise, honouring the two supported modes:
 *   PERCENTAGE → bps × metal value (the historical behaviour).
 *   PER_GRAM   → flat rupee-per-gram rate × weight. weightMg/1000 → grams.
 * Integer paise throughout (banker's rounding) — never float-multiply a price.
 * This is the ONE place making-charge mode is interpreted so POS, storefront
 * pricing, and valuation never diverge.
 */
export function resolveMakingChargePaise(opts: {
  metalValuePaise: number;
  weightMg: number;
  mode: 'PERCENTAGE' | 'PER_GRAM' | null | undefined;
  bps: number;
  perGramPaise: number | null | undefined;
}): number {
  if (opts.mode === 'PER_GRAM') {
    return bankersRound((opts.weightMg * (opts.perGramPaise ?? 0)) / 1000);
  }
  return applyBpsShared(opts.metalValuePaise, opts.bps);
}

// ── Bill math --------------------------------------------------------

/** Wastage applied to an exchanged old-gold piece. 2% is the trade standard. */
export const OLD_GOLD_WASTAGE_BPS = 200;

/**
 * Total GST applied to a taxable line (CGST+SGST intra-state, or IGST
 * inter-state — both sum to 3%). Used to back out the taxable base from a
 * GST-inclusive price. Kept here so POS, storefront, and inventory all agree.
 */
export const TOTAL_GST_BPS = 300;

/**
 * Back-calculate the pre-GST taxable base from a GST-INCLUSIVE price.
 * A fixed selling price is entered as the final amount the customer pays, so
 * we feed `taxable` into the normal GST-on-top pipeline and the grand total
 * lands back on the inclusive price (within per-line rounding). Integer
 * paise, banker's rounded.
 *   taxable + 3% GST ≈ inclusive
 */
export function taxableFromInclusivePaise(inclusivePaise: number): number {
  return bankersRound((inclusivePaise * 10_000) / (10_000 + TOTAL_GST_BPS));
}

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

// ── Place-of-supply resolution for e-commerce GST ──────────────────────────
// POS bills already carry a 2-digit shop gstStateCode AND a customer state
// code, so the split is computed at bill time (computeBillTotals above). But
// e-commerce orders only store the customer's free-text shipping STATE (a name
// like "Haryana", entered at checkout) plus a single `taxPaise` total. To tag
// those orders as intra-state (CGST+SGST) vs inter-state (IGST) we have to
// normalise that free text to a GST state code and compare it to the seller's
// home state. This map + resolver live here so the server (order invoices,
// finance GST report) and any client preview agree byte-for-byte.

/** Full GST state/UT code → canonical name. */
const STATE_CODE_TO_NAME: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
  '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
  '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
  '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
};

/** Lower-cased state name / alias → 2-digit GST code. */
const STATE_NAME_TO_CODE: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [code, name] of Object.entries(STATE_CODE_TO_NAME)) m[name.toLowerCase()] = code;
  // Common aliases / abbreviations people type into a free-text state field.
  Object.assign(m, {
    'jammu & kashmir': '01', 'j&k': '01', 'jk': '01',
    'uttaranchal': '05', 'uk': '05',
    'haryana ': '06', 'hr': '06',
    'new delhi': '07', 'nct of delhi': '07', 'delhi ncr': '07', 'dl': '07',
    'up': '09', 'bihar ': '10',
    'orissa': '21', 'mp': '23', 'gujrat': '24', 'gj': '24',
    'maharastra': '27', 'mh': '27', 'ka': '29', 'karnatka': '29',
    'tamilnadu': '33', 'tn': '33', 'pondicherry': '34',
    'telengana': '36', 'ts': '36', 'tg': '36', 'kl': '32', 'wb': '19',
    'rj': '08', 'pb': '03', 'ap': '37',
  });
  return m;
})();

/**
 * Normalise a captured state value (name, alias, GST code, or full GSTIN) to a
 * 2-digit GST state code. Returns null when it can't be resolved.
 */
export function resolveStateCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  // Bare 1-2 digit code.
  if (/^\d{1,2}$/.test(raw)) {
    const code = raw.padStart(2, '0');
    return STATE_CODE_TO_NAME[code] ? code : null;
  }
  // A full 15-char GSTIN starts with the 2-digit state code.
  if (/^\d{2}[A-Za-z]{5}\d{4}[A-Za-z]/.test(raw)) {
    const code = raw.slice(0, 2);
    return STATE_CODE_TO_NAME[code] ? code : null;
  }
  const key = raw.toLowerCase().replace(/\s+/g, ' ');
  return STATE_NAME_TO_CODE[key] ?? STATE_NAME_TO_CODE[key.trim()] ?? null;
}

export interface TaxSplit {
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

/**
 * Split an already-computed total tax into CGST+SGST (intra-state) or IGST
 * (inter-state), based on the customer's place of supply vs the seller's home
 * state. Used for e-commerce orders, which persist tax as a single number.
 * An unresolved customer state defaults to intra-state — the same conservative
 * convention POS uses — so a local sale is never mis-tagged inter-state.
 */
export function splitTaxByPlaceOfSupply(
  taxPaise: number,
  customerState: string | null | undefined,
  homeStateCode: string,
): TaxSplit {
  const custCode = resolveStateCode(customerState);
  const intra = !custCode || custCode === homeStateCode;
  if (intra) {
    const cgstPaise = Math.floor(taxPaise / 2);
    return { cgstPaise, sgstPaise: taxPaise - cgstPaise, igstPaise: 0 };
  }
  return { cgstPaise: 0, sgstPaise: 0, igstPaise: taxPaise };
}
