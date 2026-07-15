// Slim live gold-rate banner that sits between the POS header and the
// page content. Visible on every POS surface so the cashier never has to
// hunt for the day's rate.
//
// Refresh strategy: the rate endpoint reads from Redis (cached, cheap), so
// polling every 60s is fine. The "Refresh" button forces an immediate
// re-fetch when the cashier wants to lock today's rate before a big bill.

import { useGetGoldRateQuery } from '@/features/pos/posApi';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import { useAppSelector } from '@/app/hooks';
import { MapPin, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { GST_STATE_CODES } from '@goldos/shared/constants';

function formatRate(paise: number | null | undefined): string {
  // ₹4,710/g — Indian-locale thousand separators, no decimal on per-gram.
  if (!paise) return '—';
  const rupees = Math.round(paise / 100);
  return `₹${rupees.toLocaleString('en-IN')}/g`;
}

export function GoldRateTicker(): JSX.Element {
  const { data, isFetching, refetch } = useGetGoldRateQuery(undefined, {
    pollingInterval: 60_000,
  });
  // 9K gold / silver / platinum — the same three rates the dashboard and the
  // storefront quote, resolved server-side through the same precedence. Bill
  // lines still price each piece at its own registered purity; this ticker is
  // the published rate, not the billing rate.
  const metalRates = data?.metalRates;
  const stale = metalRates?.stale ?? false;

  // Resolve the cashier's shop → state for the "Haryana" / "Maharashtra"
  // badge next to the rates. The underlying MCX-INR rate is national, but
  // displaying the operator's state confirms they're looking at the right
  // book for local making-charge + GST decisions.
  const user = useAppSelector((s) => s.auth.user);
  const { data: shopsData } = useGetShopsQuery();
  const shop = shopsData?.data.find((s) => s.id === user?.shopId) ?? shopsData?.data?.[0];
  const stateName = shop ? GST_STATE_CODES[shop.gstStateCode as keyof typeof GST_STATE_CODES] : null;

  return (
    <div
      className={cn(
        'border-b text-ink-50',
        stale ? 'bg-warning-700 border-warning-800' : 'bg-ink-900 border-ink-800',
      )}
      role="status"
      aria-live="polite"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-4 h-9 flex items-center gap-3 overflow-x-auto whitespace-nowrap scrollbar-thin">
        <span className="text-[10px] uppercase tracking-wider text-brand-300/90 font-medium shrink-0 inline-flex items-center gap-1.5">
          <MapPin className="h-3 w-3" />
          {stateName ?? 'Live rate'}
        </span>
        <Quote label="9K" paise={metalRates?.gold9kPaise} />
        <Quote label="Silver" paise={metalRates?.silverPaise} />
        {/* Platinum only when a rate is configured — most tenants carry none,
            and an empty "Pt —" chip is noise on a 36px bar. */}
        {metalRates?.platinum950Paise ? (
          <span className="hidden sm:inline-flex items-center gap-3">
            <Quote label="Pt 950" paise={metalRates.platinum950Paise} muted />
          </span>
        ) : null}
        {stale && (
          <span className="ml-auto text-[10px] text-warning-100 inline-flex items-center gap-1 shrink-0">
            ⚠ Rates haven't refreshed in a while
          </span>
        )}
        <button
          type="button"
          onClick={() => void refetch()}
          className={cn(
            'ml-auto inline-flex items-center gap-1 text-[11px] text-ink-300 hover:text-ink-50 shrink-0',
            stale && 'ml-2',
          )}
          aria-label="Refresh gold rates"
        >
          <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>
    </div>
  );
}

function Quote({
  label,
  paise,
  muted,
}: {
  label: string;
  paise: number | null | undefined;
  muted?: boolean;
}): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1.5 text-sm font-mono tabular-nums shrink-0',
        muted && 'text-ink-300',
      )}
    >
      <span className={cn('text-[10px] uppercase tracking-wider', muted ? 'text-ink-400' : 'text-ink-300')}>
        {label}
      </span>
      <span className={muted ? 'text-ink-200' : 'text-brand-100'}>{formatRate(paise)}</span>
    </span>
  );
}
