// server/src/lib/gst.ts — THE only place GST is calculated in the codebase.
//
// Per specs/gotchas.md:
//   - Jewellery GST is 3% (1.5% CGST + 1.5% SGST intra-state, 3% IGST inter-state).
//   - Intra vs inter is DERIVED from shop.gstStateCode vs customer billing state. Never user-picked.
//   - Old gold exchange is GST-neutral: exchange value subtracted from taxable base.
//   - GST on making charges: YES, making is taxable supply.
//   - CGST/SGST/IGST split is mutually exclusive.
//   - Per-line rounding (banker's). Bill total GST = sum of line GST.

import { CGST_RATE_BPS, SGST_RATE_BPS, IGST_RATE_BPS } from '@goldos/shared/constants';
import { applyBps, sumPaise, type Paise } from './money.js';

export interface GstSplit {
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
}

export interface GstLineInput {
  /** Taxable amount for this line, in paise (already net of any exchange/discount allocation). */
  taxablePaise: Paise;
}

export interface GstComputeInput {
  shopStateCode: string;
  /** Customer's billing-address state code. If null, treat as same-state (intra). */
  customerStateCode?: string | null;
  lines: GstLineInput[];
}

/** True if intra-state (CGST + SGST). False if inter-state (IGST). */
export function isIntraState(shopStateCode: string, customerStateCode: string | null | undefined): boolean {
  if (!customerStateCode) return true;
  return shopStateCode === customerStateCode;
}

/** Compute GST per line, banker-rounded, then sum. Returns mutually-exclusive CGST+SGST or IGST. */
export function computeGst(input: GstComputeInput): GstSplit {
  const intra = isIntraState(input.shopStateCode, input.customerStateCode);
  if (intra) {
    const cgstLines = input.lines.map((l) => applyBps(l.taxablePaise, CGST_RATE_BPS));
    const sgstLines = input.lines.map((l) => applyBps(l.taxablePaise, SGST_RATE_BPS));
    return {
      cgstPaise: sumPaise(cgstLines),
      sgstPaise: sumPaise(sgstLines),
      igstPaise: 0,
    };
  }
  const igstLines = input.lines.map((l) => applyBps(l.taxablePaise, IGST_RATE_BPS));
  return {
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: sumPaise(igstLines),
  };
}
