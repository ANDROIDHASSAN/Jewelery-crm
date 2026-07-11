// Storefront content slice — local cache of the database-backed storefront content.
// Hydrated from /api/v1/website/storefront via storefrontApi (see StorefrontLayout).
// Granular update actions mutate the local draft; the Website CMS calls the
// PUT /api/v1/storefront mutation to persist to the database.

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface StoreLocation {
  id: string;
  name: string;
  address: string;
  phone: string;
  hours: string;
  image: string;
}

export interface CollectionTile {
  slug: string;
  name: string;
  tagline: string;
  img: string;
}

/** One slide of the homepage hero carousel (CMS-managed). */
export interface HeroSlide {
  /** Background image (Cloudinary URL). */
  image: string;
  /** Optional short overlay headline. Empty = image only. */
  headline: string;
  /** CTA button label — defaults to "Shop Now". */
  ctaLabel: string;
  /** Where the CTA links — a collection or product route. */
  ctaHref: string;
}

/**
 * Storefront filter facet shown on collection / search pages. Each group has a
 * stable `key` (so per-collection visibility lists can reference it) and a list
 * of human-readable options. The matching predicate lives in CollectionPage —
 * keys here must stay in sync with the FILTER_PREDICATES map there.
 */
export interface FilterGroup {
  key: string;
  label: string;
  options: string[];
}

export interface StorefrontFiltersConfig {
  /** Master list of filter groups available across the storefront. */
  groups: FilterGroup[];
  /**
   * Which group keys to show on a given collection slug. Missing slug = show
   * `defaultGroupKeys`. Empty array = hide all filters on that page.
   */
  perCollection: Record<string, string[]>;
  /** Used when no override exists for the current slug. */
  defaultGroupKeys: string[];
}

// New CMS-editable sub-types (match shared/schemas.ts)
export interface ShopByOccasionTile { name: string; slug: string; count: number; img: string; }
export interface BrowseCategoryTile { label: string; slug: string; img: string; }
export interface ReelTile { handle: string; caption: string; poster: string; slug: string; }
export interface DealCard { slug: string; name: string; category: string; priceLabel: string; badge: 'NEW' | 'SALE' | 'OUT'; img: string; }
export interface TestimonialCard { quote: string; author: string; city: string; occasion: string; }
export interface DoorCard { eyebrow: string; title: string; body: string; href: string; img: string; }
// Featured "lookbook" editorial cards (1 large + up to 2 stacked) shown above
// Shop-by-occasion. First card renders large with its body + CTA; the rest are
// compact image tiles. Each links to a collection (or any route).
export interface LookbookCard { eyebrow: string; title: string; body: string; ctaLabel: string; href: string; img: string; }
// One journal / blog post (CMS-managed). Shown as cards in the homepage Blogs
// section and on the /store/blog index; each opens a detail page at
// /store/blog/:slug. `date` is an ISO string (YYYY-MM-DD) rendered as a date
// badge + full date; `body` uses blank lines to separate paragraphs.
export interface BlogPost { slug: string; title: string; date: string; excerpt: string; image: string; body: string; author: string; }
export interface TrustBadge { icon: 'shield' | 'sparkles' | 'award'; title: string; body: string; }
export interface FooterLink { label: string; href: string; }

export interface SectionLabels {
  categoriesEyebrow?: string;
  categoriesTitle?: string;
  categoriesSub?: string;
  occasionEyebrow?: string;
  occasionTitle?: string;
  occasionSub?: string;
  reelsEyebrow?: string;
  reelsTitle?: string;
  reelsSub?: string;
  reviewsEyebrow?: string;
  reviewsTitle?: string;
  reviewsSub?: string;
  seasonSaleEyebrow?: string;
  seasonSaleTitle?: string;
  seasonSaleSub?: string;
  seasonSaleCtaLabel?: string;
  trustEyebrow?: string;
  visitEyebrow?: string;
  visitTitle?: string;
  visitSub?: string;
  visitCtaLabel?: string;
  visitCtaHref?: string;
  dealsEyebrow?: string;
  dealsTitle?: string;
  dealsSub?: string;
  dealsCtaLabel?: string;
  dealsCtaHref?: string;
  newsletterEyebrow?: string;
  newsletterTitle?: string;
  newsletterSub?: string;
}

export interface StorefrontContent {
  brand: {
    name: string;
    tagline: string;
    /** URL or data URL of the storefront logo. Empty string = show wordmark only. */
    logo: string;
    /** Browser tab favicon — URL or data URL. Empty = fall back to logo. */
    favicon: string;
    /** document.title override. Empty = use brand.name. */
    siteTitle: string;
    /** SEO meta description. */
    metaDescription: string;
    /** SEO meta keywords. Comma-separated. */
    metaKeywords: string;
    /** OG share image URL (1200×630). */
    ogImage: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    ctaLabel: string;
    ctaHref: string;
    secondaryCtaLabel: string;
    secondaryCtaHref: string;
    image: string;
    /** Optional MP4/WebM URL that plays on the right hero panel. Empty string = static image only. */
    videoSrc: string;
  };
  /** CMS-managed hero carousel slides. Empty = fall back to the single `hero` block. */
  heroSlides: HeroSlide[];
  rates: {
    // Free-text display strings for the "Today's rate" ticker. Each one, when
    // filled, overrides the live GoldAPI feed for that purity; blank falls back
    // to the live feed. (Product prices always use the numeric live feed.)
    g24: string;
    g22: string;
    g18: string;
    silver: string;
    updatedAt: string;
  };
  collections: CollectionTile[];
  story: {
    eyebrow: string;
    title: string;
    body: string;
    image: string;
  };
  testimonial: {
    quote: string;
    author: string;
  };
  locations: StoreLocation[];
  whatsappNumber: string;
  filters: StorefrontFiltersConfig;

  // --- New CMS-editable sections ---
  /** Quiet "Shop by" pill row under the hero. Each pill: label + link (href).
   *  Empty = fall back to the built-in metal/price pills. */
  shopBy: FooterLink[];
  shopByOccasion: ShopByOccasionTile[];
  browseCategories: BrowseCategoryTile[];
  reels: ReelTile[];
  deals: DealCard[];
  testimonialsRow1: TestimonialCard[];
  testimonialsRow2: TestimonialCard[];
  doorCards: DoorCard[];
  /** Featured "lookbook" editorial cards (1 big + 2). Empty = hide the section. */
  lookbookCards: LookbookCard[];
  /** Curated product slugs for the homepage 18K Gold Tone showcase. Empty = auto-fill from the category. */
  goldToneFeatured: string[];
  /** Curated product slugs for the homepage 9 KT Fine Gold showcase. Empty = auto-fill from the category. */
  nineKtFeatured: string[];
  /** Curated product slugs for the homepage Fine Silver showcase. Empty = auto-fill from the category. */
  silverFeatured: string[];
  /** Journal / blog posts. Empty = hide the homepage Blogs section. */
  blogs: BlogPost[];
  trustBadges: TrustBadge[];
  pressLogos: string[];
  footerShop: FooterLink[];
  footerVisit: FooterLink[];
  footerHelp: FooterLink[];
  footerEmail: string;
  /** Footer brand-block address + phone. Empty = fall back to the first store. */
  footerAddress: string;
  footerPhone: string;
  copyrightLine: string;
  sectionLabels: SectionLabels;
  navMenu: NavItem[];

  // Social media URLs surfaced in the storefront footer. Each string can
  // be empty — the footer hides the icon when blank.
  socials: {
    instagram: string;
    facebook: string;
    youtube: string;
    whatsapp: string;
  };

  // CMS-controlled invoice / receipt overrides. Both POS receipts and
  // e-commerce order invoices read this blob server-side. Each string
  // can be empty — the renderer falls back to baked defaults.
  invoiceLayout: {
    // Brand band
    brandSubTagline: string;
    brandEstablishedLine: string;
    // Hero block
    heroHeadline: string;
    heroBody: string;
    heroImage: string;
    // Tax-invoice block
    invoiceTitle: string;
    invoiceNumberPrefix: string;
    // Business details
    businessAddress: string;
    businessEmail: string;
    // Thank-you block
    thankYouTitle: string;
    thankYouBody: string;
    // Payment details
    bankName: string;
    bankAccountNumber: string;
    bankIfsc: string;
    upiId: string;
    // Terms (multi-line)
    termsAndConditions: string;
    // Footer ribbon + contact bar
    footerRibbon: string;
    contactWebsite: string;
    contactPhone: string;
    contactAddressLine: string;
    // Display toggles
    showLogo: boolean;
    showHeroImage: boolean;
    showAmountInWords: boolean;
    showUpiQr: boolean;
    showStamp: boolean;
    // Accent hex
    accentColor: string;
    // Legacy (unused by the new renderer but kept for backward compat)
    headerNote: string;
    footerNote: string;
    signatoryName: string;
  };
}

export interface NavItem {
  label: string;
  href: string;
  end?: boolean;
}

export const DEFAULT_CONTENT: StorefrontContent = {
  brand: {
    name: 'Zelora',
    tagline: 'Indian bridal jewellery, BIS-hallmarked 22K & 18K gold, certified diamond solitaires and 925 silver — family jewellers in Haryana since 1972. Priced against the live MCX gold rate, with transparent making charges on every bill.',
    logo: '/logo/zelora-mark.png',
    favicon: '/logo/zelora-mark.png',
    siteTitle: 'Zelora — Run your jewellery business from one screen',
    metaDescription: 'BIS-hallmarked 22K & 18K gold, certified solitaires, and 925 silver — priced against the live MCX rate.',
    metaKeywords: 'jewellery, gold, bridal, BIS hallmark, diamond, silver',
    ogImage: '',
  },
  hero: {
    eyebrow: 'The 2025 Bridal Edit · BIS Hallmarked',
    title: 'Heirloom Indian bridal jewellery, made for the modern bride.',
    subtitle:
      'Hand-set 22K BIS-hallmarked gold, IGI/GIA-certified diamond solitaires, and lightweight daily-wear pieces. Priced against today\u2019s live MCX gold rate \u2014 weight \u00d7 rate + making + GST, nothing hidden.',
    ctaLabel: 'Explore the edit',
    ctaHref: '/store/collections/bridal',
    secondaryCtaLabel: 'Visit our store',
    secondaryCtaHref: '/store/locations',
    image:
      'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=2400&q=95',
    videoSrc: '',
  },
  // Default hero carousel — seeded so the storefront shows a rotating banner out
  // of the box. The admin replaces these with branded banners + collection links
  // from Website CMS → Hero.
  heroSlides: [
    {
      image:
        'https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=2400&q=90',
      headline: 'The 2025 Bridal Edit',
      ctaLabel: 'Shop Now',
      ctaHref: '/store/collections/bridal',
    },
    {
      image:
        'https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?auto=format&fit=crop&w=2400&q=90',
      headline: '22K BIS-Hallmarked Gold',
      ctaLabel: 'Shop Now',
      ctaHref: '/store/collections/22k',
    },
    {
      image:
        'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=2400&q=90',
      headline: '925 Sterling Silver',
      ctaLabel: 'Shop Now',
      ctaHref: '/store/collections/silver',
    },
  ],
  rates: {
    // Default to blank so a fresh storefront shows the live GoldAPI feed until
    // an editor types a manual rate in the CMS (which then overrides the feed).
    g24: '',
    g22: '',
    g18: '',
    silver: '',
    updatedAt: '',
  },
  collections: [
    { slug: 'bridal', name: 'Bridal', tagline: 'For the day that matters', img: 'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=1600&q=92' },
    { slug: 'daily-wear', name: 'Daily wear', tagline: 'For every day after', img: 'https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?auto=format&fit=crop&w=1600&q=92' },
    { slug: 'festive', name: 'Festive', tagline: 'For the season', img: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=1600&q=92' },
    { slug: 'diamond', name: 'Diamond', tagline: 'For forever', img: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=1600&q=92' },
  ],
  story: {
    eyebrow: 'Since 1972',
    title: 'Three generations, one workshop.',
    body:
      'Every piece you see is hand-set in our Gurugram workshop. We weigh in front of you, price against the live MCX rate, and stamp every gram with a BIS hallmark.',
    image: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=1800&q=92',
  },
  testimonial: {
    quote:
      'They weighed each piece in front of me and printed the rate for that exact minute. I’ve never felt this calm buying gold.',
    author: 'Priya R., Gurugram · Bridal customer, 2024',
  },
  locations: [
    {
      id: 'main',
      name: 'Main Showroom — Gurugram',
      address: 'MG Road, Gurugram, Haryana 122001',
      phone: '+91 124 444 0011',
      hours: 'Mon–Sat · 10:30 AM – 8:30 PM',
      image: 'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=1600&q=85',
    },
    {
      id: 'karnal',
      name: 'Karnal Branch',
      address: 'Sector 14, Karnal, Haryana 132001',
      phone: '+91 184 263 0022',
      hours: 'Mon–Sat · 11:00 AM – 9:00 PM',
      image: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=1600&q=85',
    },
  ],
  whatsappNumber: '919876543210',
  filters: {
    groups: [
      {
        key: 'metal',
        label: 'Metal',
        options: ['22K Gold', '18K Gold', 'Silver', 'Platinum'],
      },
      {
        key: 'weight',
        label: 'Weight',
        options: ['Under 10 g', '10 – 20 g', '20 – 40 g', 'Over 40 g'],
      },
      {
        key: 'price',
        label: 'Price',
        options: ['Under ₹50,000', '₹50,000 – ₹1,00,000', 'Over ₹1,00,000'],
      },
      {
        key: 'purity',
        label: 'Purity',
        options: ['22K', '18K', '14K'],
      },
      {
        key: 'occasion',
        label: 'Occasion',
        options: ['Bridal', 'Daily wear', 'Festive', 'Gifting'],
      },
    ],
    // Per-collection visibility — only the most opinionated overrides are
    // baked in. Admin can edit/extend from the Website CMS → Filters tab.
    perCollection: {
      // Silver collection: hide gold-only options.
      silver: ['weight', 'price', 'occasion'],
      // Diamond collection: weight is less meaningful, price + occasion matter.
      diamond: ['price', 'occasion'],
      // Pre-filtered purity pages: hide metal filter (already constrained).
      '22k': ['weight', 'price', 'occasion'],
      '18k': ['weight', 'price', 'occasion'],
      // Price-bucketed page: hide the price filter, keep metal/weight.
      'under-50k': ['metal', 'weight', 'occasion'],
    },
    defaultGroupKeys: ['metal', 'weight', 'price'],
  },

  // --- New CMS-editable sections (defaults match the hand-tuned design) ---
  // "Shop by" pill row — the metal / price / gifting quick-filters under the
  // hero. Seeded with the original hardcoded set so existing storefronts look
  // identical until an editor customises them.
  shopBy: [
    { label: '22K Gold',       href: '/store/collections/22k' },
    { label: '18K Gold',       href: '/store/collections/18k' },
    { label: 'Diamond',        href: '/store/collections/diamond' },
    { label: 'Silver',         href: '/store/collections/silver' },
    { label: 'Under ₹50,000',  href: '/store/collections/under-50k' },
    { label: 'Gifting',        href: '/store/collections/gifting' },
  ],
  shopByOccasion: [
    { name: 'Bracelets',  slug: '22k',        count: 16, img: '/categories/jewl1.jpg' },
    { name: 'Earrings',   slug: 'daily-wear', count: 16, img: '/categories/jewl2.jpg' },
    { name: 'Gold Set',   slug: 'bridal',     count: 4,  img: '/categories/jew3.jpg'  },
    { name: 'Necklaces',  slug: 'festive',    count: 12, img: '/categories/jewl4.jpg' },
    { name: 'Rings',      slug: 'diamond',    count: 13, img: '/categories/jewl6.jpg' },
    { name: 'Silver Set', slug: 'silver',     count: 3,  img: '/categories/jewl7.jpg' },
  ],
  browseCategories: [
    { label: 'Diamond rings',    slug: 'diamond',    img: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=92' },
    { label: 'Bridal necklaces', slug: 'bridal',     img: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=800&q=92' },
    { label: 'Gold earrings',    slug: 'daily-wear', img: 'https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?auto=format&fit=crop&w=800&q=92' },
    { label: '22K bangles',      slug: '22k',        img: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=800&q=92' },
    { label: 'Pendants',         slug: '18k',        img: 'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=800&q=92' },
    { label: 'Mangalsutra',      slug: 'festive',    img: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=800&q=92' },
    { label: 'Solitaires',       slug: 'diamond',    img: '/categories/jewl6.jpg' },
    { label: '18K rings',        slug: '18k',        img: '/categories/jewl1.jpg' },
    { label: 'Chains',           slug: 'daily-wear', img: '/categories/jewl4.jpg' },
    { label: 'Festive sets',     slug: 'festive',    img: '/categories/jew3.jpg'  },
    { label: 'Silver pieces',    slug: 'silver',     img: '/categories/jewl7.jpg' },
    { label: 'Gifting',          slug: 'gifting',    img: '/categories/jewl2.jpg' },
  ],
  reels: [
    { handle: '@priya.bridal',    caption: 'Day-of-wedding bridal set · 22K',  poster: 'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=900&q=92', slug: 'bridal' },
    { handle: '@diya.daily',      caption: 'Light-weight 22K chain · 8.2 g',    poster: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=900&q=92', slug: 'daily-wear' },
    { handle: '@aisha.studio',    caption: 'Festive jhumka stack',              poster: 'https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?auto=format&fit=crop&w=900&q=92', slug: 'festive' },
    { handle: '@meera.solitaire', caption: 'IGI-certified solitaire · 0.48 ct', poster: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=900&q=92', slug: 'diamond' },
    { handle: '@aanya.bangles',   caption: 'Stack of 6 · 22K · 38 g',           poster: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=900&q=92', slug: '22k' },
  ],
  deals: [
    { slug: 'aurelia-pendant',   name: 'Aurelia Diamond Pendant', category: 'NECKLACES', priceLabel: '₹29,000', badge: 'NEW',  img: '/img/j1.jpg' },
    { slug: 'mira-bangle-set',   name: 'Mira 22K Bangle Stack',   category: 'BANGLES',   priceLabel: '₹84,500', badge: 'NEW',  img: '/img/j2.jpg' },
    { slug: 'tara-mangalsutra',  name: 'Tara Mangalsutra',        category: 'NECKLACES', priceLabel: '₹62,200', badge: 'NEW',  img: '/img/j3.jpg' },
    { slug: 'aarya-pearl-drop',  name: 'Aarya Pearl Drops',       category: 'EARRINGS',  priceLabel: '₹19,400', badge: 'OUT',  img: '/img/j4.jpg' },
    { slug: 'forever-solitaire', name: 'Forever Solitaire Ring',  category: 'RINGS',     priceLabel: '₹48,900', badge: 'NEW',  img: '/img/j5.jpg' },
    { slug: 'meera-jhumka',      name: 'Meera Festive Jhumkas',   category: 'EARRINGS',  priceLabel: '₹31,400', badge: 'SALE', img: '/img/j6.jpg' },
    { slug: 'kavya-chain',       name: 'Kavya Light Chain',       category: 'NECKLACES', priceLabel: '₹18,900', badge: 'NEW',  img: '/img/j7.jpg' },
    { slug: 'parker-signet',     name: 'Parker Signet Ring',      category: 'RINGS',     priceLabel: '₹11,900', badge: 'NEW',  img: '/img/j8.jpg' },
  ],
  testimonialsRow1: [
    { quote: 'They weighed each piece in front of me and printed the rate for that exact minute. I have never felt this calm buying gold.', author: 'Priya Sharma',    city: 'Gurugram',   occasion: 'Bridal set · 2024' },
    { quote: 'My daughter\u2019s mangalsutra arrived hand-finished, BIS hallmarked, with the GST broken out line-by-line. Three generations of trust.', author: 'Sunita Malhotra', city: 'Karnal',     occasion: 'Wedding gift · 2024' },
    { quote: 'WhatsApp updates with photos of my piece on the bench made it feel personal. Worth every gram.',                              author: 'Aanya Kapoor',    city: 'Faridabad',  occasion: 'Anniversary · 2025' },
    { quote: 'Light-weight 22K chain I wear every day to work. Looks premium, priced fairly against the live MCX rate.',                    author: 'Kavya Iyer',      city: 'Delhi',      occasion: 'Daily wear · 2025' },
    { quote: 'The bridal set was hand-set in three weeks and weighed in front of me at delivery. Pure 22K, exactly as promised.',           author: 'Anjali Verma',    city: 'Panchkula',  occasion: 'Daughter\u2019s wedding · 2024' },
  ],
  testimonialsRow2: [
    { quote: 'My Diwali earrings arrived a day early with a BIS hallmark certificate. Best festive jewellery shopping I have done.',        author: 'Meera Reddy',     city: 'Gurugram',   occasion: 'Festive set · 2024' },
    { quote: 'Mangalsutra design was customised over WhatsApp in two days. The karigar\u2019s craftsmanship is unmatched in Haryana.',      author: 'Riya Singh',      city: 'Karnal',     occasion: 'Mangalsutra · 2024' },
    { quote: '0.48 ct IGI-certified solitaire, delivered with the original lab certificate and box. No middleman, no markup.',              author: 'Divya Patel',     city: 'Faridabad',  occasion: 'Solitaire ring · 2025' },
    { quote: 'Engagement ring with a transparent breakdown \u2014 weight, rate, making, GST. No haggling, no surprises at billing.',        author: 'Neha Joshi',      city: 'Gurugram',   occasion: 'Engagement · 2024' },
    { quote: 'Bought a complete bridal jewellery set for my wedding. Everything weighed publicly, hallmarked, and delivered on time.',      author: 'Pooja Choudhary', city: 'Hisar',      occasion: 'Bridal · 2025' },
  ],
  doorCards: [
    { eyebrow: 'Luxury necklace', title: 'Best Friend Jewelry',     body: 'A wide range of exquisite 22K & 18K necklaces — hand-set in Haryana, BIS-hallmarked.',     href: '/store/collections/bridal',  img: '/img/j9.jpg'  },
    { eyebrow: 'Our earrings',    title: 'Diamond Stud Earrings',   body: 'IGI-certified solitaires and timeless studs, priced against today\u2019s live MCX rate.', href: '/store/collections/diamond', img: '/img/j10.jpg' },
  ],
  lookbookCards: [
    { eyebrow: 'Lookbook · Autumn', title: 'The Bridal lookbook', body: 'Twelve heirloom pieces, photographed in our Gurugram workshop.', ctaLabel: 'Read the story', href: '/store/collections/bridal', img: 'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=2000&q=95' },
    { eyebrow: 'Under ₹50,000', title: 'Gifts that hold value', body: '', ctaLabel: '', href: '/store/collections/gifting', img: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1600&q=92' },
    { eyebrow: 'New · Diamond', title: 'Solitaires, certified', body: '', ctaLabel: '', href: '/store/collections/diamond', img: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=1600&q=92' },
  ],
  // Curated showcase product slugs default to empty — each homepage showcase
  // auto-fills from its category until an admin picks specific pieces in the CMS.
  goldToneFeatured: [],
  nineKtFeatured: [],
  silverFeatured: [],
  blogs: [
    {
      slug: 'gold-vs-silver-how-to-choose',
      title: 'Gold vs Silver Jewellery: How to Choose What Suits You Best',
      date: '2026-03-03',
      author: 'The Zelora Studio',
      image: 'https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?auto=format&fit=crop&w=1600&q=92',
      excerpt: 'The great debate is always on — gold or silver? Here is a simple way to decide based on skin tone, occasion and budget.',
      body:
        'The great debate is always on — gold or silver. Both are beautiful, both are timeless, and the truth is most jewellery wardrobes have room for both. But when you are buying a piece you will wear often, a few simple guidelines make the choice easy.\n\nStart with skin tone. Warm undertones — think golden or olive skin that tans easily — glow next to yellow and rose gold. Cooler undertones, where the skin burns before it tans, are flattered by the bright white of silver and 925 sterling. If your wrist veins look green you are likely warm; blue means cool.\n\nNext, think about occasion. For bridal and festive wear, 22K gold carries weight, both literally and culturally — it photographs richly and holds its value. For daily wear and gifting, lightweight 18K or 925 silver is practical, comfortable, and easy to restyle.\n\nFinally, budget. Gold tracks the live MCX rate, so price moves with weight and purity. Silver lets you experiment with bigger, more design-forward pieces for less. At Zelora every piece — gold or silver — is hallmarked and weighed in front of you, so whichever you choose, you know exactly what you are paying for.',
    },
    {
      slug: 'how-to-read-a-bis-hallmark',
      title: 'How to Read a BIS Hallmark Before You Buy Gold',
      date: '2026-02-18',
      author: 'The Zelora Studio',
      image: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=1600&q=92',
      excerpt: 'Every gold piece over 2 grams sold in India must carry a BIS hallmark. Here is what each tiny stamp on the band actually means.',
      body:
        'Every piece of gold over 2 grams sold in India must legally carry a BIS hallmark. It is your guarantee of purity — but most buyers have never looked closely at what those tiny stamps mean. Here is a quick guide so you can read any piece with confidence.\n\nThe BIS logo is a small triangular mark. It confirms the piece was tested at a BIS-recognised assaying and hallmarking centre — not self-certified by the seller.\n\nThe purity grade tells you the karat. 916 means 22K (91.6% pure gold), 750 means 18K, and 585 means 14K. The bigger the number, the purer the gold.\n\nThe HUID is a six-character alphanumeric code unique to your exact piece. You can verify it on the BIS Care app or the official portal — a genuine code will pull up the registered details of the item.\n\nWhen you buy from us, we hand you the hallmark details on the bill and show you the stamps under a loupe. If a seller hesitates to do that, walk away.',
    },
    {
      slug: 'caring-for-your-22k-gold',
      title: 'Caring for Your 22K Gold: A Simple Monthly Routine',
      date: '2026-01-29',
      author: 'The Zelora Studio',
      image: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=1600&q=92',
      excerpt: 'Gold is durable, but it likes a gentle wipe. Two minutes a month keeps a 22K piece looking new for a decade.',
      body:
        'Gold does not rust or tarnish the way silver does, but daily wear leaves behind lotion, perfume and skin oils that dull its shine. The good news: two minutes a month is all it takes to keep a 22K piece looking new.\n\nFor everyday habits, put your jewellery on last — after perfume, lotion and makeup — and take it off first before swimming, sleeping or the gym. Chlorine and harsh sweat are the main culprits behind a tired-looking finish.\n\nFor a monthly clean, soak the piece in warm water with a single drop of mild dish soap for ten minutes, brush gently with a soft baby toothbrush, rinse, and pat dry with a microfibre cloth. Avoid toothpaste and tissue — both are abrasive and leave fine scratches.\n\nStore each piece in its own soft pouch so harder stones do not scratch softer gold, and keep everything away from direct sunlight and humidity. And remember — any piece bought from us gets free professional polishing, any time you walk in.',
    },
    {
      slug: 'lab-grown-vs-natural-diamonds',
      title: 'Lab-Grown vs Natural Diamonds: What Every Indian Buyer Should Know',
      date: '2026-01-12',
      author: 'The Zelora Studio',
      image: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=1600&q=92',
      excerpt: 'Lab-grown diamonds are real diamonds — chemically identical to mined ones. Here is how to decide which is right for you.',
      body:
        'Lab-grown diamonds have gone from curiosity to mainstream in just a few years, and a lot of buyers are confused about what they actually are. The short version: a lab-grown diamond is a real diamond — chemically, physically and optically identical to a mined one. The only difference is origin.\n\nOn price, lab-grown stones typically cost 40–70% less than a natural diamond of the same size and quality. That means a bigger, cleaner stone for the same budget — which is why they are popular for engagement rings and statement studs.\n\nOn value, natural diamonds are rarer and tend to hold resale value better, while lab-grown prices have been falling as production scales. If you are buying as a long-term store of value, natural still has the edge; if you are buying for beauty per rupee, lab-grown wins.\n\nWhatever you choose, insist on certification. Every diamond we sell above 0.20 ct comes with an IGI or GIA certificate stating exactly what it is — natural or lab-grown — with its 4Cs documented. No ambiguity, no markup on the mystery.',
    },
  ],
  trustBadges: [
    { icon: 'shield',   title: 'BIS 916 hallmarked gold',         body: 'Every gram of our 22K and 18K jewellery is BIS-hallmarked and audited monthly by an independent assay lab.' },
    { icon: 'sparkles', title: 'Live MCX rate · transparent GST', body: 'Weight \u00d7 today\u2019s MCX gold rate + making charges + 3% GST, itemised on every bill. No hidden margins.' },
    { icon: 'award',    title: 'Lifetime exchange on pure gold',  body: 'Trade in any piece against pure-gold value at the current rate \u2014 no time limit, no deduction beyond stones.' },
  ],
  pressLogos: ['Vogue India', 'Femina', 'The Hindu', 'Times of India'],
  footerShop: [
    { label: 'Bridal',     href: '/store/collections/bridal' },
    { label: 'Daily wear', href: '/store/collections/daily-wear' },
    { label: 'Festive',    href: '/store/collections/festive' },
    { label: 'Diamond',    href: '/store/collections/diamond' },
    { label: 'Silver',     href: '/store/collections/silver' },
  ],
  footerVisit: [
    { label: 'Stores',          href: '/store/locations' },
    { label: 'Our story',       href: '/store/story' },
    { label: 'Journal',         href: '/store/blog' },
    { label: 'Workshop tours',  href: '/store/workshop' },
    { label: 'Contact',         href: '/store/contact' },
  ],
  footerHelp: [
    { label: 'Track order',          href: '/store/track' },
    { label: 'Shipping & returns',   href: '/store/help' },
    { label: 'Care guide',           href: '/store/care' },
    { label: 'Hallmark guide',       href: '/store/hallmark' },
  ],
  footerEmail: 'hello@anantjewellers.in',
  footerAddress: '',
  footerPhone: '',
  copyrightLine: 'BIS Hallmark #IND-916 · GSTIN 27ABCDE1234F1Z5',
  sectionLabels: {
    categoriesEyebrow: 'Browse by category',
    categoriesTitle: 'Rings, necklaces, earrings & more',
    categoriesSub: 'From diamond solitaires to 22K bridal necklaces — shop every category in one hallmarked workshop.',
    occasionEyebrow: 'Shop by occasion',
    occasionTitle: 'Indian bridal & festive jewellery, by collection',
    occasionSub: 'Hand-crafted 22K and 18K pieces — bridal, daily-wear, festive, diamond and silver — from our family workshop in Haryana.',
    reelsEyebrow: 'Watch & wear',
    reelsTitle: 'Styling reels from our customers',
    reelsSub: 'Real brides, real jhumka stacks, real solitaires. Tap any reel to shop the look.',
    reviewsEyebrow: 'Loved by jewellery families across Haryana',
    reviewsTitle: '50,000+ verified customers since 1972',
    reviewsSub: 'Transparent pricing, BIS-hallmarked gold, and a WhatsApp update on every piece — that\u2019s why families trust us for bridal, festive, and gifting.',
    seasonSaleEyebrow: 'Limited time',
    seasonSaleTitle: 'Season Sales',
    seasonSaleSub: 'Handpicked pieces at a special price — while stocks last.',
    seasonSaleCtaLabel: 'View all',
    trustEyebrow: '',
    visitEyebrow: 'Visit our jewellery showrooms',
    visitTitle: 'Two BIS-certified showrooms in Gurugram & Karnal. Walk in, weigh, decide.',
    visitSub: 'In-person rate matching, free try-on, lifetime exchange — and a chai on the house while you decide.',
    visitCtaLabel: 'Find a store',
    visitCtaHref: '/store/locations',
    dealsEyebrow: 'Deals of the week',
    dealsTitle: '9 KT Fine Gold',
    dealsSub: 'Our 9 KT fine-gold edit, hallmarked and priced at the live gold rate.',
    dealsCtaLabel: 'Shop 9 KT gold',
    dealsCtaHref: '/store/collections/9-k-fine-gold',
    newsletterEyebrow: 'Stay in the loop',
    newsletterTitle: 'New collections, in your inbox.',
    newsletterSub: 'Quiet, once a month. Unsubscribe anytime.',
  },
  // Empty by default — StorefrontHeader falls back to its hardcoded NAV
  // until an editor adds the first entry from Website CMS → Navigation.
  navMenu: [],
  socials: {
    instagram: '',
    facebook: '',
    youtube: '',
    whatsapp: '',
  },
  invoiceLayout: {
    brandSubTagline: 'FINE JEWELLERY',
    brandEstablishedLine: 'HARYANA · SINCE 1972',
    heroHeadline: 'Heirlooms, made for the modern bride.',
    heroBody: 'Handcrafted with love in Haryana, our jewellery is priced transparently against today’s MCX rate — weight × rate + making, nothing hidden.',
    heroImage: '',
    invoiceTitle: 'TAX INVOICE',
    invoiceNumberPrefix: '',
    businessAddress: '',
    businessEmail: '',
    thankYouTitle: 'Thank you for choosing us.',
    thankYouBody: 'We appreciate your trust in our craftsmanship.',
    bankName: '',
    bankAccountNumber: '',
    bankIfsc: '',
    upiId: '',
    termsAndConditions: 'Goods once sold will not be taken back or exchanged.\nAny damages must be reported within 3 days of delivery.\nPrices are subject to change with MCX rate fluctuations.',
    footerRibbon: 'HEIRLOOMS TODAY, MEMORIES FOREVER.',
    contactWebsite: '',
    contactPhone: '',
    contactAddressLine: '',
    showLogo: true,
    showHeroImage: true,
    showAmountInWords: true,
    showUpiQr: true,
    showStamp: true,
    accentColor: '#C7895A',
    headerNote: '',
    footerNote: '',
    signatoryName: '',
  },
};

// Initialise state.filters on demand if a legacy payload hydrated without
// it. Returns the (now-defined) filters object so the caller can mutate it
// directly under Immer.
function ensureFilters(state: StorefrontContent): StorefrontFiltersConfig {
  if (!state.filters) state.filters = DEFAULT_CONTENT.filters;
  return state.filters!;
}

const slice = createSlice({
  name: 'storefrontContent',
  initialState: DEFAULT_CONTENT,
  reducers: {
    /** Replace the whole content blob — used when API hydration completes.
     *  Falls back to default `filters` when older content blobs are missing it,
     *  so the storefront doesn't crash on legacy tenants. */
    setContent(
      _state,
      action: PayloadAction<
        Omit<StorefrontContent, 'filters'> & { filters?: StorefrontFiltersConfig }
      >,
    ) {
      const incoming = action.payload;
      // Defensively fill in any new fields the API doesn't yet send so we
      // never render `undefined.map(...)` after the CMS schema expanded.
      return {
        ...DEFAULT_CONTENT,
        ...incoming,
        filters: incoming.filters ?? DEFAULT_CONTENT.filters,
        // Hero carousel — legacy rows pre-date this; seed the defaults so the
        // banner never renders empty (same fallback the other sections use).
        heroSlides: incoming.heroSlides?.length ? incoming.heroSlides : DEFAULT_CONTENT.heroSlides,
        shopBy: incoming.shopBy?.length ? incoming.shopBy : DEFAULT_CONTENT.shopBy,
        shopByOccasion: incoming.shopByOccasion?.length ? incoming.shopByOccasion : DEFAULT_CONTENT.shopByOccasion,
        browseCategories: incoming.browseCategories?.length ? incoming.browseCategories : DEFAULT_CONTENT.browseCategories,
        reels: incoming.reels?.length ? incoming.reels : DEFAULT_CONTENT.reels,
        deals: incoming.deals?.length ? incoming.deals : DEFAULT_CONTENT.deals,
        testimonialsRow1: incoming.testimonialsRow1?.length ? incoming.testimonialsRow1 : DEFAULT_CONTENT.testimonialsRow1,
        testimonialsRow2: incoming.testimonialsRow2?.length ? incoming.testimonialsRow2 : DEFAULT_CONTENT.testimonialsRow2,
        doorCards: incoming.doorCards?.length ? incoming.doorCards : DEFAULT_CONTENT.doorCards,
        lookbookCards: incoming.lookbookCards?.length ? incoming.lookbookCards : DEFAULT_CONTENT.lookbookCards,
        blogs: incoming.blogs?.length ? incoming.blogs : DEFAULT_CONTENT.blogs,
        trustBadges: incoming.trustBadges?.length ? incoming.trustBadges : DEFAULT_CONTENT.trustBadges,
        pressLogos: incoming.pressLogos?.length ? incoming.pressLogos : DEFAULT_CONTENT.pressLogos,
        footerShop: incoming.footerShop?.length ? incoming.footerShop : DEFAULT_CONTENT.footerShop,
        footerVisit: incoming.footerVisit?.length ? incoming.footerVisit : DEFAULT_CONTENT.footerVisit,
        footerHelp: incoming.footerHelp?.length ? incoming.footerHelp : DEFAULT_CONTENT.footerHelp,
        footerEmail: incoming.footerEmail || DEFAULT_CONTENT.footerEmail,
        copyrightLine: incoming.copyrightLine || DEFAULT_CONTENT.copyrightLine,
        sectionLabels: { ...DEFAULT_CONTENT.sectionLabels, ...(incoming.sectionLabels ?? {}) },
        navMenu: incoming.navMenu ?? DEFAULT_CONTENT.navMenu,
        // Legacy content rows pre-date these fields; defensively merge so
        // useStorefrontContent never returns `undefined` for an editor read.
        brand: { ...DEFAULT_CONTENT.brand, ...(incoming.brand ?? {}) },
        socials: { ...DEFAULT_CONTENT.socials, ...(incoming.socials ?? {}) },
        invoiceLayout: { ...DEFAULT_CONTENT.invoiceLayout, ...(incoming.invoiceLayout ?? {}) },
      };
    },
    updateBrand(state, action: PayloadAction<Partial<StorefrontContent['brand']>>) {
      state.brand = { ...state.brand, ...action.payload };
    },
    updateHero(state, action: PayloadAction<Partial<StorefrontContent['hero']>>) {
      state.hero = { ...state.hero, ...action.payload };
    },
    updateRates(state, action: PayloadAction<Partial<StorefrontContent['rates']>>) {
      state.rates = { ...state.rates, ...action.payload };
    },
    updateStory(state, action: PayloadAction<Partial<StorefrontContent['story']>>) {
      state.story = { ...state.story, ...action.payload };
    },
    updateTestimonial(state, action: PayloadAction<Partial<StorefrontContent['testimonial']>>) {
      state.testimonial = { ...state.testimonial, ...action.payload };
    },
    updateWhatsapp(state, action: PayloadAction<string>) {
      state.whatsappNumber = action.payload;
    },
    updateCollection(
      state,
      action: PayloadAction<{ index: number; patch: Partial<CollectionTile> }>,
    ) {
      const { index, patch } = action.payload;
      const existing = state.collections[index];
      if (existing) Object.assign(existing, patch);
    },
    addCollection(state, action: PayloadAction<CollectionTile>) {
      state.collections.push(action.payload);
    },
    removeCollection(state, action: PayloadAction<number>) {
      state.collections.splice(action.payload, 1);
    },
    updateLocation(
      state,
      action: PayloadAction<{ index: number; patch: Partial<StoreLocation> }>,
    ) {
      const { index, patch } = action.payload;
      const existing = state.locations[index];
      if (existing) Object.assign(existing, patch);
    },
    addLocation(state, action: PayloadAction<StoreLocation>) {
      state.locations.push(action.payload);
    },
    removeLocation(state, action: PayloadAction<number>) {
      state.locations.splice(action.payload, 1);
    },
    resetContent() {
      return DEFAULT_CONTENT;
    },
    // --- Nav menu (Website CMS → Navigation tab) ---
    // navMenu defaults to [] which signals StorefrontHeader to fall back to
    // the hardcoded baseline. Once an editor adds the first entry the CMS
    // takes over.
    setNavMenu(state, action: PayloadAction<NavItem[]>) {
      state.navMenu = action.payload;
    },
    addNavItem(state, action: PayloadAction<NavItem>) {
      const existing = state.navMenu ?? [];
      if (existing.length >= 12) return;
      state.navMenu = [...existing, action.payload];
    },
    updateNavItem(
      state,
      action: PayloadAction<{ index: number; patch: Partial<NavItem> }>,
    ) {
      const { index, patch } = action.payload;
      const existing = state.navMenu ?? [];
      const target = existing[index];
      if (!target) return;
      state.navMenu = existing.map((item: NavItem, i: number) =>
        i === index ? { ...item, ...patch } : item,
      );
    },
    removeNavItem(state, action: PayloadAction<number>) {
      const existing = state.navMenu ?? [];
      state.navMenu = existing.filter((_: NavItem, i: number) => i !== action.payload);
    },
    // --- Filters ---
    // `state.filters` is typed optional because the API payload can omit it
    // for older tenants, but at runtime setContent() always backfills with
    // DEFAULT_CONTENT.filters. ensureFilters() makes that invariant explicit
    // for TypeScript instead of sprinkling non-null assertions everywhere.
    addFilterGroup(state, action: PayloadAction<FilterGroup>) {
      const filters = ensureFilters(state);
      if (filters.groups.some((g) => g.key === action.payload.key)) return;
      filters.groups.push(action.payload);
    },
    updateFilterGroup(
      state,
      action: PayloadAction<{ key: string; patch: Partial<FilterGroup> }>,
    ) {
      const filters = ensureFilters(state);
      const g = filters.groups.find((x) => x.key === action.payload.key);
      if (!g) return;
      // Explicit field assignment instead of Object.assign — handles the
      // options array as a fresh reference so Immer reliably picks up the
      // mutation. The previous Object.assign path silently no-op'd in
      // production builds where Immer's draft-mutation detection sometimes
      // missed shallow re-assignments of nested arrays.
      if (action.payload.patch.label !== undefined) g.label = action.payload.patch.label;
      if (action.payload.patch.options !== undefined) g.options = [...action.payload.patch.options];
    },
    // Dedicated option-removal action. Used by the filter-chip "X" button so
    // the reducer can splice the option array in place — the most Immer-
    // friendly mutation possible. Robust against the patch-merge bug above.
    removeFilterOption(
      state,
      action: PayloadAction<{ key: string; option: string }>,
    ) {
      const filters = ensureFilters(state);
      const g = filters.groups.find((x) => x.key === action.payload.key);
      if (!g) return;
      const idx = g.options.indexOf(action.payload.option);
      if (idx >= 0) g.options.splice(idx, 1);
    },
    addFilterOption(
      state,
      action: PayloadAction<{ key: string; option: string }>,
    ) {
      const filters = ensureFilters(state);
      const g = filters.groups.find((x) => x.key === action.payload.key);
      if (!g) return;
      const value = action.payload.option.trim();
      if (!value || g.options.includes(value)) return;
      g.options.push(value);
    },
    removeFilterGroup(state, action: PayloadAction<string>) {
      const filters = ensureFilters(state);
      filters.groups = filters.groups.filter((g) => g.key !== action.payload);
      // Strip the removed key from every per-collection list and from defaults.
      for (const slug of Object.keys(filters.perCollection)) {
        filters.perCollection[slug] = filters.perCollection[slug]!.filter(
          (k) => k !== action.payload,
        );
      }
      filters.defaultGroupKeys = filters.defaultGroupKeys.filter(
        (k) => k !== action.payload,
      );
    },
    setFiltersForCollection(
      state,
      action: PayloadAction<{ slug: string; groupKeys: string[] }>,
    ) {
      const filters = ensureFilters(state);
      filters.perCollection[action.payload.slug] = action.payload.groupKeys;
    },
    clearFiltersOverride(state, action: PayloadAction<string>) {
      const filters = ensureFilters(state);
      delete filters.perCollection[action.payload];
    },
    setDefaultFilterKeys(state, action: PayloadAction<string[]>) {
      const filters = ensureFilters(state);
      filters.defaultGroupKeys = action.payload;
    },
    updateSocials(state, action: PayloadAction<Partial<NonNullable<StorefrontContent['socials']>>>) {
      state.socials = { ...(state.socials ?? DEFAULT_CONTENT.socials), ...action.payload };
    },
    updateInvoiceLayout(
      state,
      action: PayloadAction<Partial<NonNullable<StorefrontContent['invoiceLayout']>>>,
    ) {
      state.invoiceLayout = {
        ...(state.invoiceLayout ?? DEFAULT_CONTENT.invoiceLayout),
        ...action.payload,
      };
    },
  },
});

export const {
  setContent,
  updateBrand,
  updateHero,
  updateRates,
  updateStory,
  updateTestimonial,
  updateWhatsapp,
  updateCollection,
  addCollection,
  removeCollection,
  updateLocation,
  addLocation,
  removeLocation,
  resetContent,
  setNavMenu,
  addNavItem,
  updateNavItem,
  removeNavItem,
  addFilterGroup,
  updateFilterGroup,
  removeFilterGroup,
  removeFilterOption,
  addFilterOption,
  setFiltersForCollection,
  clearFiltersOverride,
  setDefaultFilterKeys,
  updateSocials,
  updateInvoiceLayout,
} = slice.actions;

export const storefrontContentReducer = slice.reducer;
