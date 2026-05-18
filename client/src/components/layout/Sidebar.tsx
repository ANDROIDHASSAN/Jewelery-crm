import { NavLink } from 'react-router-dom';
import {
  Boxes,
  Store,
  Wallet,
  Users,
  ShoppingBag,
  Globe,
  BarChart3,
  Settings,
  LayoutDashboard,
  UserCog,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAppSelector } from '@/app/hooks';
import { hasAnyPermission } from '@/features/auth/authSlice';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  // Show this item if the user has any of these permissions. Super admin
  // bypasses (hasAnyPermission returns true for them).
  anyPerm?: readonly string[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

// Nav items are grouped visually so a power user can scan the sidebar by
// theme — operations live together, customer-facing channels live together,
// reporting and admin sit at the bottom. The titles are purely presentational;
// permission gating is identical to before.
const sections: NavSection[] = [
  {
    title: 'Main',
    items: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, anyPerm: ['dashboard.view'] },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/admin/inventory', label: 'Inventory', icon: Boxes, anyPerm: ['inventory.read', 'inventory.write'] },
      // No POS billing here — that lives on the pos.<host> subdomain.
      // This is the read-only owner / accountant monitor across every shop.
      { to: '/admin/counter', label: 'Offline shops', icon: Store, anyPerm: ['pos.monitor'] },
      { to: '/admin/finance', label: 'Finance', icon: Wallet, anyPerm: ['finance.read', 'finance.expense_write'] },
    ],
  },
  {
    title: 'Channels',
    items: [
      { to: '/admin/ecommerce', label: 'E-commerce', icon: ShoppingBag, anyPerm: ['ecommerce.read', 'ecommerce.product_write'] },
      { to: '/admin/website', label: 'Website', icon: Globe, anyPerm: ['website.read', 'website.write'] },
      { to: '/admin/crm', label: 'CRM & ads', icon: Users, anyPerm: ['crm.read', 'crm.write'] },
    ],
  },
  {
    title: 'Insights',
    items: [
      { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, anyPerm: ['reports.view'] },
      { to: '/admin/team', label: 'Team & roles', icon: UserCog, anyPerm: ['users.read', 'roles.read'] },
    ],
  },
];

interface SidebarProps {
  /** Drawer open state on mobile/tablet (<lg). Ignored at lg+ where the sidebar is fixed. */
  mobileOpen?: boolean;
  /** Called when the drawer should close (overlay click, nav click, esc). */
  onMobileClose?: () => void;
}

function SidebarInner({ onNavigate }: { onNavigate?: () => void }): JSX.Element {
  const user = useAppSelector((s) => s.auth.user);

  // Filter items per section by permissions, then drop any section that ends
  // up empty so we don't render a stranded heading.
  const visibleSections = sections
    .map((sec) => ({
      ...sec,
      items: sec.items.filter((it) => !it.anyPerm || hasAnyPermission(user, it.anyPerm)),
    }))
    .filter((sec) => sec.items.length > 0);

  return (
    <>
      <div className="px-5 py-5 flex items-center gap-2.5">
        <div className="relative h-9 w-9 shrink-0">
          <img
            src="/logo/zelora-mark.png"
            alt=""
            aria-hidden="true"
            className="h-9 w-9 rounded-md object-cover ring-1 ring-ink-100"
          />
          {/* Tiny gold "live" dot — purely decorative; reads as a brand accent. */}
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-brand-400 ring-2 ring-ink-0"
          />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-display text-[17px] text-ink-900 leading-none tracking-tight">
            Zelora
          </span>
          {user && (
            <span className="text-[10px] uppercase tracking-[0.14em] text-ink-400 mt-1 font-medium truncate">
              {user.roleSlug.replace(/_/g, ' ')}
            </span>
          )}
        </div>
      </div>

      <nav className="px-3 pt-2 flex-1 overflow-y-auto" aria-label="Primary">
        {visibleSections.map((sec, idx) => (
          <div key={sec.title} className={cn(idx > 0 && 'mt-5')}>
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">
              {sec.title}
            </p>
            <div className="space-y-0.5">
              {sec.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex items-center gap-2.5 rounded-md h-9 px-3 text-sm transition-colors duration-fast',
                      isActive
                        ? 'bg-brand-50 text-ink-900 font-medium'
                        : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* Active-state left bar — small, gold, anchored. */}
                      <span
                        aria-hidden
                        className={cn(
                          'absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full transition-all duration-fast',
                          isActive ? 'bg-brand-500' : 'bg-transparent',
                        )}
                      />
                      <it.icon
                        className={cn(
                          'h-4 w-4 shrink-0 transition-colors duration-fast',
                          isActive ? 'text-brand-600' : 'text-ink-400 group-hover:text-ink-700',
                        )}
                        aria-hidden
                      />
                      <span className="truncate">{it.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-ink-100">
        <NavLink
          to="/admin/settings"
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-md h-9 px-3 text-sm transition-colors duration-fast',
              isActive
                ? 'bg-ink-50 text-ink-900'
                : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
            )
          }
        >
          <Settings className="h-4 w-4 text-ink-400" aria-hidden />
          <span>Settings</span>
        </NavLink>
      </div>
    </>
  );
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps): JSX.Element {
  return (
    <>
      {/* Desktop / large-tablet: fixed sidebar */}
      <aside className="hidden lg:flex flex-col w-[240px] shrink-0 h-screen sticky top-0 bg-ink-0 border-r border-ink-100">
        <SidebarInner />
      </aside>

      {/* Mobile / tablet: slide-in drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button
            type="button"
            className="absolute inset-0 bg-ink-900/40"
            aria-label="Close menu"
            onClick={onMobileClose}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-[260px] max-w-[85vw] bg-ink-0 border-r border-ink-100 flex flex-col shadow-xl animate-in slide-in-from-left duration-200">
            <button
              type="button"
              onClick={onMobileClose}
              className="absolute right-3 top-3 h-8 w-8 rounded-md text-ink-500 hover:bg-ink-50 hover:text-ink-800 flex items-center justify-center"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarInner onNavigate={onMobileClose} />
          </aside>
        </div>
      )}
    </>
  );
}
