import { formatPaise, type Paise } from '@/lib/money';
import { cn } from '@/lib/cn';

export function Money({
  paise,
  className,
  withSymbol = true,
}: {
  paise: Paise;
  className?: string;
  withSymbol?: boolean;
}): JSX.Element {
  return <span className={cn('font-mono tabular-nums', className)}>{formatPaise(paise, { withSymbol })}</span>;
}

export function Weight({ mg, className }: { mg: number; className?: string }): JSX.Element {
  const grams = (mg / 1000).toFixed(3);
  return <span className={cn('font-mono tabular-nums', className)}>{grams} g</span>;
}

export function Purity({
  x100,
  metalType,
  className,
}: {
  x100: number;
  // Optional — disambiguates purity 0, which is shared by silver and
  // non-precious metals. Without it the 0 → "Silver" legacy default holds.
  metalType?: string | null;
  className?: string;
}): JSX.Element {
  // Canonical labels first so the preset chips read as expected.
  let label: string;
  // Non-precious metals (stainless steel / "other", e.g. gold-tone plated) have
  // no real carat purity — the stored number is meaningless for them — so always
  // label them "Non-precious" regardless of the value, rather than "Silver" (0)
  // or a stray carat. Diamond pieces keep their (white-gold setting) carat.
  if (metalType === 'STAINLESS_STEEL' || metalType === 'OTHER') {
    label = 'Non-precious';
  } else if (x100 === 2400) label = '24K';
  else if (x100 === 2200) label = '22K';
  else if (x100 === 1800) label = '18K';
  else if (x100 === 1400) label = '14K';
  else if (x100 === 0) label = 'Silver';
  else if (x100 === 9500) label = 'Pt 950';
  else if (x100 > 0 && x100 <= 2400) {
    // Custom gold carat — covers the full 0K–24K range the Add Item form
    // accepts (9K = 900, 16K = 1600, 21K = 2100, 23K = 2300, fractional
    // half-carats etc). Trims the decimal for whole carats so "21K" reads
    // cleanly instead of "21.0K".
    const k = x100 / 100;
    label = `${Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)}K`;
  } else if (x100 >= 9000 && x100 <= 9999) {
    // Platinum finenesses other than the 9500 default (Pt 990, Pt 999).
    label = `Pt ${x100 / 10}`;
  } else {
    // Unknown — surface the raw value so it's debuggable in prod rather
    // than collapsing to a silent dash.
    label = String(x100);
  }
  return (
    <span className={cn('inline-flex items-center rounded-sm bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700', className)}>
      {label}
    </span>
  );
}
