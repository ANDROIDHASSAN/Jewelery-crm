import { useState } from 'react';
import { Search, LogOut, User as UserIcon, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ShopSwitcher } from './ShopSwitcher';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { signOutAndClear } from '@/features/auth/authActions';
import { cn } from '@/lib/cn';
import { NotificationBell } from '@/features/notifications/NotificationBell';

interface TopBarProps {
  onOpenCmdK: () => void;
  onOpenMobileNav?: () => void;
}

export function TopBar({ onOpenCmdK, onOpenMobileNav }: TopBarProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const user = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const initials = (user?.name ?? 'AK')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  async function signOut(): Promise<void> {
    // signOutAndClear takes care of:
    //   - server-side refresh-cookie revoke (via /auth/logout)
    //   - clearing the auth slice + localStorage
    //   - resetting the RTK Query cache so the next signed-in user never
    //     sees this user's cached data (perm change propagation bug).
    await dispatch(signOutAndClear());
    toast.success('Signed out');
    navigate('/admin/login', { replace: true });
  }

  return (
    <header className="h-14 sticky top-0 z-30 bg-ink-0/90 backdrop-blur-md border-b border-ink-100 flex items-center px-3 sm:px-4 lg:px-6 gap-2 sm:gap-3">
      {/* Hamburger – only visible below lg where the sidebar is a drawer */}
      <button
        type="button"
        onClick={onOpenMobileNav}
        className="lg:hidden h-9 w-9 -ml-1 rounded-md text-ink-700 hover:bg-ink-50 flex items-center justify-center transition-colors duration-fast"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <ShopSwitcher />
      <div className="flex-1 flex justify-center min-w-0">
        <button
          onClick={onOpenCmdK}
          className="group hidden md:flex items-center gap-2.5 w-full max-w-md h-9 px-3 rounded-md border border-ink-100 bg-ink-25 text-sm text-ink-500 hover:bg-ink-0 hover:border-ink-200 hover:shadow-sm transition-all duration-fast"
          aria-label="Open command palette"
        >
          <Search className="h-4 w-4 text-ink-400 group-hover:text-brand-500 transition-colors duration-fast" />
          <span className="text-left flex-1 truncate">Search or jump to…</span>
          <kbd className="ml-auto inline-flex items-center gap-0.5 font-mono text-[11px] text-ink-500 bg-ink-0 border border-ink-200 rounded px-1.5 py-0.5 shadow-sm">
            <span className="text-ink-400">⌘</span>K
          </kbd>
        </button>
        {/* Compact search button on mobile */}
        <button
          onClick={onOpenCmdK}
          className="md:hidden h-9 w-9 rounded-md text-ink-700 hover:bg-ink-50 flex items-center justify-center transition-colors duration-fast"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>
      <div className="hidden sm:inline-flex">
        <NotificationBell />
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'h-8 w-8 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center text-[11px] font-medium tracking-wide',
            'ring-1 ring-brand-200/60 hover:bg-brand-200 hover:ring-brand-300 transition-all duration-fast',
            open && 'ring-2 ring-brand-300',
          )}
          aria-label="Account menu"
          aria-expanded={open}
        >
          {initials}
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
            <div className="absolute right-0 mt-2 w-60 rounded-md border border-ink-100 bg-ink-0 shadow-lg z-40 overflow-hidden">
              {user && (
                <div className="px-3.5 py-3 border-b border-ink-100 bg-gradient-to-b from-ink-25 to-ink-0">
                  <div className="flex items-center gap-2.5">
                    <span className="h-9 w-9 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center text-xs font-medium shrink-0">
                      {initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink-900 truncate leading-tight">{user.name}</div>
                      <div className="text-xs text-ink-500 truncate mt-0.5">{user.email}</div>
                    </div>
                  </div>
                  <div className={cn(
                    'inline-block mt-2 text-[10px] uppercase tracking-[0.14em] font-semibold px-1.5 py-0.5 rounded',
                    user.roleSlug === 'SUPER_ADMIN' ? 'bg-brand-100 text-brand-800' : 'bg-ink-100 text-ink-600',
                  )}>
                    {user.roleSlug.replace(/_/g, ' ')}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => { setOpen(false); navigate('/admin/settings'); }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink-700 hover:bg-ink-50 transition-colors duration-fast"
              >
                <UserIcon className="h-4 w-4 text-ink-400" /> Profile & 2FA
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); void signOut(); }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink-700 hover:bg-danger-50 hover:text-danger-700 transition-colors duration-fast border-t border-ink-100"
              >
                <LogOut className="h-4 w-4 text-ink-400 group-hover:text-danger-500" /> Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
