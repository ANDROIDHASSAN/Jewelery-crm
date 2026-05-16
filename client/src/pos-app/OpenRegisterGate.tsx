// Start-of-day gate. The cashier must count their physical cash drawer and
// open the till session before the billing surface unlocks — no exceptions.
// This is what reconciles end-of-day variance, so it's load-bearing.
//
// UX:
//   * Big card, centred, with shop name + today's date + cashier name so
//     the operator knows their context before they type a single number.
//   * Quick-pick float chips for the four amounts owners actually use.
//   * Below the form: a 60-second "why this matters" explainer that's quiet
//     but always present so a new cashier doesn't skip the count.

import { useState } from 'react';
import { toast } from 'sonner';
import { Banknote, CalendarDays, Sunrise, Store } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Money } from '@/components/ui/money';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import { useGetOpenSessionQuery, useOpenRegisterMutation } from './posFeaturesApi';
import { cn } from '@/lib/cn';

const QUICK_FLOATS = [2_000, 5_000, 10_000, 20_000] as const;

function todayInIST(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function OpenRegisterGate({ children }: { children: JSX.Element }): JSX.Element {
  const user = useAppSelector((s) => s.auth.user);
  const { data: shopsData } = useGetShopsQuery();
  const shopId = user?.shopId ?? shopsData?.data?.[0]?.id ?? '';
  const shop = shopsData?.data.find((s) => s.id === shopId) ?? null;
  const { data: sessionData, isLoading } = useGetOpenSessionQuery(shopId, { skip: !shopId });
  const [openRegister, { isLoading: opening }] = useOpenRegisterMutation();
  const [floatRupees, setFloatRupees] = useState('5000');
  const [notes, setNotes] = useState('');

  if (isLoading || !shopId) {
    return (
      <div className="px-6 py-10 text-center text-sm text-ink-500">Loading register state…</div>
    );
  }

  if (sessionData?.data) return children;

  const floatPaise = Math.round(Number(floatRupees.replace(/,/g, '') || '0') * 100);
  const validFloat = floatPaise >= 0 && !Number.isNaN(floatPaise);

  async function onOpen(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!validFloat) {
      toast.error('Enter a non-negative amount in rupees.');
      return;
    }
    try {
      await openRegister({ shopId, openingFloatPaise: floatPaise, notes: notes || null }).unwrap();
      toast.success('Till opened. Happy selling!');
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Failed to open the register');
    }
  }

  return (
    <div className="bg-ink-25">
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Hero card --------------------------------------------------- */}
        <div className="rounded-2xl border border-ink-100 bg-ink-0 shadow-sm overflow-hidden">
          {/* Top gradient banner with shop context */}
          <div
            className="relative px-5 sm:px-6 py-5 text-ink-50"
            style={{
              background:
                'radial-gradient(120% 80% at 20% 0%, rgba(201,155,42,0.22) 0%, transparent 60%), linear-gradient(180deg, #1F1D1A 0%, #0F0E0C 100%)',
            }}
          >
            <p className="text-[10px] uppercase tracking-[0.18em] text-brand-300/90 inline-flex items-center gap-1.5">
              <Sunrise className="h-3 w-3" />
              Start of day
            </p>
            <h1 className="font-display text-display-sm sm:text-display-md text-ink-0 mt-1.5 leading-tight">
              Open the till.
            </h1>
            <p className="text-sm text-ink-300 mt-1 max-w-md">
              Count what's physically in the cash drawer. This is the float you'll reconcile against tonight.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-300">
              {shop && (
                <span className="inline-flex items-center gap-1.5">
                  <Store className="h-3 w-3" /> {shop.name}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3 w-3" /> {todayInIST()}
              </span>
              {user?.name && (
                <span className="inline-flex items-center gap-1.5">
                  Cashier <span className="text-ink-0 font-medium">{user.name}</span>
                </span>
              )}
            </div>
          </div>

          {/* Form ------------------------------------------------------ */}
          <form onSubmit={onOpen} className="px-5 sm:px-6 py-5 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="float" className="text-xs text-ink-600 inline-flex items-center gap-1.5">
                <Banknote className="h-3.5 w-3.5" /> Opening float
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 text-lg font-mono pointer-events-none">
                  ₹
                </span>
                <Input
                  id="float"
                  type="text"
                  inputMode="numeric"
                  value={floatRupees}
                  onChange={(e) => setFloatRupees(e.target.value.replace(/[^\d.,]/g, ''))}
                  required
                  autoFocus
                  className="pl-7 pr-3 h-12 text-lg font-mono tabular-nums"
                />
              </div>

              {/* Quick-pick chips */}
              <div className="flex flex-wrap gap-2 pt-1">
                {QUICK_FLOATS.map((amt) => {
                  const active = floatRupees === String(amt);
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setFloatRupees(String(amt))}
                      className={cn(
                        'inline-flex items-center gap-1 px-3 h-8 rounded-full text-xs font-medium border transition-colors',
                        active
                          ? 'bg-brand-500 text-ink-0 border-brand-500'
                          : 'bg-ink-0 text-ink-700 border-ink-200 hover:border-brand-300 hover:bg-brand-50',
                      )}
                    >
                      ₹{amt.toLocaleString('en-IN')}
                    </button>
                  );
                })}
              </div>

              <p className="text-[11px] text-ink-500 pt-1">
                Cash in the drawer right now. Don't include card terminals or UPI float.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-xs text-ink-600">
                Notes (optional)
              </Label>
              <Input
                id="notes"
                placeholder="Day-shift opening · received from safe"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-10"
              />
            </div>

            <Button type="submit" size="lg" className="w-full h-12 text-base" disabled={opening || !validFloat}>
              {opening ? 'Opening…' : (
                <>Open till with <Money paise={floatPaise} className="ml-1.5 font-mono font-semibold" /></>
              )}
            </Button>
          </form>
        </div>

        {/* Quiet "why" strip below the card --------------------------- */}
        <div className="mt-5 rounded-md border border-ink-100 bg-ink-0/50 px-4 py-3 text-xs text-ink-500 space-y-1.5">
          <p className="text-ink-700 font-medium">Why we count first</p>
          <ul className="space-y-0.5">
            <li>· Locks the day's opening balance so tonight's variance is honest.</li>
            <li>· Every bill, refund, and cash drawer pay-out today gets tied to this session.</li>
            <li>· If the drawer was wrong this morning, log it in <span className="text-ink-700">Notes</span> rather than padding the float.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
