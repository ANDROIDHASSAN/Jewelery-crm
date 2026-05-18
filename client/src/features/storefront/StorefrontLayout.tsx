import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { StorefrontHeader } from './StorefrontHeader';
import { StorefrontFooter } from './StorefrontFooter';
import { setContent } from './storefrontContentSlice';
import { useGetPublicStorefrontQuery } from './storefrontApi';
import { useAppDispatch, useAppSelector } from '@/app/hooks';

export function StorefrontLayout(): JSX.Element {
  const whatsapp = useAppSelector((s) => s.storefrontContent.whatsappNumber);
  const dispatch = useAppDispatch();
  const { data } = useGetPublicStorefrontQuery();

  // Hydrate the local slice from the database on mount + whenever the server
  // version refreshes. Preserves the existing useAppSelector consumers without
  // requiring a per-component refactor.
  useEffect(() => {
    if (data?.content) dispatch(setContent(data.content));
  }, [data, dispatch]);

  return (
    <div className="min-h-screen flex flex-col bg-ink-0">
      <StorefrontHeader />
      {/* pb-* keeps page CTAs (Place order, Move to bag, Refresh now)
          clear of the fixed WhatsApp orb on mobile/tablet. */}
      <main className="flex-1 pb-24 sm:pb-28 lg:pb-12">
        <Outlet />
      </main>
      <StorefrontFooter />
      {/* WhatsApp floating button per design-references */}
      <a
        href={`https://wa.me/${whatsapp}`}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-brand-400 text-ink-900 inline-flex items-center justify-center shadow-md hover:bg-brand-500 transition-colors duration-fast z-30"
        aria-label="Chat on WhatsApp"
      >
        <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6" />
      </a>
    </div>
  );
}
