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

export interface StorefrontContent {
  brand: {
    name: string;
    tagline: string;
    /** URL or data URL of the storefront logo. Empty string = show wordmark only. */
    logo: string;
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
  };
  rates: {
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
}

export const DEFAULT_CONTENT: StorefrontContent = {
  brand: {
    name: 'Anant Jewellers',
    tagline: 'Family jewellers since 1972. Hallmarked gold. Transparent pricing. Hand-crafted in Pune.',
    logo: '/logo/zelora-mark.png',
  },
  hero: {
    eyebrow: 'The 2025 Bridal Edit',
    title: 'Heirlooms, made for the modern bride.',
    subtitle:
      "Hand-set by our karigars in Pune. 22K BIS-hallmarked. Priced transparently against today's MCX rate — weight × rate + making, nothing hidden.",
    ctaLabel: 'Explore the edit',
    ctaHref: '/store/collections/bridal',
    secondaryCtaLabel: 'Visit our store',
    secondaryCtaHref: '/store/locations',
    image:
      'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=1920&q=85',
  },
  rates: {
    g22: '₹6,420/g',
    g18: '₹5,255/g',
    silver: '₹84.50/g',
    updatedAt: '14 May, 11:02 AM IST',
  },
  collections: [
    { slug: 'bridal', name: 'Bridal', tagline: 'For the day that matters', img: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=900&q=80' },
    { slug: 'daily-wear', name: 'Daily wear', tagline: 'For every day after', img: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=900&q=80' },
    { slug: 'festive', name: 'Festive', tagline: 'For the season', img: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=900&q=80' },
    { slug: 'diamond', name: 'Diamond', tagline: 'For forever', img: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=900&q=80' },
  ],
  story: {
    eyebrow: 'Since 1972',
    title: 'Three generations, one workshop.',
    body:
      'Every piece you see is hand-set in our Laxmi Road workshop. We weigh in front of you, price against the live MCX rate, and stamp every gram with a BIS hallmark.',
    image: 'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=1200&q=85',
  },
  testimonial: {
    quote:
      'They weighed each piece in front of me and printed the rate for that exact minute. I’ve never felt this calm buying gold.',
    author: 'Priya R., Pune · Bridal customer, 2024',
  },
  locations: [
    {
      id: 'main',
      name: 'Main Showroom',
      address: 'Laxmi Road, Pune, Maharashtra 411002',
      phone: '+91 20 2444 0011',
      hours: 'Mon–Sat · 10:30 AM – 8:30 PM',
      image: 'https://images.unsplash.com/photo-1606293459339-aa5d34a7b0e1?auto=format&fit=crop&w=1200&q=80',
    },
    {
      id: 'camp',
      name: 'Camp Branch',
      address: 'East Street, Camp, Pune 411001',
      phone: '+91 20 2633 0022',
      hours: 'Mon–Sat · 11:00 AM – 9:00 PM',
      image: 'https://images.unsplash.com/photo-1606293459339-aa5d34a7b0e1?auto=format&fit=crop&w=1200&q=80',
    },
  ],
  whatsappNumber: '919876543210',
};

const slice = createSlice({
  name: 'storefrontContent',
  initialState: DEFAULT_CONTENT,
  reducers: {
    /** Replace the whole content blob — used when API hydration completes. */
    setContent(_state, action: PayloadAction<StorefrontContent>) {
      return action.payload;
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
} = slice.actions;

export const storefrontContentReducer = slice.reducer;
