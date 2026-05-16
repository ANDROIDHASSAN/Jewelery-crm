// Customer advances — booking receipts, rate-locked future orders. Read-only
// view here; advances are CREATED inside POS (different flow), the finance
// dashboard rolls them up for the owner.

import { Money } from '@/components/ui/money';
import { MetricCard } from '@/components/ui/MetricCard';
import { useGetAdvanceSummaryQuery } from '@/features/finance/financeApi';
import { cn } from '@/lib/cn';

export function AdvancesSection(): JSX.Element {
  const { data, isLoading } = useGetAdvanceSummaryQuery();
  const summary = data?.data;

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <MetricCard
          label="Active advances"
          value={summary ? <Money paise={summary.active.amountPaise} /> : '…'}
          tone={summary && summary.active.amountPaise > 0 ? 'warning' : 'neutral'}
          delta={
            summary ? { value: `${summary.active.count} customers`, direction: 'flat' } : undefined
          }
        />
        <MetricCard
          label="Consumed (lifetime)"
          value={summary ? <Money paise={summary.consumed.amountPaise} /> : '…'}
          tone="success"
          delta={
            summary
              ? { value: `${summary.consumed.count} converted`, direction: 'flat' }
              : undefined
          }
        />
        <MetricCard
          label="Refunded (lifetime)"
          value={summary ? <Money paise={summary.refunded.amountPaise} /> : '…'}
          delta={
            summary
              ? { value: `${summary.refunded.count} refunds`, direction: 'flat' }
              : undefined
          }
        />
      </section>

      <section className="rounded-md border border-ink-100 bg-ink-0">
        <header className="px-4 py-3 border-b border-ink-100">
          <p className="text-eyebrow uppercase text-ink-500">History</p>
          <h2 className="text-md font-medium text-ink-900">Recent advance receipts</h2>
        </header>
        {isLoading && <p className="px-4 py-3 text-sm text-ink-500">Loading…</p>}
        {!isLoading && summary?.recent.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink-500">
            No advances on file. Cashiers can take an advance from the POS app.
          </p>
        )}
        {summary && summary.recent.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-eyebrow uppercase text-ink-500 bg-ink-25">
                <tr>
                  <th className="text-left px-4 py-2.5">Receipt</th>
                  <th className="text-left px-4 py-2.5">Customer</th>
                  <th className="text-right px-4 py-2.5">Amount</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-right px-4 py-2.5">Created</th>
                  <th className="text-right px-4 py-2.5">Valid till</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {summary.recent.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2 font-mono text-xs text-ink-900">
                      {a.receiptNumber}
                    </td>
                    <td className="px-4 py-2">
                      <p className="font-medium text-ink-900">{a.customerName}</p>
                      <p className="text-xs text-ink-500">{a.customerPhone}</p>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Money paise={a.amountPaise} />
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          'inline-block rounded-sm px-1.5 py-0.5 text-[11px] font-medium',
                          a.status === 'ACTIVE'
                            ? 'bg-warning-50 text-warning-700'
                            : a.status === 'CONSUMED'
                              ? 'bg-success-50 text-success-700'
                              : 'bg-ink-50 text-ink-600',
                        )}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-ink-600">
                      {new Date(a.createdAt).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-ink-600">
                      {a.validUntil
                        ? new Date(a.validUntil).toLocaleDateString('en-IN')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
