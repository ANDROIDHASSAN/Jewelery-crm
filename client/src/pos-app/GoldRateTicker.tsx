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

interface RateRow {
  purity: number;
  ratePerGramPaise: number;
  stale: boolean;
  asOf: string;
}

// Labels in the order they should render on the ticker. We use 22K/18K/Silver
// because that's what 95%+ of bills touch — 24K and 14K are folded into
// "more" or hidden on narrow screens.
const PRIMARY = [
  { purity: 2200, label: '22K' },
  { purity: 1800, label: '18K' },
  { purity: 0, label: 'Silver' },
] as const;
const SECONDARY = [
  { purity: 2400, label: '24K' },
  { purity: 1400, label: '14K' },
] as const;

function formatRate(paise: number): string {
  // ₹6,420/g — Indian-locale thousand separators, no decimal on per-gram.
  const rupees = Math.round(paise / 100);
  return `₹${rupees.toLocaleString('en-IN')}/g`;
}

export function GoldRateTicker(): JSX.Element {
  const { data, isFetching, refetch } = useGetGoldRateQuery(undefined, {
    pollingInterval: 60_000,
  });
  const rates = (data?.data ?? []) as RateRow[];
  const stale = rates.some((r) => r.stale);

  // Resolve the cashier's shop → state for the "Haryana" / "Maharashtra"
  // badge next to the rates. The underlying MCX-INR rate is national, but
  // displaying the operator's state confirms they're looking at the right
  // book for local making-charge + GST decisions.
  const user = useAppSelector((s) => s.auth.user);
  const { data: shopsData } = useGetShopsQuery();
  const shop = shopsData?.data.find((s) => s.id === user?.shopId) ?? shopsData?.data?.[0];
  const stateName = shop ? GST_STATE_CODES[shop.gstStateCode as keyof typeof GST_STATE_CODES] : null;

  function rateFor(purity: number): RateRow | undefined {
    return rates.find((r) => r.purity === purity);
  }

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
        {PRIMARY.map(({ purity, label }) => (
          <Quote key={purity} label={label} rate={rateFor(purity)} />
        ))}
        <span className="hidden sm:inline-flex items-center gap-3">
          {SECONDARY.map(({ purity, label }) => (
            <Quote key={purity} label={label} rate={rateFor(purity)} muted />
          ))}
        </span>
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

function Quote({ label, rate, muted }: { label: string; rate: RateRow | undefined; muted?: boolean }): JSX.Element {
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
      <span className={muted ? 'text-ink-200' : 'text-brand-100'}>
        {rate ? formatRate(rate.ratePerGramPaise) : '—'}
      </span>
    </span>
  );
}
