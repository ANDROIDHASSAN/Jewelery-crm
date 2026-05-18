// Skeleton primitives — the spec says "skeletons, never spinners". A small
// shimmer keeps the page alive without distracting from real content when it
// arrives. Use sparingly; for trivial inline labels just render the resolved
// value instead.

import { cn } from '@/lib/cn';

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden rounded-md bg-ink-50',
        // Subtle shimmer — gold-tinted, slow. Respects prefers-reduced-motion
        // via the global override in tokens.css.
        'after:absolute after:inset-0 after:bg-gradient-to-r after:from-transparent after:via-ink-25 after:to-transparent after:translate-x-[-100%] after:animate-[shimmer_1.6s_ease-in-out_infinite]',
        className,
      )}
      {...props}
    />
  );
}

/** A line of text — fills the parent width unless `w-…` is overridden. */
export function SkeletonLine({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <Skeleton className={cn('h-3.5 w-full', className)} {...props} />;
}

/** Block placeholder for a KPI tile — matches MetricCard footprint. */
export function MetricSkeleton(): JSX.Element {
  return (
    <div className="rounded-md border border-ink-100 bg-ink-0 p-4 space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

/** Grid of metric skeletons — common pattern at the top of a dashboard. */
export function MetricGridSkeleton({ count = 4 }: { count?: number }): JSX.Element {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: count }, (_, i) => (
        <MetricSkeleton key={i} />
      ))}
    </div>
  );
}

/** Table skeleton — header row + N body rows matching the spec's 40px row height. */
export function TableSkeleton({
  rows = 6,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}): JSX.Element {
  return (
    <div className="rounded-md border border-ink-100 bg-ink-0 overflow-hidden">
      <div className="bg-ink-25 border-b border-ink-100 px-3 py-2.5 flex gap-3">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={`h${i}`} className="h-3 flex-1 max-w-[12ch]" />
        ))}
      </div>
      <div className="divide-y divide-ink-100">
        {Array.from({ length: rows }, (_, r) => (
          <div key={`r${r}`} className="px-3 h-10 flex items-center gap-3">
            {Array.from({ length: columns }, (_, c) => (
              <Skeleton
                key={`c${r}-${c}`}
                className={cn(
                  'h-3',
                  c === 0 ? 'flex-[2]' : 'flex-1',
                  'max-w-[16ch]',
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Generic bordered card placeholder. */
export function CardSkeleton({
  lines = 4,
  className,
}: {
  lines?: number;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('rounded-md border border-ink-100 bg-ink-0 p-5 space-y-3', className)}>
      <Skeleton className="h-4 w-32" />
      <div className="space-y-2 pt-1">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
        ))}
      </div>
    </div>
  );
}
