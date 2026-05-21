// client/src/lib/money.ts — MUST be byte-identical to server/src/lib/money.ts.
// Integer paise only. No float math. Display formatting at edges only.

export type Paise = number;

/** Parse a rupee string ("12,345.50" or "1,24,500") into integer paise. Throws on invalid. */
export function parseRupeesToPaise(input: string): Paise {
  const cleaned = input.replace(/[₹\s,]/g, '').trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`parseRupeesToPaise: invalid rupee string: ${JSON.stringify(input)}`);
  }
  const [intPart, fracPart = ''] = cleaned.split('.');
  const sign = intPart!.startsWith('-') ? -1 : 1;
  const intDigits = intPart!.replace('-', '');
  const fracDigits = (fracPart + '00').slice(0, 2);
  return sign * (Number(intDigits) * 100 + Number(fracDigits));
}

/** Format paise to Indian rupees with lakh/crore grouping. e.g. 12450050 -> "₹1,24,500.50". */
export function formatPaise(paise: Paise, opts: { withSymbol?: boolean } = {}): string {
  const { withSymbol = true } = opts;
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const fr = abs % 100;
  const rupeeStr = formatIndianInt(rupees);
  const fracStr = fr.toString().padStart(2, '0');
  const body = `${rupeeStr}.${fracStr}`;
  return `${sign}${withSymbol ? '₹' : ''}${body}`;
}

function formatIndianInt(n: number): string {
  const s = n.toString();
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}

/** Banker's rounding (round half to even). */
export function bankersRound(n: number): number {
  const floor = Math.floor(n);
  const diff = n - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

export function applyBps(paise: Paise, bps: number): Paise {
  return bankersRound((paise * bps) / 10_000);
}

export function sumPaise(values: Paise[]): Paise {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

export function computeGoldValuePaise(
  weightMg: number,
  purityCaratX100: number,
  ratePerGramPaise: Paise,
): Paise {
  // Silver is stored as purityCaratX100 === 0 with the silver rate already
  // in paise/g, so we skip the carat-ratio scaling. Returning 0 here
  // (the old behavior) made every silver line show ₹0 in the POS catalog.
  if (purityCaratX100 === 0) {
    return bankersRound((weightMg * ratePerGramPaise) / 1000);
  }
  const numerator = weightMg * ratePerGramPaise * purityCaratX100;
  return bankersRound(numerator / (1000 * 2400));
}
