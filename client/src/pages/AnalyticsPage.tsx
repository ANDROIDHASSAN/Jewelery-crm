import { MetricCard } from '@/components/ui/MetricCard';
import { Money } from '@/components/ui/money';

export function AnalyticsPage(): JSX.Element {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-eyebrow uppercase text-ink-500">Reports & analytics</p>
        <h1 className="font-display text-display-sm text-ink-900">Real-time</h1>
      </header>
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Revenue (today)" value={<Money paise={18_42_000_00 / 100} />} delta={{ value: '▲ 12% vs avg', direction: 'up' }} />
        <MetricCard label="CAC" value="₹342" delta={{ value: '▼ 8% MoM', direction: 'down' }} tone="success" />
        <MetricCard label="Ad ROI" value="4.2x" delta={{ value: 'Meta + Google', direction: 'flat' }} />
        <MetricCard label="Top shop" value="Main · Pune" />
      </section>
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-md border border-ink-100 bg-ink-0 p-5">
          <h3 className="text-md font-medium text-ink-900">Top-selling — week</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {['22K Daily-wear bangle set', '18K Diamond solitaire', 'Silver puja set', 'Mangalsutra · 22K'].map((p, i) => (
              <li key={p} className="flex items-center justify-between">
                <span className="text-ink-800">{i + 1}. {p}</span>
                <span className="font-mono text-ink-500 tabular-nums">{42 - i * 6}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-md border border-ink-100 bg-ink-0 p-5">
          <h3 className="text-md font-medium text-ink-900">Staff leaderboard — week</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {[
              ['Priya M.', '₹4,82,000'],
              ['Neha T.', '₹3,64,000'],
              ['Ravi S.', '₹2,12,000'],
            ].map(([name, amt]) => (
              <li key={name} className="flex items-center justify-between">
                <span className="text-ink-800">{name}</span>
                <span className="font-mono tabular-nums">{amt}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
