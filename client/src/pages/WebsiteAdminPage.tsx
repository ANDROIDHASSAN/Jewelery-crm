// Website admin — edits the public storefront content (hero, rates, collections, story, locations).
// Local edits flow through the Redux slice for instant feedback; clicking
// "Publish" PUTs the full content blob to /api/v1/storefront and invalidates
// the public storefront cache so visitors see the change.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Plus, Trash2, RotateCcw, CloudUpload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/PageHeader';
import { TabStrip, type TabStripItem } from '@/components/ui/TabStrip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  addCollection,
  addFilterGroup,
  addLocation,
  clearFiltersOverride,
  removeCollection,
  removeFilterGroup,
  removeLocation,
  resetContent,
  setContent,
  setDefaultFilterKeys,
  setFiltersForCollection,
  type StorefrontContent,
  updateBrand,
  updateCollection,
  updateFilterGroup,
  updateHero,
  updateLocation,
  updateRates,
  updateStory,
  updateTestimonial,
  updateWhatsapp,
} from '@/features/storefront/storefrontContentSlice';
import {
  useGetAdminStorefrontQuery,
  useUpdateStorefrontMutation,
} from '@/features/storefront/storefrontApi';

type TabKey =
  | 'brand'
  | 'hero'
  | 'rates'
  | 'collections'
  | 'story'
  | 'testimonial'
  | 'locations'
  | 'contact'
  | 'filters'
  | 'homepage'
  | 'labels'
  | 'footer';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'brand', label: 'Brand' },
  { key: 'hero', label: 'Hero' },
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
          )}

          {tab === 'hero' && (
            <Card title="Hero section" desc="The first impression on the home page.">
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
              <Field label="Hero image URL">
                <Input
                  value={content.hero.image}
                  onChange={(e) => dispatch(updateHero({ image: e.target.value }))}
                  onBlur={notify}
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
          )}

          {tab === 'rates' && (
            <Card title="Today's gold rates" desc="Shown in the announcement bar, hero strip, and PDP.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="22K">
                  <Input
                    value={content.rates.g22}
                    onChange={(e) => dispatch(updateRates({ g22: e.target.value }))}
                    onBlur={notify}
                  />
                </Field>
                <Field label="18K">
                  <Input
                    value={content.rates.g18}
                    onChange={(e) => dispatch(updateRates({ g18: e.target.value }))}
                    onBlur={notify}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Silver">
                  <Input
                    value={content.rates.silver}
                    onChange={(e) => dispatch(updateRates({ silver: e.target.value }))}
                    onBlur={notify}
                  />
                </Field>
                <Field label="Updated at" hint="Free text — e.g. '14 May, 11:02 AM IST'.">
                  <Input
                    value={content.rates.updatedAt}
                    onChange={(e) => dispatch(updateRates({ updatedAt: e.target.value }))}
                    onBlur={notify}
                  />
                </Field>
              </div>
              <p className="text-xs text-ink-500">
                In production these will be wired to the MCX worker (see <code className="text-ink-700">server/src/workers/gold-rate.ts</code>).
              </p>
            </Card>
          )}

          {tab === 'collections' && (
            <Card
              title="Collection tiles"
              desc="The four cards shown under 'Shop by occasion'."
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    dispatch(
                      addCollection({
                        slug: `new-${Date.now()}`,
                        name: 'New collection',
                        tagline: 'Add a tagline',
                        img: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=900&q=80',
                      }),
                    );
                    notify();
                  }}
                >
                  <Plus className="h-4 w-4" /> Add
                </Button>
              }
            >
              <div className="space-y-4">
                {content.collections.map((c, i) => (
                  <div key={c.slug + i} className="rounded-md border border-ink-100 p-4 space-y-3 bg-ink-25">
                    <div className="flex flex-col sm:flex-row items-start gap-3">
                      <img src={c.img} alt="" className="h-16 w-16 object-cover rounded-sm bg-ink-100 shrink-0" />
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                        <Field label="Name" compact>
                          <Input
                            value={c.name}
                            onChange={(e) =>
                              dispatch(updateCollection({ index: i, patch: { name: e.target.value } }))
                            }
                            onBlur={notify}
                          />
                        </Field>
                        <Field label="Slug" compact>
                          <Input
                            value={c.slug}
                            onChange={(e) =>
                              dispatch(updateCollection({ index: i, patch: { slug: e.target.value } }))
                            }
                            onBlur={notify}
                          />
                        </Field>
                        <Field label="Tagline" compact>
                          <Input
                            value={c.tagline}
                            onChange={(e) =>
                              dispatch(updateCollection({ index: i, patch: { tagline: e.target.value } }))
                            }
                            onBlur={notify}
                          />
                        </Field>
                        <Field label="Image URL" compact>
                          <Input
                            value={c.img}
                            onChange={(e) =>
                              dispatch(updateCollection({ index: i, patch: { img: e.target.value } }))
                            }
                            onBlur={notify}
                          />
                        </Field>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          dispatch(removeCollection(i));
                          notify();
                        }}
                        aria-label={`Remove ${c.name}`}
                      >
                        <Trash2 className="h-4 w-4 text-danger-500" />
                      </Button>
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
            />
          )}

          {tab === 'homepage' && (
            <HomepageSectionsTab content={content} onPatch={(patch) => { dispatch(setContent({ ...content, ...patch })); notify(); }} />
          )}
          {tab === 'labels' && (
            <Card title="Section labels & headlines" desc="Eyebrows, titles and sub-copy for every homepage section. Edit as JSON.">
              <JsonSectionEditor
                value={content.sectionLabels}
                onSave={(next) => { dispatch(setContent({ ...content, sectionLabels: next })); notify(); }}
              />
            </Card>
          )}
          {tab === 'footer' && (
            <FooterSectionsTab content={content} onPatch={(patch) => { dispatch(setContent({ ...content, ...patch })); notify(); }} />
          )}
        </div>

        {/* Live preview panel */}
        <aside className="space-y-4">
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
}: {
  filters: import('@/features/storefront/storefrontContentSlice').StorefrontFiltersConfig;
  collections: import('@/features/storefront/storefrontContentSlice').CollectionTile[];
  onAddGroup: (g: { key: string; label: string; options: string[] }) => void;
  onUpdateGroup: (key: string, patch: Partial<{ label: string; options: string[] }>) => void;
  onRemoveGroup: (key: string) => void;
  onSetForCollection: (slug: string, groupKeys: string[]) => void;
  onClearOverride: (slug: string) => void;
  onSetDefaultKeys: (keys: string[]) => void;
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
                onOptionsChange={(options) => onUpdateGroup(g.key, { options })}
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
  onOptionsChange,
  onRemove,
}: {
  group: { key: string; label: string; options: string[] };
  onLabelChange: (label: string) => void;
  onOptionsChange: (options: string[]) => void;
  onRemove: () => void;
}): JSX.Element {
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
                onClick={() => onOptionsChange(group.options.filter((o) => o !== opt))}
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
                if (!group.options.includes(newOption.trim())) {
                  onOptionsChange([...group.options, newOption.trim()]);
                }
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
              if (!v || group.options.includes(v)) return;
              onOptionsChange([...group.options, v]);
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

function JsonSectionEditor<T>({
  value,
  onSave,
  rows = 12,
}: {
  value: T;
  onSave: (next: T) => void;
  rows?: number;
}): JSX.Element {
  const [draft, setDraft] = useState(() => JSON.stringify(value, null, 2));
  const [err, setErr] = useState<string | null>(null);
  // Refresh the draft when the source value changes (e.g. after publish).
  useEffect(() => {
    setDraft(JSON.stringify(value, null, 2));
    setErr(null);
  }, [value]);
  function save(): void {
    try {
      const parsed = JSON.parse(draft) as T;
      setErr(null);
      onSave(parsed);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Invalid JSON');
    }
  }
  return (
    <div className="space-y-3">
      <Textarea
        rows={rows}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="font-mono text-xs"
        spellCheck={false}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-500">Edit the JSON above, then click <strong>Apply</strong>. The changes save to the database when you click <strong>Publish changes</strong> at the top.</p>
        <button
          type="button"
          onClick={save}
          className="h-8 px-4 rounded-md bg-ink-900 text-ink-0 text-sm hover:bg-ink-800 transition-colors shrink-0"
        >
          Apply
        </button>
      </div>
      {err && <p className="text-xs text-danger-700">JSON error: {err}</p>}
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
  return (
    <div className="space-y-6">
      <Card title="Hero video" desc="MP4/WebM URL that plays in the right hero panel. Leave empty to show the static hero image only.">
        <Field label="Video URL">
          <Input
            value={content.hero.videoSrc}
            placeholder="/img/hero.mp4 or https://…"
            onChange={(e) => onPatch({ hero: { ...content.hero, videoSrc: e.target.value } })}
          />
        </Field>
      </Card>

      <Card title="Shop by occasion (6-tile body-shot grid)" desc="Each tile: name, slug (existing collection), product count, image URL.">
        <JsonSectionEditor value={content.shopByOccasion} onSave={(v) => onPatch({ shopByOccasion: v })} />
      </Card>

      <Card title="Browse by category (circular marquee)" desc="Each tile: label, slug, image URL. 6–12 tiles recommended.">
        <JsonSectionEditor value={content.browseCategories} onSave={(v) => onPatch({ browseCategories: v })} />
      </Card>

      <Card title="Watch & wear reels" desc="Up to 12 vertical 9:16 reel tiles. Each: @handle, caption, poster image, collection slug.">
        <JsonSectionEditor value={content.reels} onSave={(v) => onPatch({ reels: v })} />
      </Card>

      <Card title="Deals of the week" desc="Up to 8 product cards. Each: slug, name, category, price label, badge (NEW/SALE/OUT), image URL.">
        <JsonSectionEditor value={content.deals} onSave={(v) => onPatch({ deals: v })} />
      </Card>

      <Card title="Customer reviews — row 1 (scrolls left)" desc="Each review: quote, author, city, occasion.">
        <JsonSectionEditor value={content.testimonialsRow1} onSave={(v) => onPatch({ testimonialsRow1: v })} />
      </Card>

      <Card title="Customer reviews — row 2 (scrolls right)" desc="Each review: quote, author, city, occasion.">
        <JsonSectionEditor value={content.testimonialsRow2} onSave={(v) => onPatch({ testimonialsRow2: v })} />
      </Card>

      <Card title="Press logos (under the reviews)" desc="Array of strings — magazine / newspaper names.">
        <JsonSectionEditor value={content.pressLogos} onSave={(v) => onPatch({ pressLogos: v })} rows={6} />
      </Card>

      <Card title="Doors-opening promo cards (2)" desc="Each: eyebrow, title, body, link href, image URL.">
        <JsonSectionEditor value={content.doorCards} onSave={(v) => onPatch({ doorCards: v })} />
      </Card>

      <Card title="Trust badges (3)" desc="Each badge: icon (one of: shield, sparkles, award), title, body.">
        <JsonSectionEditor value={content.trustBadges} onSave={(v) => onPatch({ trustBadges: v })} rows={10} />
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
      <Card title="Footer email" desc="Contact email shown in the footer left column.">
        <Field label="Email">
          <Input
            value={content.footerEmail}
            placeholder="hello@yourjewellers.in"
            onChange={(e) => onPatch({ footerEmail: e.target.value })}
          />
        </Field>
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
        <JsonSectionEditor value={content.footerShop} onSave={(v) => onPatch({ footerShop: v })} rows={8} />
      </Card>

      <Card title="Footer — Visit column" desc="Each link: label and href.">
        <JsonSectionEditor value={content.footerVisit} onSave={(v) => onPatch({ footerVisit: v })} rows={8} />
      </Card>

      <Card title="Footer — Help column" desc="Each link: label and href.">
        <JsonSectionEditor value={content.footerHelp} onSave={(v) => onPatch({ footerHelp: v })} rows={8} />
      </Card>
    </div>
  );
}
