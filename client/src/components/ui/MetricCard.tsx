import { cn } from '@/lib/cn';

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
    delta?.direction === 'up' ? 'text-success-700' : delta?.direction === 'down' ? 'text-danger-700' : 'text-ink-500';
  return (
    <div
      className={cn(
        'rounded-md border border-ink-100 bg-ink-0 p-4 transition-colors duration-fast',
        tone === 'success' && 'border-success-500/30',
        tone === 'warning' && 'border-warning-500/30',
        tone === 'danger' && 'border-danger-500/30',
      )}
    >
      <p className="text-eyebrow uppercase text-ink-500">{label}</p>
      <div className="mt-1.5 text-2xl font-mono font-semibold text-ink-900 tabular-nums">{value}</div>
      {delta && <p className={cn('mt-0.5 text-xs', deltaColor)}>{delta.value}</p>}
    </div>
  );
}
