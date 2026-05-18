// Offline Shops — the owner / accountant's read-only window into every
// shop's POS activity. NOT a billing surface: actual billing happens on the
// pos.<host> subdomain and never inside the admin panel.
//
// Layout:
//   * Hero strip: combined today totals across all shops
//   * Per-shop cards: open-till state, today's sales, queue depths
//   * Live bills feed
//   * Open / recent register sessions with variance flagging
//   * Salesperson leaderboard

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  CircleDot,
  Clock,
  FileText,
  Hand,
  ReceiptText,
  RefreshCw,
  Store,
  Trophy,
  Wrench,
} from 'lucide-react';
import {
  useCounterBillsQuery,
  useCounterSessionsQuery,
  useCounterStaffQuery,
  useCounterSummaryQuery,
  type CounterBillRow,
  type CounterSessionRow,
  type CounterSummary,
} from '@/features/counter/counterApi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { cn } from '@/lib/cn';

export function CounterPage(): JSX.Element {
  const { data: summaryData, isLoading: sumLoading, refetch: refetchSum } = useCounterSummaryQuery(undefined, { pollingInterval: 60_000 });
  const { data: billsData, refetch: refetchBills } = useCounterBillsQuery({ limit: 30 }, { pollingInterval: 60_000 });
  const { data: sessionsData, refetch: refetchSessions } = useCounterSessionsQuery(undefined, { pollingInterval: 60_000 });
  const { data: staffData, refetch: refetchStaff } = useCounterStaffQuery(undefined, { pollingInterval: 120_000 });

  const shops = summaryData?.data ?? [];
  const bills = billsData?.data ?? [];
  const sessions = sessionsData?.data ?? [];
  const staff = staffData?.data ?? [];

  // Today rollup across every shop.
  const rollup = useMemo(() => {
    let revenue = 0;
    let cash = 0;
    let digital = 0;
    let refunds = 0;
    let billCount = 0;
    let openTills = 0;
    let parked = 0;
    let repairs = 0;
    let estimates = 0;
    let advances = 0;
    for (const s of shops) {
      revenue += s.revenueTodayPaise;
      cash += s.cashSalesTodayPaise;
      digital += s.digitalSalesTodayPaise;
      refunds += s.refundsTodayPaise;
      billCount += s.billsCountToday;
      if (s.registerStatus === 'OPEN') openTills += 1;
      parked += s.activeParkedBills;
      repairs += s.activeRepairs;
      estimates += s.activeEstimates;
      advances += s.activeAdvancesPaise;
    }
    return { revenue, cash, digital, refunds, billCount, openTills, parked, repairs, estimates, advances };
  }, [shops]);

  function refreshAll(): void {
    void refetchSum();
    void refetchBills();
    void refetchSessions();
    void refetchStaff();
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="Module 02 · Read-only monitor"
        title="Offline shops"
        description={
          <>
            Every shop&apos;s POS activity at a glance. Live till state, today&apos;s sales, parked carts and end-of-day variances.
            Counter billing happens on the <code className="text-ink-700 bg-ink-50 px-1 rounded">pos.</code> subdomain — this view is monitoring only.
          </>
        }
        actions={
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      {/* Today rollup ---------------------------------------------------- */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric
          label="Today's revenue"
          value={<Money paise={rollup.revenue} />}
          sublabel={`${rollup.billCount} bill${rollup.billCount === 1 ? '' : 's'}`}
        />
        <Metric
          label="Cash sales"
          value={<Money paise={rollup.cash} />}
          sublabel={
            rollup.cash + rollup.digital > 0
              ? `${Math.round((rollup.cash / (rollup.cash + rollup.digital)) * 100)}% of mix`
              : '—'
          }
        />
        <Metric
          label="Digital sales"
          value={<Money paise={rollup.digital} />}
          sublabel={`UPI / card / cheque`}
        />
        <Metric
          label="Refunds today"
          value={<Money paise={rollup.refunds} />}
          sublabel={rollup.refunds === 0 ? 'Clean day' : 'Check the bills feed'}
          tone={rollup.refunds > 0 ? 'warn' : undefined}
        />
      </section>

      {/* Per-shop cards -------------------------------------------------- */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-ink-700">Shops</h2>
        {sumLoading && <p className="text-sm text-ink-500">Loading shop summary…</p>}
        {!sumLoading && shops.length === 0 && (
          <EmptyState title="No shops yet" body="Add a branch shop from Settings to start tracking." />
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {shops.map((s) => <ShopCard key={s.shopId} shop={s} />)}
        </div>
      </section>

      {/* Live bills feed + sessions ------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <BillsFeed bills={bills} />
        <SessionsList sessions={sessions} />
      </div>

      {/* Staff leaderboard ---------------------------------------------- */}
      <StaffLeaderboard staff={staff} shopNames={Object.fromEntries(shops.map((s) => [s.shopId, s.shopName]))} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Metric({ label, value, sublabel, tone }: { label: string; value: React.ReactNode; sublabel?: string; tone?: 'warn' }): JSX.Element {
  return (
    <div className={cn(
      'rounded-lg border bg-ink-0 p-3 sm:p-4',
      tone === 'warn' ? 'border-warning-200 bg-warning-50/30' : 'border-ink-100',
    )}>
      <div className="text-[10px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className="mt-1 font-mono text-base sm:text-lg text-ink-900 truncate">{value}</div>
      {sublabel && <div className="text-[11px] text-ink-500 mt-0.5 truncate">{sublabel}</div>}
    </div>
  );
}

function ShopCard({ shop }: { shop: CounterSummary }): JSX.Element {
  const cashPct = shop.cashSalesTodayPaise + shop.digitalSalesTodayPaise > 0
    ? Math.round((shop.cashSalesTodayPaise / (shop.cashSalesTodayPaise + shop.digitalSalesTodayPaise)) * 100)
    : 0;
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-ink-100 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-ink-500 shrink-0" />
            <h3 className="text-sm font-medium text-ink-900 truncate">{shop.shopName}</h3>
          </div>
          {shop.registerStatus === 'OPEN' && shop.openedByName && (
            <div className="text-[11px] text-ink-500 mt-0.5 truncate">
              {shop.openedByName} · since {timeAgo(shop.openedAt!)}
            </div>
          )}
        </div>
        <TillPill status={shop.registerStatus} />
      </div>

      {/* Today block */}
      <div className="px-4 py-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-500">Revenue</div>
          <Money paise={shop.revenueTodayPaise} className="block mt-0.5 font-mono text-ink-900" />
          <div className="text-[11px] text-ink-500">{shop.billsCountToday} bill{shop.billsCountToday === 1 ? '' : 's'}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-500">Cash / Digital</div>
          <div className="font-mono text-ink-900 mt-0.5 truncate">
            <Money paise={shop.cashSalesTodayPaise} /> <span className="text-ink-400">·</span>{' '}
            <Money paise={shop.digitalSalesTodayPaise} />
          </div>
          <div className="text-[11px] text-ink-500">{cashPct}% cash</div>
        </div>
      </div>

      {/* Queues */}
      <div className="px-4 py-3 border-t border-ink-50 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center bg-ink-25/50">
        <QueueChip icon={Hand} label="Parked" value={shop.activeParkedBills} />
        <QueueChip icon={FileText} label="Quotes" value={shop.activeEstimates} />
        <QueueChip icon={Wrench} label="Repairs" value={shop.activeRepairs} />
        <QueueChip icon={Banknote} label="Advances" valueLabel={shop.activeAdvancesPaise > 0 ? `₹${Math.round(shop.activeAdvancesPaise / 100).toLocaleString('en-IN')}` : '—'} />
      </div>

      {shop.refundsTodayPaise > 0 && (
        <div className="px-4 py-2 border-t border-warning-200 bg-warning-50 text-xs text-warning-700 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          Refunds today: <Money paise={shop.refundsTodayPaise} className="font-mono" />
        </div>
      )}
    </div>
  );
}

function QueueChip({ icon: Icon, label, value, valueLabel }: { icon: typeof Hand; label: string; value?: number; valueLabel?: string }): JSX.Element {
  const display = valueLabel ?? (value ?? 0).toString();
  const dim = display === '—' || display === '0';
  return (
    <div className={cn('rounded-md py-1.5', dim ? 'text-ink-400' : 'text-ink-700')}>
      <Icon className="h-3.5 w-3.5 mx-auto mb-0.5" />
      <div className="text-xs font-medium tabular-nums">{display}</div>
      <div className="text-[10px] uppercase tracking-wider text-ink-500">{label}</div>
    </div>
  );
}

function TillPill({ status }: { status: 'OPEN' | 'CLOSED' }): JSX.Element {
  const open = status === 'OPEN';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0',
        open ? 'bg-success-50 text-success-700' : 'bg-ink-100 text-ink-600',
      )}
    >
      <CircleDot className={cn('h-2.5 w-2.5', open ? 'text-success-600' : 'text-ink-400')} />
      Till {open ? 'open' : 'closed'}
    </span>
  );
}

function BillsFeed({ bills }: { bills: CounterBillRow[] }): JSX.Element {
  return (
    <section className="rounded-lg border border-ink-100 bg-ink-0">
      <header className="px-4 py-3 border-b border-ink-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ReceiptText className="h-4 w-4 text-ink-500" />
          <h3 className="text-sm font-medium text-ink-700">Live bills</h3>
        </div>
        <span className="text-[11px] text-ink-500">{bills.length} most recent</span>
      </header>
      {bills.length === 0 ? (
        <div className="p-8 text-center text-sm text-ink-500">No bills yet today.</div>
      ) : (
        <ul className="divide-y divide-ink-50 max-h-[480px] overflow-y-auto">
          {bills.map((b) => (
            <li key={b.id} className="px-4 py-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-ink-900 truncate">{b.billNumber}</span>
                  {b.voidedAt ? <Badge tone="warning">Voided</Badge>
                    : b.paymentStatus === 'REFUNDED' ? <Badge tone="warning">Refunded</Badge>
                    : b.paymentStatus === 'PARTIAL' ? <Badge tone="warning">Partial</Badge>
                    : <Badge tone="success">Paid</Badge>}
                </div>
                <div className="text-[11px] text-ink-500 truncate">
                  {b.shop.name} · {b.customer?.name ?? 'Walk-in'} · {timeAgo(b.createdAt)}
                </div>
              </div>
              <Money paise={b.totalPaise} className={cn('font-mono text-sm shrink-0', b.voidedAt && 'line-through text-ink-400')} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SessionsList({ sessions }: { sessions: CounterSessionRow[] }): JSX.Element {
  const open = sessions.filter((s) => s.status === 'OPEN');
  const closed = sessions.filter((s) => s.status === 'CLOSED');
  return (
    <section className="rounded-lg border border-ink-100 bg-ink-0">
      <header className="px-4 py-3 border-b border-ink-100 flex items-center gap-2">
        <ArrowRightLeft className="h-4 w-4 text-ink-500" />
        <h3 className="text-sm font-medium text-ink-700">Register sessions</h3>
        <span className="ml-auto text-[11px] text-ink-500">{open.length} open · {closed.length} closed (7d)</span>
      </header>
      {sessions.length === 0 ? (
        <div className="p-8 text-center text-sm text-ink-500">No sessions in the last 7 days.</div>
      ) : (
        <ul className="divide-y divide-ink-50 max-h-[480px] overflow-y-auto">
          {sessions.map((s) => {
            const variance = s.variancePaise ?? 0;
            return (
              <li key={s.id} className="px-4 py-3 flex items-start gap-3">
                <CircleDot className={cn('h-3 w-3 mt-1', s.status === 'OPEN' ? 'text-success-600' : 'text-ink-400')} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ink-900 truncate">{s.shop.name}</span>
                    {s.status === 'OPEN' ? <Badge tone="success">Open</Badge> : <Badge tone="neutral">Closed</Badge>}
                    {s.status === 'CLOSED' && variance !== 0 && (
                      <Badge tone={Math.abs(variance) > 50_000 ? 'danger' : 'warning'}>
                        {variance > 0 ? 'Over' : 'Short'} <Money paise={Math.abs(variance)} />
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-ink-500 mt-0.5 truncate">
                    {s.openedBy.name} · opened {timeAgo(s.openedAt)}
                    {s.closedAt ? <> · closed {timeAgo(s.closedAt)}</> : null}
                    · {s._count.bills} bill{s._count.bills === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="text-right text-[11px] text-ink-500 shrink-0">
                  <div>float</div>
                  <Money paise={s.openingFloatPaise} className="font-mono text-ink-700" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function StaffLeaderboard({ staff, shopNames }: { staff: { userId: string; userName: string; shopId: string; billCount: number; revenuePaise: number }[]; shopNames: Record<string, string> }): JSX.Element {
  const [shopFilter, setShopFilter] = useState<string>('ALL');
  const filtered = shopFilter === 'ALL' ? staff : staff.filter((s) => s.shopId === shopFilter);
  return (
    <section className="rounded-lg border border-ink-100 bg-ink-0">
      <header className="px-4 py-3 border-b border-ink-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-ink-500" />
          <h3 className="text-sm font-medium text-ink-700">Today's salespeople</h3>
        </div>
        <select
          className="h-8 rounded-md border border-ink-200 px-2 text-xs bg-ink-0"
          value={shopFilter}
          onChange={(e) => setShopFilter(e.target.value)}
        >
          <option value="ALL">All shops</option>
          {Object.entries(shopNames).map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      </header>
      {filtered.length === 0 ? (
        <div className="p-8 text-center text-sm text-ink-500">No bills attributed to any cashier yet today.</div>
      ) : (
        <ul className="divide-y divide-ink-50">
          {filtered.map((s, idx) => (
            <li key={s.userId} className="px-4 py-2.5 flex items-center gap-3">
              <span className={cn(
                'h-6 w-6 rounded-full inline-flex items-center justify-center text-[11px] font-medium shrink-0',
                idx === 0 ? 'bg-brand-100 text-brand-700' :
                idx === 1 ? 'bg-ink-100 text-ink-700' :
                idx === 2 ? 'bg-warning-50 text-warning-700' :
                'bg-ink-25 text-ink-500',
              )}>{idx + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink-900 truncate">{s.userName}</div>
                <div className="text-[11px] text-ink-500 truncate">{shopNames[s.shopId] ?? '—'} · {s.billCount} bill{s.billCount === 1 ? '' : 's'}</div>
              </div>
              <Money paise={s.revenuePaise} className="font-mono text-sm shrink-0" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// Unused but kept to make the icon imports tree-shakeable consistently.
void Clock;
