import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Facebook, Youtube, MapPin, Phone, Mail, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { useAppSelector } from '@/app/hooks';
import { useCreateEnquiryMutation } from '@/features/storefront/storefrontApi';

export function StorefrontFooter(): JSX.Element {
  const brand = useAppSelector((s) => s.storefrontContent.brand);
  const primaryLocation = useAppSelector((s) => s.storefrontContent.locations[0]);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [subscribe, { isLoading: subscribing }] = useCreateEnquiryMutation();

  async function handleSubscribe(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(newsletterEmail)) {
      toast.error('Please enter a valid email');
      return;
    }
    try {
      // Newsletter signups land as Leads with source=newsletter so the CRM
      // can see and follow up. Phone is the lead model's required field;
      // we synthesize a placeholder local-format number from the email hash
      // so validation passes — the email is stored in the interest field.
      const stableLocal = `+91${(7000000000 + Math.abs(hashCode(newsletterEmail)) % 999999999).toString().slice(0, 10)}`;
      await subscribe({
        source: 'newsletter',
        name: newsletterEmail.split('@')[0]!.slice(0, 80),
        phone: stableLocal,
        interest: `Newsletter signup: ${newsletterEmail}`,
      }).unwrap();
      toast.success('Subscribed — see you in your inbox!');
      setNewsletterEmail('');
    } catch {
      toast.error('Could not subscribe. Try again.');
    }
  }
  return (
    <footer className="bg-[#FAF3EE] border-t border-[#EFE0D2]">
      {/* Newsletter — inline, never a popup */}
      <div className="border-b border-[#EFE0D2] bg-[#F5E5DC]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-10 sm:py-12 md:py-14 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 md:gap-10 items-center">
          <div className="max-w-md">
            <p className="text-eyebrow uppercase text-brand-700">Stay in the loop</p>
            <h2 className="font-display text-2xl sm:text-[26px] md:text-[32px] leading-tight text-ink-900 mt-2">
              New collections, in your inbox.
            </h2>
            <p className="mt-2 text-sm text-ink-600">Quiet, once a month. Unsubscribe anytime.</p>
          </div>
          <form className="flex w-full max-w-md gap-2" onSubmit={handleSubscribe}>
            <label htmlFor="newsletter" className="sr-only">Email</label>
            <input
              id="newsletter"
              type="email"
              required
              value={newsletterEmail}
              onChange={(e) => setNewsletterEmail(e.target.value)}
              placeholder="you@email.com"
              className="flex-1 h-12 px-4 rounded-full bg-ink-0 border border-ink-200 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-400 outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={subscribing}
              className="h-12 px-4 sm:px-5 rounded-full bg-ink-900 text-ink-0 text-sm font-medium hover:bg-ink-800 disabled:opacity-60 transition-colors inline-flex items-center gap-1.5 shrink-0"
            >
              <span className="hidden sm:inline">{subscribing ? 'Subscribing…' : 'Subscribe'}</span>
              <span className="sm:hidden">{subscribing ? '…' : 'Join'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Main footer */}
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-12 sm:py-14 md:py-16 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 sm:gap-10">
        <div className="col-span-2 max-w-sm">
          <Link to="/store" className="font-display text-[22px] text-ink-900 inline-flex items-center gap-2.5">
            {brand.logo && (
              <img src={brand.logo} alt="" aria-hidden="true" className="h-9 w-9 rounded-md object-cover" />
            )}
            {brand.name}
          </Link>
          <p className="mt-3 text-sm text-ink-600 leading-relaxed">
            {brand.tagline}
          </p>
          <ul className="mt-5 space-y-2.5 text-sm text-ink-700">
            {primaryLocation && (
              <>
                <li className="flex gap-2.5"><MapPin className="h-4 w-4 mt-0.5 text-ink-400 shrink-0" /> {primaryLocation.address}</li>
                <li className="flex gap-2.5"><Phone className="h-4 w-4 mt-0.5 text-ink-400 shrink-0" /> {primaryLocation.phone}</li>
              </>
            )}
            <li className="flex gap-2.5"><Mail className="h-4 w-4 mt-0.5 text-ink-400 shrink-0" /> hello@anantjewellers.in</li>
          </ul>
          <div className="mt-5 flex items-center gap-2 text-ink-500">
            <a href="#" aria-label="Instagram" className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-ink-100 hover:border-ink-300 hover:text-ink-900"><Instagram className="h-4 w-4" /></a>
            <a href="#" aria-label="Facebook" className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-ink-100 hover:border-ink-300 hover:text-ink-900"><Facebook className="h-4 w-4" /></a>
            <a href="#" aria-label="YouTube" className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-ink-100 hover:border-ink-300 hover:text-ink-900"><Youtube className="h-4 w-4" /></a>
          </div>
        </div>
        <FooterCol
          title="Shop"
          links={[
            ['Bridal', '/store/collections/bridal'],
            ['Daily wear', '/store/collections/daily-wear'],
            ['Festive', '/store/collections/festive'],
            ['Diamond', '/store/collections/diamond'],
            ['Silver', '/store/collections/silver'],
          ]}
        />
        <FooterCol
          title="Visit"
          links={[
            ['Stores', '/store/locations'],
            ['Our story', '/store/story'],
            ['Workshop tours', '/store/workshop'],
            ['Contact', '/store/contact'],
          ]}
        />
        <FooterCol
          title="Help"
          links={[
            ['Track order', '/store/track'],
            ['Shipping & returns', '/store/help'],
            ['Care guide', '/store/care'],
            ['Hallmark guide', '/store/hallmark'],
          ]}
        />
      </div>

      {/* Compliance microbar — pb-* on the wrapper extends the bg
          strip past the text so the fixed WhatsApp orb (bottom-right) sits
          over a clear zone of the same colour at scroll-bottom on mobile. */}
      <div className="border-t border-[#EFE0D2] bg-[#FDF8F4] pb-16 sm:pb-20 lg:pb-0">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-5 text-xs text-ink-500 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <p>© {new Date().getFullYear()} {brand.name} · BIS Hallmark #IND-916 · GSTIN 27ABCDE1234F1Z5</p>
          <div className="flex items-center gap-4">
            <Link to="/store/privacy" className="hover:text-ink-700">Privacy</Link>
            <Link to="/store/terms" className="hover:text-ink-700">Terms</Link>
            <span className="text-ink-400">Powered by Zelora</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

// Tiny stable hash so newsletter signups produce a deterministic synthesized
// phone number passing the Lead's phone validation. The email itself is
// captured in the `interest` field — that's the real signup data.
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

function FooterCol({ title, links }: { title: string; links: Array<[string, string]> }): JSX.Element {
  return (
    <div>
      <p className="text-eyebrow uppercase text-brand-700">{title}</p>
      <ul className="mt-4 space-y-2.5 text-sm text-ink-700">
        {links.map(([label, to]) => (
          <li key={to}>
            <Link to={to} className="hover:text-ink-900">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
