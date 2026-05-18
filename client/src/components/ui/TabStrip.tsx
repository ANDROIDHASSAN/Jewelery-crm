// TabStrip — the canonical underline-tab nav for admin sub-pages.
//
// Used by Inventory (Items / Transfers / Wastage / …), CRM (Inbox / Pipeline
// / Reports / …), Finance (Overview / P&L / GST / …). Centralised so the
// border colour, hover, active treatment, and overflow behaviour are
// identical everywhere.
//
// Two modes:
//   - `items` + `value` + `onChange` → state-driven (React useState callers)
//   - `items` with `to:` urls → router-driven (NavLink under the hood)

import type { ComponentType, SVGProps } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';

export interface TabStripItem<TValue extends string = string> {
  id: TValue;
  label: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** When set, the tab is rendered as a NavLink to this URL (instead of triggering onChange). */
  to?: string;
  /** Tiny pill rendered next to the label. Use for counts. */
  count?: number;
  /** Visual tone for the count pill. Defaults to neutral. `danger` pulses. */
  countTone?: 'neutral' | 'brand' | 'danger';
  /** Tooltip on the count pill. */
  countTitle?: string;
  /** Disable interaction. */
  disabled?: boolean;
}

interface BaseProps<TValue extends string> {
  items: ReadonlyArray<TabStripItem<TValue>>;
  /** Bleed the strip into the page padding on small screens so it can scroll edge-to-edge. */
  bleed?: boolean;
  className?: string;
}

interface StateProps<TValue extends string> extends BaseProps<TValue> {
  value: TValue;
  onChange: (next: TValue) => void;
}

interface RouterProps<TValue extends string> extends BaseProps<TValue> {
  value?: undefined;
  onChange?: undefined;
}

export function TabStrip<TValue extends string>(
  props: StateProps<TValue> | RouterProps<TValue>,
): JSX.Element {
  const { items, bleed = true, className } = props;
  const value = (props as StateProps<TValue>).value;
  const onChange = (props as StateProps<TValue>).onChange;
  return (
    <nav
      role="tablist"
      aria-label="Section tabs"
      className={cn(
        'flex gap-1 border-b border-ink-100 overflow-x-auto -mb-px scrollbar-thin',
        bleed && '-mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6',
        className,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const inner = (active: boolean): JSX.Element => (
          <>
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            <span>{item.label}</span>
            {typeof item.count === 'number' && (
              <span
                title={item.countTitle}
                className={cn(
                  'ml-0.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-semibold tabular-nums',
                  item.countTone === 'danger'
                    ? 'bg-danger-500 text-ink-0 animate-pulse'
                    : item.countTone === 'brand' || active
                      ? 'bg-brand-100 text-brand-800'
                      : 'bg-ink-100 text-ink-600',
                )}
              >
                {item.count}
              </span>
            )}
          </>
        );

        const classNameFor = (active: boolean): string =>
          cn(
            'inline-flex items-center gap-1.5 px-3 h-10 text-sm border-b-2 transition-colors duration-fast whitespace-nowrap shrink-0',
            active
              ? 'border-brand-500 text-ink-900 font-medium'
              : 'border-transparent text-ink-500 hover:text-ink-800 hover:border-ink-200',
            item.disabled && 'opacity-40 pointer-events-none',
          );

        // Router-driven tab
        if (item.to) {
          return (
            <NavLink
              key={item.id}
              to={item.to}
              end
              role="tab"
              className={({ isActive }) => classNameFor(isActive)}
            >
              {({ isActive }) => inner(isActive)}
            </NavLink>
          );
        }

        // State-driven tab
        if (value !== undefined && onChange) {
          const active = value === item.id;
          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={active}
              disabled={item.disabled}
              onClick={() => onChange(item.id)}
              className={classNameFor(active)}
            >
              {inner(active)}
            </button>
          );
        }

        // Static fallback — shouldn't typically be hit
        return (
          <span key={item.id} className={classNameFor(false)}>
            {inner(false)}
          </span>
        );
      })}
    </nav>
  );
}
