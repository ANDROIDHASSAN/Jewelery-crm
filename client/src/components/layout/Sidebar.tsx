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

const items: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, anyPerm: ['dashboard.view'] },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes, anyPerm: ['inventory.read', 'inventory.write'] },
  // No POS billing here — that lives on the pos.<host> subdomain.
  // This is the read-only owner / accountant monitor across every shop.
  { to: '/admin/counter', label: 'Offline Shops', icon: Store, anyPerm: ['pos.monitor'] },
  { to: '/admin/finance', label: 'Finance', icon: Wallet, anyPerm: ['finance.read', 'finance.expense_write'] },
  { to: '/admin/ecommerce', label: 'E-Commerce', icon: ShoppingBag, anyPerm: ['ecommerce.read', 'ecommerce.product_write'] },
  { to: '/admin/website', label: 'Website', icon: Globe, anyPerm: ['website.read', 'website.write'] },
  { to: '/admin/crm', label: 'CRM', icon: Users, anyPerm: ['crm.read', 'crm.write'] },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, anyPerm: ['reports.view'] },
  { to: '/admin/team', label: 'Team & Roles', icon: UserCog, anyPerm: ['users.read', 'roles.read'] },
];

interface SidebarProps {
  /** Drawer open state on mobile/tablet (<lg). Ignored at lg+ where the sidebar is fixed. */
  mobileOpen?: boolean;
  /** Called when the drawer should close (overlay click, nav click, esc). */
  onMobileClose?: () => void;
}

function SidebarInner({ onNavigate }: { onNavigate?: () => void }): JSX.Element {
  const user = useAppSelector((s) => s.auth.user);
  const visible = items.filter((it) => !it.anyPerm || hasAnyPermission(user, it.anyPerm));

  return (
    <>
      <div className="px-5 py-5 flex items-center gap-2.5">
        <img
          src="/logo/zelora-mark.png"
          alt=""
          aria-hidden="true"
          className="h-8 w-8 rounded-md object-cover"
        />
        <div className="flex flex-col">
          <span className="font-display text-md text-ink-900 leading-none">Zelora</span>
          {user && (
            <span className="text-[10px] uppercase tracking-wider text-ink-400 mt-0.5">
              {user.roleSlug.replace('_', ' ')}
            </span>
          )}
        </div>
      </div>
      <nav className="px-3 pt-2 flex-1 space-y-0.5 overflow-y-auto" aria-label="Primary">
        {visible.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-md px-3 h-9 text-sm transition-colors duration-fast',
                isActive
                  ? 'bg-brand-50 text-ink-900 border-l-2 border-brand-400 -ml-[2px] pl-[10px]'
                  : 'text-ink-600 hover:bg-ink-50 hover:text-ink-800',
              )
            }
          >
            <it.icon className="h-4 w-4 shrink-0" aria-hidden />
            <span>{it.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="px-3 py-3 border-t border-ink-100">
        <NavLink
          to="/admin/settings"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-md px-3 h-9 text-sm text-ink-600 hover:bg-ink-50 hover:text-ink-800 transition-colors duration-fast"
        >
          <Settings className="h-4 w-4" aria-hidden />
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
