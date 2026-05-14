import { Link } from 'react-router-dom';
import { Instagram, Facebook, Youtube, MapPin, Phone, Mail, ArrowRight } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';

export function StorefrontFooter(): JSX.Element {
  const brand = useAppSelector((s) => s.storefrontContent.brand);
  const primaryLocation = useAppSelector((s) => s.storefrontContent.locations[0]);
  return (
    <footer className="bg-ink-50 border-t border-ink-100">
      {/* Newsletter — inline, never a popup */}
      <div className="border-b border-ink-100 bg-ink-25">
        <div className="max-w-[1280px] mx-auto px-6 py-12 md:py-14 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 md:gap-10 items-center">
          <div className="max-w-md">
            <p className="text-eyebrow uppercase text-ink-500">Stay in the loop</p>
            <h2 className="font-display text-[26px] md:text-[32px] leading-tight text-ink-900 mt-2">
              New collections, in your inbox.
            </h2>
            <p className="mt-2 text-sm text-ink-600">Quiet, once a month. Unsubscribe anytime.</p>
          </div>
          <form className="flex w-full max-w-md gap-2" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="newsletter" className="sr-only">Email</label>
            <input
              id="newsletter"
              type="email"
              required
              placeholder="you@email.com"
              className="flex-1 h-12 px-4 rounded-full bg-ink-0 border border-ink-200 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-400 outline-none transition-colors"
            />
            <button
              type="submit"
              className="h-12 px-5 rounded-full bg-ink-900 text-ink-0 text-sm font-medium hover:bg-ink-800 transition-colors inline-flex items-center gap-1.5"
            >
              Subscribe
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Main footer */}
      <div className="max-w-[1280px] mx-auto px-6 py-14 md:py-16 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10">
        <div className="col-span-2 max-w-sm">
          <Link to="/store" className="font-display text-[22px] text-ink-900">{brand.name}</Link>
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

      {/* Compliance microbar */}
      <div className="border-t border-ink-100 bg-ink-25">
        <div className="max-w-[1280px] mx-auto px-6 py-5 text-xs text-ink-500 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <p>© {new Date().getFullYear()} {brand.name} · BIS Hallmark #IND-916 · GSTIN 27ABCDE1234F1Z5</p>
          <div className="flex items-center gap-4">
            <Link to="/store/privacy" className="hover:text-ink-700">Privacy</Link>
            <Link to="/store/terms" className="hover:text-ink-700">Terms</Link>
            <span className="text-ink-400">Powered by Gold OS</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: Array<[string, string]> }): JSX.Element {
  return (
    <div>
      <p className="text-eyebrow uppercase text-ink-500">{title}</p>
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
