// Website admin — edits the public storefront content (hero, rates, collections, story, locations).
// Local edits flow through the Redux slice for instant feedback; clicking
// "Publish" PUTs the full content blob to /api/v1/storefront and invalidates
// the public storefront cache so visitors see the change.

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Plus, Trash2, RotateCcw, CloudUpload, X, Image as ImageIcon, Video as VideoIcon, FileText } from 'lucide-react';
import { downloadPdf } from '@/lib/downloadPdf';
import { uploadImageToCloudinary, uploadVideoToCloudinary } from '@/lib/cloudinary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/PageHeader';
import { TabStrip, type TabStripItem } from '@/components/ui/TabStrip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  addFilterGroup,
  addFilterOption,
  addLocation,
  addNavItem,
  clearFiltersOverride,
  removeFilterGroup,
  removeFilterOption,
  removeLocation,
  removeNavItem,
  resetContent,
  setContent,
  setDefaultFilterKeys,
  setFiltersForCollection,
  setNavMenu,
  type StorefrontContent,
  updateBrand,
  updateFilterGroup,
  updateHero,
  updateLocation,
  updateNavItem,
  updateInvoiceLayout,
  updateRates,
  updateSocials,
  updateStory,
  updateTestimonial,
  updateWhatsapp,
} from '@/features/storefront/storefrontContentSlice';
import { useGetCategoriesQuery } from '@/features/inventory/inventoryApi';
import {
  useGetAdminStorefrontQuery,
  useUpdateStorefrontMutation,
  useGetPublicProductsQuery,
  useGetPublicCollectionsQuery,
  type PublicProduct,
} from '@/features/storefront/storefrontApi';
import {
  useGetLoyaltyConfigQuery,
  useUpdateLoyaltyConfigMutation,
} from '@/features/promotions/promotionsApi';
import { CouponsAdminTab } from '@/features/promotions/CouponsAdminTab';

type TabKey =
  | 'brand'
  | 'hero'
  | 'navigation'
  | 'rates'
  | 'collections'
  | 'story'
  | 'testimonial'
  | 'locations'
  | 'contact'
  | 'filters'
  | 'homepage'
  | 'labels'
  | 'footer'
  | 'invoice'
  | 'loyalty'
  | 'coupons';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'brand', label: 'Brand' },
  { key: 'hero', label: 'Hero' },
  { key: 'navigation', label: 'Navigation' },
  { key: 'rates', label: 'Gold rates' },
  { key: 'collections', label: 'Collections' },
  { key: 'filters', label: 'Filters' },
  { key: 'story', label: 'Story' },
  { key: 'testimonial', label: 'Testimonial' },
  { key: 'locations', label: 'Stores' },
  { key: 'contact', label: 'Contact' },
  { key: 'homepage', label: 'Homepage sections' },
  { key: 'labels', label: 'Section labels' },
  { key: 'footer', label: 'Footer' },
  { key: 'invoice', label: 'Invoice layout' },
  { key: 'loyalty', label: 'Loyalty' },
  { key: 'coupons', label: 'Coupons' },
];

export function WebsiteAdminPage(): JSX.Element {
  const dispatch = useAppDispatch();
  const content = useAppSelector((s) => s.storefrontContent);
  const [tab, setTab] = useState<TabKey>('brand');
  const [isDirty, setIsDirty] = useState(false);
  const { data: serverData, isLoading } = useGetAdminStorefrontQuery();
  const [publish, { isLoading: isPublishing }] = useUpdateStorefrontMutation();

  // Hydrate the local draft from the database on first load. We only do this
  // once (or when the server changes from null) so user edits aren't trampled.
  useEffect(() => {
    if (serverData?.content && !isDirty) {
      dispatch(setContent(serverData.content));
    }
  }, [serverData, isDirty, dispatch]);

  function notify(): void {
    setIsDirty(true);
  }

  async function handlePublish(): Promise<void> {
    // Flip the button + dirty flag immediately. The mutation patches the cache
    // optimistically (see updateStorefront in storefrontApi); if the PUT fails
    // the catch below restores the dirty state so the user can retry. This
    // turns "Publishing…" from a 5-15s blocking spinner into a sub-100ms ack.
    setIsDirty(false);
    const t0 = performance.now();
    try {
      await publish(content).unwrap();
      const ms = Math.round(performance.now() - t0);
      toast.success(`Published in ${ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`} · live on the storefront`);
    } catch (err) {
      setIsDirty(true); // re-arm so the user can retry
      const message =
        (err as { data?: { error?: { message?: string } } })?.data?.error?.message ??
        'Could not publish. Check the server logs.';
      toast.error(message);
    }
  }

  const websiteTabs: TabStripItem<TabKey>[] = TABS.map((t) => ({ id: t.key, label: t.label }));
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Module 05 · Business website"
        title="Pages & content"
        description={
          <>
            Edits stay local until you click <span className="font-medium text-ink-800">Publish</span>.
            {isLoading && ' Loading saved content…'}
          </>
        }
        actions={
          <>
            {isDirty && <Badge tone="warning">Unsaved changes</Badge>}
            <Button
              variant="ghost"
              onClick={() => {
                if (confirm('Discard local edits and reload the published version?')) {
                  if (serverData?.content) dispatch(setContent(serverData.content));
                  else dispatch(resetContent());
                  setIsDirty(false);
                  toast.message('Reverted to published');
                }
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Revert
            </Button>
            <Button variant="outline" asChild>
              <a href="/store" target="_blank" rel="noreferrer">
                View live site
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
            <Button
              onClick={handlePublish}
              disabled={isPublishing || !isDirty}
              aria-disabled={isPublishing || !isDirty}
            >
              <CloudUpload className="h-4 w-4" />
              {isPublishing ? 'Publishing…' : isDirty ? 'Publish' : 'Published'}
            </Button>
          </>
        }
        bare
      />

      <TabStrip<TabKey> items={websiteTabs} value={tab} onChange={setTab} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 lg:gap-8">
        <div className="space-y-4 sm:space-y-6 lg:max-w-2xl">
          {tab === 'brand' && (
            <div className="space-y-6">
            <Card title="Brand identity" desc="Logo, shop name and tagline used in the header and footer.">
              <Field
                label="Logo"
                hint="Square works best (≤ 256×256). Upload a file or paste a URL."
              >
                <div className="flex items-start gap-4">
                  <div
                    className="h-16 w-16 rounded-md bg-ink-50 border border-ink-100 flex items-center justify-center overflow-hidden shrink-0"
                    aria-hidden="true"
                  >
                    {content.brand.logo ? (
                      <img src={content.brand.logo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs text-ink-400">No logo</span>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="https://… or /logo/your-mark.png"
                      value={content.brand.logo}
                      onChange={(e) => dispatch(updateBrand({ logo: e.target.value }))}
                      onBlur={notify}
                    />
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor="logo-upload"
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-ink-200 bg-ink-0 text-xs text-ink-700 hover:bg-ink-50 cursor-pointer"
                      >
                        Upload image
                      </label>
                      <input
                        id="logo-upload"
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 512 * 1024) {
                            toast.error('Logo must be under 512 KB');
                            e.target.value = '';
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = () => {
                            dispatch(updateBrand({ logo: String(reader.result ?? '') }));
                            notify();
                          };
                          reader.onerror = () => toast.error('Could not read file');
                          reader.readAsDataURL(file);
                          e.target.value = '';
                        }}
                      />
                      {content.brand.logo && (
                        <button
                          type="button"
                          onClick={() => {
                            dispatch(updateBrand({ logo: '' }));
                            notify();
                          }}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs text-ink-600 hover:text-ink-900 hover:bg-ink-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Field>
              <Field label="Shop name">
                <Input
                  value={content.brand.name}
                  onChange={(e) => dispatch(updateBrand({ name: e.target.value }))}
                  onBlur={notify}
                />
              </Field>
              <Field label="Tagline" hint="Shown in the footer.">
                <Textarea
                  value={content.brand.tagline}
                  onChange={(e) => dispatch(updateBrand({ tagline: e.target.value }))}
                  onBlur={notify}
                />
              </Field>
            </Card>

            <Card title="Browser tab & SEO" desc="Favicon, browser tab title, and search-engine metadata. All optional — leave blank to fall back to brand defaults.">
              <Field
                label="Favicon"
                hint="Square, ≤ 64×64 PNG/SVG. Upload or paste a URL. Falls back to the logo if blank."
              >
                <div className="flex items-start gap-4">
                  <div
                    className="h-12 w-12 rounded-md bg-ink-50 border border-ink-100 flex items-center justify-center overflow-hidden shrink-0"
                    aria-hidden="true"
                  >
                    {(content.brand.favicon || content.brand.logo) ? (
                      <img src={content.brand.favicon || content.brand.logo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-ink-400">None</span>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="https://… or /favicon.png"
                      value={content.brand.favicon ?? ''}
                      onChange={(e) => dispatch(updateBrand({ favicon: e.target.value }))}
                      onBlur={notify}
                    />
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor="favicon-upload"
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-ink-200 bg-ink-0 text-xs text-ink-700 hover:bg-ink-50 cursor-pointer"
                      >
                        Upload image
                      </label>
                      <input
                        id="favicon-upload"
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 256 * 1024) {
                            toast.error('Favicon must be under 256 KB');
                            e.target.value = '';
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = () => {
                            dispatch(updateBrand({ favicon: String(reader.result ?? '') }));
                            notify();
                          };
                          reader.onerror = () => toast.error('Could not read file');
                          reader.readAsDataURL(file);
                          e.target.value = '';
                        }}
                      />
                      {content.brand.favicon && (
                        <button
                          type="button"
                          onClick={() => {
                            dispatch(updateBrand({ favicon: '' }));
                            notify();
                          }}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs text-ink-600 hover:text-ink-900 hover:bg-ink-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Field>
              <Field label="Browser tab title" hint="Used for document.title. Falls back to shop name if blank.">
                <Input
                  value={content.brand.siteTitle ?? ''}
                  onChange={(e) => dispatch(updateBrand({ siteTitle: e.target.value }))}
                  onBlur={notify}
                  placeholder="Your shop — short tagline"
                />
              </Field>
              <Field label="Meta description" hint="1–2 sentences. Shown by search engines. Max 320 chars.">
                <Textarea
                  rows={3}
                  value={content.brand.metaDescription ?? ''}
                  onChange={(e) => dispatch(updateBrand({ metaDescription: e.target.value }))}
                  onBlur={notify}
                />
              </Field>
              <Field label="Meta keywords" hint="Comma-separated. Optional and lightly weighted by search engines.">
                <Input
                  value={content.brand.metaKeywords ?? ''}
                  onChange={(e) => dispatch(updateBrand({ metaKeywords: e.target.value }))}
                  onBlur={notify}
                  placeholder="jewellery, gold, bridal"
                />
              </Field>
              <Field label="OG share image URL" hint="Image used when the link is shared on WhatsApp / Facebook. 1200×630 recommended.">
                <Input
                  value={content.brand.ogImage ?? ''}
                  onChange={(e) => dispatch(updateBrand({ ogImage: e.target.value }))}
                  onBlur={notify}
                  placeholder="https://… or /og/cover.jpg"
                />
              </Field>
            </Card>
            </div>
          )}

          {tab === 'hero' && (
            <>
            <Card title="Hero section" desc="The editorial band shown directly under the banner carousel (eyebrow, headline, subtitle, buttons + live rates). Manage the rotating banner images in 'Hero carousel slides' below.">
              <Field label="Eyebrow" hint='Small caps line above the title (e.g. "The 2025 Bridal Edit").'>
                <Input
                  value={content.hero.eyebrow}
                  onChange={(e) => dispatch(updateHero({ eyebrow: e.target.value }))}
                  onBlur={notify}
                />
              </Field>
              <Field label="Title">
                <Textarea
                  value={content.hero.title}
                  onChange={(e) => dispatch(updateHero({ title: e.target.value }))}
                  onBlur={notify}
                />
              </Field>
              <Field label="Subtitle">
                <Textarea
                  rows={3}
                  value={content.hero.subtitle}
                  onChange={(e) => dispatch(updateHero({ subtitle: e.target.value }))}
                  onBlur={notify}
                />
              </Field>
              <Field
                label="Hero video"
                hint="Optional MP4/WebM. Legacy single-image/video hero — the live storefront now leads with the banner carousel below, so this is only used by older themes. Leave empty unless you need it."
              >
                <HeroMediaUploader
                  mode="video"
                  value={content.hero.videoSrc}
                  onChange={(url) => {
                    dispatch(updateHero({ videoSrc: url }));
                    notify();
                  }}
                />
              </Field>
              <Field
                label="Hero poster image"
                hint="Shown until the video frame loads + as a fallback when video is empty. JPG/PNG/WebP."
              >
                <HeroMediaUploader
                  mode="image"
                  value={content.hero.image}
                  onChange={(url) => {
                    dispatch(updateHero({ image: url }));
                    notify();
                  }}
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Primary CTA label">
                  <Input
                    value={content.hero.ctaLabel}
                    onChange={(e) => dispatch(updateHero({ ctaLabel: e.target.value }))}
                    onBlur={notify}
                  />
                </Field>
                <Field label="Primary CTA link">
                  <Input
                    value={content.hero.ctaHref}
                    onChange={(e) => dispatch(updateHero({ ctaHref: e.target.value }))}
                    onBlur={notify}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Secondary CTA label">
                  <Input
                    value={content.hero.secondaryCtaLabel}
                    onChange={(e) => dispatch(updateHero({ secondaryCtaLabel: e.target.value }))}
                    onBlur={notify}
                  />
                </Field>
                <Field label="Secondary CTA link">
                  <Input
                    value={content.hero.secondaryCtaHref}
                    onChange={(e) => dispatch(updateHero({ secondaryCtaHref: e.target.value }))}
                    onBlur={notify}
                  />
                </Field>
              </div>
            </Card>

            <Card
              title="Hero carousel slides"
              desc="Full-width rotating banners at the top of the home page. Each slide is an image with a 'Shop Now' button that links to a collection. Use ↑ / ↓ to reorder. Add 3–6 for the best effect; a wide banner crop works best."
            >
              <ListItemEditor
                items={content.heroSlides ?? []}
                fields={HERO_SLIDE_FIELDS}
                newItem={() => ({
                  image: '',
                  headline: '',
                  ctaLabel: 'Shop Now',
                  ctaHref: '/store/collections/bridal',
                })}
                itemLabel={(s, i) => (s.headline?.trim() ? s.headline : `Slide ${i + 1}`)}
                max={8}
                onChange={(next) => {
                  dispatch(setContent({ ...content, heroSlides: next }));
                  notify();
                }}
              />
            </Card>
            </>
          )}

          {tab === 'navigation' && (
            <NavigationPanel content={content} notify={notify} />
          )}

          {tab === 'rates' && (
            <Card title="Today's gold rates" desc="Shown in the announcement bar, hero strip, and PDP. A value entered here overrides the live market feed — leave a field blank to fall back to today's live rate.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="24K" hint="Blank = use live feed.">
                  <Input
                    value={content.rates.g24 ?? ''}
                    onChange={(e) => dispatch(updateRates({ g24: e.target.value }))}
                    onBlur={notify}
                  />
                </Field>
                <Field label="22K" hint="Blank = use live feed.">
                  <Input
                    value={content.rates.g22}
                    onChange={(e) => dispatch(updateRates({ g22: e.target.value }))}
                    onBlur={notify}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="18K" hint="Blank = use live feed.">
                  <Input
                    value={content.rates.g18}
                    onChange={(e) => dispatch(updateRates({ g18: e.target.value }))}
                    onBlur={notify}
                  />
                </Field>
                <Field label="Silver" hint="Blank = use live feed.">
                  <Input
                    value={content.rates.silver}
                    onChange={(e) => dispatch(updateRates({ silver: e.target.value }))}
                    onBlur={notify}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Updated at" hint="Free text — e.g. '14 May, 11:02 AM IST'. Blank = show the live feed's timestamp.">
                  <Input
                    value={content.rates.updatedAt}
                    onChange={(e) => dispatch(updateRates({ updatedAt: e.target.value }))}
                    onBlur={notify}
                  />
                </Field>
              </div>
              <p className="text-xs text-ink-500">
                Any field left blank is filled from the live GoldAPI feed (see <code className="text-ink-700">server/src/lib/gold-rate.ts</code>). Product prices always use the live feed, never these display values.
              </p>
            </Card>
          )}

          {tab === 'collections' && (
            <Card
              title="Shop by occasion (6-tile body-shot grid)"
              desc="Synced from Inventory Collections. Each tile: name, slug, product count, image URL. Upload local files or paste image URLs."
              action={
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        const response = await fetch('/api/v1/website/auto-sync-collections', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                        });
                        const result = (await response.json()) as { data?: { collections?: any[] } };
                        if (result.data?.collections) {
                          dispatch(setContent({ ...content, shopByOccasion: result.data.collections }));
                          notify();
                          toast.success(`Synced ${result.data.collections.length} collections from Inventory`);
                        }
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Sync failed');
                      }
                    }}
                  >
                    ↻ Sync from Inventory
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      dispatch(
                        setContent({
                          ...content,
                          shopByOccasion: [
                            ...(content.shopByOccasion ?? []),
                            { name: '', slug: '', count: 0, img: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=900&q=80' },
                          ],
                        }),
                      );
                      notify();
                    }}
                  >
                    <Plus className="h-4 w-4" /> Add tile
                  </Button>
                </div>
              }
            >
              <div className="space-y-4">
                {(content.shopByOccasion ?? []).map((tile, i) => (
                  <div key={i} className="rounded-md border border-ink-100 p-4 space-y-3 bg-ink-25">
                    <div className="grid grid-cols-1 gap-4">
                      <div className="flex items-start justify-between">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                          <Field label="Tile name" compact>
                            <Input
                              value={tile.name}
                              onChange={(e) => {
                                const updated = [...(content.shopByOccasion ?? [])];
                                updated[i] = { ...tile, name: e.target.value };
                                dispatch(setContent({ ...content, shopByOccasion: updated }));
                              }}
                              onBlur={notify}
                            />
                          </Field>
                          <Field label="Collection slug" compact>
                            <Input
                              value={tile.slug}
                              placeholder="bridal"
                              onChange={(e) => {
                                const updated = [...(content.shopByOccasion ?? [])];
                                updated[i] = { ...tile, slug: e.target.value };
                                dispatch(setContent({ ...content, shopByOccasion: updated }));
                              }}
                              onBlur={notify}
                            />
                          </Field>
                          <Field label="Product count" compact>
                            <Input
                              type="number"
                              value={tile.count}
                              disabled
                              title="Auto-synced from Inventory. Click 'Sync from Inventory' to update."
                              className="bg-ink-50 text-ink-600 cursor-not-allowed"
                            />
                            <p className="text-xs text-ink-500 mt-1">Auto-synced from Inventory</p>
                          </Field>
                        </div>
                        <div className="flex items-center gap-0.5 mt-6">
                          <button
                            type="button"
                            onClick={() => {
                              dispatch(setContent({ ...content, shopByOccasion: moveInArray(content.shopByOccasion ?? [], i, -1) }));
                              notify();
                            }}
                            disabled={i === 0}
                            className="h-8 w-8 inline-flex items-center justify-center rounded text-ink-500 hover:text-ink-900 hover:bg-ink-100 disabled:opacity-30"
                            aria-label="Move up"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              dispatch(setContent({ ...content, shopByOccasion: moveInArray(content.shopByOccasion ?? [], i, 1) }));
                              notify();
                            }}
                            disabled={i === (content.shopByOccasion?.length ?? 0) - 1}
                            className="h-8 w-8 inline-flex items-center justify-center rounded text-ink-500 hover:text-ink-900 hover:bg-ink-100 disabled:opacity-30"
                            aria-label="Move down"
                            title="Move down"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = content.shopByOccasion?.filter((_, idx) => idx !== i) ?? [];
                              dispatch(setContent({ ...content, shopByOccasion: updated }));
                              notify();
                            }}
                            aria-label={`Remove ${tile.name}`}
                            title="Remove"
                            className="h-8 w-8 inline-flex items-center justify-center rounded text-danger-500 hover:bg-danger-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <Field
                        label="Image"
                        compact
                        hint="Upload a local file (≤ 2 MB) or paste an image URL. Saves to Cloudinary."
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="h-20 w-28 rounded-md bg-ink-50 border border-ink-100 overflow-hidden shrink-0"
                            aria-hidden="true"
                          >
                            {tile.img ? (
                              <img src={tile.img} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-xs text-ink-400">
                                No image
                              </div>
                            )}
                          </div>
                          <div className="flex-1 space-y-2">
                            <Input
                              placeholder="https://… or paste a URL"
                              value={tile.img}
                              onChange={(e) => {
                                const updated = [...(content.shopByOccasion ?? [])];
                                updated[i] = { ...tile, img: e.target.value };
                                dispatch(setContent({ ...content, shopByOccasion: updated }));
                              }}
                              onBlur={notify}
                            />
                            <div className="flex items-center gap-2">
                              <label
                                htmlFor={`occasion-image-${i}`}
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-ink-200 bg-ink-0 text-xs text-ink-700 hover:bg-ink-50 cursor-pointer"
                              >
                                Upload image
                              </label>
                              <input
                                id={`occasion-image-${i}`}
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className="sr-only"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  if (file.size > 2_000 * 1024) {
                                    toast.error('Image must be under 2 MB');
                                    e.target.value = '';
                                    return;
                                  }
                                  try {
                                    const result = await uploadImageToCloudinary(file, {
                                      folder: 'zelora/collections',
                                    });
                                    const updated = [...(content.shopByOccasion ?? [])];
                                    updated[i] = { ...tile, img: result.secureUrl };
                                    dispatch(setContent({ ...content, shopByOccasion: updated }));
                                    notify();
                                    toast.success('Image uploaded');
                                  } catch (err) {
                                    toast.error(
                                      err instanceof Error ? err.message : 'Failed to upload image',
                                    );
                                  }
                                  e.target.value = '';
                                }}
                              />
                              {tile.img && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...(content.shopByOccasion ?? [])];
                                    updated[i] = { ...tile, img: '' };
                                    dispatch(setContent({ ...content, shopByOccasion: updated }));
                                    notify();
                                  }}
                                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs text-ink-600 hover:text-ink-900 hover:bg-ink-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" /> Remove
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {tab === 'story' && (
            <Card title="Brand story" desc="The 'Three generations' editorial block.">
              <Field label="Eyebrow">
                <Input
                  value={content.story.eyebrow}
                  onChange={(e) => dispatch(updateStory({ eyebrow: e.target.value }))}
                  onBlur={notify}
                />
              </Field>
              <Field label="Title" hint="Use a newline to break to a second line.">
                <Textarea
                  value={content.story.title}
                  onChange={(e) => dispatch(updateStory({ title: e.target.value }))}
                  onBlur={notify}
                />
              </Field>
              <Field label="Body">
                <Textarea
                  rows={4}
                  value={content.story.body}
                  onChange={(e) => dispatch(updateStory({ body: e.target.value }))}
                  onBlur={notify}
                />
              </Field>
              <Field label="Image URL">
                <Input
                  value={content.story.image}
                  onChange={(e) => dispatch(updateStory({ image: e.target.value }))}
                  onBlur={notify}
                />
              </Field>
            </Card>
          )}

          {tab === 'testimonial' && (
            <div className="space-y-6">
              <Card title="Customer quote" desc="The dark press block on the home page.">
                <Field label="Quote">
                  <Textarea
                    rows={3}
                    value={content.testimonial.quote}
                    onChange={(e) => dispatch(updateTestimonial({ quote: e.target.value }))}
                    onBlur={notify}
                  />
                </Field>
                <Field label="Attribution">
                  <Input
                    value={content.testimonial.author}
                    onChange={(e) => dispatch(updateTestimonial({ author: e.target.value }))}
                    onBlur={notify}
                  />
                </Field>
              </Card>

              {/* Customer reviews moved here from the Homepage Sections tab —
                  this is the natural home for "what real customers said".
                  Editing here updates the two scrolling rows on the storefront
                  reviews band. */}
              <Card title="Customer reviews — row 1 (scrolls left)" desc="Each review: author, city, occasion, quote.">
                <ListItemEditor
                  items={content.testimonialsRow1 ?? []}
                  fields={TESTIMONIAL_FIELDS as ReadonlyArray<FieldDef<{ quote: string; author: string; city: string; occasion: string }>>}
                  newItem={() => ({ quote: '', author: '', city: '', occasion: '' })}
                  onChange={(v) => {
                    dispatch(setContent({ ...content, testimonialsRow1: v }));
                    notify();
                  }}
                  itemLabel={(it) => it.author || 'New review'}
                  max={12}
                />
              </Card>

              <Card title="Customer reviews — row 2 (scrolls right)" desc="Each review: author, city, occasion, quote.">
                <ListItemEditor
                  items={content.testimonialsRow2 ?? []}
                  fields={TESTIMONIAL_FIELDS as ReadonlyArray<FieldDef<{ quote: string; author: string; city: string; occasion: string }>>}
                  newItem={() => ({ quote: '', author: '', city: '', occasion: '' })}
                  onChange={(v) => {
                    dispatch(setContent({ ...content, testimonialsRow2: v }));
                    notify();
                  }}
                  itemLabel={(it) => it.author || 'New review'}
                  max={12}
                />
              </Card>
            </div>
          )}

          {tab === 'locations' && (
            <Card
              title="Stores"
              desc="Listed on the Stores page and surfaced in the header."
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    dispatch(
                      addLocation({
                        id: `loc-${Date.now()}`,
                        name: 'New showroom',
                        address: 'Street, City, PIN',
                        phone: '+91 ',
                        hours: 'Mon–Sat · 10:30 AM – 8:30 PM',
                        image:
                          'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=1600&q=85',
                      }),
                    );
                    notify();
                  }}
                >
                  <Plus className="h-4 w-4" /> Add store
                </Button>
              }
            >
              <div className="space-y-4">
                {content.locations.map((l, i) => (
                  <div key={l.id + i} className="rounded-md border border-ink-100 p-4 space-y-3 bg-ink-25">
                    <div className="flex items-start justify-between">
                      <span className="text-eyebrow uppercase text-ink-500">Store #{i + 1}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          dispatch(removeLocation(i));
                          notify();
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-danger-500" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Name" compact>
                        <Input
                          value={l.name}
                          onChange={(e) =>
                            dispatch(updateLocation({ index: i, patch: { name: e.target.value } }))
                          }
                          onBlur={notify}
                        />
                      </Field>
                      <Field label="Phone" compact>
                        <Input
                          value={l.phone}
                          onChange={(e) =>
                            dispatch(updateLocation({ index: i, patch: { phone: e.target.value } }))
                          }
                          onBlur={notify}
                        />
                      </Field>
                    </div>
                    <Field label="Address" compact>
                      <Input
                        value={l.address}
                        onChange={(e) =>
                          dispatch(updateLocation({ index: i, patch: { address: e.target.value } }))
                        }
                        onBlur={notify}
                      />
                    </Field>
                    <Field label="Hours" compact>
                      <Input
                        value={l.hours}
                        onChange={(e) =>
                          dispatch(updateLocation({ index: i, patch: { hours: e.target.value } }))
                        }
                        onBlur={notify}
                      />
                    </Field>
                    <Field
                      label="Photo"
                      compact
                      hint="Paste an image URL or upload a file (≤ 1.5 MB). Shown on the Stores page card."
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="h-20 w-28 rounded-md bg-ink-50 border border-ink-100 overflow-hidden shrink-0"
                          aria-hidden="true"
                        >
                          {l.image ? (
                            <img src={l.image} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-xs text-ink-400">
                              No image
                            </div>
                          )}
                        </div>
                        <div className="flex-1 space-y-2">
                          <Input
                            placeholder="https://…"
                            value={l.image}
                            onChange={(e) =>
                              dispatch(updateLocation({ index: i, patch: { image: e.target.value } }))
                            }
                            onBlur={notify}
                          />
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor={`store-image-${i}`}
                              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-ink-200 bg-ink-0 text-xs text-ink-700 hover:bg-ink-50 cursor-pointer"
                            >
                              Upload image
                            </label>
                            <input
                              id={`store-image-${i}`}
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="sr-only"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                if (file.size > 1_500 * 1024) {
                                  toast.error('Store photo must be under 1.5 MB');
                                  e.target.value = '';
                                  return;
                                }
                                const reader = new FileReader();
                                reader.onload = () => {
                                  dispatch(
                                    updateLocation({
                                      index: i,
                                      patch: { image: String(reader.result ?? '') },
                                    }),
                                  );
                                  notify();
                                };
                                reader.onerror = () => toast.error('Could not read file');
                                reader.readAsDataURL(file);
                                e.target.value = '';
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </Field>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {tab === 'contact' && (
            <div className="space-y-6">
              <Card title="WhatsApp contact" desc="Used by the floating WhatsApp button on every storefront page.">
                <Field
                  label="WhatsApp number"
                  hint="Country code + number, digits only. Example: 919876543210"
                >
                  <Input
                    value={content.whatsappNumber}
                    onChange={(e) => dispatch(updateWhatsapp(e.target.value.replace(/\D/g, '')))}
                    onBlur={notify}
                  />
                </Field>
                <p className="text-xs text-ink-500">
                  Link generated: <span className="font-mono text-ink-700">https://wa.me/{content.whatsappNumber}</span>
                </p>
              </Card>

              <Card title="Social media links" desc="Shown as icons in the storefront footer. Leave blank to hide an icon.">
                <Field label="Instagram URL" hint="Full URL, e.g. https://instagram.com/yourbrand">
                  <Input
                    value={content.socials?.instagram ?? ''}
                    onChange={(e) => dispatch(updateSocials({ instagram: e.target.value }))}
                    onBlur={notify}
                    placeholder="https://instagram.com/…"
                  />
                </Field>
                <Field label="Facebook URL" hint="Full URL, e.g. https://facebook.com/yourbrand">
                  <Input
                    value={content.socials?.facebook ?? ''}
                    onChange={(e) => dispatch(updateSocials({ facebook: e.target.value }))}
                    onBlur={notify}
                    placeholder="https://facebook.com/…"
                  />
                </Field>
                <Field label="YouTube URL" hint="Full channel URL, e.g. https://youtube.com/@yourbrand">
                  <Input
                    value={content.socials?.youtube ?? ''}
                    onChange={(e) => dispatch(updateSocials({ youtube: e.target.value }))}
                    onBlur={notify}
                    placeholder="https://youtube.com/@…"
                  />
                </Field>
                <Field label="WhatsApp share link" hint="A click-to-chat link, e.g. https://wa.me/91XXXXXXXXXX">
                  <Input
                    value={content.socials?.whatsapp ?? ''}
                    onChange={(e) => dispatch(updateSocials({ whatsapp: e.target.value }))}
                    onBlur={notify}
                    placeholder="https://wa.me/…"
                  />
                </Field>
              </Card>
            </div>
          )}

          {tab === 'filters' && (
            <FiltersTab
              filters={content.filters}
              collections={content.collections}
              onAddGroup={(g) => {
                dispatch(addFilterGroup(g));
                notify();
              }}
              onUpdateGroup={(key, patch) => {
                dispatch(updateFilterGroup({ key, patch }));
                notify();
              }}
              onRemoveGroup={(key) => {
                dispatch(removeFilterGroup(key));
                notify();
              }}
              onSetForCollection={(slug, keys) => {
                dispatch(setFiltersForCollection({ slug, groupKeys: keys }));
                notify();
              }}
              onClearOverride={(slug) => {
                dispatch(clearFiltersOverride(slug));
                notify();
              }}
              onSetDefaultKeys={(keys) => {
                dispatch(setDefaultFilterKeys(keys));
                notify();
              }}
              notify={notify}
            />
          )}

          {tab === 'homepage' && (
            <HomepageSectionsTab content={content} onPatch={(patch) => { dispatch(setContent({ ...content, ...patch })); notify(); }} />
          )}
          {tab === 'labels' && (
            <SectionLabelsTab
              labels={content.sectionLabels}
              onPatch={(next) => {
                dispatch(setContent({ ...content, sectionLabels: next }));
                notify();
              }}
            />
          )}
          {tab === 'footer' && (
            <FooterSectionsTab content={content} onPatch={(patch) => { dispatch(setContent({ ...content, ...patch })); notify(); }} />
          )}
          {tab === 'loyalty' && <LoyaltyConfigTab />}
          {tab === 'coupons' && <CouponsAdminTab />}
          {tab === 'invoice' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between rounded-md border border-ink-100 bg-ink-0 px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-ink-900">Invoice preview</p>
                  <p className="text-xs text-ink-500 mt-0.5">Opens a sample PDF using your current layout settings. Publish first to include the latest changes.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 shrink-0"
                  onClick={() => downloadPdf('/api/v1/storefront/invoice-preview.pdf', { mode: 'preview' })}
                >
                  <FileText className="h-4 w-4" />
                  Preview PDF
                </Button>
              </div>
              <Card title="Brand band (top of invoice)" desc="The branded header strip — wordmark + tagline + established line.">
                <Field label="Sub-tagline" hint="Small uppercase line under the brand name. e.g. FINE JEWELLERY">
                  <Input
                    value={content.invoiceLayout?.brandSubTagline ?? ''}
                    onChange={(e) => dispatch(updateInvoiceLayout({ brandSubTagline: e.target.value }))}
                    onBlur={notify}
                    placeholder="FINE JEWELLERY"
                  />
                </Field>
                <Field label="Established line" hint="Appears in the accent colour under the sub-tagline. The stamp seal reads its year from this line.">
                  <Input
                    value={content.invoiceLayout?.brandEstablishedLine ?? ''}
                    onChange={(e) => dispatch(updateInvoiceLayout({ brandEstablishedLine: e.target.value }))}
                    onBlur={notify}
                    placeholder="HARYANA · SINCE 1972"
                  />
                </Field>
                <Field label="Invoice title" hint="Right-side heading. Usually 'TAX INVOICE'.">
                  <Input
                    value={content.invoiceLayout?.invoiceTitle ?? ''}
                    onChange={(e) => dispatch(updateInvoiceLayout({ invoiceTitle: e.target.value }))}
                    onBlur={notify}
                    placeholder="TAX INVOICE"
                  />
                </Field>
                <Field label="Invoice number prefix" hint="Prepended to every invoice number on the PDF. e.g. ZEL/INV/2026-27/ → bill 000123 reads ZEL/INV/2026-27/000123.">
                  <Input
                    value={content.invoiceLayout?.invoiceNumberPrefix ?? ''}
                    onChange={(e) => dispatch(updateInvoiceLayout({ invoiceNumberPrefix: e.target.value }))}
                    onBlur={notify}
                    placeholder="ZEL/INV/2026-27/"
                  />
                </Field>
                <Field label="Accent colour" hint="Drives headlines, totals card and ribbon. Six-digit hex.">
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={content.invoiceLayout?.accentColor ?? '#C7895A'}
                      onChange={(e) => dispatch(updateInvoiceLayout({ accentColor: e.target.value }))}
                      onBlur={notify}
                      className="h-9 w-12 cursor-pointer rounded border border-ink-200"
                    />
                    <Input
                      value={content.invoiceLayout?.accentColor ?? '#C7895A'}
                      onChange={(e) => dispatch(updateInvoiceLayout({ accentColor: e.target.value }))}
                      onBlur={notify}
                      placeholder="#C7895A"
                      className="flex-1"
                    />
                  </div>
                </Field>
              </Card>

              <Card title="Hero block (under the brand band)" desc="A short headline + body + product image — the editorial top of the invoice.">
                <Field label="Hero headline">
                  <Input
                    value={content.invoiceLayout?.heroHeadline ?? ''}
                    onChange={(e) => dispatch(updateInvoiceLayout({ heroHeadline: e.target.value }))}
                    onBlur={notify}
                    placeholder="Heirlooms, made for the modern bride."
                  />
                </Field>
                <Field label="Hero body" hint="One or two short sentences.">
                  <Textarea
                    rows={3}
                    value={content.invoiceLayout?.heroBody ?? ''}
                    onChange={(e) => dispatch(updateInvoiceLayout({ heroBody: e.target.value }))}
                    onBlur={notify}
                  />
                </Field>
                <Field label="Hero image URL" hint="Optional decorative product photo on the right of the hero block. PNG with transparent background works best.">
                  <Input
                    value={content.invoiceLayout?.heroImage ?? ''}
                    onChange={(e) => dispatch(updateInvoiceLayout({ heroImage: e.target.value }))}
                    onBlur={notify}
                    placeholder="https://… or /img/hero.png"
                  />
                </Field>
                <Field label="Display toggles">
                  <div className="space-y-2">
                    <label className="inline-flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={content.invoiceLayout?.showLogo ?? true}
                        onChange={(e) => { dispatch(updateInvoiceLayout({ showLogo: e.target.checked })); notify(); }}
                      />
                      Show brand logo
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={content.invoiceLayout?.showHeroImage ?? true}
                        onChange={(e) => { dispatch(updateInvoiceLayout({ showHeroImage: e.target.checked })); notify(); }}
                      />
                      Show hero image
                    </label>
                  </div>
                </Field>
              </Card>

              <Card title="Business details" desc="Printed in the right-side card under the Tax Invoice block. Falls back to shop / tenant data when blank.">
                <Field label="Business address" hint="Single block of text. Comma-separated; the PDF wraps automatically.">
                  <Textarea
                    rows={2}
                    value={content.invoiceLayout?.businessAddress ?? ''}
                    onChange={(e) => dispatch(updateInvoiceLayout({ businessAddress: e.target.value }))}
                    onBlur={notify}
                    placeholder="Haryana, India"
                  />
                </Field>
                <Field label="Business email">
                  <Input
                    value={content.invoiceLayout?.businessEmail ?? ''}
                    onChange={(e) => dispatch(updateInvoiceLayout({ businessEmail: e.target.value }))}
                    onBlur={notify}
                    placeholder="hello@yourbrand.in"
                  />
                </Field>
              </Card>

              <Card title="Thank-you block (under totals)" desc="A warm closing line + body. Printed in the accent colour as an italicised callout.">
                <Field label="Thank-you headline">
                  <Input
                    value={content.invoiceLayout?.thankYouTitle ?? ''}
                    onChange={(e) => dispatch(updateInvoiceLayout({ thankYouTitle: e.target.value }))}
                    onBlur={notify}
                    placeholder="Thank you for choosing us."
                  />
                </Field>
                <Field label="Thank-you body">
                  <Textarea
                    rows={2}
                    value={content.invoiceLayout?.thankYouBody ?? ''}
                    onChange={(e) => dispatch(updateInvoiceLayout({ thankYouBody: e.target.value }))}
                    onBlur={notify}
                    placeholder="We appreciate your trust in our craftsmanship."
                  />
                </Field>
                <Field label="Show amount in words">
                  <label className="inline-flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={content.invoiceLayout?.showAmountInWords ?? true}
                      onChange={(e) => { dispatch(updateInvoiceLayout({ showAmountInWords: e.target.checked })); notify(); }}
                    />
                    Print the Indian rupee amount-in-words card
                  </label>
                </Field>
              </Card>

              <Card title="Payment details + QR" desc="Bank coordinates + UPI ID. The QR is generated server-side from the UPI ID — no need to upload an image.">
                <Field label="Bank name">
                  <Input
                    value={content.invoiceLayout?.bankName ?? ''}
                    onChange={(e) => dispatch(updateInvoiceLayout({ bankName: e.target.value }))}
                    onBlur={notify}
                    placeholder="HDFC Bank"
                  />
                </Field>
                <Field label="Account number">
                  <Input
                    value={content.invoiceLayout?.bankAccountNumber ?? ''}
                    onChange={(e) => dispatch(updateInvoiceLayout({ bankAccountNumber: e.target.value }))}
                    onBlur={notify}
                    placeholder="5010 1234 5678 90"
                  />
                </Field>
                <Field label="IFSC code">
                  <Input
                    value={content.invoiceLayout?.bankIfsc ?? ''}
                    onChange={(e) => dispatch(updateInvoiceLayout({ bankIfsc: e.target.value }))}
                    onBlur={notify}
                    placeholder="HDFC0001234"
                  />
                </Field>
                <Field label="UPI ID" hint="If set, a Scan-to-Pay QR is auto-generated using the invoice total amount.">
                  <Input
                    value={content.invoiceLayout?.upiId ?? ''}
                    onChange={(e) => dispatch(updateInvoiceLayout({ upiId: e.target.value }))}
                    onBlur={notify}
                    placeholder="yourbrand@hdfcbank"
                  />
                </Field>
                <Field label="Show UPI QR">
                  <label className="inline-flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={content.invoiceLayout?.showUpiQr ?? true}
                      onChange={(e) => { dispatch(updateInvoiceLayout({ showUpiQr: e.target.checked })); notify(); }}
                    />
                    Generate a Scan-to-Pay QR from the UPI ID
                  </label>
                </Field>
              </Card>

              <Card title="Terms & notes + stamp" desc="One bullet per line. The stamp is rendered as a circular seal at the bottom-right using the brand name + year from the Established line.">
                <Field label="Terms (one per line)">
                  <Textarea
                    rows={5}
                    value={content.invoiceLayout?.termsAndConditions ?? ''}
                    onChange={(e) => dispatch(updateInvoiceLayout({ termsAndConditions: e.target.value }))}
                    onBlur={notify}
                    placeholder={'Goods once sold will not be taken back or exchanged.\nAny damages must be reported within 3 days of delivery.\nPrices are subject to change with MCX rate fluctuations.'}
                  />
                </Field>
                <Field label="Show stamp">
                  <label className="inline-flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={content.invoiceLayout?.showStamp ?? true}
                      onChange={(e) => { dispatch(updateInvoiceLayout({ showStamp: e.target.checked })); notify(); }}
                    />
                    Print the circular brand stamp at the bottom-right
                  </label>
                </Field>
              </Card>

              <Card title="Footer ribbon + contact bar" desc="The full-width ribbon at the very bottom + the contact strip just above it.">
                <Field label="Ribbon text" hint="Centred, uppercase, in the accent colour.">
                  <Input
                    value={content.invoiceLayout?.footerRibbon ?? ''}
                    onChange={(e) => dispatch(updateInvoiceLayout({ footerRibbon: e.target.value }))}
                    onBlur={notify}
                    placeholder="HEIRLOOMS TODAY, MEMORIES FOREVER."
                  />
                </Field>
                <Field label="Website">
                  <Input
                    value={content.invoiceLayout?.contactWebsite ?? ''}
                    onChange={(e) => dispatch(updateInvoiceLayout({ contactWebsite: e.target.value }))}
                    onBlur={notify}
                    placeholder="www.yourbrand.in"
                  />
                </Field>
                <Field label="Phone (contact bar)" hint="Falls back to shop phone if blank.">
                  <Input
                    value={content.invoiceLayout?.contactPhone ?? ''}
                    onChange={(e) => dispatch(updateInvoiceLayout({ contactPhone: e.target.value }))}
                    onBlur={notify}
                    placeholder="+91 99999 88888"
                  />
                </Field>
                <Field label="Full address line" hint="Single-line address shown in the contact bar.">
                  <Input
                    value={content.invoiceLayout?.contactAddressLine ?? ''}
                    onChange={(e) => dispatch(updateInvoiceLayout({ contactAddressLine: e.target.value }))}
                    onBlur={notify}
                    placeholder="Brand Jewellery, City, State - PIN"
                  />
                </Field>
              </Card>
            </div>
          )}
        </div>

        {/* Live preview panel */}
        <aside className="space-y-4">
          {tab === 'invoice' ? (
            <div className="rounded-md border border-ink-100 overflow-hidden bg-ink-0 sticky top-6">
              <div className="px-4 h-10 border-b border-ink-100 flex items-center justify-between bg-ink-25">
                <span className="text-eyebrow uppercase text-ink-500">Invoice preview</span>
              </div>
              <div className="flex flex-col items-center justify-center gap-4 py-12 px-6 text-center">
                <div className="rounded-full bg-ink-50 p-4">
                  <FileText className="h-8 w-8 text-ink-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink-800">Preview your invoice layout</p>
                  <p className="text-xs text-ink-500 mt-1 max-w-[220px]">
                    Opens a sample PDF with dummy data using your saved CMS settings.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => downloadPdf('/api/v1/storefront/invoice-preview.pdf', { mode: 'preview' })}
                >
                  <FileText className="h-4 w-4" />
                  Open preview PDF
                </Button>
                <p className="text-[11px] text-ink-400">Publish your changes first to see them in the preview.</p>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-ink-100 overflow-hidden bg-ink-0 sticky top-6">
              <div className="px-4 h-10 border-b border-ink-100 flex items-center justify-between bg-ink-25">
                <span className="text-eyebrow uppercase text-ink-500">Live preview</span>
                <a
                  href="/store"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-ink-700 hover:text-ink-900 inline-flex items-center gap-1"
                >
                  Open
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <iframe
                key={JSON.stringify(content).length}
                src="/store"
                title="Storefront preview"
                className="w-full h-[640px] bg-ink-0"
              />
              <p className="px-4 py-2 text-[11px] text-ink-500 border-t border-ink-100 bg-ink-25">
                Preview reloads when you switch tabs. Use the open icon to test interactions.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Card({
  title,
  desc,
  action,
  children,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="rounded-md border border-ink-100 bg-ink-0 p-5 space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-ink-900">{title}</h2>
          {desc && <p className="text-sm text-ink-500 mt-0.5">{desc}</p>}
        </div>
        {action}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  compact,
  children,
}: {
  label: string;
  hint?: string;
  compact?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      <Label className="text-xs text-ink-600">{label}</Label>
      {children}
      {hint && <p className="text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

// Top-nav editor + auto-seed shortcuts. Two onboarding affordances when the
// list is empty so editors don't have to type the seven default items by
// hand:
//   - "Use built-in menu" copies the hardcoded baseline (All / Bridal / …)
//     into the CMS as editable rows.
//   - "Sync from main categories" pulls inventory main categories
//     (parentId == null) and turns each into a nav item — so adding a new
//     main category in Inventory propagates to the storefront with one
//     click here.
const BUILT_IN_NAV: Array<{ label: string; href: string; end?: boolean }> = [
  { label: 'All', href: '/store/collections', end: true },
  { label: 'Bridal', href: '/store/collections/bridal' },
  { label: 'Daily wear', href: '/store/collections/daily-wear' },
  { label: 'Festive', href: '/store/collections/festive' },
  { label: 'Diamond', href: '/store/collections/diamond' },
  { label: 'Silver', href: '/store/collections/silver' },
  { label: 'Stores', href: '/store/locations' },
];

function slugifyCategoryName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function NavigationPanel({
  content,
  notify,
}: {
  content: StorefrontContent;
  notify: () => void;
}): JSX.Element {
  const dispatch = useAppDispatch();
  const { data: catsRes } = useGetCategoriesQuery();
  const navMenu = content.navMenu ?? [];
  const isEmpty = navMenu.length === 0;

  // Build the "Sync from main categories" target. parentId === null is a
  // main category in our schema; sub-categories don't surface in the nav
  // because they'd overflow the strip.
  const mainCategories = (catsRes?.data ?? []).filter(
    (c) => !(c as { parentId?: string | null }).parentId,
  );

  function seedFromBuiltIn(): void {
    dispatch(setNavMenu(BUILT_IN_NAV));
    notify();
    toast.success('Built-in menu copied — edit as needed.');
  }

  function syncFromCategories(): void {
    if (mainCategories.length === 0) {
      toast.error('No main categories yet — add some in Inventory → Categories first.');
      return;
    }
    const items: Array<{ label: string; href: string; end?: boolean }> = [
      { label: 'All', href: '/store/collections', end: true },
      ...mainCategories
        .slice(0, 10) // 12 cap, leave room for All + Stores
        .map((c) => ({
          label: c.name,
          href: `/store/collections/${slugifyCategoryName(c.name)}`,
        })),
      { label: 'Stores', href: '/store/locations' },
    ];
    dispatch(setNavMenu(items));
    notify();
    toast.success(`Synced ${items.length} menu items from main categories.`);
  }

  return (
    <Card
      title="Top navigation menu"
      desc="Links shown in the storefront header. Edit any row inline; remove with the trash icon."
    >
      <div className="space-y-3">
        {isEmpty ? (
          <div className="rounded-md border border-dashed border-ink-200 bg-ink-25 p-4 space-y-3 text-sm">
            <p className="text-ink-700">
              The storefront is currently showing the built-in menu (
              <strong>All / Bridal / Daily wear / Festive / Diamond / Silver / Stores</strong>).
              To customize, start from one of these:
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={seedFromBuiltIn}>
                Use built-in menu
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={syncFromCategories}
                disabled={mainCategories.length === 0}
              >
                Sync from main categories
                {mainCategories.length > 0 && (
                  <span className="ml-1.5 text-xs text-ink-500">({mainCategories.length})</span>
                )}
              </Button>
            </div>
            <p className="text-xs text-ink-500">
              Or click <strong>+ Add menu item</strong> below to build the menu from scratch.
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-md bg-ink-25 border border-ink-100 p-3 text-xs">
            <span className="text-ink-600">
              {navMenu.length} item{navMenu.length === 1 ? '' : 's'} live on the storefront.
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={syncFromCategories}
                disabled={mainCategories.length === 0}
                className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs text-ink-700 hover:bg-ink-100 disabled:opacity-50"
                title="Replace with auto-generated items from main categories"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Sync from categories
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm('Replace the current menu with the built-in default?')) return;
                  seedFromBuiltIn();
                }}
                className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs text-ink-700 hover:bg-ink-100"
              >
                Reset to built-in
              </button>
            </div>
          </div>
        )}

        {navMenu.map((item, idx) => (
          <div
            key={idx}
            className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto_auto] gap-2 items-end rounded-md border border-ink-100 p-3 bg-ink-25"
          >
            <Field label="Label" compact>
              <Input
                value={item.label}
                placeholder="Bridal"
                onChange={(e) =>
                  dispatch(updateNavItem({ index: idx, patch: { label: e.target.value } }))
                }
                onBlur={notify}
              />
            </Field>
            <Field label="Link" compact>
              <Input
                value={item.href}
                placeholder="/store/collections/bridal"
                onChange={(e) =>
                  dispatch(updateNavItem({ index: idx, patch: { href: e.target.value } }))
                }
                onBlur={notify}
                className="font-mono text-xs"
              />
            </Field>
            <label className="inline-flex items-center gap-1.5 text-xs text-ink-700 select-none pb-2">
              <input
                type="checkbox"
                checked={!!item.end}
                onChange={(e) => {
                  dispatch(updateNavItem({ index: idx, patch: { end: e.target.checked } }));
                  notify();
                }}
              />
              Exact match
            </label>
            <div className="flex items-center gap-0.5 pb-1">
              <button
                type="button"
                onClick={() => { dispatch(setNavMenu(moveInArray(navMenu, idx, -1))); notify(); }}
                disabled={idx === 0}
                className="h-8 w-8 inline-flex items-center justify-center rounded text-ink-500 hover:text-ink-900 hover:bg-ink-100 disabled:opacity-30"
                aria-label="Move up"
                title="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => { dispatch(setNavMenu(moveInArray(navMenu, idx, 1))); notify(); }}
                disabled={idx === navMenu.length - 1}
                className="h-8 w-8 inline-flex items-center justify-center rounded text-ink-500 hover:text-ink-900 hover:bg-ink-100 disabled:opacity-30"
                aria-label="Move down"
                title="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => {
                  dispatch(removeNavItem(idx));
                  notify();
                }}
                className="h-8 w-8 inline-flex items-center justify-center rounded text-danger-700 hover:bg-danger-50"
                aria-label={`Remove ${item.label}`}
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (navMenu.length >= 12) {
              toast.error('Maximum 12 menu items');
              return;
            }
            dispatch(addNavItem({ label: 'New item', href: '/store/collections' }));
            notify();
          }}
          className="self-start"
        >
          <Plus className="h-4 w-4" /> Add menu item
        </Button>

        <p className="text-xs text-ink-500">
          Tip: use relative paths like <code className="text-ink-700">/store/collections/silver</code>
          for internal links. External URLs (https://…) open in the same tab.
          Enable <strong>Exact match</strong> for "All" / homepage-style links so they don't stay
          highlighted on sub-pages.
        </p>
      </div>
    </Card>
  );
}

// Combined uploader + URL-paste fallback for the hero image / video fields.
// Tries the server-signed Cloudinary path first (no preset setup needed);
// falls back to URL paste so editors can keep using Unsplash/external links
// when they prefer. Mode flips the file accept attribute, the upload helper,
// and the preview element between <img> and <video>.
function HeroMediaUploader({
  mode,
  value,
  onChange,
}: {
  mode: 'image' | 'video';
  value: string;
  onChange: (url: string) => void;
}): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const accept = mode === 'image' ? 'image/png,image/jpeg,image/webp,image/svg+xml' : 'video/mp4,video/webm';
  const folder = mode === 'image' ? 'zelora/hero/images' : 'zelora/hero/videos';

  async function handleFile(file: File): Promise<void> {
    setProgress(0);
    try {
      const result =
        mode === 'image'
          ? await uploadImageToCloudinary(file, { folder, onProgress: setProgress })
          : await uploadVideoToCloudinary(file, { folder, onProgress: setProgress });
      onChange(result.secureUrl);
      toast.success(`${mode === 'image' ? 'Image' : 'Video'} uploaded`);
    } catch (err) {
      toast.error((err as Error).message ?? 'Upload failed');
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* Preview */}
      {value && (
        <div className="rounded-md border border-ink-100 bg-ink-25 overflow-hidden">
          {mode === 'image' ? (
            <img src={value} alt="Hero preview" className="w-full max-h-64 object-cover" />
          ) : (
            <video src={value} controls className="w-full max-h-64 bg-black" />
          )}
        </div>
      )}

      {/* Upload + URL paste */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={progress !== null}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-ink-200 bg-ink-0 text-sm text-ink-700 hover:bg-ink-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {mode === 'image' ? <ImageIcon className="h-4 w-4" /> : <VideoIcon className="h-4 w-4" />}
          {progress !== null ? `Uploading ${progress}%` : `Upload ${mode}`}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm text-ink-600 hover:text-ink-900 hover:bg-ink-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={mode === 'image' ? 'or paste an https://… URL' : 'or paste /img/hero.mp4 or https://…'}
        className="font-mono text-xs"
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Filters tab
//
// Admin UI for the storefront filter config (sidebar facets on collection
// pages). Two parts:
//   1. Master groups — add/edit/remove filter groups with their option labels.
//      Removing a group strips it from every per-collection list automatically
//      (see the reducer).
//   2. Per-collection visibility — pick which groups show on each collection
//      slug. Empty list = hide all filters on that page. "Reset" clears the
//      override so the page falls back to `defaultGroupKeys`.
// -----------------------------------------------------------------------------

function FiltersTab({
  filters,
  collections,
  onAddGroup,
  onUpdateGroup,
  onRemoveGroup,
  onSetForCollection,
  onClearOverride,
  onSetDefaultKeys,
  notify,
}: {
  filters: import('@/features/storefront/storefrontContentSlice').StorefrontFiltersConfig;
  collections: import('@/features/storefront/storefrontContentSlice').CollectionTile[];
  onAddGroup: (g: { key: string; label: string; options: string[] }) => void;
  onUpdateGroup: (key: string, patch: Partial<{ label: string; options: string[] }>) => void;
  onRemoveGroup: (key: string) => void;
  onSetForCollection: (slug: string, groupKeys: string[]) => void;
  onClearOverride: (slug: string) => void;
  onSetDefaultKeys: (keys: string[]) => void;
  notify: () => void;
}): JSX.Element {
  const [newLabel, setNewLabel] = useState('');
  const slugify = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

  // Pseudo-collections (priced/purity buckets) that exist as collection pages
  // but aren't real categories in the DB. List them so admin can override
  // filter visibility for these slugs too.
  const PSEUDO_SLUGS = ['22k', '18k', 'silver', 'gifting', 'under-50k'];
  const allSlugs = Array.from(
    new Set([...collections.map((c) => c.slug), ...PSEUDO_SLUGS]),
  );

  return (
    <>
      <Card
        title="Default visibility"
        desc="Filters shown on a collection that doesn't have its own override below."
      >
        <FilterGroupCheckboxes
          allGroups={filters.groups}
          enabled={filters.defaultGroupKeys}
          onChange={onSetDefaultKeys}
        />
      </Card>

      <Card
        title="Filter groups"
        desc="Each group becomes one section in the storefront sidebar. Removing a group hides it everywhere."
        action={
          <div className="flex items-center gap-2">
            <Input
              value={newLabel}
              placeholder="New group label (e.g. Stone)"
              onChange={(e) => setNewLabel(e.target.value)}
              className="h-9 w-56"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={!newLabel.trim()}
              onClick={() => {
                const label = newLabel.trim();
                const key = slugify(label);
                if (!label || !key) return;
                onAddGroup({ key, label, options: [] });
                setNewLabel('');
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Add group
            </Button>
          </div>
        }
      >
        {filters.groups.length === 0 ? (
          <p className="text-sm text-ink-500">
            No filter groups yet. Add one above to start showing filters on the storefront.
          </p>
        ) : (
          <ul className="space-y-3">
            {filters.groups.map((g) => (
              <FilterGroupEditor
                key={g.key}
                group={g}
                onLabelChange={(label) => onUpdateGroup(g.key, { label })}
                notify={notify}
                onRemove={() => {
                  if (confirm(`Remove the "${g.label}" filter from every collection?`)) {
                    onRemoveGroup(g.key);
                  }
                }}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Per-collection overrides"
        desc="Hide or show specific filter groups on individual collection pages."
      >
        <ul className="space-y-3">
          {allSlugs.map((slug) => {
            const override = filters.perCollection[slug];
            const effective = override ?? filters.defaultGroupKeys;
            const using = override === undefined ? 'default' : 'override';
            return (
              <li
                key={slug}
                className="rounded-md border border-ink-100 bg-ink-25 p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-ink-700">/{slug}</span>
                    <Badge tone={using === 'default' ? 'neutral' : 'info'}>
                      {using === 'default' ? 'Uses default' : 'Custom'}
                    </Badge>
                  </div>
                  {using === 'override' && (
                    <button
                      type="button"
                      onClick={() => onClearOverride(slug)}
                      className="text-xs text-ink-600 hover:text-ink-900 inline-flex items-center gap-1"
                    >
                      <RotateCcw className="h-3 w-3" /> Reset to default
                    </button>
                  )}
                </div>
                <FilterGroupCheckboxes
                  allGroups={filters.groups}
                  enabled={effective}
                  onChange={(keys) => onSetForCollection(slug, keys)}
                />
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}

function FilterGroupEditor({
  group,
  onLabelChange,
  onRemove,
  notify,
}: {
  group: { key: string; label: string; options: string[] };
  onLabelChange: (label: string) => void;
  onRemove: () => void;
  notify: () => void;
}): JSX.Element {
  const dispatch = useAppDispatch();
  const [newOption, setNewOption] = useState('');
  return (
    <li className="rounded-md border border-ink-100 bg-ink-25 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Input
          value={group.label}
          onChange={(e) => onLabelChange(e.target.value)}
          className="h-8 flex-1"
        />
        <span className="font-mono text-[11px] text-ink-500 px-2">key: {group.key}</span>
        <button
          type="button"
          onClick={onRemove}
          className="h-8 w-8 inline-flex items-center justify-center rounded text-ink-500 hover:text-rose-700 hover:bg-rose-50"
          aria-label={`Remove ${group.label}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div>
        <p className="text-[11px] text-ink-500 mb-1">Options</p>
        {group.options.length === 0 && (
          <p className="text-xs text-ink-500 italic mb-2">No options yet.</p>
        )}
        <ul className="flex flex-wrap gap-1.5 mb-2">
          {group.options.map((opt) => (
            <li
              key={opt}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-ink-0 border border-ink-200 text-xs text-ink-700"
            >
              <span>{opt}</span>
              <button
                type="button"
                onClick={() => {
                  // Dispatch the dedicated reducer directly. The old path
                  // routed through onOptionsChange → updateFilterGroup with
                  // an Object.assign merge that occasionally no-op'd on the
                  // Vercel production bundle; the dedicated splice is Immer-
                  // safe and always re-renders.
                  dispatch(removeFilterOption({ key: group.key, option: opt }));
                  notify();
                }}
                className="text-ink-400 hover:text-rose-700"
                aria-label={`Remove ${opt}`}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <Input
            value={newOption}
            onChange={(e) => setNewOption(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newOption.trim()) {
                e.preventDefault();
                dispatch(addFilterOption({ key: group.key, option: newOption.trim() }));
                notify();
                setNewOption('');
              }
            }}
            placeholder="Add option (Enter to confirm)"
            className="h-8 flex-1"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={!newOption.trim()}
            onClick={() => {
              const v = newOption.trim();
              if (!v) return;
              dispatch(addFilterOption({ key: group.key, option: v }));
              notify();
              setNewOption('');
            }}
          >
            Add
          </Button>
        </div>
      </div>
    </li>
  );
}

function FilterGroupCheckboxes({
  allGroups,
  enabled,
  onChange,
}: {
  allGroups: Array<{ key: string; label: string }>;
  enabled: string[];
  onChange: (keys: string[]) => void;
}): JSX.Element {
  if (allGroups.length === 0) {
    return <p className="text-xs text-ink-500">No groups to choose from yet.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {allGroups.map((g) => {
        const isOn = enabled.includes(g.key);
        return (
          <button
            key={g.key}
            type="button"
            onClick={() =>
              onChange(isOn ? enabled.filter((k) => k !== g.key) : [...enabled, g.key])
            }
            className={cn(
              'inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs transition-colors',
              isOn
                ? 'border-brand-400 bg-brand-50 text-brand-800'
                : 'border-ink-200 bg-ink-0 text-ink-700 hover:border-ink-300',
            )}
            aria-pressed={isOn}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                isOn ? 'bg-brand-500' : 'bg-ink-300',
              )}
              aria-hidden
            />
            {g.label}
          </button>
        );
      })}
    </div>
  );
}

const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>): JSX.Element => (
  <textarea
    {...props}
    rows={props.rows ?? 2}
    className={
      'w-full rounded-md border border-ink-200 bg-ink-0 px-3 py-2 text-sm text-ink-800 placeholder:text-ink-400 ' +
      'focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20 resize-y ' +
      (props.className ?? '')
    }
  />
);

/* ─────────────────────────────────────────────────────────────────────────
 * Phase-1 CMS editors for the new homepage sections. JSON-textarea based —
 * pragmatic; gives the client full control without 12 bespoke forms. A
 * Phase-2 pass can replace each section with a proper repeater UI.
 * ────────────────────────────────────────────────────────────────────── */


// Generic per-item form editor for arrays of objects in the CMS. Replaces
// the old "paste JSON, click Apply" textareas which were error-prone (one
// missing comma broke the whole save). Each section now declares a fields
// schema; the editor renders the right input per field type and handles
// add / remove / reorder. Saves on every keystroke through onChange so the
// existing notify() → publish path keeps working without an explicit Apply
// button per row.
type FieldType = 'text' | 'textarea' | 'url' | 'image' | 'number' | 'select';
interface FieldDef<T> {
  key: keyof T & string;
  label: string;
  type: FieldType;
  placeholder?: string;
  /** Required for 'select'. */
  options?: ReadonlyArray<string>;
  /** Rough relative width in the row (1..3). Defaults to 1. */
  span?: 1 | 2 | 3;
}

function ImageFieldCell({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
}): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  return (
    <>
      <div className="flex gap-1 mt-1">
        <Input
          value={value}
          placeholder={placeholder ?? 'https://...'}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-xs font-mono"
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0 h-8 px-2 inline-flex items-center justify-center rounded-md border border-ink-200 bg-ink-0 text-ink-600 hover:bg-ink-50 hover:text-ink-900 disabled:opacity-50"
          title="Upload image to Cloudinary"
        >
          {uploading ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <CloudUpload className="h-3.5 w-3.5" />
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 5_000 * 1024) {
              toast.error('Image must be under 5 MB');
              e.target.value = '';
              return;
            }
            setUploading(true);
            try {
              const result = await uploadImageToCloudinary(file, {
                folder: 'zelora/website',
              });
              onChange(result.secureUrl);
              toast.success('Image uploaded');
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Upload failed');
            } finally {
              setUploading(false);
              e.target.value = '';
            }
          }}
        />
      </div>
      {value ? (
        <img
          src={value}
          alt=""
          className="mt-1 max-h-20 rounded-md border border-ink-100 object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : null}
    </>
  );
}

// Swap an array element with its neighbour (dir -1 = up, +1 = down). Returns a
// new array; out-of-range moves are a no-op. Backs the CMS reorder buttons.
function moveInArray<T>(arr: readonly T[], index: number, dir: -1 | 1): T[] {
  const next = arr.slice();
  const target = index + dir;
  if (target < 0 || target >= next.length) return next;
  const tmp = next[index]!;
  next[index] = next[target]!;
  next[target] = tmp;
  return next;
}

function ListItemEditor<T extends Record<string, unknown>>({
  items,
  fields,
  newItem,
  onChange,
  itemLabel,
  max,
}: {
  items: readonly T[];
  fields: ReadonlyArray<FieldDef<T>>;
  newItem: () => T;
  onChange: (next: T[]) => void;
  /** Function returning a short label for the row header — usually the title field. */
  itemLabel?: (item: T, index: number) => string;
  max?: number;
}): JSX.Element {
  function patchItem(idx: number, key: keyof T, value: unknown): void {
    // Cast through unknown: callers know the value-type match (select →
    // literal union, number → number, text → string). TS can't track this
    // narrowing through the generic, so we widen at the assignment line.
    const next = items.map((it, i) =>
      i === idx ? (({ ...it, [key]: value }) as unknown as T) : it,
    );
    onChange(next as T[]);
  }
  function removeAt(idx: number): void {
    onChange(items.filter((_, i) => i !== idx) as T[]);
  }
  function addNew(): void {
    if (max && items.length >= max) return;
    onChange([...items, newItem()] as T[]);
  }
  function move(idx: number, delta: -1 | 1): void {
    const target = idx + delta;
    if (target < 0 || target >= items.length) return;
    const next = items.slice() as T[];
    const tmp = next[idx];
    next[idx] = next[target] as T;
    next[target] = tmp as T;
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="text-xs text-ink-500 italic">
          No entries yet — click <strong>+ Add</strong> to create one.
        </p>
      )}
      {items.map((it, idx) => (
        <div
          key={idx}
          className="rounded-md border border-ink-100 bg-ink-25 p-3 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-wider text-ink-500">
              {itemLabel ? itemLabel(it, idx) : `Item ${idx + 1}`}
            </p>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                className="h-7 w-7 inline-flex items-center justify-center rounded text-ink-500 hover:text-ink-900 hover:bg-ink-100 disabled:opacity-30"
                aria-label="Move up"
                title="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(idx, 1)}
                disabled={idx === items.length - 1}
                className="h-7 w-7 inline-flex items-center justify-center rounded text-ink-500 hover:text-ink-900 hover:bg-ink-100 disabled:opacity-30"
                aria-label="Move down"
                title="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="h-7 w-7 inline-flex items-center justify-center rounded text-ink-500 hover:text-danger-700 hover:bg-danger-50"
                aria-label="Remove"
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
            {fields.map((f) => (
              <div
                key={f.key}
                className={cn(
                  f.span === 3 && 'sm:col-span-6',
                  f.span === 2 && 'sm:col-span-3',
                  (!f.span || f.span === 1) && 'sm:col-span-2',
                  f.type === 'textarea' && 'sm:col-span-6',
                )}
              >
                <Label className="text-[11px] text-ink-600">{f.label}</Label>
                {f.type === 'textarea' ? (
                  <textarea
                    value={String((it[f.key] ?? '') as string)}
                    placeholder={f.placeholder}
                    rows={3}
                    onChange={(e) => patchItem(idx, f.key, e.target.value)}
                    className="w-full mt-1 rounded-md border border-ink-200 px-2 py-1.5 text-xs bg-ink-0 focus:outline-none focus:ring-1 focus:ring-brand-500/40 focus:border-brand-500"
                  />
                ) : f.type === 'select' ? (
                  <select
                    value={String((it[f.key] ?? '') as string)}
                    onChange={(e) => patchItem(idx, f.key, e.target.value)}
                    className="w-full h-8 mt-1 rounded-md border border-ink-200 px-2 text-xs bg-ink-0 focus:outline-none focus:border-brand-500"
                  >
                    {(f.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : f.type === 'number' ? (
                  <Input
                    type="number"
                    value={Number((it[f.key] ?? 0) as number)}
                    placeholder={f.placeholder}
                    onChange={(e) =>
                      patchItem(idx, f.key, Number(e.target.value) || 0)
                    }
                    className="h-8 mt-1 text-xs"
                  />
                ) : f.type === 'image' ? (
                  <ImageFieldCell
                    value={String((it[f.key] ?? '') as string)}
                    placeholder={f.placeholder}
                    onChange={(url) => patchItem(idx, f.key, url)}
                  />
                ) : (
                  <Input
                    value={String((it[f.key] ?? '') as string)}
                    placeholder={f.placeholder}
                    onChange={(e) => patchItem(idx, f.key, e.target.value)}
                    className={cn(
                      'h-8 mt-1 text-xs',
                      f.type === 'url' && 'font-mono',
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={addNew}
          disabled={max !== undefined && items.length >= max}
        >
          <Plus className="h-4 w-4" /> Add
        </Button>
        {max !== undefined && (
          <p className="text-xs text-ink-500">
            {items.length} / {max}
          </p>
        )}
      </div>
    </div>
  );
}

// Lightweight chip-style editor for string[] (e.g. press logos). Mirrors the
// filter-option chips elsewhere in this file.
function StringListEditor({
  items,
  onChange,
  placeholder,
  max,
}: {
  items: readonly string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
}): JSX.Element {
  const [draft, setDraft] = useState('');
  function add(): void {
    const v = draft.trim();
    if (!v) return;
    if (max !== undefined && items.length >= max) return;
    if (items.includes(v)) return;
    onChange([...items, v]);
    setDraft('');
  }
  function removeAt(idx: number): void {
    onChange(items.filter((_, i) => i !== idx));
  }
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-1.5">
        {items.length === 0 && (
          <p className="text-xs text-ink-500 italic">No entries yet.</p>
        )}
        {items.map((opt, idx) => (
          <li
            key={opt + idx}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-ink-25 border border-ink-200 text-xs text-ink-700"
          >
            <span>{opt}</span>
            <button
              type="button"
              onClick={() => removeAt(idx)}
              className="text-ink-400 hover:text-danger-700"
              aria-label={`Remove ${opt}`}
            >
              <X className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder ?? 'Add entry (Enter to confirm)'}
          className="h-8 flex-1"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!draft.trim() || (max !== undefined && items.length >= max)}
          onClick={add}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

// Searchable product picker for a homepage showcase (18K Gold Tone, 9 KT Fine
// Gold, Silver). Stores an ordered list of product slugs; the storefront
// resolves them live so price / stock stay current. `candidates` is the set of
// published products eligible for this showcase (already filtered to the
// section's category). An empty selection means the storefront auto-fills the
// showcase from that category — so curating is optional.
function ProductPickerEditor({
  slugs,
  candidates,
  onChange,
  max = 8,
  loading,
}: {
  slugs: readonly string[];
  candidates: PublicProduct[];
  onChange: (next: string[]) => void;
  max?: number;
  loading?: boolean;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const bySlug = new Map(candidates.map((p) => [p.slug, p]));
  const selectedSet = new Set(slugs);
  const q = query.trim().toLowerCase();
  const matches = q
    ? candidates
        .filter((p) => !selectedSet.has(p.slug))
        .filter((p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q))
        .slice(0, 8)
    : [];
  const atMax = slugs.length >= max;

  function add(slug: string): void {
    if (atMax || selectedSet.has(slug)) return;
    onChange([...slugs, slug]);
    setQuery('');
  }
  function removeAt(idx: number): void {
    onChange(slugs.filter((_, i) => i !== idx));
  }
  function move(idx: number, delta: -1 | 1): void {
    const target = idx + delta;
    if (target < 0 || target >= slugs.length) return;
    const next = slugs.slice();
    const tmp = next[idx] as string;
    next[idx] = next[target] as string;
    next[target] = tmp;
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {slugs.length === 0 ? (
        <p className="text-xs text-ink-500 italic">
          No products picked — the showcase auto-fills from this category. Search below to curate it.
        </p>
      ) : (
        <ul className="space-y-2">
          {slugs.map((slug, idx) => {
            const p = bySlug.get(slug);
            return (
              <li
                key={slug + idx}
                className="flex items-center gap-3 rounded-md border border-ink-100 bg-ink-25 p-2"
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-ink-100">
                  {p?.images?.[0] && (
                    <img src={p.images[0]} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink-900">{p?.name ?? slug}</p>
                  <p className="truncate text-[11px] text-ink-500">
                    {p ? slug : `${slug} — not found (unpublished or removed)`}
                  </p>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="h-7 w-7 inline-flex items-center justify-center rounded text-ink-500 hover:text-ink-900 hover:bg-ink-100 disabled:opacity-30"
                    aria-label="Move up"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, 1)}
                    disabled={idx === slugs.length - 1}
                    className="h-7 w-7 inline-flex items-center justify-center rounded text-ink-500 hover:text-ink-900 hover:bg-ink-100 disabled:opacity-30"
                    aria-label="Move down"
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAt(idx)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded text-ink-500 hover:text-danger-700 hover:bg-danger-50"
                    aria-label="Remove"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="relative">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={atMax ? `Max ${max} reached — remove one to add more` : 'Search products to add…'}
          disabled={atMax}
          className="h-9"
        />
        {q && matches.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-ink-200 bg-ink-0 shadow-lg">
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => add(p.slug)}
                  className="flex w-full items-center gap-3 px-2 py-1.5 text-left hover:bg-ink-25"
                >
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-ink-100">
                    {p.images?.[0] && (
                      <img src={p.images[0]} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink-900">{p.name}</p>
                    <p className="truncate text-[11px] text-ink-500">{p.slug}</p>
                  </div>
                  <Plus className="h-4 w-4 text-ink-400 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {q && matches.length === 0 && (
          <p className="mt-1 text-[11px] text-ink-500">
            {loading
              ? 'Loading products…'
              : candidates.length === 0
                ? 'No published products in this category yet.'
                : 'No matches.'}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-ink-500">
          Empty = auto-fill from the category · {candidates.length} eligible
        </p>
        <p className="text-xs text-ink-500">
          {slugs.length} / {max}
        </p>
      </div>
    </div>
  );
}

// -- Field schemas per section --
const HERO_SLIDE_FIELDS = [
  { key: 'image', label: 'Banner image', type: 'image', span: 3 },
  { key: 'headline', label: 'Headline (optional overlay)', type: 'text', span: 3 },
  { key: 'ctaLabel', label: 'Button label', type: 'text', placeholder: 'Shop Now', span: 2 },
  { key: 'ctaHref', label: 'Button link', type: 'url', placeholder: '/store/collections/bridal', span: 2 },
] as const;

const BROWSE_CATEGORY_FIELDS = [
  { key: 'label', label: 'Tile label', type: 'text', span: 2 },
  { key: 'slug', label: 'Collection slug', type: 'text', placeholder: 'rings', span: 2 },
  { key: 'img', label: 'Image URL', type: 'image', span: 3 },
] as const;

const REEL_FIELDS = [
  { key: 'handle', label: '@handle', type: 'text', placeholder: '@priya.bridal', span: 2 },
  { key: 'slug', label: 'Collection slug', type: 'text', placeholder: 'bridal', span: 2 },
  { key: 'caption', label: 'Caption', type: 'text', span: 3 },
  { key: 'poster', label: 'Poster image URL', type: 'image', span: 3 },
] as const;

const TESTIMONIAL_FIELDS = [
  { key: 'author', label: 'Author', type: 'text', span: 2 },
  { key: 'city', label: 'City', type: 'text', span: 1 },
  { key: 'occasion', label: 'Occasion', type: 'text', span: 1 },
  { key: 'quote', label: 'Quote', type: 'textarea', span: 3 },
] as const;

const DOOR_CARD_FIELDS = [
  { key: 'eyebrow', label: 'Eyebrow', type: 'text', span: 2 },
  { key: 'title', label: 'Title', type: 'text', span: 2 },
  { key: 'href', label: 'Link', type: 'url', span: 2 },
  { key: 'body', label: 'Body', type: 'textarea', span: 3 },
  { key: 'img', label: 'Image URL', type: 'image', span: 3 },
] as const;

const LOOKBOOK_FIELDS = [
  { key: 'img', label: 'Image URL', type: 'image', span: 3 },
  { key: 'eyebrow', label: 'Eyebrow', type: 'text', placeholder: 'Lookbook · Autumn', span: 2 },
  { key: 'title', label: 'Title', type: 'text', span: 2 },
  { key: 'href', label: 'Link', type: 'url', placeholder: '/store/collections/bridal', span: 2 },
  { key: 'ctaLabel', label: 'Button (1st card only)', type: 'text', placeholder: 'Read the story', span: 2 },
  { key: 'body', label: 'Body (1st card only)', type: 'textarea', span: 3 },
] as const;

const BLOG_FIELDS = [
  { key: 'image', label: 'Cover image', type: 'image', span: 3 },
  { key: 'title', label: 'Title', type: 'text', span: 3 },
  { key: 'slug', label: 'URL slug', type: 'text', placeholder: 'how-to-read-a-hallmark', span: 2 },
  { key: 'date', label: 'Date (YYYY-MM-DD)', type: 'text', placeholder: '2026-03-03', span: 1 },
  { key: 'author', label: 'Author', type: 'text', placeholder: 'The Zelora Studio', span: 2 },
  { key: 'excerpt', label: 'Excerpt (card summary)', type: 'textarea', span: 3 },
  { key: 'body', label: 'Article body (blank line = new paragraph)', type: 'textarea', span: 3 },
] as const;

const TRUST_BADGE_FIELDS = [
  {
    key: 'icon',
    label: 'Icon',
    type: 'select',
    options: ['shield', 'sparkles', 'award'],
    span: 1,
  },
  { key: 'title', label: 'Title', type: 'text', span: 2 },
  { key: 'body', label: 'Body', type: 'textarea', span: 3 },
] as const;

const FOOTER_LINK_FIELDS = [
  { key: 'label', label: 'Label', type: 'text', span: 2 },
  { key: 'href', label: 'Link', type: 'url', span: 3 },
] as const;

// Per-section list of label keys → friendly field labels, used by
// SectionLabelsTab. Grouped so editors can update one storefront strip at
// a time without scrolling through 30 unlabeled inputs.
type SectionLabelKey = keyof NonNullable<StorefrontContent['sectionLabels']>;
const SECTION_LABEL_GROUPS: Array<{
  title: string;
  fields: Array<{ key: SectionLabelKey; label: string; type?: 'text' | 'textarea' }>;
}> = [
  // Ordered top-to-bottom to match how the sections actually appear on the
  // storefront homepage, so editors can scan the CMS in the same order they
  // see the live site: Browse by category → Season Sales → Shop by occasion →
  // Watch & wear reels → Customer reviews → Visit our showrooms → Newsletter.
  {
    title: 'Browse by category',
    fields: [
      { key: 'categoriesEyebrow', label: 'Eyebrow' },
      { key: 'categoriesTitle', label: 'Title' },
      { key: 'categoriesSub', label: 'Sub-copy', type: 'textarea' },
    ],
  },
  {
    title: 'Season Sales',
    fields: [
      { key: 'seasonSaleEyebrow', label: 'Eyebrow' },
      { key: 'seasonSaleTitle', label: 'Title' },
      { key: 'seasonSaleSub', label: 'Sub-copy', type: 'textarea' },
      { key: 'seasonSaleCtaLabel', label: '"View all" button label' },
    ],
  },
  {
    title: 'Shop by occasion',
    fields: [
      { key: 'occasionEyebrow', label: 'Eyebrow' },
      { key: 'occasionTitle', label: 'Title' },
      { key: 'occasionSub', label: 'Sub-copy', type: 'textarea' },
    ],
  },
  {
    title: 'Watch & wear reels',
    fields: [
      { key: 'reelsEyebrow', label: 'Eyebrow' },
      { key: 'reelsTitle', label: 'Title' },
      { key: 'reelsSub', label: 'Sub-copy', type: 'textarea' },
    ],
  },
  {
    title: 'Customer reviews',
    fields: [
      { key: 'reviewsEyebrow', label: 'Eyebrow' },
      { key: 'reviewsTitle', label: 'Title' },
      { key: 'reviewsSub', label: 'Sub-copy', type: 'textarea' },
    ],
  },
  {
    title: 'Visit our showrooms',
    fields: [
      { key: 'visitEyebrow', label: 'Eyebrow' },
      { key: 'visitTitle', label: 'Title' },
      { key: 'visitSub', label: 'Sub-copy', type: 'textarea' },
      { key: 'visitCtaLabel', label: 'CTA label' },
      { key: 'visitCtaHref', label: 'CTA link' },
    ],
  },
  {
    title: 'Newsletter',
    fields: [
      { key: 'newsletterEyebrow', label: 'Eyebrow' },
      { key: 'newsletterTitle', label: 'Title' },
      { key: 'newsletterSub', label: 'Sub-copy', type: 'textarea' },
    ],
  },
  // Legacy strips — kept editable for older layouts but no longer rendered on
  // the current homepage, so they sit at the end rather than mid-flow.
  {
    title: 'Deals of the week',
    fields: [
      { key: 'dealsEyebrow', label: 'Eyebrow' },
      { key: 'dealsTitle', label: 'Title' },
      { key: 'dealsSub', label: 'Sub-copy', type: 'textarea' },
      { key: 'dealsCtaLabel', label: 'CTA label' },
      { key: 'dealsCtaHref', label: 'CTA link' },
    ],
  },
  {
    title: 'Trust band',
    fields: [
      { key: 'trustEyebrow', label: 'Eyebrow' },
    ],
  },
];

function SectionLabelsTab({
  labels,
  onPatch,
}: {
  labels: NonNullable<StorefrontContent['sectionLabels']>;
  onPatch: (next: NonNullable<StorefrontContent['sectionLabels']>) => void;
}): JSX.Element {
  function set(key: SectionLabelKey, value: string): void {
    onPatch({ ...labels, [key]: value });
  }
  return (
    <div className="space-y-4">
      {SECTION_LABEL_GROUPS.map((group) => (
        <Card
          key={group.title}
          title={group.title}
          desc="Headline strip shown above this section on the homepage."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {group.fields.map((f) => (
              <div
                key={f.key}
                className={cn(f.type === 'textarea' && 'sm:col-span-2')}
              >
                <Label className="text-xs text-ink-600">{f.label}</Label>
                {f.type === 'textarea' ? (
                  <textarea
                    value={String(labels[f.key] ?? '')}
                    rows={2}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="w-full mt-1 rounded-md border border-ink-200 px-2 py-1.5 text-xs bg-ink-0 focus:outline-none focus:ring-1 focus:ring-brand-500/40 focus:border-brand-500"
                  />
                ) : (
                  <Input
                    value={String(labels[f.key] ?? '')}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="h-8 mt-1"
                  />
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function HomepageSectionsTab({
  content,
  onPatch,
}: {
  content: StorefrontContent;
  onPatch: (patch: Partial<StorefrontContent>) => void;
}): JSX.Element {
  // Live published products + categories, used to power the showcase product
  // pickers below. `candidatesFor` resolves a main category slug to its
  // products (the category + its sub-categories) so each picker only offers
  // pieces that belong on that showcase.
  const { data: allProducts = [], isLoading: productsLoading } = useGetPublicProductsQuery();
  const { data: allCategories = [] } = useGetPublicCollectionsQuery();
  const candidatesFor = (mainSlug: string): PublicProduct[] => {
    const main = allCategories.find((c) => c.slug === mainSlug);
    if (!main) return [];
    const ids = new Set<string>([
      main.id,
      ...allCategories.filter((c) => c.parentId === main.id).map((c) => c.id),
    ]);
    return allProducts.filter((p) => ids.has(p.categoryId));
  };

  return (
    <div className="space-y-6">
      {/* Hero video moved to the Hero tab so it lives next to the title /
          subtitle / poster image. Avoids editors hunting through two tabs
          to update what reads as one section on the live site. */}

      {/* Curated product showcases — the three category grids on the homepage.
          Pick specific pieces (drag to reorder); leave empty to auto-fill from
          the category. The storefront prices/stock these live. */}
      <Card
        title="18K Gold Tone showcase (Top Styles)"
        desc="Products shown in the homepage 18K Gold Tone grid. Empty = auto-fill from the 18k-gold-tone category. Up to 8 (a 4×2 grid)."
      >
        <ProductPickerEditor
          slugs={content.goldToneFeatured ?? []}
          candidates={candidatesFor('18k-gold-tone')}
          onChange={(v) => onPatch({ goldToneFeatured: v })}
          loading={productsLoading}
          max={8}
        />
      </Card>

      <Card
        title="9 KT Fine Gold showcase"
        desc="Products shown in the homepage 9 KT Fine Gold grid. Empty = auto-fill from the 9-k-fine-gold category. Up to 8 (a 4×2 grid)."
      >
        <ProductPickerEditor
          slugs={content.nineKtFeatured ?? []}
          candidates={candidatesFor('9-k-fine-gold')}
          onChange={(v) => onPatch({ nineKtFeatured: v })}
          loading={productsLoading}
          max={8}
        />
      </Card>

      <Card
        title="Fine Silver showcase"
        desc="Products shown in the homepage Fine Silver grid. Empty = auto-fill from the 925-sterling-silver category. Up to 8 (a 4×2 grid)."
      >
        <ProductPickerEditor
          slugs={content.silverFeatured ?? []}
          candidates={candidatesFor('925-sterling-silver')}
          onChange={(v) => onPatch({ silverFeatured: v })}
          loading={productsLoading}
          max={8}
        />
      </Card>

      <Card title="Browse by category (circular marquee)" desc="Each tile: label, slug, image URL. 6–12 tiles recommended.">
        <ListItemEditor
          items={content.browseCategories ?? []}
          fields={BROWSE_CATEGORY_FIELDS as ReadonlyArray<FieldDef<{ label: string; slug: string; img: string }>>}
          newItem={() => ({ label: '', slug: '', img: '' })}
          onChange={(v) => onPatch({ browseCategories: v })}
          itemLabel={(it) => it.label || it.slug || 'New tile'}
          max={24}
        />
      </Card>

      <Card title="Watch & wear reels" desc="Up to 12 vertical 9:16 reel tiles. Each: @handle, caption, poster image, collection slug.">
        <ListItemEditor
          items={content.reels ?? []}
          fields={REEL_FIELDS as ReadonlyArray<FieldDef<{ handle: string; caption: string; poster: string; slug: string }>>}
          newItem={() => ({ handle: '', caption: '', poster: '', slug: '' })}
          onChange={(v) => onPatch({ reels: v })}
          itemLabel={(it) => it.handle || it.caption?.slice(0, 24) || 'New reel'}
          max={12}
        />
      </Card>

      {/* Customer reviews rows moved to the Testimonial tab — same data, but
          editing reviews next to the testimonial quote is more discoverable. */}

      <Card title="Press logos (under the reviews)" desc="Magazine / newspaper names — appear as a logo strip.">
        <StringListEditor
          items={content.pressLogos ?? []}
          onChange={(v) => onPatch({ pressLogos: v })}
          placeholder="Vogue India, Femina, …"
          max={10}
        />
      </Card>

      <Card title="Doors-opening promo cards (2)" desc="Each: eyebrow, title, body, link, image URL.">
        <ListItemEditor
          items={content.doorCards ?? []}
          fields={DOOR_CARD_FIELDS as ReadonlyArray<FieldDef<{ eyebrow: string; title: string; body: string; href: string; img: string }>>}
          newItem={() => ({ eyebrow: '', title: '', body: '', href: '', img: '' })}
          onChange={(v) => onPatch({ doorCards: v })}
          itemLabel={(it) => it.title || 'New card'}
          max={2}
        />
      </Card>

      <Card title="Featured lookbook (1 big + 2 cards)" desc="The editorial banner below Deals of the Week. The first card renders large with its body + button; the next two are compact image tiles. Each links to a collection. Use ↑/↓ to reorder.">
        <ListItemEditor
          items={content.lookbookCards ?? []}
          fields={LOOKBOOK_FIELDS as ReadonlyArray<FieldDef<{ eyebrow: string; title: string; body: string; ctaLabel: string; href: string; img: string }>>}
          newItem={() => ({ eyebrow: '', title: '', body: '', ctaLabel: '', href: '/store/collections', img: '' })}
          onChange={(v) => onPatch({ lookbookCards: v })}
          itemLabel={(it) => it.title || 'New card'}
          max={3}
        />
      </Card>

      <Card title="Trust badges (3)" desc="Each badge: icon, title, body.">
        <ListItemEditor
          items={content.trustBadges ?? []}
          fields={TRUST_BADGE_FIELDS as ReadonlyArray<FieldDef<{ icon: 'shield' | 'sparkles' | 'award'; title: string; body: string }>>}
          newItem={() => ({ icon: 'shield' as const, title: '', body: '' })}
          onChange={(v) => onPatch({ trustBadges: v })}
          itemLabel={(it) => it.title || 'New badge'}
          max={6}
        />
      </Card>

      <Card title="Blog / Journal posts" desc="The 'From the journal' section near the bottom of the homepage shows the first 4 posts; the rest appear on the /store/blog page. Each post opens its own detail page at /store/blog/{slug}. Use ↑/↓ to reorder. Body: leave a blank line between paragraphs.">
        <ListItemEditor
          items={content.blogs ?? []}
          fields={BLOG_FIELDS as ReadonlyArray<FieldDef<{ slug: string; title: string; date: string; excerpt: string; image: string; body: string; author: string }>>}
          newItem={() => ({ slug: '', title: '', date: '', excerpt: '', image: '', body: '', author: '' })}
          onChange={(v) => onPatch({ blogs: v })}
          itemLabel={(it) => it.title || 'New post'}
          max={24}
        />
      </Card>
    </div>
  );
}

function FooterSectionsTab({
  content,
  onPatch,
}: {
  content: StorefrontContent;
  onPatch: (patch: Partial<StorefrontContent>) => void;
}): JSX.Element {
  return (
    <div className="space-y-6">
      <Card title="Footer brand block" desc="The footer's left column — brand name, tagline, address, phone and email. Name & tagline are shared with the Brand tab; address & phone fall back to your first store when left blank.">
        <div className="space-y-3">
          <Field label="Brand name">
            <Input
              value={content.brand.name}
              onChange={(e) => onPatch({ brand: { ...content.brand, name: e.target.value } })}
            />
          </Field>
          <Field label="Tagline">
            <Textarea
              rows={2}
              value={content.brand.tagline}
              placeholder="Family jewellers since 1972. Hallmarked gold. Transparent pricing."
              onChange={(e) => onPatch({ brand: { ...content.brand, tagline: e.target.value } })}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Address" hint="Blank = use your first store's address.">
              <Input
                value={content.footerAddress}
                placeholder="PANIPAT, HARYANA"
                onChange={(e) => onPatch({ footerAddress: e.target.value })}
              />
            </Field>
            <Field label="Phone" hint="Blank = use your first store's phone.">
              <Input
                value={content.footerPhone}
                placeholder="9996444442"
                onChange={(e) => onPatch({ footerPhone: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Email">
            <Input
              value={content.footerEmail}
              placeholder="hello@yourjewellers.in"
              onChange={(e) => onPatch({ footerEmail: e.target.value })}
            />
          </Field>
        </div>
      </Card>

      <Card title="Copyright line" desc="Text shown after the © year and brand name. Use for hallmark numbers, GSTIN etc.">
        <Field label="Copyright text">
          <Input
            value={content.copyrightLine}
            placeholder="BIS Hallmark #IND-916 · GSTIN 27ABCDE1234F1Z5"
            onChange={(e) => onPatch({ copyrightLine: e.target.value })}
          />
        </Field>
      </Card>

      <Card title="Footer — Shop column" desc="Each link: label and href.">
        <ListItemEditor
          items={content.footerShop ?? []}
          fields={FOOTER_LINK_FIELDS as ReadonlyArray<FieldDef<{ label: string; href: string }>>}
          newItem={() => ({ label: '', href: '' })}
          onChange={(v) => onPatch({ footerShop: v })}
          itemLabel={(it) => it.label || 'New link'}
          max={10}
        />
      </Card>

      <Card title="Footer — Visit column" desc="Each link: label and href.">
        <ListItemEditor
          items={content.footerVisit ?? []}
          fields={FOOTER_LINK_FIELDS as ReadonlyArray<FieldDef<{ label: string; href: string }>>}
          newItem={() => ({ label: '', href: '' })}
          onChange={(v) => onPatch({ footerVisit: v })}
          itemLabel={(it) => it.label || 'New link'}
          max={10}
        />
      </Card>

      <Card title="Footer — Help column" desc="Each link: label and href.">
        <ListItemEditor
          items={content.footerHelp ?? []}
          fields={FOOTER_LINK_FIELDS as ReadonlyArray<FieldDef<{ label: string; href: string }>>}
          newItem={() => ({ label: '', href: '' })}
          onChange={(v) => onPatch({ footerHelp: v })}
          itemLabel={(it) => it.label || 'New link'}
          max={10}
        />
      </Card>
    </div>
  );
}

// ─── Loyalty Config Tab ────────────────────────────────────────────────────────

function LoyaltyConfigTab(): JSX.Element {
  const { data, isLoading } = useGetLoyaltyConfigQuery();
  const [save, { isLoading: saving }] = useUpdateLoyaltyConfigMutation();
  const [fields, setFields] = useState({
    loyaltyEarnRatePaise: 10000,
    loyaltyPointValuePaise: 1,
    loyaltyMinRedeemPoints: 500,
    loyaltyMaxRedeemPct: 20,
    loyaltyExpiryDays: 365,
  });

  useEffect(() => {
    if (data) setFields(data);
  }, [data]);

  const patch = <K extends keyof typeof fields>(key: K, val: number): void =>
    setFields((prev) => ({ ...prev, [key]: val }));

  const handleSave = async (): Promise<void> => {
    try {
      await save(fields).unwrap();
      toast.success('Loyalty settings saved');
    } catch { toast.error('Failed to save loyalty settings'); }
  };

  if (isLoading) return <div className="py-8 text-center text-ink-400 text-sm">Loading…</div>;

  const earnRateRs = fields.loyaltyEarnRatePaise / 100;
  const pointValuePaise = fields.loyaltyPointValuePaise;

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h3 className="text-base font-medium text-ink-900">Loyalty programme settings</h3>
        <p className="text-sm text-ink-500 mt-1">
          Control how customers earn and redeem loyalty points on your storefront.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-ink-200 p-5">
        <div>
          <Label>Earn rate (₹ per 1 point)</Label>
          <p className="text-xs text-ink-400 mb-1.5">Customer earns 1 point for every ₹{earnRateRs} spent</p>
          <Input
            type="number" min={100} max={1000000} step={100}
            value={earnRateRs}
            onChange={(e) => patch('loyaltyEarnRatePaise', Math.round(Number(e.target.value) * 100))}
          />
        </div>

        <div>
          <Label>Point value (paise per point)</Label>
          <p className="text-xs text-ink-400 mb-1.5">
            Currently: 1 point = {pointValuePaise} paise = ₹{(pointValuePaise / 100).toFixed(2)}.
            (100 points = ₹{pointValuePaise})
          </p>
          <Input
            type="number" min={1} max={1000}
            value={pointValuePaise}
            onChange={(e) => patch('loyaltyPointValuePaise', Number(e.target.value))}
          />
        </div>

        <div>
          <Label>Minimum points to redeem</Label>
          <p className="text-xs text-ink-400 mb-1.5">Customer needs at least this many points to redeem</p>
          <Input
            type="number" min={1} max={100000}
            value={fields.loyaltyMinRedeemPoints}
            onChange={(e) => patch('loyaltyMinRedeemPoints', Number(e.target.value))}
          />
        </div>

        <div>
          <Label>Maximum % of cart payable by points</Label>
          <p className="text-xs text-ink-400 mb-1.5">Points can cover at most this % of the subtotal</p>
          <Input
            type="number" min={1} max={100}
            value={fields.loyaltyMaxRedeemPct}
            onChange={(e) => patch('loyaltyMaxRedeemPct', Number(e.target.value))}
          />
        </div>

        <div>
          <Label>Points expiry (days of inactivity)</Label>
          <p className="text-xs text-ink-400 mb-1.5">Points expire after this many days without any transaction</p>
          <Input
            type="number" min={30} max={3650}
            value={fields.loyaltyExpiryDays}
            onChange={(e) => patch('loyaltyExpiryDays', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
        <strong>Example:</strong> With current settings, a customer spending ₹{earnRateRs.toLocaleString('en-IN')} earns 1 point (= {pointValuePaise} paise).
        Spending ₹{(earnRateRs * 100).toLocaleString('en-IN')} earns 100 points = ₹{pointValuePaise}.
      </div>

      <Button onClick={() => void handleSave()} disabled={saving}>
        {saving ? 'Saving…' : 'Save loyalty settings'}
      </Button>
    </div>
  );
}
