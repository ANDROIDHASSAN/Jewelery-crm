// Admin settings — workspace info, stores, integration status, session.
// Real data where it exists (shops via /api/v1/shops); placeholders with
// "Not connected" badges for integrations whose env vars aren't on Render
// yet (WhatsApp, Razorpay, Shiprocket, MCX). Sign-out clears the in-memory
// token via the authSlice and bounces back to the login screen.

import { useNavigate } from 'react-router-dom';
import { LogOut, Store, Phone, MapPin, ExternalLink, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAppDispatch } from '@/app/hooks';
import { logout } from '@/features/auth/authSlice';
import { useGetShopsQuery } from '@/features/shops/shopsApi';

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL ?? 'admin@zelora.in';
const APP_NAME = import.meta.env.VITE_APP_NAME ?? 'Zelora';

interface Integration {
  name: string;
  description: string;
  connected: boolean;
  link?: string;
}

const INTEGRATIONS: Integration[] = [
  {
    name: 'WhatsApp Business (Meta Cloud API)',
    description: 'Send order confirmations, OTPs, and abandoned-cart nudges from your business number.',
    connected: false,
    link: 'https://business.facebook.com/wa/manage',
  },
  {
    name: 'Razorpay',
    description: 'Accept card / UPI / net-banking payments online. Required for cart checkout with prepayment.',
    connected: false,
    link: 'https://dashboard.razorpay.com',
  },
  {
    name: 'Shiprocket',
    description: 'Auto-assign couriers, print labels, and pull live AWB tracking on every order.',
    connected: false,
    link: 'https://app.shiprocket.in',
  },
  {
    name: 'MCX live gold rate',
    description: 'Replace the demo rate with the real-time MCX 22K/18K/silver feed, refreshed every 5 minutes.',
    connected: false,
    link: 'https://www.mcxindia.com',
  },
];

export function SettingsPage(): JSX.Element {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { data: shopsRes, isLoading: shopsLoading, isError: shopsError } = useGetShopsQuery();
  const shops = shopsRes?.data ?? [];

  function handleSignOut(): void {
    dispatch(logout());
    toast.message('Signed out');
    navigate('/admin/login', { replace: true });
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
        <dl className="divide-y divide-ink-100">
          <Row label="Business name" value="Zelora" />
          <Row label="Plan" value={<Badge tone="brand">Starter · demo</Badge>} />
          <Row label="App brand" value={APP_NAME} />
          <Row label="Sign-in email" value={<span className="font-mono text-xs">{ADMIN_EMAIL}</span>} />
          <Row label="GSTIN" value={<span className="font-mono text-xs">27AAAPL1234C1Z5</span>} />
          <Row label="Owner phone" value={<span className="font-mono text-xs">+91 98765 43210</span>} />
        </dl>
        <p className="mt-4 text-xs text-ink-500">
          Editing business info will move here in v1.1. For now reach out at{' '}
          <a className="underline decoration-ink-300 underline-offset-2" href="mailto:server.anantkamal@gmail.com">
            server.anantkamal@gmail.com
          </a>
          .
        </p>
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
        <ul className="divide-y divide-ink-100">
          {INTEGRATIONS.map((int) => (
            <li key={int.name} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="font-medium text-ink-900 text-sm">{int.name}</p>
                <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">{int.description}</p>
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
      </SettingsCard>

      <SettingsCard
        title="Session"
        eyebrow="Signed in as admin"
        description="The demo admin uses a bearer-token sentinel against the server's ADMIN_API_TOKEN. Click Sign out to clear it and return to the login screen."
      >
        <div className="flex items-center gap-3 rounded-md border border-ink-100 bg-ink-25 p-4">
          <div className="h-10 w-10 rounded-full bg-brand-50 text-brand-700 inline-flex items-center justify-center shrink-0">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink-900">Admin (sentinel)</p>
            <p className="text-xs text-ink-500 mt-0.5 truncate">{ADMIN_EMAIL}</p>
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

function Row({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
  return (
    <div className="grid grid-cols-[110px_1fr] sm:grid-cols-[180px_1fr] gap-3 sm:gap-4 py-2.5 text-sm">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-ink-900 break-words">{value}</dd>
    </div>
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
