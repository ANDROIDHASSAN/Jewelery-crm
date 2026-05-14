import { NavLink } from 'react-router-dom';
import {
  Boxes,
  ScanLine,
  Wallet,
  Users,
  ShoppingBag,
  Globe,
  BarChart3,
  Settings,
  LayoutDashboard,
} from 'lucide-react';
import { cn } from '@/lib/cn';

const items = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { to: '/admin/pos', label: 'POS', icon: ScanLine },
  { to: '/admin/finance', label: 'Finance', icon: Wallet },
  { to: '/admin/ecommerce', label: 'E-Commerce', icon: ShoppingBag },
  { to: '/admin/website', label: 'Website', icon: Globe },
  { to: '/admin/crm', label: 'CRM', icon: Users },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
];

export function Sidebar(): JSX.Element {
  return (
    <aside className="hidden lg:flex flex-col w-[240px] shrink-0 h-screen sticky top-0 bg-ink-0 border-r border-ink-100">
      <div className="px-5 py-5 flex items-center gap-2.5">
        <img
          src="/logo/zelora-mark.png"
          alt=""
          aria-hidden="true"
          className="h-8 w-8 rounded-md object-cover"
        />
        <span className="font-display text-md text-ink-900">Zelora</span>
      </div>
      <nav className="px-3 pt-2 flex-1 space-y-0.5" aria-label="Primary">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-md px-3 h-8 text-sm transition-colors duration-fast',
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
          className="flex items-center gap-2.5 rounded-md px-3 h-8 text-sm text-ink-600 hover:bg-ink-50 hover:text-ink-800 transition-colors duration-fast"
        >
          <Settings className="h-4 w-4" aria-hidden />
          <span>Settings</span>
        </NavLink>
      </div>
    </aside>
  );
}
