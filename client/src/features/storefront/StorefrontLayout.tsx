import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { StorefrontHeader } from './StorefrontHeader';
import { StorefrontFooter } from './StorefrontFooter';
import { AuthGateProvider } from './AuthSheet';
import { setContent } from './storefrontContentSlice';
import { useGetPublicStorefrontQuery } from './storefrontApi';
import { useAppDispatch, useAppSelector } from '@/app/hooks';

export function StorefrontLayout(): JSX.Element {
  const whatsapp = useAppSelector((s) => s.storefrontContent.whatsappNumber);
  const dispatch = useAppDispatch();
  const { data } = useGetPublicStorefrontQuery();
  const { pathname } = useLocation();

  // Scroll to top on every storefront route transition
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // Hydrate the local slice from the database on mount + whenever the server
  // version refreshes. Preserves the existing useAppSelector consumers without
  // requiring a per-component refactor.
  //
  // VITE_USE_DEFAULT_CONTENT=1 used to completely bypass the API so the
  // storefront rendered the hardcoded design-system defaults, but that meant
  // any real CMS edits were silently ignored on local dev (which is also
  // exactly what made the nav-menu publish look broken). The flag is now a
  // FALLBACK: it only kicks in when the API returned no content (404,
  // network error, or empty body). Whenever the CMS has saved content it
  // wins — what an editor publishes is what gets rendered.
  useEffect(() => {
    if (data?.content) {
      dispatch(setContent(data.content));
    }
    // No-content case: leave the initial DEFAULT_CONTENT in place. The flag
    // is implicitly honoured because that initial state IS the design-system
    // default — no extra dispatch needed.
  }, [data, dispatch]);


  return (
    <AuthGateProvider>
    <div className="min-h-screen flex flex-col bg-ink-0">
      <StorefrontHeader />
      {/* pb-* keeps page CTAs (Place order, Move to bag, Refresh now)
          clear of the fixed WhatsApp orb on mobile/tablet. */}
      <main className="flex-1 pb-24 sm:pb-28 lg:pb-12">
        <Outlet />
      </main>
      <StorefrontFooter />
      {/* WhatsApp floating button per design-references — soft floating bob */}
      <a
        href={`https://wa.me/${whatsapp}`}
        target="_blank"
        rel="noopener noreferrer"
        className="group fixed bottom-4 right-4 sm:bottom-6 sm:right-6 h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-brand-400 text-ink-900 inline-flex items-center justify-center shadow-md hover:bg-brand-500 transition-colors duration-fast z-30 animate-float-bob"
        aria-label="Chat on WhatsApp"
      >
        <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6 transition-transform duration-200 group-hover:scale-110" />
      </a>
    </div>
    </AuthGateProvider>
  );
}
