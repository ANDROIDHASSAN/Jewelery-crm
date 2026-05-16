// POS sidebar — same dashboard pattern as the admin shell, but with the
// counter-workflow nav. Fixed at `lg+`, slide-in drawer below that so a
// tablet cashier can swipe in for the menu when they need it.

import { NavLink } from 'react-router-dom';
import { CreditCard, LogOut, Settings, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Money } from '@/components/ui/money';

export interface PosSidebarNavItem {
  to: string;
  end?: boolean;
  icon: typeof CreditCard;
  label: string;
  description?: string;
  badge?: number;
}

interface PosSidebarProps {
  items: PosSidebarNavItem[];
  shopName: string | null;
  cashierName: string | null;
  initials: string;
  tillOpen: boolean;
  openingFloatPaise?: number;
  onSignOut: () => void;
  /** Mobile drawer open state. Ignored on lg+. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function PosSidebar(props: PosSidebarProps): JSX.Element {
  return (
    <>
      {/* Desktop — fixed sidebar */}
      <aside className="hidden lg:flex flex-col w-[260px] shrink-0 h-screen sticky top-0 bg-ink-0 border-r border-ink-100">
        <SidebarInner {...props} />
      </aside>

      {/* Mobile / tablet — slide-in drawer */}
      {props.mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="POS navigation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-ink-900/40"
            aria-label="Close menu"
            onClick={props.onMobileClose}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-ink-0 border-r border-ink-100 flex flex-col shadow-xl animate-in slide-in-from-left duration-200">
            <button
              type="button"
              onClick={props.onMobileClose}
              className="absolute right-3 top-3 h-8 w-8 rounded-md text-ink-500 hover:bg-ink-50 hover:text-ink-800 flex items-center justify-center"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarInner {...props} onNavigate={props.onMobileClose} />
          </aside>
        </div>
      )}
    </>
  );
}

function SidebarInner({
  items,
  shopName,
  cashierName,
  initials,
  tillOpen,
  openingFloatPaise,
  onSignOut,
  onNavigate,
}: PosSidebarProps & { onNavigate?: () => void }): JSX.Element {
  return (
    <>
      {/* Brand block ----------------------------------------------- */}
      <div className="px-5 pt-5 pb-4 border-b border-ink-100">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo/zelora-mark.png"
            alt=""
            aria-hidden="true"
            className="h-9 w-9 rounded-md object-cover shrink-0"
          />
          <div className="min-w-0">
            <div className="font-display text-md text-ink-900 leading-none">Zelora POS</div>
            <div className="text-[10px] uppercase tracking-wider text-ink-500 mt-1 truncate">
              {shopName ?? 'No shop assigned'}
            </div>
          </div>
        </div>

        {/* Till status chip */}
        <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium border bg-ink-25"
          style={{
            borderColor: tillOpen ? 'var(--color-success-200, #b3e5be)' : 'var(--color-warning-200, #f5d27d)',
            color: tillOpen ? 'var(--color-success-700, #1f7a32)' : 'var(--color-warning-700, #8a5d00)',
          }}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              tillOpen ? 'bg-success-600 animate-pulse' : 'bg-warning-600',
            )}
            aria-hidden
          />
          Till {tillOpen ? 'open' : 'closed'}
          {tillOpen && openingFloatPaise !== undefined && openingFloatPaise > 0 && (
            <>
              <span className="text-ink-400">·</span>
              <Money paise={openingFloatPaise} className="font-mono text-ink-700" />
            </>
          )}
        </div>
      </div>

      {/* Nav ------------------------------------------------------- */}
      <nav className="px-3 pt-3 pb-2 flex-1 space-y-0.5 overflow-y-auto" aria-label="POS workflows">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-md px-3 h-10 text-sm transition-colors',
                isActive
                  ? 'bg-brand-50 text-ink-900 border-l-2 border-brand-400 -ml-[2px] pl-[10px]'
                  : 'text-ink-600 hover:bg-ink-50 hover:text-ink-800',
              )
            }
          >
            {({ isActive }) => (
              <>
                <it.icon
                  className={cn('h-4 w-4 shrink-0', isActive ? 'text-brand-600' : 'text-ink-500 group-hover:text-ink-700')}
                  aria-hidden
                />
                <span className="flex-1 truncate">{it.label}</span>
                {!!it.badge && it.badge > 0 && (
                  <span
                    className={cn(
                      'min-w-[18px] h-[18px] rounded-full px-1 text-[10px] font-medium inline-flex items-center justify-center tabular-nums',
                      isActive ? 'bg-brand-500 text-ink-0' : 'bg-ink-100 text-ink-700',
                    )}
                    aria-label={`${it.badge} ${it.label.toLowerCase()}`}
                  >
                    {it.badge > 99 ? '99+' : it.badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Cashier card + actions ----------------------------------- */}
      <div className="border-t border-ink-100 p-3 space-y-2">
        {cashierName && (
          <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-brand-100 text-brand-700 text-sm font-medium shrink-0">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-ink-900 font-medium truncate">{cashierName}</div>
              <div className="text-[10px] uppercase tracking-wider text-ink-500">Cashier</div>
            </div>
          </div>
        )}
        <NavLink
          to="/pos/settings"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-md px-3 h-9 text-sm text-ink-600 hover:bg-ink-50 hover:text-ink-800"
        >
          <Settings className="h-4 w-4" aria-hidden />
          <span>Settings</span>
        </NavLink>
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-2.5 rounded-md px-3 h-9 text-sm text-ink-600 hover:bg-danger-50 hover:text-danger-700"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          <span>Sign out</span>
        </button>
      </div>
    </>
  );
}
