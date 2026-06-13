// shared/defaults.ts — default storefront content blob.
// Single source of truth, imported by both the client slice (initial state +
// merge fallback) and the server seed (first-tenant insert). Keep this in sync
// with `StorefrontContentSchema` in shared/schemas.ts; tests should `parse` it.

// Intentionally untyped — this blob is a superset of `StorefrontContent` (it
// carries extra editorial fields like bestSellers, trustItems, etc. that the
// schema doesn't currently enforce). Consumers that need a strict
// `StorefrontContent` should `StorefrontContentSchema.parse(...)` it.
export const DEFAULT_STOREFRONT_CONTENT = {
  brand: {
    name: 'Zelora',
    tagline: 'Family jewellers since 1972. Hallmarked gold. Transparent pricing. Hand-crafted in Haryana.',
    logo: '/logo/zelora-mark.png',
  },
  hero: {
    eyebrow: 'The 2025 Bridal Edit',
    title: 'Heirlooms, made for the modern bride.',
    subtitle:
      "Hand-set by our karigars in Haryana. 22K BIS-hallmarked. Priced transparently against today's MCX rate — weight × rate + making, nothing hidden.",
    ctaLabel: 'Explore the edit',
    ctaHref: '/store/collections/bridal',
    secondaryCtaLabel: 'Visit our store',
    secondaryCtaHref: '/store/locations',
    image:
      'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=1920&q=85',
  },
  // Blank by default so a fresh storefront shows the live GoldAPI feed; an
  // editor can type a manual rate in the CMS to override the feed per purity.
  rates: {
    g24: '',
    g22: '',
    g18: '',
    silver: '',
    updatedAt: '',
  },
  shopByChips: [
    { label: '22K Gold', href: '/store/collections/22k' },
    { label: '18K Gold', href: '/store/collections/18k' },
    { label: 'Diamond', href: '/store/collections/diamond' },
    { label: 'Silver', href: '/store/collections/silver' },
    { label: 'Under ₹50,000', href: '/store/collections/under-50k' },
    { label: 'Gifting', href: '/store/collections/gifting' },
  ],
  collectionsHeading: {
    eyebrow: 'Shop by occasion',
    title: 'Collections',
    ctaLabel: 'See all',
    ctaHref: '/store/collections',
  },
  collections: [
    { slug: 'bridal', name: 'Bridal', tagline: 'For the day that matters', img: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=900&q=80' },
    { slug: 'daily-wear', name: 'Daily wear', tagline: 'For every day after', img: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=900&q=80' },
    { slug: 'festive', name: 'Festive', tagline: 'For the season', img: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=900&q=80' },
    { slug: 'diamond', name: 'Diamond', tagline: 'For forever', img: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=900&q=80' },
  ],
  editorial: {
    primary: {
      eyebrow: 'Lookbook · Autumn',
      title: 'The Bridal lookbook',
      body: 'Twelve heirloom pieces, photographed in our Gurugram workshop. Long-form story, no carousel.',
      ctaLabel: 'Read the story',
      href: '/store/collections/bridal',
      image: 'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=1400&q=85',
    },
    secondary: [
      {
        eyebrow: 'Under ₹50,000',
        title: 'Gifts that hold value',
        body: '',
        ctaLabel: '',
        href: '/store/collections/gifting',
        image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1100&q=85',
      },
      {
        eyebrow: 'New · Diamond',
        title: 'Solitaires, certified',
        body: '',
        ctaLabel: '',
        href: '/store/collections/diamond',
        image: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=1100&q=85',
      },
    ],
  },
  bestSellersHeading: {
    eyebrow: 'Most loved this season',
    title: 'Best-sellers',
    ctaLabel: 'Browse all',
    ctaHref: '/store/collections',
  },
  bestSellers: [
    { slug: 'mira-bangle', name: 'Mira bangle', weight: '12.45 g · 22K', priceLabel: '₹84,500', badge: 'Bestseller', img: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=800&q=80', altImg: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=80' },
    { slug: 'tara-mangalsutra', name: 'Tara mangalsutra', weight: '8.10 g · 22K', priceLabel: '₹62,200', badge: 'Bestseller', img: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=800&q=80', altImg: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=800&q=80' },
    { slug: 'aarya-solitaire', name: 'Aarya solitaire', weight: '0.32 ct · 18K', priceLabel: '₹48,900', badge: 'Bestseller', img: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=800&q=80', altImg: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=800&q=80' },
    { slug: 'riya-jhumka', name: 'Riya jhumkas', weight: '5.20 g · 22K', priceLabel: '₹31,400', badge: 'Bestseller', img: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=80', altImg: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=800&q=80' },
  ],
  story: {
    eyebrow: 'Since 1972',
    title: 'Three generations, one workshop.',
    body:
      'Every piece you see is hand-set in our Gurugram workshop. We weigh in front of you, price against the live MCX rate, and stamp every gram with a BIS hallmark.',
    image: 'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=1200&q=85',
    ctaLabel: 'Read the story',
    ctaHref: '/store/story',
  },
  trustItems: [
    { icon: 'ShieldCheck', title: 'BIS Hallmarked', body: 'Every gram. Every piece. Audited monthly by an independent lab.' },
    { icon: 'Sparkles', title: 'Transparent pricing', body: 'Weight × today’s MCX rate + making + GST. Itemised on every bill.' },
    { icon: 'Award', title: 'Lifetime exchange', body: 'Trade in any piece against pure-gold value — no time limit.' },
  ],
  testimonial: {
    quote:
      'They weighed each piece in front of me and printed the rate for that exact minute. I’ve never felt this calm buying gold.',
    author: 'Priya R., Gurugram · Bridal customer, 2024',
  },
  pressLogos: [
    { name: 'Vogue India' },
    { name: 'Femina' },
    { name: 'The Hindu' },
    { name: 'Times of India' },
  ],
  visitCta: {
    eyebrow: 'Visit us',
    title: 'Two showrooms in Haryana. Walk in, weigh, decide.',
    ctaLabel: 'Find a store',
    ctaHref: '/store/locations',
  },
  newsletter: {
    eyebrow: 'Stay in the loop',
    title: 'New collections, in your inbox.',
    body: 'Quiet, once a month. Unsubscribe anytime.',
    ctaLabel: 'Subscribe',
  },
  locations: [
    {
      id: 'main',
      name: 'Main Showroom — Gurugram',
      address: 'MG Road, Gurugram, Haryana 122001',
      phone: '+91 124 444 0011',
      hours: 'Mon–Sat · 10:30 AM – 8:30 PM',
      image: 'https://images.unsplash.com/photo-1606293459339-aa5d34a7b0e1?auto=format&fit=crop&w=1200&q=80',
    },
    {
      id: 'karnal',
      name: 'Karnal Branch',
      address: 'Sector 14, Karnal, Haryana 132001',
      phone: '+91 184 263 0022',
      hours: 'Mon–Sat · 11:00 AM – 9:00 PM',
      image: 'https://images.unsplash.com/photo-1606293459339-aa5d34a7b0e1?auto=format&fit=crop&w=1200&q=80',
    },
  ],
  whatsappNumber: '919876543210',
};
