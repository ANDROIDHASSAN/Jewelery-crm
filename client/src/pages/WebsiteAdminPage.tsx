// Website admin — edits the public storefront content (hero, rates, collections, story, locations).
// Local edits flow through the Redux slice for instant feedback; clicking
// "Publish" PUTs the full content blob to /api/v1/storefront and invalidates
// the public storefront cache so visitors see the change.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Plus, Trash2, RotateCcw, CloudUpload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  addCollection,
  addLocation,
  removeCollection,
  removeLocation,
  resetContent,
  setContent,
  updateBrand,
  updateCollection,
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

type TabKey = 'brand' | 'hero' | 'rates' | 'collections' | 'story' | 'testimonial' | 'locations' | 'contact';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'brand', label: 'Brand' },
  { key: 'hero', label: 'Hero' },
  { key: 'rates', label: 'Gold rates' },
  { key: 'collections', label: 'Collections' },
  { key: 'story', label: 'Story' },
  { key: 'testimonial', label: 'Testimonial' },
  { key: 'locations', label: 'Stores' },
  { key: 'contact', label: 'Contact' },
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

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-eyebrow uppercase text-ink-500">Business website</p>
          <h1 className="font-display text-xl sm:text-display-sm text-ink-900">Pages & content</h1>
          <p className="text-sm text-ink-500 mt-1">
            Edits stay local until you click <span className="font-medium text-ink-800">Publish</span>.
            {isLoading && ' Loading saved content…'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
      </header>

      {/* Tabs */}
      <nav className="border-b border-ink-100 -mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6 overflow-x-auto" aria-label="Sections">
        <ul className="flex items-center gap-1 min-w-max">
          {TABS.map((t) => (
            <li key={t.key}>
              <button
                type="button"
                onClick={() => setTab(t.key)}
                className={
                  'px-4 h-10 text-sm transition-colors border-b-2 -mb-px ' +
                  (tab === t.key
                    ? 'text-ink-900 border-brand-500'
                    : 'text-ink-600 border-transparent hover:text-ink-900')
                }
                aria-current={tab === t.key}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

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
