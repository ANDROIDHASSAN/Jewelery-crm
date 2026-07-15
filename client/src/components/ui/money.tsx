import { formatPaise, type Paise } from '@/lib/money';
import { metalPurityLabel, type MetalTypeLike } from '@goldos/shared/metal-rate';
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
  // REQUIRED in practice: purity 0 is a shared sentinel for silver AND
  // non-precious, so purity alone cannot name the metal. Omitting it falls back
  // to the legacy 0 → "Silver" reading, which mislabels gold-tone steel.
  metalType?: string | null;
  className?: string;
}): JSX.Element {
  const label = metalPurityLabel((metalType ?? null) as MetalTypeLike, x100);
  return (
    <span className={cn('inline-flex items-center rounded-sm bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700', className)}>
      {label}
    </span>
  );
}
