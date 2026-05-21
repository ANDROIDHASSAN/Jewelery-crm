// Admin settings — workspace info, stores, integration status, session.
//
// Tenant info is now editable end-to-end: GET /settings/tenant for the
// initial values, PATCH /settings/tenant on Save. Integrations report their
// "connected" state from the server (env-var presence), so the badge tracks
// reality instead of being hard-coded. Stores list still comes from /shops.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Store, Phone, MapPin, ExternalLink, ShieldCheck, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { signOutAndClear } from '@/features/auth/authActions';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import {
  useGetTenantQuery,
  useUpdateTenantMutation,
  useGetIntegrationsQuery,
  useBackfillPaymentsMutation,
  type TenantPatch,
} from '@/features/settings/settingsApi';

const APP_NAME = import.meta.env.VITE_APP_NAME ?? 'Zelora';

export function SettingsPage(): JSX.Element {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const authedUser = useAppSelector((s) => s.auth.user);
  const { data: shopsRes, isLoading: shopsLoading, isError: shopsError } = useGetShopsQuery();
  const shops = shopsRes?.data ?? [];
  const { data: tenantRes, isLoading: tenantLoading } = useGetTenantQuery();
  const { data: integrationsRes, isLoading: intLoading } = useGetIntegrationsQuery();
  const [updateTenant, { isLoading: saving }] = useUpdateTenantMutation();
  const [backfillPayments, { isLoading: backfilling }] = useBackfillPaymentsMutation();

  // Friendly role label derived from the signed-in user's roleSlug
  // (SUPER_ADMIN → "Super admin", SHOP_MANAGER → "Shop manager", etc.).
  const roleLabel = authedUser?.roleSlug
    ? authedUser.roleSlug
        .toLowerCase()
        .split('_')
        .map((w) => (w.length > 0 ? `${w[0]!.toUpperCase()}${w.slice(1)}` : w))
        .join(' ')
    : 'Signed in';
  const displayName = authedUser?.name?.trim() || authedUser?.email || 'Current user';
  const displayEmail = authedUser?.email ?? '';
  const initials = (authedUser?.name ?? authedUser?.email ?? '?')
    .split(/[\s@]+/)
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Local form state, hydrated from the server response so the Save button can
  // diff-and-PATCH only the changed fields.
  const [draft, setDraft] = useState<TenantPatch>({});
  useEffect(() => {
    if (tenantRes?.data) {
      setDraft({
        businessName: tenantRes.data.businessName,
        gstNumber: tenantRes.data.gstNumber ?? '',
        phone: tenantRes.data.phone,
        ownerEmail: tenantRes.data.ownerEmail,
        brandPrimary: tenantRes.data.brandPrimary,
        logoUrl: tenantRes.data.logoUrl ?? '',
      });
    }
  }, [tenantRes?.data]);

  async function handleSignOut(): Promise<void> {
    // Resets the RTK Query cache too — without that, the next sign-in
    // (especially with a different role) would briefly serve this user's
    // tenant-scoped data through the cached responses.
    await dispatch(signOutAndClear());
    toast.message('Signed out');
    navigate('/admin/login', { replace: true });
  }

  async function handleBackfill(): Promise<void> {
    try {
      const res = await backfillPayments().unwrap();
      const { billsBackfilled, paymentsCreated } = res.data;
      if (billsBackfilled === 0) {
        toast.message('No orphan bills — Mode-wise collection is already populated.');
      } else {
        toast.success(
          `Backfilled ${billsBackfilled} bill${billsBackfilled === 1 ? '' : 's'} → ${paymentsCreated} payment row${paymentsCreated === 1 ? '' : 's'}`,
        );
      }
    } catch (err) {
      const msg = (err as { data?: { error?: { message?: string } } }).data?.error?.message;
      toast.error(msg ?? 'Backfill failed');
    }
  }

  async function handleSave(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    try {
      // Treat empty strings on optional/text fields as "clear" — server schema
      // accepts null for nullable cols and ignores undefined.
      const body: TenantPatch = {
        ...draft,
        gstNumber: draft.gstNumber === '' ? null : draft.gstNumber,
        logoUrl: draft.logoUrl === '' ? null : draft.logoUrl,
      };
      await updateTenant(body).unwrap();
      toast.success('Workspace updated');
    } catch (err) {
      const msg = (err as { data?: { error?: { message?: string } } }).data?.error?.message;
      toast.error(msg ?? 'Could not save settings');
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Business info, stores, integrations, and your admin session."
        bare
      />

      <SettingsCard
        title="Business"
        eyebrow="Workspace"
        description="Set once, used everywhere — invoices, GST returns, the public storefront, WhatsApp templates."
      >
        {tenantLoading ? (
          <p className="text-sm text-ink-500">Loading workspace…</p>
        ) : (
          <form className="space-y-4" onSubmit={(e) => void handleSave(e)}>
            <Field label="Business name">
              <Input
                value={draft.businessName ?? ''}
                onChange={(e) => setDraft({ ...draft, businessName: e.target.value })}
                placeholder="Zelora"
                required
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Plan">
                <p className="h-10 px-3 inline-flex items-center text-sm text-ink-700 font-mono">
                  {tenantRes?.data.plan ?? '—'}
                </p>
              </Field>
              <Field label="App brand">
                <p className="h-10 px-3 inline-flex items-center text-sm text-ink-700">{APP_NAME}</p>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Sign-in / owner email">
                <Input
                  type="email"
                  value={draft.ownerEmail ?? ''}
                  onChange={(e) => setDraft({ ...draft, ownerEmail: e.target.value })}
                  required
                />
              </Field>
              <Field label="Owner phone (E.164)">
                <Input
                  value={draft.phone ?? ''}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  placeholder="+919876543210"
                  required
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="GSTIN (optional)">
                <Input
                  value={draft.gstNumber ?? ''}
                  onChange={(e) => setDraft({ ...draft, gstNumber: e.target.value.toUpperCase() })}
                  placeholder="27AAAPL1234C1Z5"
                  maxLength={15}
                />
              </Field>
              <Field label="Brand primary colour">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={draft.brandPrimary ?? '#C99B2A'}
                    onChange={(e) => setDraft({ ...draft, brandPrimary: e.target.value })}
                    className="h-10 w-12 rounded-md border border-ink-200 cursor-pointer"
                  />
                  <Input
                    value={draft.brandPrimary ?? ''}
                    onChange={(e) => setDraft({ ...draft, brandPrimary: e.target.value })}
                    placeholder="#C99B2A"
                  />
                </div>
              </Field>
            </div>
            <Field label="Logo URL (optional)">
              <Input
                value={draft.logoUrl ?? ''}
                onChange={(e) => setDraft({ ...draft, logoUrl: e.target.value })}
                placeholder="https://…/logo.png"
              />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? 'Saving…' : 'Save business info'}
              </Button>
            </div>
          </form>
        )}
      </SettingsCard>

      <SettingsCard
        title="Stores"
        eyebrow={
          shopsLoading
            ? 'Loading…'
            : shopsError
              ? 'Could not load'
              : `${shops.length} ${shops.length === 1 ? 'location' : 'locations'}`
        }
        description="Each piece of inventory belongs to a store. Stores show up in the POS shop switcher and on the public storefront's Locations page."
      >
        {shopsLoading ? (
          <p className="text-sm text-ink-500">Fetching stores from the database…</p>
        ) : shopsError ? (
          <p className="text-sm text-danger-700">
            Couldn&apos;t reach the server. Make sure the API is up and refresh.
          </p>
        ) : shops.length === 0 ? (
          <p className="text-sm text-ink-500">
            No stores yet. Seed the database (<code className="font-mono text-[11px]">npm run db:seed</code>) or add
            stores from the admin API.
          </p>
        ) : (
          <ul className="space-y-3">
            {shops.map((shop) => (
              <li
                key={shop.id}
                className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 rounded-md border border-ink-100 bg-ink-25 p-4"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-md bg-brand-50 text-brand-700 inline-flex items-center justify-center shrink-0">
                    <Store className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900 truncate">{shop.name}</p>
                    <p className="text-xs text-ink-500 mt-0.5 flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 shrink-0" /> {shop.address}
                    </p>
                    <p className="text-xs text-ink-500 mt-0.5 flex items-center gap-1.5 font-mono">
                      <Phone className="h-3 w-3 shrink-0" /> {shop.phone}
                    </p>
                  </div>
                </div>
                <Badge tone={shop.isActive ? 'success' : 'neutral'}>
                  {shop.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <SettingsCard
        title="Integrations"
        eyebrow="External services"
        description="Wire these up once and the rest of the app starts speaking to them — POS receipts go out on WhatsApp, online orders charge on Razorpay, AWBs sync from Shiprocket."
      >
        {intLoading ? (
          <p className="text-sm text-ink-500">Checking connections…</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {(integrationsRes?.data ?? []).map((int) => (
              <li
                key={int.key}
                className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink-900 text-sm">{int.name}</p>
                  <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">{int.description}</p>
                  {!int.connected && int.envKeys.length > 0 && (
                    <p className="text-[11px] text-ink-500 mt-1 font-mono">
                      Set in server env: {int.envKeys.join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                  <Badge tone={int.connected ? 'success' : 'neutral'}>
                    {int.connected ? 'Connected' : 'Not connected'}
                  </Badge>
                  {int.link && (
                    <a
                      href={int.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-ink-700 hover:text-ink-900 inline-flex items-center gap-1 underline decoration-ink-200 underline-offset-4"
                    >
                      Open
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <SettingsCard
        title="Data utilities"
        eyebrow="One-shot fixes"
        description="Small admin tools for tidying historic data. Each is idempotent — re-running does nothing once the data is healthy."
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-md border border-ink-100 bg-ink-25 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-900">Backfill missing payment rows</p>
            <p className="text-xs text-ink-500 mt-0.5">
              Old demo bills were inserted without Payment records, so the Mode-wise collection table
              and the Offline-shops cash/digital tiles look empty. Hit this once to synthesize plausible
              Payment rows for any orphan bill.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={backfilling}
            onClick={() => void handleBackfill()}
            className="self-start sm:self-auto shrink-0"
          >
            {backfilling ? 'Backfilling…' : 'Run backfill'}
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Session"
        eyebrow={authedUser ? `Signed in as ${roleLabel.toLowerCase()}` : 'Not signed in'}
        description="This is the account you're currently signed in with. Click Sign out to clear it and return to the login screen."
      >
        <div className="flex items-center gap-3 rounded-md border border-ink-100 bg-ink-25 p-4">
          <div className="h-10 w-10 rounded-full bg-brand-50 text-brand-700 inline-flex items-center justify-center shrink-0 font-medium text-sm">
            {authedUser ? initials : <ShieldCheck className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink-900 truncate">
              {displayName}
              {authedUser && (
                <span className="ml-2 text-[11px] font-normal text-ink-500 uppercase tracking-wider">
                  {roleLabel}
                </span>
              )}
            </p>
            {displayEmail && (
              <p className="text-xs text-ink-500 mt-0.5 truncate">{displayEmail}</p>
            )}
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
}

interface SettingsCardProps {
  title: string;
  eyebrow: string;
  description?: string;
  children: React.ReactNode;
}

function SettingsCard({ title, eyebrow, description, children }: SettingsCardProps): JSX.Element {
  return (
    <section className="rounded-md border border-ink-100 bg-ink-0 p-4 sm:p-6">
      <header className="mb-4">
        <p className="text-[11px] uppercase tracking-wider text-ink-500">{eyebrow}</p>
        <h2 className="font-display text-lg sm:text-[22px] leading-tight text-ink-900 mt-1">{title}</h2>
        {description && <p className="text-sm text-ink-500 mt-1.5 leading-relaxed">{description}</p>}
      </header>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="block text-sm">
      <span className="text-[11px] uppercase tracking-wider text-ink-500 block mb-1">{label}</span>
      {children}
    </label>
  );
}

type BadgeTone = 'brand' | 'success' | 'neutral' | 'danger';

function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }): JSX.Element {
  const classes: Record<BadgeTone, string> = {
    brand: 'bg-brand-50 text-brand-800 border-brand-200',
    success: 'bg-success-50 text-success-700 border-success-200',
    neutral: 'bg-ink-50 text-ink-600 border-ink-200',
    danger: 'bg-danger-50 text-danger-700 border-danger-200',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium tracking-wide ${classes[tone]}`}
    >
      {children}
    </span>
  );
}
