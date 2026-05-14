import { MetricCard } from '@/components/ui/MetricCard';
import { Money } from '@/components/ui/money';

export function DashboardPage(): JSX.Element {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-eyebrow uppercase text-ink-500">Today</p>
        <h1 className="font-display text-display-sm text-ink-900">Welcome back, Anant.</h1>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Today's sales"
          value={<Money paise={18_42_000_00 / 100} />}
          delta={{ value: '▲ 12% vs yesterday', direction: 'up' }}
        />
        <MetricCard
          label="Bills today"
          value="42"
          delta={{ value: '▲ 6 vs yesterday', direction: 'up' }}
        />
        <MetricCard
          label="Stock valuation"
          value={<Money paise={4_82_50_000_00 / 100} />}
          delta={{ value: 'Live · 22K ₹6,420/g', direction: 'flat' }}
        />
        <MetricCard
          label="Open leads"
          value="17"
          delta={{ value: '▲ 3 today', direction: 'up' }}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-md border border-ink-100 bg-ink-0 p-5">
          <h3 className="text-md text-ink-900 font-medium mb-3">Sales — last 7 days</h3>
          <p className="text-sm text-ink-500">Day 29 wires Recharts. Until then, this card holds its place.</p>
        </div>
        <div className="rounded-md border border-ink-100 bg-ink-0 p-5">
          <h3 className="text-md text-ink-900 font-medium mb-3">Live gold rate</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ink-500">22K</dt><dd className="font-mono">₹6,420.00/g</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">18K</dt><dd className="font-mono">₹5,255.00/g</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Silver</dt><dd className="font-mono">₹84.50/g</dd></div>
          </dl>
          <p className="mt-3 text-xs text-ink-400">Updated 2 minutes ago · MCX</p>
        </div>
      </section>
    </div>
  );
}
