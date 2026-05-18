// Public landing page for an invitation link. Anyone with the token can
// access this — that's intentional. The token is the auth: 256 bits of
// entropy, server-side rate-limited via authRateLimit, single-use.
//
// Flow:
//   1. Fetch /auth/invitation/:token to preview (email + role + tenant name).
//   2. Show name + password + optional phone form.
//   3. POST /auth/invitation/accept → user row created, password set.
//   4. Redirect to /admin/login with the email prefilled.
//
// We deliberately do NOT auto-login the user — they must complete a normal
// email/password login from a clean state. That way the audit log shows a
// LOGIN_SUCCESS as the first real session entry, and any 2FA enrolment they
// add later applies to a freshly-authenticated session.

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Shield, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface InvitationPreview {
  email: string;
  name: string;
  roleName: string;
  shopName: string | null;
  tenantName: string;
  expiresAt: string;
}

const API_BASE = '/api/v1';

export function AcceptInvitationPage(): JSX.Element {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Validate the token + load the invitation metadata.
  useEffect(() => {
    let cancelled = false;
    async function run(): Promise<void> {
      try {
        const res = await fetch(`${API_BASE}/auth/invitation/${encodeURIComponent(token)}`, {
          method: 'GET',
          credentials: 'include',
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(body?.error?.message ?? `Invalid invitation link (${res.status})`);
        }
        const body = (await res.json()) as { data: InvitationPreview };
        if (cancelled) return;
        setPreview(body.data);
        setName(body.data.name);
      } catch (err) {
        if (!cancelled) setPreviewError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!preview) return;
    if (password.length < 10) {
      toast.error('Password must be at least 10 characters');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (phone && !/^\+91[6-9]\d{9}$/.test(phone)) {
      toast.error('Phone must be +91 followed by 10 digits starting 6–9');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/invitation/accept`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          name: name.trim(),
          password,
          phone: phone || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body?.error?.message ?? `Could not accept invitation (${res.status})`);
      }
      toast.success('Account created · please sign in');
      navigate(`/admin/login?email=${encodeURIComponent(preview.email)}`, { replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Shell>
        <p className="text-sm text-ink-500">Validating your invitation…</p>
      </Shell>
    );
  }

  if (previewError) {
    return (
      <Shell>
        <div className="flex flex-col items-center text-center gap-4">
          <div className="h-12 w-12 rounded-full bg-rose-50 inline-flex items-center justify-center text-rose-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl text-ink-900">Invitation can&apos;t be used</h1>
            <p className="mt-2 text-sm text-ink-600 max-w-prose">{previewError}</p>
            <p className="mt-3 text-xs text-ink-500">
              Ask the person who invited you to send a fresh link. Links are valid for 7 days and can only be used once.
            </p>
          </div>
          <Link to="/admin/login" className="text-sm text-brand-700 underline decoration-brand-200 underline-offset-4">
            Back to sign in
          </Link>
        </div>
      </Shell>
    );
  }

  if (!preview) return <Shell><></></Shell>;

  return (
    <Shell>
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-full bg-brand-50 inline-flex items-center justify-center text-brand-700">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <p className="text-eyebrow uppercase text-ink-500">{preview.tenantName}</p>
          <h1 className="font-display text-2xl text-ink-900">You&apos;re invited as {preview.roleName}</h1>
        </div>
      </div>

      <div className="rounded-md border border-ink-100 bg-ink-25 p-4 mb-6 text-sm space-y-1">
        <Row label="Email">{preview.email}</Row>
        <Row label="Role">{preview.roleName}</Row>
        {preview.shopName && <Row label="Shop">{preview.shopName}</Row>}
        <Row label="Link expires">{new Date(preview.expiresAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</Row>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="name">Your name</Label>
          <Input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>

        <div>
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input id="phone" type="tel" placeholder="+919XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          <p className="text-[11px] text-ink-500 mt-1">For 2FA SMS + bill receipt access.</p>
        </div>

        <div>
          <Label htmlFor="password">Choose a password</Label>
          <Input id="password" type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          <p className="text-[11px] text-ink-500 mt-1">At least 10 characters. Mix of letters, numbers, symbols recommended.</p>
        </div>

        <div>
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" required minLength={10} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </div>

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <div className="mt-6 flex items-start gap-2 text-[11px] text-ink-500 border-t border-ink-100 pt-4">
        <CheckCircle2 className="h-3.5 w-3.5 text-brand-700 mt-0.5 shrink-0" />
        <p>
          Your password is hashed (argon2id) before storage. We never see it. Enable 2FA in
          Settings after your first sign-in for an extra layer.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="min-h-screen bg-ink-25 grid place-items-center px-4 py-12">
      <div className="w-full max-w-md bg-ink-0 rounded-lg border border-ink-100 shadow-sm p-6 sm:p-8">
        {children}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-500">{label}</span>
      <span className="text-ink-900 font-medium text-right">{children}</span>
    </div>
  );
}
