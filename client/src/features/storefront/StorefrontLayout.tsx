import { Outlet } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { StorefrontHeader } from './StorefrontHeader';
import { StorefrontFooter } from './StorefrontFooter';
import { useAppSelector } from '@/app/hooks';

export function StorefrontLayout(): JSX.Element {
  const whatsapp = useAppSelector((s) => s.storefrontContent.whatsappNumber);
  return (
    <div className="min-h-screen flex flex-col bg-ink-0">
      <StorefrontHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <StorefrontFooter />
      {/* WhatsApp floating button per design-references */}
      <a
        href={`https://wa.me/${whatsapp}`}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-brand-400 text-ink-900 inline-flex items-center justify-center shadow-md hover:bg-brand-500 transition-colors duration-fast"
        aria-label="Chat on WhatsApp"
      >
        <MessageCircle className="h-6 w-6" />
      </a>
    </div>
  );
}
