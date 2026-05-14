import { MetricCard } from '@/components/ui/MetricCard';
import { Money } from '@/components/ui/money';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export function FinancePage(): JSX.Element {
  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-eyebrow uppercase text-ink-500">Finance & accounting</p>
          <h1 className="font-display text-display-sm text-ink-900">P&amp;L</h1>
        </div>
        <Button variant="outline">
          <Download className="h-4 w-4" /> Tally export
        </Button>
      </header>
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Revenue (MTD)" value={<Money paise={12_45_00_000} />} delta={{ value: '▲ 18% YoY', direction: 'up' }} />
        <MetricCard label="Expenses (MTD)" value={<Money paise={1_82_00_000} />} delta={{ value: '▲ 4%', direction: 'up' }} />
        <MetricCard label="Net" value={<Money paise={10_63_00_000} />} tone="success" />
        <MetricCard label="GST collected" value={<Money paise={37_35_000} />} delta={{ value: 'Filing due 11th', direction: 'flat' }} />
      </section>
      <section className="rounded-md border border-ink-100 bg-ink-0 p-5">
        <h2 className="text-md font-medium text-ink-900">GST split (last month)</h2>
        <dl className="mt-3 grid grid-cols-3 gap-4 text-sm">
          <Stat label="CGST" value={<Money paise={9_22_500} />} />
          <Stat label="SGST" value={<Money paise={9_22_500} />} />
          <Stat label="IGST" value={<Money paise={18_90_000} />} />
        </dl>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
  return (
    <div>
      <dt className="text-eyebrow uppercase text-ink-500">{label}</dt>
      <dd className="mt-1 font-mono text-xl text-ink-900">{value}</dd>
    </div>
  );
}
