import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';
import { useMeQuery } from '@/features/auth/authApi';
import { useAppDispatch } from '@/app/hooks';
import { setUser } from '@/features/auth/authSlice';

export function AdminShell(): JSX.Element {
  const [cmdOpen, setCmdOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  // Re-fetch /me on every full app boot so a role/permission change applied
  // by the super-admin elsewhere takes effect on next page load. Refresh is
  // already wired for 401s in store.ts.
  const { data } = useMeQuery();
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (data?.data) dispatch(setUser(data.data));
  }, [data, dispatch]);

  // Close the mobile nav whenever the route changes so it doesn't linger
  // after a navigation triggered outside the sidebar.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Close mobile nav on Escape.
  useEffect(() => {
    if (!mobileNavOpen) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setMobileNavOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

  return (
    <div className="min-h-screen flex">
      <Sidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          onOpenCmdK={() => setCmdOpen(true)}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        <main className="flex-1 px-3 sm:px-4 lg:px-6 py-4 sm:py-6">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
