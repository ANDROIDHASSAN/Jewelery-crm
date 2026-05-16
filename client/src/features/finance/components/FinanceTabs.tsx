// Pill-tab navigation for the Finance dashboard. The tabs scroll horizontally
// on phones (no flex-wrap into multi-line chaos) and stay flush left on
// desktop so the eye never has to hunt for the active tab.
//
// We route via ?tab=… so all tabs share the same RouteObject — that avoids
// re-mounting the page chrome and lets us share state (shop picker, dialogs)
// across sub-tabs cheaply.

import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/cn';

export interface FinanceTab {
  to: string;
  label: string;
  end?: boolean;
}

function getTab(to: string): string | null {
  const idx = to.indexOf('?');
  if (idx < 0) return null;
  return new URLSearchParams(to.slice(idx + 1)).get('tab');
}

export function FinanceTabs({ tabs }: { tabs: FinanceTab[] }): JSX.Element {
  const [params] = useSearchParams();
  const loc = useLocation();
  const active = params.get('tab') ?? 'overview';

  return (
    <nav
      className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 border-b border-ink-100"
      aria-label="Finance sections"
    >
      <ul className="flex items-end gap-1 min-w-max">
        {tabs.map((t) => {
          const target = getTab(t.to) ?? t.to;
          const isActive = active === target;
          return (
            <li key={t.to}>
              <Link
                to={t.to}
                state={loc.state}
                className={cn(
                  'inline-flex h-10 items-center px-3.5 text-sm transition-colors duration-fast border-b-2 -mb-px whitespace-nowrap',
                  isActive
                    ? 'border-brand-400 text-ink-900 font-medium'
                    : 'border-transparent text-ink-500 hover:text-ink-800 hover:border-ink-200',
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
