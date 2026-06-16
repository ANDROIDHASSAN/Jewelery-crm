import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useMeQuery } from '@/features/auth/authApi';
import { useAppDispatch } from '@/app/hooks';
import { setUser } from '@/features/auth/authSlice';
import { useGetPublicStorefrontQuery } from '@/features/storefront/storefrontApi';
import { setContent } from '@/features/storefront/storefrontContentSlice';

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

  // Hydrate the storefront content slice so the admin Sidebar logo / brand
  // name + DocumentHead favicon / title reflect the published CMS values
  // for admins too — not just for visitors on the public storefront. The
  // endpoint is unauthenticated and edge-cached, so this is cheap.
  const { data: storefront } = useGetPublicStorefrontQuery();
  useEffect(() => {
    if (storefront?.content) dispatch(setContent(storefront.content));
  }, [storefront, dispatch]);

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
      <div className="print:hidden">
        <Sidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="print:hidden">
          <TopBar
            onOpenCmdK={() => setCmdOpen(true)}
            onOpenMobileNav={() => setMobileNavOpen(true)}
          />
        </div>
        <main className="flex-1 px-3 sm:px-4 lg:px-6 py-4 sm:py-6 print:p-0">
          {/* Per-page boundary: a crash in one screen shows a contained error
              card here while the sidebar/topbar stay usable. Keyed by route so
              navigating to another page clears the error automatically. */}
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
