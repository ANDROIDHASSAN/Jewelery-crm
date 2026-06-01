// Indian rupee amount-in-words. Uses the Indian numbering system
// (Lakh / Crore) rather than the international one (Million / Billion)
// because that's what every Indian tax invoice prints.

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** Convert a non-negative integer 0..999 to English words. */
function chunkToWords(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n]!;
  if (n < 100) {
    const t = Math.floor(n / 10);
    const r = n % 10;
    return r === 0 ? TENS[t]! : `${TENS[t]} ${ONES[r]}`;
  }
  const h = Math.floor(n / 100);
  const r = n % 100;
  return r === 0 ? `${ONES[h]} Hundred` : `${ONES[h]} Hundred ${chunkToWords(r)}`;
}

/**
 * Convert paise to "Rupees ... Only" in the Indian numbering system.
 * Examples:
 *   100        → "Rupees One Only"
 *   146260_00  → "Rupees One Lakh Forty Six Thousand Two Hundred Sixty Only"
 *   100000_50  → "Rupees One Lakh and Fifty Paise Only"
 */
export function paiseToIndianWords(paise: number): string {
  if (!Number.isFinite(paise) || paise < 0) return 'Rupees Zero Only';
  const rupees = Math.floor(paise / 100);
  const remainderPaise = paise % 100;

  if (rupees === 0 && remainderPaise === 0) return 'Rupees Zero Only';

  const crores = Math.floor(rupees / 10_000_000);
  const lakhs = Math.floor((rupees % 10_000_000) / 100_000);
  const thousands = Math.floor((rupees % 100_000) / 1_000);
  const hundreds = rupees % 1_000;

  const parts: string[] = [];
  if (crores > 0) parts.push(`${chunkToWords(crores)} Crore`);
  if (lakhs > 0) parts.push(`${chunkToWords(lakhs)} Lakh`);
  if (thousands > 0) parts.push(`${chunkToWords(thousands)} Thousand`);
  if (hundreds > 0) parts.push(chunkToWords(hundreds));

  const rupeeWords = parts.join(' ').trim();
  let out = `Rupees ${rupeeWords || 'Zero'}`;
  if (remainderPaise > 0) out += ` and ${chunkToWords(remainderPaise)} Paise`;
  out += ' Only';
  return out;
}
