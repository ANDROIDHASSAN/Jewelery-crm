import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';

// MetricCard — a single KPI tile.
//
// Color psychology:
//   success → green (profit, healthy stock, conversion)
//   warning → amber (attention, outstanding payables, partial state)
//   danger  → red   (loss, overdue, lost lead, failure)
//   neutral → ink   (purely informational)
//
// The tone tints the BORDER + a soft top accent stripe so the user sees the
// status at a glance without the card becoming a noisy color block. Numbers
// stay in ink-900 for legibility — only the chrome carries the semantics.

export function MetricCard({
  label,
  value,
  delta,
  tone = 'neutral',
}: {
  label: string;
  value: React.ReactNode;
  delta?: { value: string; direction: 'up' | 'down' | 'flat' };
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}): JSX.Element {
  const deltaColor =
    delta?.direction === 'up'
      ? 'text-success-700'
      : delta?.direction === 'down'
        ? 'text-danger-700'
        : 'text-ink-500';

  const DeltaIcon =
    delta?.direction === 'up' ? TrendingUp : delta?.direction === 'down' ? TrendingDown : Minus;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md border bg-ink-0 p-4 transition-colors duration-fast',
        // Subtle color-coded chrome by tone.
        tone === 'neutral' && 'border-ink-100',
        tone === 'success' && 'border-success-500/40 bg-gradient-to-b from-success-50/40 to-ink-0',
        tone === 'warning' && 'border-warning-500/40 bg-gradient-to-b from-warning-50/40 to-ink-0',
        tone === 'danger' && 'border-danger-500/40 bg-gradient-to-b from-danger-50/40 to-ink-0',
      )}
    >
      {/* Accent stripe — 2px top edge in the tone color. */}
      {tone !== 'neutral' && (
        <span
          aria-hidden
          className={cn(
            'absolute inset-x-0 top-0 h-[2px]',
            tone === 'success' && 'bg-success-500',
            tone === 'warning' && 'bg-warning-500',
            tone === 'danger' && 'bg-danger-500',
          )}
        />
      )}

      <p className="text-eyebrow uppercase text-ink-500">{label}</p>
      <div className="mt-1.5 text-2xl font-mono font-semibold text-ink-900 tabular-nums">{value}</div>
      {delta && (
        <p className={cn('mt-0.5 text-xs inline-flex items-center gap-1', deltaColor)}>
          <DeltaIcon className="h-3 w-3" />
          {delta.value}
        </p>
      )}
    </div>
  );
}
