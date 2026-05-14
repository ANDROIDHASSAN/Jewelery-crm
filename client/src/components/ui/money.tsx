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

export function Purity({ x100, className }: { x100: number; className?: string }): JSX.Element {
  let label = '—';
  if (x100 === 2400) label = '24K';
  else if (x100 === 2200) label = '22K';
  else if (x100 === 1800) label = '18K';
  else if (x100 === 1400) label = '14K';
  else if (x100 === 0) label = 'Silver';
  else if (x100 === 9500) label = 'Pt 950';
  return (
    <span className={cn('inline-flex items-center rounded-sm bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700', className)}>
      {label}
    </span>
  );
}
