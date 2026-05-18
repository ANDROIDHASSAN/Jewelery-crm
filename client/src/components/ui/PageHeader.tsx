// PageHeader — the canonical page heading block for admin screens.
//
// Layout: eyebrow (uppercase, ink-500) → h1 (display, ink-900) → supporting
// paragraph (sm, ink-500) on the left; action slot on the right that stacks
// below on mobile. Tucks under sticky TopBar without overlap.
//
// Use this on every admin page so spacing, density, and type ramp stay
// consistent across modules. Don't roll your own header block.

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface PageHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Slot below the title row (e.g. a tab strip). Renders flush with the page header bottom border. */
  meta?: ReactNode;
  /** Hide the bottom border separator. Useful when an immediately-following tab strip carries its own border. */
  bare?: boolean;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  bare = false,
  className,
}: PageHeaderProps): JSX.Element {
  return (
    <header
      className={cn(
        'flex flex-col gap-3',
        !bare && 'pb-4 border-b border-ink-100',
        className,
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="min-w-0 space-y-1">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-xl sm:text-2xl text-ink-900 leading-tight tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-ink-500 max-w-2xl">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
      {meta}
    </header>
  );
}
