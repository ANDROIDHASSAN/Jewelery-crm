// Team & Roles — super-admin command centre for managing staff and the
// permission model. Tabs: Members, Roles, Permissions reference.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Check,
  ChevronDown,
  Copy,
  KeyRound,
  Mail,
  Minus,
  Plus,
  ShieldCheck,
  ShieldOff,
  Store,
  Trash2,
  UserCircle2,
  X as XIcon,
} from 'lucide-react';
import {
  useListUsersQuery,
  useListRolesQuery,
  useListPermissionsQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useResetPasswordMutation,
  useSetUserPermissionsMutation,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
  useGetUserQuery,
  type RoleSummary,
} from '@/features/team/teamApi';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { TabStrip, type TabStripItem } from '@/components/ui/TabStrip';
import { cn } from '@/lib/cn';
import { MODULE_LABELS, MODULE_ORDER, PERMISSIONS } from '@goldos/shared/constants';

// Lookup map: dot-notation key → friendly label/description from the shared
// catalog. Permissions returned by the API include `description` but not
// `label`, so we merge with the local catalog (single source of truth).
const PERM_DISPLAY: Record<string, { label: string; description: string }> = Object.fromEntries(
  PERMISSIONS.map((p) => [p.key, { label: p.label, description: p.description }]),
);

function permLabel(key: string): string {
  return PERM_DISPLAY[key]?.label ?? key;
}
function permDescription(key: string): string {
  return PERM_DISPLAY[key]?.description ?? '';
}
function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? module.charAt(0).toUpperCase() + module.slice(1);
}

/** Sort & group an array of permissions by module, in the order set by MODULE_ORDER. */
function groupByModule<T extends { module: string }>(rows: readonly T[]): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const arr = map.get(r.module) ?? [];
    arr.push(r);
    map.set(r.module, arr);
  }
  const ordered: Array<[string, T[]]> = [];
  for (const mod of MODULE_ORDER) {
    if (map.has(mod)) {
      ordered.push([mod, map.get(mod)!]);
      map.delete(mod);
    }
  }
  // Anything not in MODULE_ORDER → tack on alphabetically so new modules still show.
  for (const mod of [...map.keys()].sort()) {
    ordered.push([mod, map.get(mod)!]);
  }
  return ordered;
}

type Tab = 'members' | 'roles' | 'permissions';

export function TeamPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('members');
  const teamTabs: TabStripItem<Tab>[] = [
    { id: 'members', label: 'Members' },
    { id: 'roles', label: 'Roles' },
    { id: 'permissions', label: 'Permissions reference' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <PageHeader
        eyebrow="Team & roles"
        title="Members, roles & permissions"
        description={
          <>
            Create staff accounts, assign roles, and customise what each role can do. Built-in roles can be edited;
            you can also create custom roles for desks like &ldquo;Bridal Consultant&rdquo; or &ldquo;Day-Shift Lead&rdquo;.
          </>
        }
        bare
      />

      <TabStrip<Tab> items={teamTabs} value={tab} onChange={setTab} />

      {tab === 'members' && <MembersTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'permissions' && <PermissionsReferenceTab />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Members tab
// ─────────────────────────────────────────────────────────────────────────────

function MembersTab(): JSX.Element {
  const [q, setQ] = useState('');
  const [addingOpen, setAddingOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const { data, isLoading } = useListUsersQuery({ q: q || undefined });
  const users = data?.data ?? [];

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Input
          placeholder="Search by name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full sm:max-w-sm"
        />
        <Button onClick={() => setAddingOpen(true)} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-1.5" /> Add member
        </Button>
      </div>

      {/* Mobile: card list ----------------------------------------------- */}
      <div className="md:hidden space-y-2">
        {isLoading && <p className="text-sm text-ink-500 text-center py-6">Loading…</p>}
        {!isLoading && users.length === 0 && (
          <EmptyState title="No team members yet" body="Add your first staff account to start delegating." />
        )}
        {users.map((u) => (
          <button
            key={u.id}
            onClick={() => setEditingUserId(u.id)}
            className="w-full text-left rounded-md border border-ink-100 bg-ink-0 p-3 hover:border-brand-300 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink-900 truncate">{u.name}</div>
                <div className="text-xs text-ink-500 truncate">{u.email}</div>
              </div>
              {u.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Disabled</Badge>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <RoleBadge slug={u.role.slug} name={u.role.name} />
              {u.shop && <span className="text-ink-500">{u.shop.name}</span>}
              {u.totpEnabled
                ? <span className="text-success-600 inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" />2FA</span>
                : <span className="text-ink-400 inline-flex items-center gap-1"><ShieldOff className="h-3 w-3" />No 2FA</span>}
              <span className="text-ink-400">
                {u.lastLoginAt ? `last seen ${new Date(u.lastLoginAt).toLocaleDateString('en-IN')}` : 'never signed in'}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Tablet+ : table ------------------------------------------------- */}
      <div className="hidden md:block rounded-md border border-ink-100 bg-ink-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="text-left text-ink-500 bg-ink-25">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Shop</th>
              <th className="px-4 py-2.5 font-medium hidden lg:table-cell">2FA</th>
              <th className="px-4 py-2.5 font-medium hidden lg:table-cell">Last sign-in</th>
              <th className="px-4 py-2.5 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-ink-500">Loading…</td></tr>
            )}
            {!isLoading && users.length === 0 && (
              <tr><td colSpan={7}><EmptyState title="No team members yet" body="Add your first staff account to start delegating." /></td></tr>
            )}
            {users.map((u) => (
              <tr
                key={u.id}
                onClick={() => setEditingUserId(u.id)}
                className="border-t border-ink-50 hover:bg-ink-25 cursor-pointer"
              >
                <td className="px-4 py-3 text-ink-900 font-medium">{u.name}</td>
                <td className="px-4 py-3 text-ink-700 text-xs">{u.email}</td>
                <td className="px-4 py-3"><RoleBadge slug={u.role.slug} name={u.role.name} /></td>
                <td className="px-4 py-3 text-ink-600">{u.shop?.name ?? <span className="text-ink-400">—</span>}</td>
                <td className="px-4 py-3 hidden lg:table-cell">{u.totpEnabled ? <span className="text-success-600 inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />On</span> : <span className="text-ink-400 inline-flex items-center gap-1"><ShieldOff className="h-3.5 w-3.5" />Off</span>}</td>
                <td className="px-4 py-3 text-ink-500 text-xs hidden lg:table-cell">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-IN') : <span className="text-ink-400">never</span>}</td>
                <td className="px-4 py-3 text-right">
                  {u.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Disabled</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AddUserSheet open={addingOpen} onClose={() => setAddingOpen(false)} />
      {editingUserId && <EditUserSheet userId={editingUserId} onClose={() => setEditingUserId(null)} />}
    </section>
  );
}

function RoleBadge({ slug, name }: { slug: string; name: string }): JSX.Element {
  const tone =
    slug === 'SUPER_ADMIN' ? 'bg-brand-100 text-brand-800' :
    slug === 'ACCOUNTANT' ? 'bg-info-50 text-info-700' :
    slug === 'EMPLOYEE' ? 'bg-ink-100 text-ink-800' :
    slug === 'POS_USER' ? 'bg-warning-50 text-warning-700' : 'bg-ink-50 text-ink-700';
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs', tone)}>{name}</span>;
}

function AddUserSheet({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const { data: rolesData } = useListRolesQuery();
  const { data: shopsData } = useGetShopsQuery();
  const [create, { isLoading }] = useCreateUserMutation();
  const [form, setForm] = useState({ name: '', email: '', phone: '', shopId: '', roleId: '' });
  const [generated, setGenerated] = useState<string | null>(null);

  const roles = rolesData?.data ?? [];
  const shops = shopsData?.data ?? [];

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!form.roleId) {
      toast.error('Pick a role first.');
      return;
    }
    try {
      const result = await create({
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        shopId: form.shopId || null,
        roleId: form.roleId,
      }).unwrap();
      if (result.data.initialPassword) {
        setGenerated(result.data.initialPassword);
        toast.success('User created. Share the temp password below.');
      } else {
        toast.success('User created.');
        onClose();
      }
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Failed to create user');
    }
  }

  function copy(): void {
    if (!generated) return;
    void navigator.clipboard.writeText(generated);
    toast.success('Copied to clipboard');
  }

  function reset(): void {
    setForm({ name: '', email: '', phone: '', shopId: '', roleId: '' });
    setGenerated(null);
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) reset(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md md:max-w-lg p-0 flex flex-col"
      >
        <header className="sticky top-0 z-10 bg-ink-0 border-b border-ink-100 px-5 sm:px-6 py-4 pr-12">
          <h2 className="font-display text-md sm:text-lg text-ink-900">
            {generated ? 'Temporary password' : 'Add a new team member'}
          </h2>
          <p className="text-xs text-ink-500 mt-0.5">
            {generated
              ? 'Share this password once — they will change it on first login.'
              : 'They will receive an auto-generated password to change on first login.'}
          </p>
        </header>

        {generated ? (
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
            <p className="text-sm text-ink-600">
              Hand this to <strong>{form.name}</strong> at{' '}
              <span className="text-ink-700">{form.email}</span>. The password is shown <em>once</em> — copy
              it now, you can't retrieve it later.
            </p>
            <div className="rounded-md border border-warning-200 bg-warning-50 p-4 flex items-center justify-between gap-3">
              <code className="font-mono text-lg text-ink-900 break-all">{generated}</code>
              <button
                type="button"
                onClick={copy}
                className="shrink-0 inline-flex items-center gap-1 text-xs text-ink-700 hover:text-ink-900 rounded-md border border-ink-200 bg-ink-0 px-2.5 py-1.5"
                aria-label="Copy password"
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
            </div>
            <Button onClick={reset} className="w-full" size="lg">Done</Button>
          </div>
        ) : (
          <form className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4" onSubmit={submit} id="add-user-form">
            <Field label="Full name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} placeholder="Anant K." />
            </Field>
            <Field label="Email" hint="They'll use this to sign in.">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="staff@yourjewellers.in" />
            </Field>
            <Field label="Phone (optional)">
              <Input placeholder="+91 98765 43210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Role">
                <select
                  className="w-full h-9 rounded-md border border-ink-200 px-3 text-sm bg-ink-0"
                  value={form.roleId}
                  onChange={(e) => setForm({ ...form, roleId: e.target.value })}
                  required
                >
                  <option value="">Select a role…</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}{r.isSystem ? '' : ' (custom)'}</option>
                  ))}
                </select>
              </Field>
              <Field label="Branch shop" hint="Required for POS Cashiers.">
                <select
                  className="w-full h-9 rounded-md border border-ink-200 px-3 text-sm bg-ink-0"
                  value={form.shopId}
                  onChange={(e) => setForm({ ...form, shopId: e.target.value })}
                >
                  <option value="">No specific shop</option>
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </Field>
            </div>
          </form>
        )}

        {!generated && (
          <footer className="sticky bottom-0 bg-ink-0 border-t border-ink-100 px-5 sm:px-6 py-3 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
            <Button type="button" variant="secondary" onClick={reset} className="sm:order-1">
              Cancel
            </Button>
            <Button
              type="submit"
              form="add-user-form"
              disabled={isLoading}
              className="sm:order-2 sm:min-w-[160px]"
            >
              {isLoading ? 'Creating…' : 'Create member'}
            </Button>
          </footer>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Initials from a name: "Anant K." → "AK", "Neha T." → "NT". */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Compact tri-state pill for a single permission. The three states map to:
 *   - allow:   green check (granted by role or explicit user grant)
 *   - deny:    red cross (explicit user deny — overrides role)
 *   - inherit: grey dash (role doesn't grant it, no explicit override)
 *
 * Click cycles inherit → allow → deny → inherit so the cashier can fine-tune
 * without ever needing to think about role internals.
 */
function PermStateBadge({ state }: { state: 'allow' | 'deny' | 'inherit' }): JSX.Element {
  return (
    <span
      className={cn(
        'shrink-0 mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full border text-[11px] font-medium',
        state === 'allow' && 'border-success-400 bg-success-100 text-success-700',
        state === 'deny' && 'border-danger-300 bg-danger-100 text-danger-700',
        state === 'inherit' && 'border-ink-200 bg-ink-0 text-ink-400',
      )}
      aria-hidden
    >
      {state === 'allow' ? <Check className="h-3 w-3" /> : state === 'deny' ? <XIcon className="h-3 w-3" /> : <Minus className="h-2.5 w-2.5" />}
    </span>
  );
}

function EditUserSheet({ userId, onClose }: { userId: string; onClose: () => void }): JSX.Element {
  const { data, isLoading } = useGetUserQuery(userId);
  const { data: rolesData } = useListRolesQuery();
  const { data: permsData } = useListPermissionsQuery();
  const { data: shopsData } = useGetShopsQuery();
  const [update] = useUpdateUserMutation();
  const [reset] = useResetPasswordMutation();
  const [setPerms] = useSetUserPermissionsMutation();
  const [resetResult, setResetResult] = useState<string | null>(null);
  // Modules start collapsed-by-default once there are 4+ groups, so the
  // sheet doesn't scroll forever on mobile.
  const [expandedModules, setExpandedModules] = useState<Set<string>>(() => new Set());

  const user = data?.data;
  const roles = rolesData?.data ?? [];
  const allPerms = permsData?.data ?? [];
  const shops = shopsData?.data ?? [];

  const currentRole = roles.find((r) => r.id === user?.roleId);
  const rolePermKeys = useMemo(
    () => new Set(currentRole?.permissions.map((p) => p.permission.key) ?? []),
    [currentRole],
  );
  const grants = useMemo(
    () => new Set(user?.permissionOverrides.filter((o) => o.granted).map((o) => o.permission.key) ?? []),
    [user],
  );
  const denies = useMemo(
    () => new Set(user?.permissionOverrides.filter((o) => !o.granted).map((o) => o.permission.key) ?? []),
    [user],
  );

  const groupedPerms = useMemo(() => groupByModule(allPerms), [allPerms]);

  // Effective-permission summary across all modules, for the section header.
  const summary = useMemo(() => {
    let allowed = 0;
    let denied = 0;
    let inherited = 0;
    for (const p of allPerms) {
      if (denies.has(p.key)) denied += 1;
      else if (grants.has(p.key) || rolePermKeys.has(p.key)) allowed += 1;
      else inherited += 1;
    }
    return { allowed, denied, inherited };
  }, [allPerms, grants, denies, rolePermKeys]);

  async function saveProfile(patch: { name?: string; roleId?: string; shopId?: string | null; isActive?: boolean }): Promise<void> {
    try {
      await update({ id: userId, patch }).unwrap();
      toast.success('Saved');
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Save failed');
    }
  }

  async function togglePerm(key: string, current: 'allow' | 'deny' | 'inherit'): Promise<void> {
    if (!user) return;
    const nextGrants = new Set(grants);
    const nextDenies = new Set(denies);
    nextGrants.delete(key);
    nextDenies.delete(key);
    const inRole = rolePermKeys.has(key);
    if (current === 'inherit') {
      // inherit → allow if role doesn't grant it, otherwise inherit → deny.
      if (inRole) nextDenies.add(key);
      else nextGrants.add(key);
    } else if (current === 'allow') {
      // allow → deny.
      nextDenies.add(key);
    }
    // 'deny' → inherit (both sets clear, fall-through).
    try {
      await setPerms({ id: userId, grants: [...nextGrants], denies: [...nextDenies], reason: null }).unwrap();
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Failed to update permissions');
    }
  }

  async function resetPassword(): Promise<void> {
    try {
      const out = await reset({ id: userId, forceChangeOnNextLogin: true }).unwrap();
      if (out.data.temporaryPassword) setResetResult(out.data.temporaryPassword);
      toast.success('Password reset');
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Failed to reset password');
    }
  }

  function toggleModule(mod: string): void {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod);
      else next.add(mod);
      return next;
    });
  }

  return (
    <Sheet open onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md md:max-w-xl p-0 flex flex-col"
      >
        {/* Sticky header ------------------------------------------------- */}
        <header className="sticky top-0 z-10 bg-ink-0 border-b border-ink-100 px-5 sm:px-6 pt-5 pb-4">
          {isLoading || !user ? (
            <div className="h-12 flex items-center text-sm text-ink-500">Loading…</div>
          ) : (
            <div className="flex items-start gap-3 pr-8">
              <div className="h-11 w-11 sm:h-12 sm:w-12 shrink-0 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold">
                {initialsOf(user.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display text-md sm:text-lg text-ink-900 truncate">{user.name}</h2>
                  {!user.isActive && <Badge tone="neutral">Disabled</Badge>}
                </div>
                <div className="text-xs sm:text-sm text-ink-500 flex items-center gap-1.5 mt-0.5 truncate">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{user.email}</span>
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <RoleBadge slug={user.role.slug} name={user.role.name} />
                  {user.shop && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-ink-500">
                      <Store className="h-3 w-3" />
                      {user.shop.name}
                    </span>
                  )}
                  {user.totpEnabled && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-success-700">
                      <ShieldCheck className="h-3 w-3" />2FA
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </header>

        {/* Body --------------------------------------------------------- */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
          {isLoading || !user ? (
            <div className="text-sm text-ink-500">Loading member details…</div>
          ) : (
            <>
              {/* Profile card ------------------------------------------- */}
              <section className="rounded-lg border border-ink-100 bg-ink-0">
                <div className="px-4 py-3 border-b border-ink-100 flex items-center gap-2">
                  <UserCircle2 className="h-4 w-4 text-ink-500" />
                  <h3 className="text-sm font-medium text-ink-700">Profile</h3>
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Full name" className="sm:col-span-2">
                    <Input
                      defaultValue={user.name}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value !== user.name) {
                          void saveProfile({ name: e.target.value });
                        }
                      }}
                    />
                  </Field>
                  <Field label="Role">
                    <select
                      className="w-full h-9 rounded-md border border-ink-200 px-3 text-sm bg-ink-0"
                      value={user.roleId}
                      onChange={(e) => void saveProfile({ roleId: e.target.value })}
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}{r.isSystem ? '' : ' (custom)'}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Branch shop">
                    <select
                      className="w-full h-9 rounded-md border border-ink-200 px-3 text-sm bg-ink-0"
                      value={user.shopId ?? ''}
                      onChange={(e) => void saveProfile({ shopId: e.target.value || null })}
                    >
                      <option value="">No specific shop</option>
                      {shops.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="px-4 py-3 border-t border-ink-100 bg-ink-25 rounded-b-lg flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={resetPassword}>
                    <KeyRound className="h-4 w-4 mr-1.5" />Reset password
                  </Button>
                  <Button
                    variant={user.isActive ? 'outline' : 'secondary'}
                    size="sm"
                    onClick={() => void saveProfile({ isActive: !user.isActive })}
                    className={cn(user.isActive && 'text-danger-700 border-danger-200 hover:bg-danger-50')}
                  >
                    {user.isActive ? 'Deactivate account' : 'Re-activate account'}
                  </Button>
                </div>
                {resetResult && (
                  <div className="mx-4 mb-4 rounded-md border border-warning-200 bg-warning-50 p-3 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="text-xs text-warning-700 font-medium">Temporary password (shown once)</div>
                      <code className="font-mono text-ink-900 text-sm break-all">{resetResult}</code>
                    </div>
                    <button
                      type="button"
                      onClick={() => { void navigator.clipboard.writeText(resetResult); toast.success('Copied'); }}
                      className="shrink-0 text-ink-500 hover:text-ink-800"
                      aria-label="Copy temp password"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </section>

              {/* Permissions card ------------------------------------- */}
              <section className="rounded-lg border border-ink-100 bg-ink-0">
                <div className="px-4 py-3 border-b border-ink-100">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-ink-700">What this member can do</h3>
                      <p className="text-xs text-ink-500 mt-0.5">
                        Tap any row to override the role default.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <SummaryStat tone="success" label="Allowed" value={summary.allowed} />
                    <SummaryStat tone="danger" label="Denied" value={summary.denied} />
                    <SummaryStat tone="neutral" label="No access" value={summary.inherited} />
                  </div>
                </div>

                <div>
                  {groupedPerms.map(([mod, perms], idx) => {
                    const open = expandedModules.has(mod);
                    const modAllowed = perms.filter((p) => !denies.has(p.key) && (grants.has(p.key) || rolePermKeys.has(p.key))).length;
                    return (
                      <div key={mod} className={cn(idx > 0 && 'border-t border-ink-50')}>
                        <button
                          type="button"
                          onClick={() => toggleModule(mod)}
                          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-ink-25 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <ChevronDown
                              className={cn('h-4 w-4 text-ink-400 transition-transform shrink-0', !open && '-rotate-90')}
                            />
                            <span className="text-sm font-medium text-ink-900 truncate">
                              {moduleLabel(mod)}
                            </span>
                          </div>
                          <span className="text-[11px] text-ink-500 shrink-0 tabular-nums">
                            {modAllowed} / {perms.length}
                          </span>
                        </button>
                        {open && (
                          <ul className="px-2 pb-2">
                            {perms.map((p) => {
                              const state: 'allow' | 'deny' | 'inherit' =
                                denies.has(p.key) ? 'deny' :
                                grants.has(p.key) ? 'allow' :
                                rolePermKeys.has(p.key) ? 'allow' : 'inherit';
                              const explicit = grants.has(p.key) || denies.has(p.key);
                              return (
                                <li key={p.key}>
                                  <button
                                    type="button"
                                    onClick={() => void togglePerm(p.key, state)}
                                    className={cn(
                                      'w-full flex items-start gap-3 rounded-md px-2.5 py-2 text-left transition-colors',
                                      state === 'allow' && 'hover:bg-success-50/60',
                                      state === 'deny' && 'hover:bg-danger-50/60',
                                      state === 'inherit' && 'hover:bg-ink-50',
                                    )}
                                    aria-label={`Toggle ${permLabel(p.key)}`}
                                  >
                                    <PermStateBadge state={state} />
                                    <span className="min-w-0 flex-1">
                                      <span className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm text-ink-900">{permLabel(p.key)}</span>
                                        {explicit && (
                                          <Badge tone={state === 'allow' ? 'success' : 'warning'}>
                                            Override
                                          </Badge>
                                        )}
                                      </span>
                                      <span className="block text-xs text-ink-500 mt-0.5 leading-snug">
                                        {permDescription(p.key) || p.description}
                                      </span>
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>

        {/* Sticky footer ------------------------------------------------- */}
        <footer className="sticky bottom-0 bg-ink-0 border-t border-ink-100 px-5 sm:px-6 py-3 flex items-center justify-between gap-2">
          <p className="text-xs text-ink-500 hidden sm:block">Changes save automatically.</p>
          <Button variant="secondary" size="sm" onClick={onClose} className="ml-auto">Done</Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}

function SummaryStat({ tone, label, value }: { tone: 'success' | 'danger' | 'neutral'; label: string; value: number }): JSX.Element {
  return (
    <div className={cn(
      'rounded-md py-2',
      tone === 'success' && 'bg-success-50',
      tone === 'danger' && 'bg-danger-50',
      tone === 'neutral' && 'bg-ink-25',
    )}>
      <div className={cn(
        'text-sm font-semibold tabular-nums',
        tone === 'success' && 'text-success-700',
        tone === 'danger' && 'text-danger-700',
        tone === 'neutral' && 'text-ink-700',
      )}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-ink-500">{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Roles tab
// ─────────────────────────────────────────────────────────────────────────────

function RolesTab(): JSX.Element {
  const { data, isLoading } = useListRolesQuery();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RoleSummary | null>(null);

  const roles = data?.data ?? [];

  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-1.5" /> New role
        </Button>
      </div>

      {isLoading && <p className="text-sm text-ink-500">Loading…</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {roles.map((r) => (
          <button
            key={r.id}
            onClick={() => setEditing(r)}
            className="text-left rounded-md border border-ink-100 bg-ink-0 p-4 hover:border-brand-300 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-ink-900 truncate">{r.name}</h3>
                <p className="text-[10px] text-ink-400 mt-0.5 font-mono">{r.slug}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1 justify-end">
                {r.isSystem && <Badge tone="neutral">Built-in</Badge>}
                <Badge tone="info">{r._count.users}</Badge>
              </div>
            </div>
            <p className="text-sm text-ink-500 mt-2 line-clamp-2">{r.description ?? 'No description.'}</p>
            <p className="text-xs text-ink-500 mt-3">{r.permissions.length} permissions enabled</p>
          </button>
        ))}
      </div>

      <RoleSheet
        open={creating}
        onClose={() => setCreating(false)}
        mode="create"
      />
      {editing && (
        <RoleSheet
          open
          onClose={() => setEditing(null)}
          mode="edit"
          role={editing}
        />
      )}
    </section>
  );
}

function RoleSheet({
  open,
  onClose,
  mode,
  role,
}: {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  role?: RoleSummary;
}): JSX.Element {
  const { data: permsData } = useListPermissionsQuery();
  const [create, { isLoading: creating }] = useCreateRoleMutation();
  const [update, { isLoading: updating }] = useUpdateRoleMutation();
  const [remove, { isLoading: removing }] = useDeleteRoleMutation();

  const [form, setForm] = useState({
    name: role?.name ?? '',
    slug: role?.slug ?? '',
    description: role?.description ?? '',
  });
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(role?.permissions.map((p) => p.permission.key) ?? []),
  );

  const allPerms = permsData?.data ?? [];
  const groupedPerms = useMemo(() => groupByModule(allPerms), [allPerms]);

  function toggle(key: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    try {
      if (mode === 'create') {
        await create({
          slug: form.slug.toUpperCase(),
          name: form.name,
          description: form.description || null,
          permissionKeys: [...selected],
        }).unwrap();
        toast.success('Role created.');
      } else if (role) {
        await update({
          id: role.id,
          patch: {
            name: form.name,
            description: form.description || null,
            permissionKeys: [...selected],
          },
        }).unwrap();
        toast.success('Role updated.');
      }
      onClose();
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Failed to save role');
    }
  }

  async function destroy(): Promise<void> {
    if (!role) return;
    if (!confirm(`Delete the role "${role.name}"? This cannot be undone.`)) return;
    try {
      await remove(role.id).unwrap();
      toast.success('Role deleted');
      onClose();
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Failed to delete role');
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg md:max-w-2xl p-0 flex flex-col"
      >
        <header className="sticky top-0 z-10 bg-ink-0 border-b border-ink-100 px-5 sm:px-6 py-4 pr-12">
          <h2 className="font-display text-md sm:text-lg text-ink-900">
            {mode === 'create' ? 'Create a new role' : `Edit "${role?.name}"`}
          </h2>
          <p className="text-xs text-ink-500 mt-0.5">
            {mode === 'create'
              ? 'Bundle a set of permissions that you can then assign to staff.'
              : role?.isSystem
                ? 'Built-in role. The internal slug can\'t change, but you can edit name, description and permissions.'
                : 'Custom role.'}
          </p>
        </header>

        <form onSubmit={save} id="role-form" className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
          <section className="rounded-lg border border-ink-100 bg-ink-0 p-4 space-y-4">
            <Field label="Display name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} placeholder="Bridal Consultant" />
            </Field>
            {mode === 'create' ? (
              <Field label="Internal slug" hint="UPPER_SNAKE_CASE. Used in code, never shown to staff.">
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                  required
                  placeholder="BRIDAL_DESK"
                  pattern="^[A-Z][A-Z0-9_]*$"
                />
              </Field>
            ) : (
              <Field label="Internal slug">
                <code className="text-xs text-ink-500 font-mono">{role?.slug}</code>
              </Field>
            )}
            <Field label="Description">
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this role does day-to-day" />
            </Field>
          </section>

          <section className="rounded-lg border border-ink-100 bg-ink-0">
            <div className="px-4 py-3 border-b border-ink-100 flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h4 className="text-sm font-medium text-ink-700">What this role can do</h4>
                <p className="text-xs text-ink-500 mt-0.5 tabular-nums">
                  {selected.size} of {allPerms.length} permissions enabled
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setSelected(new Set(allPerms.map((p) => p.key)))}
                  className="text-ink-500 hover:text-ink-800"
                >
                  Select all
                </button>
                <span className="text-ink-300">·</span>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="text-ink-500 hover:text-ink-800"
                >
                  Clear
                </button>
              </div>
            </div>
            <div>
              {groupedPerms.map(([mod, perms], idx) => {
                const moduleAllChecked = perms.every((p) => selected.has(p.key));
                const moduleSomeChecked = !moduleAllChecked && perms.some((p) => selected.has(p.key));
                const moduleCount = perms.filter((p) => selected.has(p.key)).length;
                return (
                  <div key={mod} className={cn(idx > 0 && 'border-t border-ink-50')}>
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-ink-25/50">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[11px] uppercase tracking-wider text-ink-600 font-medium truncate">
                          {moduleLabel(mod)}
                        </span>
                        <span className="text-[10px] text-ink-500 tabular-nums">
                          {moduleCount}/{perms.length}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (moduleAllChecked) {
                              perms.forEach((p) => next.delete(p.key));
                            } else {
                              perms.forEach((p) => next.add(p.key));
                            }
                            return next;
                          });
                        }}
                        className="text-[11px] text-ink-500 hover:text-ink-800 shrink-0"
                      >
                        {moduleAllChecked ? 'Uncheck all' : moduleSomeChecked ? 'Check rest' : 'Check all'}
                      </button>
                    </div>
                    <ul className="px-2 py-1">
                      {perms.map((p) => (
                        <li key={p.key}>
                          <label className="flex items-start gap-2.5 cursor-pointer rounded-md px-2 py-2 hover:bg-ink-25">
                            <input
                              type="checkbox"
                              checked={selected.has(p.key)}
                              onChange={() => toggle(p.key)}
                              className="mt-0.5 shrink-0 h-4 w-4 rounded border-ink-300 text-brand-500 focus:ring-brand-400"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-ink-900">{permLabel(p.key)}</div>
                              <p className="text-xs text-ink-500 mt-0.5 leading-snug">{permDescription(p.key) || p.description}</p>
                            </div>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        </form>

        <footer className="sticky bottom-0 bg-ink-0 border-t border-ink-100 px-5 sm:px-6 py-3 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            {mode === 'edit' && role && !role.isSystem ? (
              <Button type="button" variant="ghost" onClick={destroy} disabled={removing} className="text-danger-600 hover:bg-danger-50 hover:text-danger-700 w-full sm:w-auto">
                <Trash2 className="h-4 w-4 mr-1.5" />Delete role
              </Button>
            ) : null}
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <Button type="button" variant="secondary" onClick={onClose} className="sm:order-1">
              Cancel
            </Button>
            <Button
              type="submit"
              form="role-form"
              disabled={creating || updating}
              className="sm:order-2 sm:min-w-[160px]"
            >
              {creating || updating ? 'Saving…' : mode === 'create' ? 'Create role' : 'Save changes'}
            </Button>
          </div>
        </footer>
      </SheetContent>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Permissions reference tab
// ─────────────────────────────────────────────────────────────────────────────

function PermissionsReferenceTab(): JSX.Element {
  const { data } = useListPermissionsQuery();
  const perms = data?.data ?? [];
  const grouped = useMemo(() => groupByModule(perms), [perms]);

  return (
    <section className="space-y-4">
      <p className="text-sm text-ink-500 max-w-2xl">
        Everything a role can do. Use this as your reference when building a custom role or granting
        a one-off permission to a single team member.
      </p>
      {grouped.map(([mod, list]) => (
        <div key={mod} className="rounded-md border border-ink-100 bg-ink-0 overflow-hidden">
          <div className="px-4 py-2.5 bg-ink-25 text-xs uppercase tracking-wider text-ink-500 font-medium">
            {moduleLabel(mod)}
          </div>
          <ul className="divide-y divide-ink-50">
            {list.map((p) => (
              <li key={p.key} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                <div className="sm:w-72 sm:shrink-0">
                  <div className="text-sm text-ink-900 font-medium">{permLabel(p.key)}</div>
                </div>
                <span className="text-xs sm:text-sm text-ink-500">
                  {permDescription(p.key) || p.description}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Field({
  label,
  children,
  className,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}): JSX.Element {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs text-ink-600">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-ink-500">{hint}</p>}
    </div>
  );
}
