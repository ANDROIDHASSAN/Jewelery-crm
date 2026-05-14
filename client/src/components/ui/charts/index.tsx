// Brand-aligned Recharts wrappers. All charts use the gold/ink palette and the
// same tooltip/axis treatment so the admin feels visually coherent.
//
// Conventions:
// - paise on the y-axis is rendered as compact INR (e.g. ₹1.8L) via formatPaiseCompact.
// - tooltips use Money for currency values, plain numbers otherwise.
// - 220–280px default height; pass `height` to override.

import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const BRAND = {
  primary: '#C99B2A',
  primaryLight: '#E6D08D',
  primaryDark: '#856515',
  ink900: '#1F1D1A',
  ink700: '#322F2A',
  ink500: '#6E695F',
  ink300: '#B8B1A4',
  ink100: '#E9E6E0',
  success: '#0F766E',
  rose: '#B91C1C',
};

const PALETTE = ['#C99B2A', '#856515', '#D7B655', '#604910', '#E6D08D', '#41320A'];

function formatPaiseCompact(paise: number): string {
  const rupees = paise / 100;
  if (Math.abs(rupees) >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(1)}Cr`;
  if (Math.abs(rupees) >= 1_00_000) return `₹${(rupees / 1_00_000).toFixed(1)}L`;
  if (Math.abs(rupees) >= 1_000) return `₹${(rupees / 1_000).toFixed(0)}k`;
  return `₹${rupees.toLocaleString('en-IN')}`;
}

function formatPaiseFull(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface ChartCardProps {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ChartCard({ title, eyebrow, action, children, className }: ChartCardProps): JSX.Element {
  return (
    <div className={`rounded-md border border-ink-100 bg-ink-0 p-5 ${className ?? ''}`}>
      <header className="flex items-end justify-between mb-3">
        <div>
          {eyebrow && <p className="text-eyebrow uppercase text-ink-500">{eyebrow}</p>}
          <h3 className="text-md text-ink-900 font-medium">{title}</h3>
        </div>
        {action}
      </header>
      {children}
    </div>
  );
}

interface CurrencyTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}

function CurrencyTooltip({ active, payload, label }: CurrencyTooltipProps): JSX.Element | null {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-ink-100 bg-ink-0 px-3 py-2 shadow-sm text-xs">
      {label && <p className="font-mono text-ink-500 mb-1">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 tabular-nums">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-ink-600">{p.name}</span>
          <span className="font-mono text-ink-900 ml-auto">{formatPaiseFull(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

function NumberTooltip({ active, payload, label }: CurrencyTooltipProps): JSX.Element | null {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-ink-100 bg-ink-0 px-3 py-2 shadow-sm text-xs">
      {label && <p className="font-mono text-ink-500 mb-1">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 tabular-nums">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-ink-600">{p.name}</span>
          <span className="font-mono text-ink-900 ml-auto">{p.value.toLocaleString('en-IN')}</span>
        </p>
      ))}
    </div>
  );
}

interface SeriesPoint {
  label: string;
  value: number;
}

interface RevenueAreaChartProps {
  data: SeriesPoint[];
  height?: number;
  name?: string;
}

export function RevenueAreaChart({ data, height = 220, name = 'Revenue' }: RevenueAreaChartProps): JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND.primary} stopOpacity={0.35} />
            <stop offset="100%" stopColor={BRAND.primary} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          tick={{ fill: BRAND.ink500, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: BRAND.ink100 }}
        />
        <YAxis
          tickFormatter={formatPaiseCompact}
          tick={{ fill: BRAND.ink500, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={50}
        />
        <Tooltip content={<CurrencyTooltip />} cursor={{ stroke: BRAND.ink300, strokeDasharray: '3 3' }} />
        <Area
          type="monotone"
          dataKey="value"
          name={name}
          stroke={BRAND.primary}
          strokeWidth={2}
          fill="url(#goldFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface ComparisonSeries {
  label: string;
  [key: string]: string | number;
}

interface RevenueExpenseBarChartProps {
  data: ComparisonSeries[];
  series: Array<{ key: string; name: string; color?: string }>;
  height?: number;
}

export function CurrencyBarChart({ data, series, height = 240 }: RevenueExpenseBarChartProps): JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fill: BRAND.ink500, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: BRAND.ink100 }}
        />
        <YAxis
          tickFormatter={formatPaiseCompact}
          tick={{ fill: BRAND.ink500, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={50}
        />
        <Tooltip content={<CurrencyTooltip />} cursor={{ fill: '#F4F2EE' }} />
        <Legend wrapperStyle={{ fontSize: 11, color: BRAND.ink500 }} iconType="circle" />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            fill={s.color ?? PALETTE[i % PALETTE.length]}
            radius={[3, 3, 0, 0]}
            maxBarSize={42}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

interface RankedRow {
  label: string;
  value: number;
  sub?: string;
}

interface RankedBarChartProps {
  data: RankedRow[];
  height?: number;
  unit?: 'currency' | 'count';
  name?: string;
}

export function RankedBarChart({ data, height = 240, unit = 'currency', name = 'Value' }: RankedBarChartProps): JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
      >
        <XAxis
          type="number"
          tickFormatter={unit === 'currency' ? formatPaiseCompact : (v) => v.toLocaleString('en-IN')}
          tick={{ fill: BRAND.ink500, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ fill: BRAND.ink700, fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={120}
        />
        <Tooltip
          content={unit === 'currency' ? <CurrencyTooltip /> : <NumberTooltip />}
          cursor={{ fill: '#F4F2EE' }}
        />
        <Bar dataKey="value" name={name} fill={BRAND.primary} radius={[0, 3, 3, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface DonutDatum {
  label: string;
  value: number;
}

interface CurrencyDonutChartProps {
  data: DonutDatum[];
  height?: number;
  centerLabel?: string;
  centerValue?: string;
}

export function CurrencyDonutChart({
  data,
  height = 220,
  centerLabel,
  centerValue,
}: CurrencyDonutChartProps): JSX.Element {
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Tooltip content={<CurrencyTooltip />} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="60%"
            outerRadius="90%"
            paddingAngle={2}
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Legend wrapperStyle={{ fontSize: 11, color: BRAND.ink500 }} iconType="circle" />
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-6">
          {centerLabel && <p className="text-eyebrow uppercase text-ink-500">{centerLabel}</p>}
          {centerValue && <p className="font-mono text-lg text-ink-900 mt-0.5">{centerValue}</p>}
        </div>
      )}
    </div>
  );
}
