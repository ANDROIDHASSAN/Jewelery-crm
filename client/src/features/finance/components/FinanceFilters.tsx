// Reusable filter row: shop picker + date range. Renders as a 12-col grid on
// desktop, single column on mobile. Each field is uncontrolled-friendly —
// the consumer owns state and passes value / onChange.

import { useGetShopsQuery } from '@/features/shops/shopsApi';

interface ShopPickerProps {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  /** Render an "All shops" option (used in admin overviews). */
  allowAll?: boolean;
  label?: string;
}

export function ShopPicker({
  value,
  onChange,
  allowAll = true,
  label = 'Shop',
}: ShopPickerProps): JSX.Element {
  const { data, isLoading } = useGetShopsQuery();
  const shops = data?.data ?? [];
  return (
    <label className="block text-sm">
      <span className="text-[11px] uppercase tracking-wider text-ink-500">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        disabled={isLoading}
        className="mt-1 w-full h-10 px-3 rounded-md border border-ink-200 bg-ink-0 text-sm disabled:opacity-60"
      >
        {allowAll && <option value="">All shops</option>}
        {!allowAll && <option value="">Select…</option>}
        {shops.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

interface DateInputProps {
  value: string;
  onChange: (next: string) => void;
  label: string;
}

export function DateInput({ value, onChange, label }: DateInputProps): JSX.Element {
  return (
    <label className="block text-sm">
      <span className="text-[11px] uppercase tracking-wider text-ink-500">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-10 px-3 rounded-md border border-ink-200 bg-ink-0 text-sm font-mono"
      />
    </label>
  );
}

interface MonthInputProps {
  value: string;
  onChange: (next: string) => void;
  label?: string;
}

export function MonthInput({ value, onChange, label = 'Month' }: MonthInputProps): JSX.Element {
  return (
    <label className="block text-sm">
      <span className="text-[11px] uppercase tracking-wider text-ink-500">{label}</span>
      <input
        type="month"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-10 px-3 rounded-md border border-ink-200 bg-ink-0 text-sm font-mono"
      />
    </label>
  );
}

export function FilterRow({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 rounded-md border border-ink-100 bg-ink-0 p-3 sm:p-4">
      {children}
    </div>
  );
}
