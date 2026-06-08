import { Star } from 'lucide-react';

interface LoyaltyToggleProps {
  balance: number;
  pointsUsed: number;
  discountPaise: number;
  enabled: boolean;
  onToggle: (on: boolean) => void;
  error: string | null;
  stackabilityConflict: string | null;
}

export function LoyaltyToggle({
  balance,
  pointsUsed,
  discountPaise,
  enabled,
  onToggle,
  error,
  stackabilityConflict,
}: LoyaltyToggleProps): JSX.Element {
  const blocked = Boolean(stackabilityConflict);
  const hasEnough = balance >= 500;

  return (
    <div className={`rounded-lg border px-3 py-2.5 text-sm transition-colors ${
      enabled ? 'border-amber-300 bg-amber-50' : 'border-ink-200 bg-ink-0'
    } ${blocked ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Star className={`h-4 w-4 shrink-0 ${enabled ? 'text-amber-500' : 'text-ink-400'}`} fill={enabled ? 'currentColor' : 'none'} />
          <div className="min-w-0">
            <span className="font-medium text-ink-900">Loyalty Points</span>
            <span className="ml-2 text-ink-500 text-xs">
              {balance.toLocaleString('en-IN')} pts = ₹{Math.round(balance / 100).toLocaleString('en-IN')}
            </span>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={blocked || !hasEnough}
          onClick={() => onToggle(!enabled)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 disabled:cursor-not-allowed ${
            enabled ? 'bg-amber-400' : 'bg-ink-200'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
              enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {enabled && discountPaise > 0 && (
        <p className="mt-1.5 text-xs text-amber-700">
          Using {pointsUsed.toLocaleString('en-IN')} pts → saving ₹{Math.round(discountPaise / 100).toLocaleString('en-IN')}
        </p>
      )}

      {!hasEnough && !enabled && (
        <p className="mt-1 text-xs text-ink-400">
          Minimum 500 points needed to redeem (you have {balance})
        </p>
      )}

      {stackabilityConflict && (
        <p className="mt-1.5 text-xs text-amber-700">{stackabilityConflict}</p>
      )}

      {error && !stackabilityConflict && (
        <p className="mt-1.5 text-xs text-error-600">{error}</p>
      )}
    </div>
  );
}
