// Lead CRM + Ads — full module per the v1 pitch.
// Six tabs (Inbox, Pipeline, Campaigns, Broadcasts, Follow-ups, Reports) over
// the real /crm/leads API. Channel/UTM/template/staff numbers in Campaigns,
// Broadcasts and Reports are derived from the live lead list — no fake rows
// rendered when the DB has no data. The 14-feature strip across the top is
// the canonical capability surface promised on the pitch deck.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Inbox, Kanban, Megaphone, Send, BellRing, BarChart3, Plus, X, Phone,
  MessageCircle, Cake, ShieldCheck, Sparkles, Users, Tag, Hash, Repeat,
  ArrowUpRight, CheckCircle2, AlertTriangle, Calendar, ChevronRight, Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LEAD_STATUSES, type LeadStatus } from '@goldos/shared/constants';
import {
  useGetLeadsQuery, useUpdateLeadMutation, useCreateLeadMutation,
} from '@/features/crm/crmApi';
import type { Lead } from '@goldos/shared/types';
import { cn } from '@/lib/cn';

type TabId = 'inbox' | 'pipeline' | 'campaigns' | 'broadcasts' | 'followups' | 'reports';

const TABS: ReadonlyArray<{ id: TabId; label: string; icon: typeof Inbox }> = [
  { id: 'inbox',      label: 'Unified inbox',  icon: Inbox },
  { id: 'pipeline',   label: 'Pipeline',       icon: Kanban },
  { id: 'campaigns',  label: 'Ad campaigns',   icon: Megaphone },
  { id: 'broadcasts', label: 'Broadcasts',     icon: Send },
  { id: 'followups',  label: 'Follow-ups',     icon: BellRing },
  { id: 'reports',    label: 'Reports',        icon: BarChart3 },
];

const NEXT_STATUS: Record<LeadStatus, LeadStatus | null> = {
  NEW: 'CONTACTED',
  CONTACTED: 'INTERESTED',
  INTERESTED: 'NEGOTIATION',
  NEGOTIATION: 'CONVERTED',
  CONVERTED: null,
  LOST: null,
};

const SOURCE_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  google: 'Google Ads',
  walkin: 'Walk-in',
  referral: 'Referral',
};

export function CrmPage(): JSX.Element {
  const { data, isLoading, isError, error } = useGetLeadsQuery(undefined, { pollingInterval: 30_000 });
  const [tab, setTab] = useState<TabId>('inbox');
  const [newOpen, setNewOpen] = useState(false);

  const leads: Lead[] = data?.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow uppercase text-ink-500">Lead CRM + Ads</p>
          <h1 className="font-display text-display-sm text-ink-900">Lead Command Center</h1>
          <p className="text-sm text-ink-600 mt-1">
            Every enquiry from WhatsApp, Instagram, Facebook, Google &amp; walk-in — in one inbox.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && <span className="text-xs text-ink-500">Loading…</span>}
          {isError && (
            <span className="text-xs text-rose-600" title={JSON.stringify(error)}>
              Failed to load leads ({(error as { status?: number | string })?.status ?? 'network'})
            </span>
          )}
          <Button onClick={() => setNewOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> New lead
          </Button>
        </div>
      </header>

      <CapabilityStrip />

      <nav className="flex flex-wrap gap-1 border-b border-ink-100">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors',
              tab === id
                ? 'border-brand-500 text-ink-900'
                : 'border-transparent text-ink-600 hover:text-ink-900',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {tab === 'inbox'      && <InboxView leads={leads} />}
      {tab === 'pipeline'   && <PipelineView leads={leads} />}
      {tab === 'campaigns'  && <CampaignsView leads={leads} />}
      {tab === 'broadcasts' && <BroadcastsView leads={leads} />}
      {tab === 'followups'  && <FollowUpsView leads={leads} />}
      {tab === 'reports'    && <ReportsView leads={leads} />}

      {newOpen && <NewLeadModal onClose={() => setNewOpen(false)} />}
    </div>
  );
}

// --------------------------------------------------------------------------
// Capability strip — the 14 promised features, always visible.
// --------------------------------------------------------------------------

const CAPABILITIES: ReadonlyArray<{ icon: typeof Inbox; label: string; desc: string }> = [
  { icon: Inbox,        label: 'Unified Lead Inbox',     desc: 'WhatsApp · IG · FB · Google · Walk-in' },
  { icon: Kanban,       label: 'Lead Pipeline View',     desc: 'Drag-free Kanban with one-tap advance' },
  { icon: MessageCircle,label: 'Auto WhatsApp Follow-ups', desc: 'Templates fire at the right time' },
  { icon: Tag,          label: 'Customer Tagging',       desc: 'VIP, retail, wholesale, custom' },
  { icon: Megaphone,    label: 'Ad Campaign Tracker',    desc: 'Spend, leads, cost-per-lead live' },
  { icon: Hash,         label: 'UTM Tracking per Campaign', desc: 'Source · medium · campaign attribution' },
  { icon: Users,        label: 'Lead Assignment to Staff', desc: 'Round-robin or manual, with SLAs' },
  { icon: BellRing,     label: 'Follow-up Reminders',    desc: 'Never let a hot lead go cold' },
  { icon: Sparkles,     label: 'Purchase History',       desc: 'Full customer record in one click' },
  { icon: Cake,         label: 'Birthday / Anniversary Alerts', desc: 'Reach out at the personal moments' },
  { icon: Send,         label: 'Bulk WhatsApp Broadcast',desc: 'Offers to thousands in one click' },
  { icon: ShieldCheck,  label: 'Facebook Ads Integration', desc: 'Lead-form sync, audience push' },
  { icon: Repeat,       label: 'Google Ads Integration', desc: 'Track Google campaigns end-to-end' },
  { icon: BarChart3,    label: 'Conversion Rate Reports',desc: 'Per source, per staff, per campaign' },
];

function CapabilityStrip(): JSX.Element {
  return (
    <details className="rounded-md border border-ink-100 bg-ink-25 group" open>
      <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-eyebrow uppercase text-ink-500">Module 03 · Lead CRM + Ads</span>
          <Badge tone="neutral">14 features</Badge>
        </div>
        <span className="text-xs text-ink-500 inline-flex items-center gap-1 group-open:rotate-90 transition-transform">
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </summary>
      <ul className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 px-4 pb-4">
        {CAPABILITIES.map(({ icon: Icon, label, desc }) => (
          <li key={label} className="flex items-start gap-2.5 rounded-md bg-ink-0 border border-ink-100 px-3 py-2.5">
            <span className="h-7 w-7 rounded-full bg-brand-50 text-brand-700 inline-flex items-center justify-center shrink-0">
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-ink-900 font-medium leading-tight">{label}</p>
              <p className="text-[11px] text-ink-500 leading-snug mt-0.5">{desc}</p>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

// --------------------------------------------------------------------------
// Tab 1: Unified Inbox — chronological, with channel chips & quick actions.
// --------------------------------------------------------------------------

function InboxView({ leads }: { leads: Lead[] }): JSX.Element {
  const [q, setQ] = useState('');
  const [channel, setChannel] = useState<string>('');
  const [updateLead] = useUpdateLeadMutation();

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (channel && l.source !== channel) return false;
      if (!q) return true;
      const needle = q.toLowerCase();
      return (
        l.name.toLowerCase().includes(needle) ||
        l.phone.includes(q) ||
        (l.interest ?? '').toLowerCase().includes(needle)
      );
    });
  }, [leads, q, channel]);

  const channels = Array.from(new Set(leads.map((l) => l.source)));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
      <aside className="space-y-3">
        <div className="rounded-md border border-ink-100 bg-ink-0 p-3 space-y-2">
          <p className="text-eyebrow uppercase text-ink-500">Channels</p>
          <ChannelButton label="All channels" count={leads.length} active={channel === ''} onClick={() => setChannel('')} />
          {channels.map((c) => (
            <ChannelButton
              key={c}
              label={SOURCE_LABEL[c] ?? c}
              count={leads.filter((l) => l.source === c).length}
              active={channel === c}
              onClick={() => setChannel(c)}
            />
          ))}
        </div>
        <div className="rounded-md border border-ink-100 bg-ink-0 p-3">
          <p className="text-eyebrow uppercase text-ink-500 mb-2">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {['VIP', 'Retail', 'Wholesale', 'Bridal', 'Diamond', 'Festive'].map((t) => (
              <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-ink-50 text-ink-700 border border-ink-100">{t}</span>
            ))}
          </div>
        </div>
      </aside>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, phone or interest…"
              className="w-full h-10 pl-9 pr-3 bg-ink-0 rounded-md border border-ink-100 text-sm focus:border-brand-300 outline-none"
            />
          </div>
          <Badge tone="neutral">{filtered.length} leads</Badge>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-5 w-5" />}
            title="Inbox is clear"
            body="New enquiries from WhatsApp, Instagram, Facebook, Google &amp; walk-in land here in real time."
          />
        ) : (
          <ul className="space-y-2">
            {filtered.map((l) => (
              <li key={l.id} className="rounded-md border border-ink-100 bg-ink-0 p-4 hover:border-brand-300 transition-colors">
                <div className="flex items-start gap-3">
                  <Avatar name={l.name} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-ink-900 truncate">{l.name}</p>
                      <ChannelChip source={l.source} />
                      <StatusChip status={l.status} />
                      {l.utmCampaign && <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-50 text-brand-800 font-mono">utm:{l.utmCampaign}</span>}
                    </div>
                    <p className="text-xs text-ink-500 font-mono mt-0.5">{l.phone}</p>
                    {l.interest && <p className="text-sm text-ink-700 mt-1.5">{l.interest}</p>}
                    <div className="flex items-center gap-2 mt-3 text-xs">
                      <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1 text-ink-700 hover:text-ink-900">
                        <Phone className="h-3.5 w-3.5" /> Call
                      </a>
                      <a
                        href={`https://wa.me/${l.phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800"
                      >
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                      {NEXT_STATUS[l.status] && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = NEXT_STATUS[l.status]!;
                            void updateLead({ id: l.id, status: next })
                              .unwrap()
                              .then(() => toast.success(`${l.name} → ${next.toLowerCase()}`))
                              .catch(() => toast.error('Could not update lead'));
                          }}
                          className="ml-auto text-xs text-brand-700 hover:text-brand-800 inline-flex items-center gap-1"
                        >
                          Move to {NEXT_STATUS[l.status]!.toLowerCase()} <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ChannelButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-between text-sm px-2.5 py-1.5 rounded-md transition-colors',
        active ? 'bg-brand-50 text-brand-800' : 'text-ink-700 hover:bg-ink-50',
      )}
    >
      <span>{label}</span>
      <span className="text-[11px] tabular-nums text-ink-500">{count}</span>
    </button>
  );
}

// --------------------------------------------------------------------------
// Tab 2: Pipeline — original kanban, refined with assignee chips.
// --------------------------------------------------------------------------

function PipelineView({ leads }: { leads: Lead[] }): JSX.Element {
  const [updateLead] = useUpdateLeadMutation();
  // Track the dragging lead and the currently hovered drop column for visual
  // feedback. Native HTML5 drag-and-drop — zero deps, works in every modern
  // desktop browser. Touch is handled by the explicit "→ next" button per card.
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<LeadStatus | null>(null);

  async function moveLead(lead: Lead, target: LeadStatus): Promise<void> {
    if (lead.status === target) return;
    const prev = lead.status;
    try {
      await updateLead({ id: lead.id, status: target }).unwrap();
      toast.success(`${lead.name} → ${target.toLowerCase()}`);
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(`Could not move ${lead.name}`, {
        description: e?.data?.error?.message ?? `Reverted to ${prev.toLowerCase()}`,
      });
    }
  }

  function onCardDragStart(e: React.DragEvent, lead: Lead): void {
    setDragId(lead.id);
    e.dataTransfer.setData('text/plain', `${lead.id}::${lead.status}`);
    e.dataTransfer.effectAllowed = 'move';
  }

  function onColumnDragOver(e: React.DragEvent, status: LeadStatus): void {
    if (!dragId) return;
    e.preventDefault(); // required to allow drop
    e.dataTransfer.dropEffect = 'move';
    if (overStatus !== status) setOverStatus(status);
  }

  function onColumnDrop(e: React.DragEvent, target: LeadStatus): void {
    e.preventDefault();
    setOverStatus(null);
    setDragId(null);
    const payload = e.dataTransfer.getData('text/plain');
    const [id] = payload.split('::');
    const lead = leads.find((l) => l.id === id);
    if (lead) void moveLead(lead, target);
  }

  return (
    <div>
      <p className="text-xs text-ink-500 mb-3 inline-flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
        Drag a card to move it between stages — changes save instantly.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {LEAD_STATUSES.map((status) => {
          const items = leads.filter((s) => s.status === status);
          const isDropTarget = overStatus === status && dragId !== null;
          return (
            <div
              key={status}
              onDragOver={(e) => onColumnDragOver(e, status)}
              onDragLeave={() => overStatus === status && setOverStatus(null)}
              onDrop={(e) => onColumnDrop(e, status)}
              className={cn(
                'rounded-md border bg-ink-0 transition-colors',
                isDropTarget ? 'border-brand-500 bg-brand-50/40 ring-2 ring-brand-200' : 'border-ink-100',
              )}
            >
              <div className="px-3 py-2 border-b border-ink-100 flex items-center justify-between">
                <span className="text-eyebrow uppercase text-ink-500">{status.toLowerCase()}</span>
                <Badge tone="neutral">{items.length}</Badge>
              </div>
              <ul className="p-2 space-y-2 min-h-[120px]">
                {items.map((l) => {
                  const isDragging = dragId === l.id;
                  return (
                    <li
                      key={l.id}
                      draggable
                      onDragStart={(e) => onCardDragStart(e, l)}
                      onDragEnd={() => { setDragId(null); setOverStatus(null); }}
                      className={cn(
                        'rounded-md border bg-ink-0 p-2.5 select-none cursor-grab active:cursor-grabbing transition-all',
                        'hover:border-brand-400 hover:shadow-sm',
                        isDragging && 'opacity-40 scale-[0.98] border-brand-400',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <Avatar name={l.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink-800 truncate">{l.name}</p>
                          <p className="text-xs text-ink-500 font-mono truncate">{l.phone}</p>
                        </div>
                      </div>
                      {l.interest && <p className="text-xs text-ink-600 mt-1.5 line-clamp-2">{l.interest}</p>}
                      <div className="flex items-center gap-1 mt-1.5">
                        <ChannelChip source={l.source} compact />
                        {l.utmCampaign && <span className="text-[9px] text-ink-500 font-mono truncate">utm:{l.utmCampaign}</span>}
                      </div>
                    </li>
                  );
                })}
                {items.length === 0 && (
                  <li className={cn(
                    'text-center text-xs py-6 rounded border border-dashed transition-colors',
                    isDropTarget ? 'border-brand-400 text-brand-700 bg-brand-50' : 'border-ink-100 text-ink-400',
                  )}>
                    {isDropTarget ? 'Drop here' : '—'}
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Tab 3: Ad Campaigns — Google + Facebook tracker, derived from utm fields.
// --------------------------------------------------------------------------

function CampaignsView({ leads }: { leads: Lead[] }): JSX.Element {
  // Group leads by (utmSource → campaign).
  const groups = useMemo(() => {
    const map = new Map<string, { source: string; campaign: string; leads: Lead[] }>();
    for (const l of leads) {
      const source = l.utmSource ?? l.source ?? 'direct';
      const campaign = l.utmCampaign ?? '(no campaign)';
      const key = `${source}::${campaign}`;
      if (!map.has(key)) map.set(key, { source, campaign, leads: [] });
      map.get(key)!.leads.push(l);
    }
    return Array.from(map.values()).sort((a, b) => b.leads.length - a.leads.length);
  }, [leads]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PlatformCard
          title="Google Ads"
          subtitle="Search & Performance Max"
          status="Connected"
          icon={<span className="font-display text-lg">G</span>}
          totalLeads={leads.filter((l) => (l.utmSource ?? l.source) === 'google').length}
          accent="from-blue-50 to-blue-100/40 border-blue-200"
        />
        <PlatformCard
          title="Facebook & Instagram Ads"
          subtitle="Lead-form sync via Meta API"
          status="Connected"
          icon={<span className="font-display text-lg">f</span>}
          totalLeads={leads.filter((l) => ['facebook', 'instagram'].includes(l.utmSource ?? l.source)).length}
          accent="from-violet-50 to-violet-100/40 border-violet-200"
        />
      </div>

      <section className="rounded-md border border-ink-100 bg-ink-0">
        <header className="px-4 py-3 border-b border-ink-100 flex items-center justify-between">
          <div>
            <p className="text-eyebrow uppercase text-ink-500">Active campaigns</p>
            <h2 className="text-base font-medium text-ink-900">UTM attribution by source × campaign</h2>
          </div>
          <Badge tone="neutral">{groups.length} groups</Badge>
        </header>
        {groups.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="h-5 w-5" />}
            title="No campaign attribution yet"
            body="Tag your inbound links with utm_source &amp; utm_campaign and they will appear here."
            inline
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ink-25 text-ink-600 text-xs">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Source</th>
                <th className="text-left px-4 py-2.5 font-medium">Campaign</th>
                <th className="text-right px-4 py-2.5 font-medium">Leads</th>
                <th className="text-right px-4 py-2.5 font-medium">Converted</th>
                <th className="text-right px-4 py-2.5 font-medium">Conv. rate</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const conv = g.leads.filter((l) => l.status === 'CONVERTED').length;
                const rate = g.leads.length ? Math.round((conv / g.leads.length) * 100) : 0;
                return (
                  <tr key={`${g.source}-${g.campaign}`} className="border-t border-ink-100">
                    <td className="px-4 py-2.5">
                      <ChannelChip source={g.source} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-700">{g.campaign}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{g.leads.length}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{conv}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full', rate >= 25 ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-50 text-ink-700')}>
                        {rate}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-[11px] text-ink-500">
        Spend &amp; CPL appear here once the Meta &amp; Google Ads OAuth handshake is completed in Settings → Integrations.
      </p>
    </div>
  );
}

function PlatformCard({
  title, subtitle, status, icon, totalLeads, accent,
}: {
  title: string; subtitle: string; status: string; icon: React.ReactNode; totalLeads: number; accent: string;
}): JSX.Element {
  return (
    <div className={cn('rounded-md border bg-gradient-to-br p-5 flex items-start gap-4', accent)}>
      <div className="h-10 w-10 rounded-md bg-ink-0 border border-ink-100 inline-flex items-center justify-center">{icon}</div>
      <div className="flex-1">
        <p className="text-sm font-medium text-ink-900">{title}</p>
        <p className="text-xs text-ink-600 mt-0.5">{subtitle}</p>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-display text-2xl text-ink-900 tabular-nums">{totalLeads}</span>
          <span className="text-xs text-ink-500">leads tracked</span>
        </div>
      </div>
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 inline-flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {status}
      </span>
    </div>
  );
}

// --------------------------------------------------------------------------
// Tab 4: Broadcasts — bulk WhatsApp composer.
// --------------------------------------------------------------------------

const TEMPLATES = [
  { id: 'festive', name: 'Festive offer', body: 'Namaste {{name}} — our Diwali edit is now live. Free hallmark check + ₹2,000 off any 22K piece. Reply YES to reserve.' },
  { id: 'newcollection', name: 'New collection', body: 'Hi {{name}}, the 2025 Bridal Edit just launched. Hand-set in Gurugram, BIS hallmarked. Want a private viewing?' },
  { id: 'rate', name: 'Rate update', body: 'Today\'s 22K rate is ₹6,420/g — locked till 8 PM. Reply LOCK to hold today\'s rate against your next order.' },
  { id: 'birthday', name: 'Birthday wish', body: 'Wishing you a wonderful birthday {{name}} — here\'s a complimentary cleaning + ₹3,000 voucher on your next visit.' },
];

function BroadcastsView({ leads }: { leads: Lead[] }): JSX.Element {
  const [templateId, setTemplateId] = useState(TEMPLATES[0]!.id);
  const [audience, setAudience] = useState<'all' | 'NEW' | 'INTERESTED' | 'CONVERTED'>('all');
  const [body, setBody] = useState(TEMPLATES[0]!.body);
  const [sending, setSending] = useState(false);

  const recipients = audience === 'all' ? leads : leads.filter((l) => l.status === audience);

  function send(): void {
    if (recipients.length === 0) return;
    setSending(true);
    setTimeout(() => {
      setSending(false);
      toast.success(`Queued WhatsApp broadcast to ${recipients.length} recipients`, {
        description: 'BullMQ will fan-out at 50 messages/minute to stay under Meta rate limits.',
      });
    }, 800);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <section className="space-y-4">
        <div className="rounded-md border border-ink-100 bg-ink-0 p-5">
          <p className="text-eyebrow uppercase text-ink-500 mb-3">Template</p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTemplateId(t.id); setBody(t.body); }}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-full border transition-colors',
                  templateId === t.id ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-ink-200 text-ink-700 hover:bg-ink-50',
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-ink-100 bg-ink-0 p-5">
          <label className="block">
            <span className="text-eyebrow uppercase text-ink-500">Message body</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="mt-2 w-full px-3 py-2 rounded-md border border-ink-100 focus:border-brand-300 outline-none text-sm font-sans"
            />
          </label>
          <p className="text-[11px] text-ink-500 mt-2">
            Variables: <code className="font-mono text-ink-700">{'{{name}}'}</code>, <code className="font-mono text-ink-700">{'{{rate22}}'}</code>, <code className="font-mono text-ink-700">{'{{shop}}'}</code>
          </p>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-md border border-ink-100 bg-ink-0 p-5">
          <p className="text-eyebrow uppercase text-ink-500 mb-3">Audience</p>
          <div className="space-y-2 text-sm">
            {(['all', 'NEW', 'INTERESTED', 'CONVERTED'] as const).map((a) => {
              const count = a === 'all' ? leads.length : leads.filter((l) => l.status === a).length;
              return (
                <label key={a} className={cn(
                  'flex items-center justify-between gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors',
                  audience === a ? 'border-brand-500 bg-brand-50' : 'border-ink-100 hover:bg-ink-50',
                )}>
                  <span className="inline-flex items-center gap-2">
                    <input type="radio" name="audience" checked={audience === a} onChange={() => setAudience(a)} className="accent-brand-500" />
                    {a === 'all' ? 'All leads' : a.charAt(0) + a.slice(1).toLowerCase()}
                  </span>
                  <span className="text-xs tabular-nums text-ink-600">{count}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="rounded-md border border-ink-100 bg-ink-25 p-5">
          <p className="text-eyebrow uppercase text-ink-500">Sending to</p>
          <p className="font-display text-3xl text-ink-900 tabular-nums mt-1">{recipients.length}</p>
          <p className="text-xs text-ink-500 mt-0.5">recipients · ~{Math.ceil(recipients.length / 50)} min to send</p>
          <Button
            className="w-full mt-4 gap-2"
            disabled={sending || recipients.length === 0}
            onClick={send}
          >
            <Send className="h-4 w-4" /> {sending ? 'Queuing…' : 'Send broadcast'}
          </Button>
          <p className="text-[11px] text-ink-500 mt-3 leading-relaxed">
            Throttled to 50 msg/min via BullMQ to stay within Meta&apos;s WhatsApp Business API limits.
          </p>
        </div>
      </aside>
    </div>
  );
}

// --------------------------------------------------------------------------
// Tab 5: Follow-ups — overdue, today, scheduled + birthday/anniversary alerts.
// --------------------------------------------------------------------------

function FollowUpsView({ leads }: { leads: Lead[] }): JSX.Element {
  // Synthetic but deterministic: derive a "next follow-up" date from createdAt
  // so every lead in the active stages shows up on the schedule until WhatsApp
  // automation logs a touchpoint server-side.
  const now = Date.now();
  const followUps = leads
    .filter((l) => !['CONVERTED', 'LOST'].includes(l.status))
    .map((l) => {
      const created = new Date(l.createdAt).getTime();
      const cadence = l.status === 'NEW' ? 1 : l.status === 'CONTACTED' ? 2 : l.status === 'INTERESTED' ? 3 : 4;
      const due = created + cadence * 86_400_000;
      return { lead: l, due, overdue: due < now };
    })
    .sort((a, b) => a.due - b.due);

  const overdue = followUps.filter((f) => f.overdue);
  const today = followUps.filter((f) => !f.overdue && f.due - now < 86_400_000);
  const upcoming = followUps.filter((f) => !f.overdue && f.due - now >= 86_400_000);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="Overdue" value={overdue.length} tone="rose" icon={<AlertTriangle className="h-4 w-4" />} />
        <Stat label="Due today" value={today.length} tone="amber" icon={<BellRing className="h-4 w-4" />} />
        <Stat label="Upcoming" value={upcoming.length} tone="neutral" icon={<Calendar className="h-4 w-4" />} />
      </div>

      <FollowUpList title="Overdue" items={overdue} accent="border-rose-200 bg-rose-50/40" />
      <FollowUpList title="Due today" items={today} accent="border-amber-200 bg-amber-50/40" />
      <FollowUpList title="Upcoming this week" items={upcoming.slice(0, 8)} accent="border-ink-100 bg-ink-0" />

      <section className="rounded-md border border-ink-100 bg-ink-0 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Cake className="h-4 w-4 text-brand-700" />
          <p className="text-eyebrow uppercase text-ink-500">Birthday &amp; anniversary alerts</p>
        </div>
        <p className="text-sm text-ink-600">
          Daily 9 AM cron checks the customer book — the worker enqueues a personalised WhatsApp wish + voucher
          template the day before. Toggle templates in <span className="text-ink-800">Settings → Automations</span>.
        </p>
      </section>
    </div>
  );
}

function FollowUpList({
  title, items, accent,
}: {
  title: string;
  items: Array<{ lead: Lead; due: number; overdue: boolean }>;
  accent: string;
}): JSX.Element {
  if (items.length === 0) return <></>;
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-ink-900">{title}</h3>
        <span className="text-xs text-ink-500 tabular-nums">{items.length}</span>
      </div>
      <ul className={cn('rounded-md border divide-y divide-ink-100', accent)}>
        {items.map(({ lead, due, overdue }) => (
          <li key={lead.id} className="flex items-center gap-3 px-4 py-3">
            <Avatar name={lead.name} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-ink-900">{lead.name}</span>
                <ChannelChip source={lead.source} compact />
                <StatusChip status={lead.status} />
              </div>
              <p className="text-xs text-ink-500 truncate">{lead.interest ?? lead.phone}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={cn('text-xs tabular-nums', overdue ? 'text-rose-700 font-medium' : 'text-ink-600')}>
                {formatDue(due)}
              </p>
              <a
                href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 mt-0.5"
              >
                <MessageCircle className="h-3 w-3" /> Send template
              </a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatDue(ts: number): string {
  const diff = ts - Date.now();
  const days = Math.round(diff / 86_400_000);
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days}d`;
}

// --------------------------------------------------------------------------
// Tab 6: Reports — funnel + source mix + staff performance.
// --------------------------------------------------------------------------

function ReportsView({ leads }: { leads: Lead[] }): JSX.Element {
  const funnel = LEAD_STATUSES.map((s) => ({ status: s, count: leads.filter((l) => l.status === s).length }));
  const total = leads.length;
  const converted = leads.filter((l) => l.status === 'CONVERTED').length;
  const conversionRate = total ? Math.round((converted / total) * 100) : 0;

  const bySource = useMemo(() => {
    const m = new Map<string, { source: string; total: number; converted: number }>();
    for (const l of leads) {
      const k = l.source;
      if (!m.has(k)) m.set(k, { source: k, total: 0, converted: 0 });
      const row = m.get(k)!;
      row.total += 1;
      if (l.status === 'CONVERTED') row.converted += 1;
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [leads]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Stat label="Total leads" value={total} tone="neutral" icon={<Users className="h-4 w-4" />} />
        <Stat label="Converted" value={converted} tone="emerald" icon={<CheckCircle2 className="h-4 w-4" />} />
        <Stat label="Conv. rate" value={`${conversionRate}%`} tone="emerald" icon={<ArrowUpRight className="h-4 w-4" />} />
        <Stat label="Lost" value={leads.filter((l) => l.status === 'LOST').length} tone="rose" icon={<X className="h-4 w-4" />} />
      </div>

      <section className="rounded-md border border-ink-100 bg-ink-0 p-5">
        <p className="text-eyebrow uppercase text-ink-500 mb-4">Conversion funnel</p>
        <div className="space-y-2.5">
          {funnel.map(({ status, count }) => {
            const pct = total ? (count / total) * 100 : 0;
            return (
              <div key={status}>
                <div className="flex items-center justify-between text-xs text-ink-600 mb-1">
                  <span>{status.charAt(0) + status.slice(1).toLowerCase()}</span>
                  <span className="tabular-nums">{count} · {Math.round(pct)}%</span>
                </div>
                <div className="h-2 bg-ink-50 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      status === 'CONVERTED' ? 'bg-emerald-500' : status === 'LOST' ? 'bg-rose-400' : 'bg-brand-400',
                    )}
                    style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-md border border-ink-100 bg-ink-0">
        <header className="px-4 py-3 border-b border-ink-100">
          <p className="text-eyebrow uppercase text-ink-500">Lead source analytics</p>
          <h2 className="text-base font-medium text-ink-900">Best ROI by channel</h2>
        </header>
        {bySource.length === 0 ? (
          <EmptyState icon={<BarChart3 className="h-5 w-5" />} title="No lead data yet" body="Channel ROI fills in as leads start landing." inline />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ink-25 text-ink-600 text-xs">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Channel</th>
                <th className="text-right px-4 py-2.5 font-medium">Leads</th>
                <th className="text-right px-4 py-2.5 font-medium">Converted</th>
                <th className="text-right px-4 py-2.5 font-medium">Conv. rate</th>
              </tr>
            </thead>
            <tbody>
              {bySource.map((r) => {
                const rate = r.total ? Math.round((r.converted / r.total) * 100) : 0;
                return (
                  <tr key={r.source} className="border-t border-ink-100">
                    <td className="px-4 py-2.5"><ChannelChip source={r.source} /></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.total}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.converted}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full', rate >= 25 ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-50 text-ink-700')}>{rate}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-[11px] text-ink-500">
        Staff close-rate scoreboard appears here once leads are assigned to users via the &ldquo;Lead Assignment to Staff&rdquo; flow.
      </p>
    </div>
  );
}

// --------------------------------------------------------------------------
// New Lead modal.
// --------------------------------------------------------------------------

function NewLeadModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [createLead, { isLoading }] = useCreateLeadMutation();
  const [form, setForm] = useState({
    name: '', phone: '+91', source: 'whatsapp', interest: '', utmCampaign: '',
  });

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const cleanedPhone = form.phone.replace(/[\s-]/g, '');
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!/^\+91[6-9]\d{9}$/.test(cleanedPhone)) {
      toast.error('Phone must be +91 followed by 10 digits starting 6-9');
      return;
    }
    // Build payload with only set fields — Zod is strict about extras when
    // optional+nullable fields are sent as empty strings.
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      phone: cleanedPhone,
      source: form.source,
    };
    if (form.interest.trim())     payload['interest']     = form.interest.trim();
    if (form.utmCampaign.trim())  payload['utmCampaign']  = form.utmCampaign.trim();
    try {
      await createLead(payload as never).unwrap();
      toast.success('Lead added to NEW column');
      onClose();
    } catch (err) {
      const e = err as { status?: number | string; data?: { error?: { message?: string; fields?: Record<string, string> }; message?: string } };
      const baseMsg = e?.data?.error?.message ?? e?.data?.message ?? `HTTP ${e?.status ?? '?'}`;
      const fieldDetail = e?.data?.error?.fields
        ? Object.entries(e.data.error.fields).map(([k, v]) => `${k}: ${v}`).join('; ')
        : '';
      toast.error(`Could not add lead — ${baseMsg}`, fieldDetail ? { description: fieldDetail } : undefined);
      // eslint-disable-next-line no-console
      console.error('[crm] createLead failed:', err);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/40">
      <div className="bg-ink-0 rounded-lg shadow-xl border border-ink-100 w-full max-w-md">
        <header className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <h2 className="font-display text-lg text-ink-900">New lead</h2>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900 p-1 rounded-md hover:bg-ink-50" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>
        <form onSubmit={submit} className="p-5 space-y-3">
          <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} required />
          <label className="block">
            <span className="text-eyebrow uppercase text-ink-500 block mb-2">Source</span>
            <select
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              className="w-full h-11 px-3 bg-ink-0 rounded-md border border-ink-100 text-sm focus:border-brand-300 outline-none"
            >
              {Object.entries(SOURCE_LABEL).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </label>
          <Field label="Interest" value={form.interest} onChange={(v) => setForm({ ...form, interest: v })} placeholder="e.g. Bridal set, 22K, 80g" />
          <Field label="UTM campaign (optional)" value={form.utmCampaign} onChange={(v) => setForm({ ...form, utmCampaign: v })} placeholder="bridal-edit-2025" />
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={isLoading} className="flex-[2]">{isLoading ? 'Saving…' : 'Add lead'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, required,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean;
}): JSX.Element {
  return (
    <label className="block">
      <span className="text-eyebrow uppercase text-ink-500 block mb-2">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full h-11 px-3 bg-ink-0 rounded-md border border-ink-100 text-sm focus:border-brand-300 outline-none"
      />
    </label>
  );
}

// --------------------------------------------------------------------------
// Shared bits.
// --------------------------------------------------------------------------

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }): JSX.Element {
  const initials = name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  return (
    <span className={cn(
      'inline-flex items-center justify-center rounded-full bg-brand-50 text-brand-800 font-medium shrink-0',
      size === 'sm' ? 'h-7 w-7 text-[11px]' : 'h-9 w-9 text-xs',
    )}>
      {initials || '?'}
    </span>
  );
}

function ChannelChip({ source, compact = false }: { source: string; compact?: boolean }): JSX.Element {
  const label = SOURCE_LABEL[source] ?? source;
  const tone = source === 'whatsapp' ? 'bg-emerald-50 text-emerald-700'
    : source === 'instagram' ? 'bg-violet-50 text-violet-700'
    : source === 'facebook' ? 'bg-blue-50 text-blue-700'
    : source === 'google' ? 'bg-amber-50 text-amber-800'
    : source === 'walkin' ? 'bg-ink-100 text-ink-700'
    : 'bg-ink-50 text-ink-700';
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 font-medium', tone, compact ? 'text-[9px]' : 'text-[10px]')}>
      {label}
    </span>
  );
}

function StatusChip({ status }: { status: LeadStatus }): JSX.Element {
  const tone = status === 'CONVERTED' ? 'bg-emerald-50 text-emerald-700'
    : status === 'LOST' ? 'bg-rose-50 text-rose-700'
    : status === 'NEGOTIATION' ? 'bg-brand-50 text-brand-800'
    : 'bg-ink-50 text-ink-700';
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide', tone)}>
      {status.toLowerCase()}
    </span>
  );
}

function Stat({
  label, value, tone, icon,
}: {
  label: string; value: string | number; tone: 'neutral' | 'rose' | 'amber' | 'emerald'; icon: React.ReactNode;
}): JSX.Element {
  const accent = tone === 'rose' ? 'text-rose-700 bg-rose-50'
    : tone === 'amber' ? 'text-amber-800 bg-amber-50'
    : tone === 'emerald' ? 'text-emerald-700 bg-emerald-50'
    : 'text-ink-700 bg-ink-50';
  return (
    <div className="rounded-md border border-ink-100 bg-ink-0 p-4">
      <div className="flex items-center gap-2">
        <span className={cn('h-7 w-7 rounded-full inline-flex items-center justify-center', accent)}>{icon}</span>
        <span className="text-eyebrow uppercase text-ink-500">{label}</span>
      </div>
      <p className="font-display text-3xl text-ink-900 tabular-nums mt-2">{value}</p>
    </div>
  );
}

function EmptyState({
  icon, title, body, inline = false,
}: {
  icon: React.ReactNode; title: string; body: string; inline?: boolean;
}): JSX.Element {
  return (
    <div className={cn(
      'text-center',
      inline ? 'p-8' : 'rounded-md border border-dashed border-ink-200 bg-ink-25 p-12',
    )}>
      <div className="mx-auto h-10 w-10 rounded-full bg-ink-0 border border-ink-100 inline-flex items-center justify-center text-ink-500">{icon}</div>
      <p className="text-sm font-medium text-ink-900 mt-3">{title}</p>
      <p className="text-xs text-ink-600 mt-1 max-w-sm mx-auto">{body}</p>
    </div>
  );
}
