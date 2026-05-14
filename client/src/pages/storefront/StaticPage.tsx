// Static info pages — Story, Workshop, Contact, Help, Care, Hallmark, Privacy, Terms.
// Each is editorial copy; the storefront previously linked to them but the routes
// 404'd. Centralised here so adding a page is a one-line registry change.

import { Link, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';

type Section = { heading: string; body: string };

interface PageSpec {
  eyebrow: string;
  title: string;
  intro: string;
  sections: Section[];
  ctaLabel?: string;
  ctaHref?: string;
}

const REGISTRY: Record<string, PageSpec> = {
  story: {
    eyebrow: 'Since 1972',
    title: 'Three generations, one workshop.',
    intro: 'Anant Jewellers was founded by Shri Ramesh Lal in a small Gurugram lane in 1972. Today it is run by his grandson, with the same karigars sitting at the same workbenches — only the tools have changed.',
    sections: [
      { heading: 'Hand-set, always', body: 'Every piece you see leaves our Gurugram workshop having been weighed, stamped, and finished by hand. No outsourced bulk lots, no factory imports.' },
      { heading: 'Transparent pricing', body: 'Gold weight × today\'s MCX rate, plus making charges and GST. Itemised on every bill. We weigh in front of you.' },
      { heading: 'Lifetime exchange', body: 'Bring any piece bought from us back at any time. We credit the pure-gold value against your next purchase — no time limit, no questions.' },
    ],
    ctaLabel: 'Visit our showroom',
    ctaHref: '/store/locations',
  },
  workshop: {
    eyebrow: 'Workshop tours',
    title: 'See your piece being made.',
    intro: 'Once a month we open the workshop to ten visitors. Watch a kundan setting take shape, weigh a 22K bar yourself, and meet the karigars who craft your jewellery.',
    sections: [
      { heading: 'When', body: 'First Saturday of every month, 11 AM – 1 PM. Reserve via WhatsApp.' },
      { heading: 'Where', body: 'Anant Workshop, behind the Main Showroom, MG Road, Gurugram.' },
      { heading: 'Free', body: 'There is no charge. Bring a friend. We serve chai.' },
    ],
    ctaLabel: 'Reserve a slot',
    ctaHref: '/store/contact',
  },
  contact: {
    eyebrow: 'Get in touch',
    title: 'We answer every WhatsApp.',
    intro: 'For reservations, custom-design enquiries, repairs, or questions about a piece — message us. Our showroom team responds within an hour, 10 AM – 8 PM IST.',
    sections: [
      { heading: 'WhatsApp', body: '+91 124 444 0011 — preferred for fast answers and photos.' },
      { heading: 'Email', body: 'hello@anantjewellers.in' },
      { heading: 'Walk in', body: 'Main Showroom — MG Road, Gurugram, Haryana 122001. Mon–Sat · 10:30 AM – 8:30 PM.' },
    ],
    ctaLabel: 'Find a store',
    ctaHref: '/store/locations',
  },
  help: {
    eyebrow: 'Shipping &amp; returns',
    title: 'Buy with confidence.',
    intro: 'Everything you need to know about how we ship, pack, and accept returns. Short answer: free delivery in Haryana, India-wide via insured courier, 7-day returns, lifetime exchange.',
    sections: [
      { heading: 'Shipping', body: 'Free delivery within Haryana. India-wide via insured Shiprocket within 4–6 working days. Tracking link sent on WhatsApp at dispatch.' },
      { heading: 'Returns', body: '7-day returns on stock pieces in original packaging. Custom or engraved pieces are non-returnable.' },
      { heading: 'Exchange', body: 'Lifetime exchange against pure-gold value. No time limit. Original bill required.' },
      { heading: 'Insurance', body: 'Every shipment is insured for full declared value. Damage in transit is replaced free.' },
    ],
  },
  care: {
    eyebrow: 'Care guide',
    title: 'How to keep your gold shining.',
    intro: 'Gold is durable but it likes a gentle wipe. Two minutes a month keeps a 22K piece looking new for a decade.',
    sections: [
      { heading: 'Daily wear', body: 'Apply perfume and lotion before putting on jewellery. Remove pieces before swimming, sleeping, or strenuous exercise.' },
      { heading: 'Cleaning', body: 'A soft microfibre cloth removes most fingerprints. For a deeper clean, dip in warm water with a drop of mild soap, then dry.' },
      { heading: 'Storage', body: 'Store each piece in a separate pouch so they don\'t scratch each other. Keep away from direct sunlight and humidity.' },
      { heading: 'When in doubt', body: 'Bring it in. Free polishing on any piece bought from us, any time.' },
    ],
  },
  hallmark: {
    eyebrow: 'BIS Hallmark guide',
    title: 'How to read a hallmark.',
    intro: 'Every piece of gold over 2 g sold in India must carry a BIS hallmark. Here\'s what each stamp on the band means.',
    sections: [
      { heading: 'BIS logo', body: 'A triangular mark with "BIS" inside — confirms the piece was tested at a BIS-recognised assaying centre.' },
      { heading: 'Purity grade', body: '916 = 22K (91.6% pure). 750 = 18K. 585 = 14K. Larger number = purer gold.' },
      { heading: 'Assay centre mark', body: 'A unique code identifying the lab that tested the piece. Look it up on bis.gov.in.' },
      { heading: 'HUID', body: 'A 6-character alphanumeric code unique to your piece. Stored on the BIS Hallmark Unique ID portal. Verify any piece you buy.' },
    ],
    ctaLabel: 'Verify a hallmark',
    ctaHref: 'https://bis.gov.in/',
  },
  privacy: {
    eyebrow: 'Privacy',
    title: 'Your data, kept yours.',
    intro: 'We collect the minimum we need to run a jewellery shop: your name, phone, and what you bought. Nothing else. We never sell or share your data.',
    sections: [
      { heading: 'What we collect', body: 'Your name and phone (for reservations, WhatsApp updates, and warranty). Your purchase history, weight × purity, and the gold rate on the day of billing — required by the BIS Hallmark Act.' },
      { heading: 'What we don\'t', body: 'We don\'t track you across websites. No ad pixels for retargeting. No third-party analytics that sell your data.' },
      { heading: 'How long we keep it', body: 'Bills for 8 years (Income Tax Act). Marketing contact data until you tell us to delete it.' },
      { heading: 'Your rights', body: 'You can ask us for a copy of your data, or to delete it (except billing records), at hello@anantjewellers.in.' },
    ],
  },
  terms: {
    eyebrow: 'Terms of service',
    title: 'The deal, in plain English.',
    intro: 'Short version: we promise hallmarked gold at today\'s rate, weighed in front of you, with a clear bill. You promise to read the bill before you pay.',
    sections: [
      { heading: 'Pricing', body: 'Prices on this site are estimates based on the day\'s MCX rate. The final bill is computed at the time of payment using that minute\'s rate, printed on the receipt.' },
      { heading: 'Reservations', body: 'Online reservations hold a piece for 48 hours. No payment is taken online; payment is collected in store.' },
      { heading: 'Returns &amp; warranty', body: 'See our shipping &amp; returns page. Lifetime exchange against pure-gold value.' },
      { heading: 'Disputes', body: 'Indian law applies. Disputes are settled at the courts of Gurugram, Haryana.' },
    ],
  },
};

export function StaticPage(): JSX.Element {
  const path = useLocation().pathname.replace(/^\/store\//, '').replace(/^\//, '');
  const spec = REGISTRY[path];
  const brand = useAppSelector((s) => s.storefrontContent.brand);

  if (!spec) {
    return (
      <div className="max-w-[760px] mx-auto px-6 py-20 text-center">
        <h1 className="font-display text-[32px] text-ink-900">Page not found</h1>
        <p className="mt-2 text-sm text-ink-600">
          We couldn&apos;t find a page at this URL.
        </p>
        <Link to="/store" className="mt-6 inline-flex h-12 px-7 rounded-full bg-brand-400 text-ink-900 text-sm font-medium hover:bg-brand-300 transition-colors">
          Back to {brand.name}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[760px] mx-auto px-6 py-14 md:py-20">
      <header className="mb-10">
        <p className="text-eyebrow uppercase text-ink-500">{spec.eyebrow}</p>
        <h1 className="font-display text-[36px] md:text-[48px] leading-[1.05] text-ink-900 mt-3">{spec.title}</h1>
        <p className="mt-5 text-base text-ink-600 leading-relaxed">{spec.intro}</p>
      </header>

      <div className="space-y-8">
        {spec.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="font-display text-[22px] text-ink-900">{s.heading}</h2>
            <p className="mt-2 text-sm text-ink-600 leading-relaxed">{s.body}</p>
          </section>
        ))}
      </div>

      {spec.ctaLabel && spec.ctaHref && (
        <div className="mt-12 pt-8 border-t border-ink-100">
          <Link
            to={spec.ctaHref}
            className="inline-flex items-center gap-2 h-12 px-7 rounded-full bg-ink-900 text-ink-0 text-sm font-medium hover:bg-ink-800 transition-colors"
          >
            {spec.ctaLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
