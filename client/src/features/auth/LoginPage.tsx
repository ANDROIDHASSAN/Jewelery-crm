// Admin login — email + password, validated against VITE_ADMIN_* env vars. No OTP.

import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';
import { useAppDispatch } from '@/app/hooks';
import { setAccessToken } from './authSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL ?? 'admin@zelora.in';
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD ?? 'zelora123';

export function LoginPage(): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/admin';

  function onSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setSubmitting(true);
    // Tiny artificial delay so the spinner state is visible.
    setTimeout(() => {
      if (email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD) {
        dispatch(setAccessToken('admin-session-token'));
        toast.success('Signed in');
        navigate(from, { replace: true });
      } else {
        toast.error('Incorrect email or password');
      }
      setSubmitting(false);
    }, 250);
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Left — editorial brand panel. */}
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
            Inventory, POS, finance, online store, customer follow-ups — all in one place. Built around how you actually
            work, not how generic ERPs assume you do.
          </p>
        </div>

        <div className="relative grid grid-cols-3 gap-6 max-w-md text-ink-300">
          <Stat label="Faster billing" value="70%" />
          <Stat label="Onboarding" value="2 hrs" />
          <Stat label="Receipt to WhatsApp" value="5 sec" />
        </div>
      </aside>

      {/* Right — sign-in form. */}
      <main className="flex flex-col justify-center px-6 sm:px-12 py-16 bg-ink-25">
        <div className="w-full max-w-sm mx-auto space-y-10">
          <header className="space-y-2">
            <p className="text-eyebrow uppercase text-ink-500">Admin sign in</p>
            <h2 className="font-display text-display-sm text-ink-900">Welcome back.</h2>
            <p className="text-sm text-ink-500">Sign in with your admin email and password.</p>
          </header>

          <form noValidate onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@zelora.in"
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
            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <footer className="pt-8 border-t border-ink-100 text-xs text-ink-500 space-y-2">
            <p>
              Looking for the store?{' '}
              <Link to="/" className="text-ink-800 underline decoration-ink-200 underline-offset-4 hover:decoration-ink-500">
                Visit the shop
              </Link>
              .
            </p>
            <p>Admin credentials are loaded from <code className="text-ink-700">client/.env</code>.</p>
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
