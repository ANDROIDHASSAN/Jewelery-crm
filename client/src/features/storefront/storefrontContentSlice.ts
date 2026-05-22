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
  filters: StorefrontFiltersConfig;
}

export const DEFAULT_CONTENT: StorefrontContent = {
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
      'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=2400&q=95',
  },
  rates: {
    g22: '₹6,420/g',
    g18: '₹5,255/g',
    silver: '₹84.50/g',
    updatedAt: '14 May, 11:02 AM IST',
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
      return {
        ...incoming,
        filters: incoming.filters ?? DEFAULT_CONTENT.filters,
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
      if (g) Object.assign(g, action.payload.patch);
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
  addFilterGroup,
  updateFilterGroup,
  removeFilterGroup,
  setFiltersForCollection,
  clearFiltersOverride,
  setDefaultFilterKeys,
} = slice.actions;

export const storefrontContentReducer = slice.reducer;
