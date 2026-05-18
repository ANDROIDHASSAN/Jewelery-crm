// SectionCard — a bordered surface with an optional titled header.
//
// Used for any dashboard panel that isn't a KPI tile or table: gold-rate
// readout, lead funnel, recent activity feed, vendor outstanding list, etc.
// Centralises the eyebrow + title + action-link pattern so panels don't
// drift across modules.

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SectionCardProps {
  /** Tiny uppercase label above the title. */
  eyebrow?: string;
  /** Main heading for the panel — left-aligned, ink-900, 15px medium. */
  title?: ReactNode;
  /** Optional icon rendered alongside the title. Pass an instantiated element so the colour can match. */
  icon?: ReactNode;
  /** Right-side slot in the header — a small link, badge, or row action. */
  action?: ReactNode;
  /** Section body. */
  children?: ReactNode;
  /** Strip the body padding — useful when the children include their own table or divided list. */
  bareBody?: boolean;
  /** Add a subtle gradient wash + tone'd border. Use sparingly for a "highlighted" panel. */
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
  className?: string;
  /** Inner-padding override for the body slot. */
  bodyClassName?: string;
}

export function SectionCard({
  eyebrow,
  title,
  icon,
  action,
  children,
  bareBody = false,
  tone = 'neutral',
  className,
  bodyClassName,
}: SectionCardProps): JSX.Element {
  const hasHeader = !!(eyebrow || title || action);
  return (
    <section
      className={cn(
        'relative rounded-md border bg-ink-0 overflow-hidden',
        tone === 'neutral' && 'border-ink-100',
        tone === 'brand' && 'border-brand-200/70 bg-gradient-to-b from-brand-50/30 to-ink-0',
        tone === 'success' && 'border-success-500/30 bg-gradient-to-b from-success-50/30 to-ink-0',
        tone === 'warning' && 'border-warning-500/30 bg-gradient-to-b from-warning-50/30 to-ink-0',
        tone === 'danger' && 'border-danger-500/30 bg-gradient-to-b from-danger-50/30 to-ink-0',
        className,
      )}
    >
      {hasHeader && (
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0 flex items-start gap-2.5">
            {icon && (
              <span
                className={cn(
                  'mt-0.5 inline-flex items-center justify-center shrink-0',
                  tone === 'brand' ? 'text-brand-500' : 'text-ink-500',
                )}
                aria-hidden
              >
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {eyebrow && (
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500 leading-none">
                  {eyebrow}
                </p>
              )}
              {title && (
                <h3
                  className={cn(
                    'text-[15px] font-medium text-ink-900 leading-tight',
                    eyebrow && 'mt-1.5',
                  )}
                >
                  {title}
                </h3>
              )}
            </div>
          </div>
          {action && <div className="shrink-0 text-xs">{action}</div>}
        </header>
      )}
      <div
        className={cn(
          !bareBody && (hasHeader ? 'px-5 pb-5' : 'p-5'),
          bodyClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
