import { useState } from 'react';
import { Search, Bell, LogOut, User as UserIcon, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ShopSwitcher } from './ShopSwitcher';
import { Button } from '@/components/ui/button';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { logout as logoutAction } from '@/features/auth/authSlice';
import { useLogoutMutation } from '@/features/auth/authApi';
import { cn } from '@/lib/cn';

interface TopBarProps {
  onOpenCmdK: () => void;
  onOpenMobileNav?: () => void;
}

export function TopBar({ onOpenCmdK, onOpenMobileNav }: TopBarProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const user = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [logout] = useLogoutMutation();

  const initials = (user?.name ?? 'AK')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  async function signOut(): Promise<void> {
    try {
      await logout().unwrap();
    } catch {
      /* swallow */
    }
    dispatch(logoutAction());
    toast.success('Signed out');
    navigate('/admin/login', { replace: true });
  }

  return (
    <header className="h-14 sticky top-0 z-30 bg-ink-0/85 backdrop-blur border-b border-ink-100 flex items-center px-3 sm:px-4 lg:px-6 gap-2 sm:gap-3">
      {/* Hamburger – only visible below lg where the sidebar is a drawer */}
      <button
        type="button"
        onClick={onOpenMobileNav}
        className="lg:hidden h-9 w-9 -ml-1 rounded-md text-ink-700 hover:bg-ink-50 flex items-center justify-center"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <ShopSwitcher />
      <div className="flex-1 flex justify-center min-w-0">
        <button
          onClick={onOpenCmdK}
          className="hidden md:flex items-center gap-2 w-full max-w-md h-9 px-3 rounded-md border border-ink-200 bg-ink-25 text-sm text-ink-500 hover:bg-ink-50 transition-colors duration-fast"
          aria-label="Open command palette"
        >
          <Search className="h-4 w-4" />
          <span>Search or jump to…</span>
          <kbd className="ml-auto font-mono text-xs text-ink-400 border border-ink-200 rounded px-1.5 py-0.5">⌘K</kbd>
        </button>
        {/* Compact search button on mobile */}
        <button
          onClick={onOpenCmdK}
          className="md:hidden h-9 w-9 rounded-md text-ink-700 hover:bg-ink-50 flex items-center justify-center"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>
      <Button variant="ghost" size="sm" aria-label="Notifications" className="hidden sm:inline-flex">
        <Bell className="h-4 w-4" />
      </Button>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-medium hover:bg-brand-200 transition-colors"
          aria-label="Account menu"
        >
          {initials}
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
            <div className="absolute right-0 mt-2 w-56 rounded-md border border-ink-100 bg-ink-0 shadow-lg z-40 overflow-hidden">
              {user && (
                <div className="px-3 py-2.5 border-b border-ink-100">
                  <div className="text-sm font-medium text-ink-900 truncate">{user.name}</div>
                  <div className="text-xs text-ink-500 truncate">{user.email}</div>
                  <div className={cn('inline-block mt-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded',
                    user.roleSlug === 'SUPER_ADMIN' ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-600',
                  )}>
                    {user.roleSlug.replace('_', ' ')}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => { setOpen(false); navigate('/admin/settings'); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50"
              >
                <UserIcon className="h-4 w-4" /> Profile & 2FA
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); void signOut(); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50 border-t border-ink-50"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
