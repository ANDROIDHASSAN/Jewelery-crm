// Toolbar — sits between PageHeader/TabStrip and the data view. Holds
// search/filter inputs on the left and primary action buttons on the right.
// Stacks vertically on mobile.
//
// Companion StatPill is a tiny "X items" / "filtered to Y" indicator that
// often sits in the toolbar's left side next to the filters.

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Toolbar({
  children,
  className,
  end,
}: {
  /** Left-side content — typically filters, search, count. */
  children?: ReactNode;
  /** Right-side content — typically primary action buttons. */
  end?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 min-w-0">{children}</div>
      {end && <div className="flex flex-wrap items-center gap-2 shrink-0">{end}</div>}
    </div>
  );
}

/** Small read-only chip — "12 items", "filtered to 3", etc. */
export function StatPill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'brand';
}): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 h-7 px-2 rounded-full text-xs font-mono tabular-nums',
        tone === 'neutral'
          ? 'bg-ink-50 text-ink-600'
          : 'bg-brand-50 text-brand-700',
      )}
    >
      {children}
    </span>
  );
}
