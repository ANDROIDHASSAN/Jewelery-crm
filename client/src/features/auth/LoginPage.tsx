// Admin login — email + password, optional TOTP 2FA. Talks to the real
// /api/v1/auth/login endpoint. After a successful login the resolved user
// (with permission list) lands in the auth slice and the sidebar renders
// only the modules they're allowed to see.

import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAppDispatch } from '@/app/hooks';
import { setSession } from './authSlice';
import { useLoginMutation } from './authApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isPosHost } from '@/app/routes';

type Step = 'credentials' | 'mfa';

export function LoginPage(): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [step, setStep] = useState<Step>('credentials');
  const [totpCode, setTotpCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [backupCode, setBackupCode] = useState('');

  const [login, { isLoading }] = useLoginMutation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const loc = useLocation();
  const onPosHost = isPosHost();
  // Default landing depends on which app the user landed on. POS subdomain
  // login → POS billing surface. Admin login → admin dashboard.
  const defaultFrom = onPosHost ? '/' : '/admin';
  const from = (loc.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? defaultFrom;

  async function attemptLogin(extra: { totpCode?: string; backupCode?: string } = {}): Promise<void> {
    try {
      const result = await login({
        email: email.trim(),
        password,
        ...(extra.totpCode ? { totpCode: extra.totpCode } : {}),
        ...(extra.backupCode ? { backupCode: extra.backupCode.toUpperCase() } : {}),
      }).unwrap();

      const { accessToken, user } = result.data;
      dispatch(setSession({ accessToken, user }));
      toast.success(`Welcome back, ${user.name}`);

      // Routing rules between admin (CRM) and POS subdomain:
      //   1. POS_USER role → only POS surface. If logged in on the admin
      //      host, redirect them to /pos so they get the cashier shell.
      //   2. Non-POS role on the POS subdomain → they don't belong here
      //      (the subdomain is the cashier station). Bounce to /admin.
      //   3. mustChangePassword forces the password reset first.
      const isPosUser = user.roleSlug === 'POS_USER';
      const passwordPath = onPosHost ? '/change-password' : '/admin/change-password';

      if (user.mustChangePassword) {
        navigate(passwordPath, { replace: true });
        return;
      }

      if (isPosUser && !onPosHost) {
        // Cashiers shouldn't see the admin panel. Land them at /pos which is
        // the same shell rendered on the POS subdomain.
        navigate('/pos', { replace: true });
        return;
      }
      if (!isPosUser && onPosHost) {
        // Owner / accountant on the POS host — push them to the main admin.
        toast.message('Admin panel is on the main domain — redirecting.');
        navigate('/admin', { replace: true });
        return;
      }
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const e = err as { status?: number; data?: { error?: { code?: string; message?: string }; data?: { mfaRequired?: boolean } } };
      if (e.data?.error?.code === 'MFA_REQUIRED' || e.data?.data?.mfaRequired) {
        setStep('mfa');
        toast.message('Enter your 2FA code to continue');
        return;
      }
      toast.error(e.data?.error?.message ?? 'Login failed');
    }
  }

  function onSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (step === 'credentials') {
      void attemptLogin();
    } else if (useBackup) {
      void attemptLogin({ backupCode: backupCode.trim() });
    } else {
      void attemptLogin({ totpCode: totpCode.trim() });
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <aside
        className="relative hidden lg:flex flex-col justify-between p-12 bg-ink-900 text-ink-50 overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background:
              'radial-gradient(120% 80% at 20% 0%, rgba(201,155,42,0.18) 0%, transparent 60%), linear-gradient(180deg, #0F0E0C 0%, #1F1D1A 100%)',
          }}
        />
        <div className="relative flex items-center gap-3">
          <img
            src="/logo/zelora-mark.png"
            alt=""
            aria-hidden="true"
            className="h-12 w-12 rounded-md object-cover shadow-sm"
          />
          <div className="font-display text-2xl tracking-tight text-brand-200">Zelora</div>
        </div>

        <div className="relative max-w-md space-y-6">
          <p className="text-eyebrow uppercase text-brand-300">For Indian jewellers</p>
          <h1 className="font-display text-display-lg leading-tight text-ink-0">
            Run your entire jewellery business from one screen.
          </h1>
          <p className="text-ink-300 text-base leading-relaxed">
            Inventory, POS, finance, online store, customer follow-ups — all in one place. Roles, permissions
            and 2FA so you decide what each team member can see.
          </p>
        </div>

        <div className="relative grid grid-cols-3 gap-6 max-w-md text-ink-300">
          <Stat label="Faster billing" value="70%" />
          <Stat label="Onboarding" value="2 hrs" />
          <Stat label="Receipt to WhatsApp" value="5 sec" />
        </div>
      </aside>

      <main className="flex flex-col justify-center px-4 sm:px-6 lg:px-12 py-10 sm:py-16 bg-ink-25">
        <div className="w-full max-w-sm mx-auto space-y-8 sm:space-y-10">
          <header className="space-y-2">
            <p className="text-eyebrow uppercase text-ink-500">Admin sign in</p>
            <h2 className="font-display text-xl sm:text-display-sm text-ink-900">
              {step === 'credentials' ? 'Welcome back.' : 'Two-factor authentication'}
            </h2>
            <p className="text-sm text-ink-500">
              {step === 'credentials'
                ? 'Sign in with the email and password your super admin sent you.'
                : 'Open your authenticator app to grab a code.'}
            </p>
          </header>

          <form noValidate onSubmit={onSubmit} className="space-y-5">
            {step === 'credentials' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@yourjewellers.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => setShow((v) => !v)}
                      className="text-xs text-ink-500 hover:text-ink-800 inline-flex items-center gap-1"
                    >
                      {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      {show ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <Input
                    id="password"
                    type={show ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Signing in…' : 'Sign in'}
                </Button>
              </>
            ) : (
              <>
                {!useBackup ? (
                  <div className="space-y-2">
                    <Label htmlFor="totp">6-digit code</Label>
                    <Input
                      id="totp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="\d{6}"
                      placeholder="123456"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      autoFocus
                      required
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="backup">Backup code</Label>
                    <Input
                      id="backup"
                      pattern="[A-Z0-9]{8}"
                      placeholder="ABCD1234"
                      value={backupCode}
                      onChange={(e) => setBackupCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                      autoFocus
                      required
                    />
                  </div>
                )}
                <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  {isLoading ? 'Verifying…' : 'Verify'}
                </Button>
                <button
                  type="button"
                  onClick={() => setUseBackup((v) => !v)}
                  className="text-xs text-ink-500 hover:text-ink-800 w-full text-center"
                >
                  {useBackup ? 'Use authenticator code instead' : 'Lost your phone? Use a backup code'}
                </button>
              </>
            )}
          </form>

          <footer className="pt-8 border-t border-ink-100 text-xs text-ink-500 space-y-2">
            <p>
              Looking for the store?{' '}
              <Link to="/" className="text-ink-800 underline decoration-ink-200 underline-offset-4 hover:decoration-ink-500">
                Visit the shop
              </Link>
              .
            </p>
            <p>
              No account? Your super admin needs to create one for you in <span className="font-medium text-ink-700">Settings &rarr; Team</span>.
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="space-y-1">
      <div className="font-mono text-xl text-brand-200">{value}</div>
      <div className="text-eyebrow uppercase">{label}</div>
    </div>
  );
}
