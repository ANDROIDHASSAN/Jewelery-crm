// Storefront sign-in / sign-up sheet — the Amazon-style auth wall that fires
// on Buy now / Add to bag / Wishlist when the visitor isn't signed in.
//
// Design intent:
//   • Phone-first identity (matches our Customer.phone unique key, and the
//     sales team's primary outreach channel — WhatsApp + voice).
//   • Two stages: phone → if new, complete profile (name + optional email,
//     pincode, dob). Returning visitors skip stage 2 entirely.
//   • Single network round-trip per stage via /website/customers/identify;
//     the server upserts the Customer and creates a Lead with intent-derived
//     status so the CRM gets a warm row the moment the visitor signs up.
//   • Resume the original intent: callers pass a resume() callback that runs
//     after the visitor is signed in (open ReserveModal, addToCart, etc.).

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Lock, ShieldCheck, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { hydrateFromServer } from '@/features/storefront/shopSlice';
import { useIdentifyCustomerMutation } from '@/features/storefront/storefrontApi';

export type AuthIntent =
  | 'buy-now'
  | 'add-to-cart'
  | 'wishlist'
  | 'checkout'
  | 'browse';

interface AuthRequest {
  intent: AuthIntent;
  /**
   * Human-readable "what were they trying to do" — populates Lead.interest on
   * the server. Examples: "Tara mangalsutra (Bridal)", "Bridal collection",
   * "Checkout — ₹54,499.40". Salespeople see this verbatim in the CRM.
   */
  interest?: string;
  /** Cart items to merge into the server-side persisted cart on sign-in. */
  mergeCart?: Array<{ productId: string; qty: number }>;
  mergeWishlist?: Array<{ productId: string }>;
  /** Fires once the visitor is signed in. The thing they were trying to do. */
  resume?: () => void;
  /** Fires if they close the sheet without signing in. */
  onCancel?: () => void;
}

interface AuthGateContextValue {
  /**
   * Returns true synchronously if the visitor was already signed in (callers
   * can proceed immediately). Otherwise opens the sheet and returns false —
   * resume() will fire async on successful sign-in.
   */
  requireAuth: (req: AuthRequest) => boolean;
}

const AuthGateContext = createContext<AuthGateContextValue | null>(null);

export function useAuthGate(): AuthGateContextValue {
  const ctx = useContext(AuthGateContext);
  if (!ctx) throw new Error('useAuthGate must be used inside <AuthGateProvider>');
  return ctx;
}

export function AuthGateProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const signedIn = useAppSelector((s) => s.shop.account.signedIn);
  const [pending, setPending] = useState<AuthRequest | null>(null);
  // Keep the latest signedIn in a ref so requireAuth() reads fresh state even
  // when callers captured an older closure.
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;

  const requireAuth = useCallback<AuthGateContextValue['requireAuth']>((req) => {
    if (signedInRef.current) {
      req.resume?.();
      return true;
    }
    setPending(req);
    return false;
  }, []);

  const value = useMemo<AuthGateContextValue>(() => ({ requireAuth }), [requireAuth]);

  return (
    <AuthGateContext.Provider value={value}>
      {children}
      <AuthSheet
        request={pending}
        onClose={(signedInNow) => {
          const req = pending;
          setPending(null);
          if (signedInNow) {
            req?.resume?.();
          } else {
            req?.onCancel?.();
          }
        }}
      />
    </AuthGateContext.Provider>
  );
}

function intentCopy(intent: AuthIntent | undefined): { title: string; sub: string } {
  switch (intent) {
    case 'buy-now':
      return {
        title: 'Sign in to buy',
        sub: 'We just need your details to confirm the order and arrange delivery.',
      };
    case 'checkout':
      return {
        title: 'Sign in to checkout',
        sub: 'Quick sign-in so we can ship to you and WhatsApp the tracking link.',
      };
    case 'add-to-cart':
      return {
        title: 'Sign in to save your bag',
        sub: 'Your bag will be saved to your account so you can pick it up on any device.',
      };
    case 'wishlist':
      return {
        title: 'Sign in to save favourites',
        sub: 'Your wishlist will be saved so you never lose a piece you loved.',
      };
    default:
      return {
        title: 'Sign in',
        sub: 'Sign in or create an account in seconds.',
      };
  }
}

interface AuthSheetProps {
  request: AuthRequest | null;
  /** Called when the dialog closes. signedIn=true → resume the intent. */
  onClose: (signedIn: boolean) => void;
}

function AuthSheet({ request, onClose }: AuthSheetProps): JSX.Element {
  const dispatch = useAppDispatch();
  const [identify, { isLoading }] = useIdentifyCustomerMutation();

  // Stage state. Stage 1: phone. Stage 2: profile-completion (new signups only).
  const [stage, setStage] = useState<1 | 2>(1);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pincode, setPincode] = useState('');
  const [dob, setDob] = useState('');

  const open = request !== null;
  const copy = intentCopy(request?.intent);

  // Reset local form state when the sheet opens fresh (new request).
  function reset(): void {
    setStage(1);
    setPhone('');
    setName('');
    setEmail('');
    setPincode('');
    setDob('');
  }

  function close(signedIn: boolean): void {
    reset();
    onClose(signedIn);
  }

  async function submitStage1(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!/^[6-9]\d{9}$/.test(phone)) {
      toast.error('Please enter a valid 10-digit Indian phone number');
      return;
    }
    const e164 = `+91${phone}`;
    try {
      // Probe call with just the phone — if the customer exists with a real
      // name, the server signs them in immediately. If not (or the name is
      // the placeholder "Customer"), we advance to stage 2 to capture the
      // rest of the profile before creating the Lead-worthy record.
      const res = await identify({
        phone: e164,
        intent: request?.intent ?? 'browse',
        interest: request?.interest,
        mergeCart: request?.mergeCart,
        mergeWishlist: request?.mergeWishlist,
      }).unwrap();
      const needsProfile =
        res.isNew || !res.customer.name || res.customer.name === 'Customer';
      if (needsProfile) {
        // Prefill name field if the server happens to know it (returning user
        // with a real name shouldn't reach here, but safe-guard anyway).
        setName(res.customer.name && res.customer.name !== 'Customer' ? res.customer.name : '');
        setStage(2);
        return;
      }
      // Existing customer with a real name — sign them in and resume.
      dispatch(
        hydrateFromServer({
          customer: res.customer,
          cart: res.cart,
          wishlist: res.wishlist,
        }),
      );
      toast.success(`Welcome back, ${res.customer.name.split(' ')[0]}`);
      close(true);
    } catch (err) {
      const msg =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ??
        'Could not sign in. Please try again.';
      toast.error(msg);
    }
  }

  async function submitStage2(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error('Please enter your full name');
      return;
    }
    const e164 = `+91${phone}`;
    try {
      const res = await identify({
        phone: e164,
        name: name.trim(),
        email: email.trim() || undefined,
        pincode: pincode.trim() || undefined,
        dob: dob || undefined,
        intent: request?.intent ?? 'browse',
        interest: request?.interest,
        mergeCart: request?.mergeCart,
        mergeWishlist: request?.mergeWishlist,
      }).unwrap();
      dispatch(
        hydrateFromServer({
          customer: { ...res.customer, email: email.trim() || res.customer.email },
          cart: res.cart,
          wishlist: res.wishlist,
        }),
      );
      toast.success(`Account created. Welcome, ${name.trim().split(' ')[0]}!`);
      close(true);
    } catch (err) {
      const msg =
        (err as { data?: { error?: { message?: string } } }).data?.error?.message ??
        'Could not create account. Please try again.';
      toast.error(msg);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close(false);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-ink-900/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] sm:w-[92vw] max-w-md max-h-[90vh] overflow-y-auto bg-ink-0 rounded-lg shadow-xl border border-ink-100 data-[state=open]:animate-in data-[state=open]:zoom-in-95">
          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="h-10 w-10 rounded-full bg-brand-50 inline-flex items-center justify-center">
                  <Lock className="h-4 w-4 text-brand-700" />
                </div>
                <Dialog.Title className="font-display text-[22px] leading-tight text-ink-900 mt-3">
                  {stage === 1 ? copy.title : 'Complete your profile'}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-ink-600 mt-1.5 leading-relaxed">
                  {stage === 1
                    ? copy.sub
                    : 'Just a few more details so we can ship to you and answer any questions.'}
                </Dialog.Description>
              </div>
              <Dialog.Close
                className="text-ink-500 hover:text-ink-900 p-1 -mr-1 -mt-1 rounded-md hover:bg-ink-50"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            {stage === 1 ? (
              <form onSubmit={submitStage1} className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-[11px] uppercase tracking-wider text-ink-500">
                    Phone number
                  </span>
                  <div className="mt-1.5 flex items-stretch w-full h-12 rounded-lg border border-ink-200 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200 overflow-hidden transition-colors">
                    <span className="flex items-center px-3 bg-ink-50 text-ink-700 text-sm font-mono border-r border-ink-200 select-none">
                      +91
                    </span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      required
                      autoFocus
                      inputMode="numeric"
                      maxLength={10}
                      pattern="[6-9][0-9]{9}"
                      className="flex-1 px-3 text-sm font-mono focus:outline-none bg-ink-0"
                      placeholder="98XXX XXXXX"
                    />
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={isLoading || phone.length !== 10}
                  className="w-full h-12 rounded-full bg-brand-400 text-ink-900 text-sm font-medium hover:bg-brand-300 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? 'Checking…' : 'Continue'}
                </button>

                <ul className="pt-1 space-y-1.5 text-[11px] text-ink-500 leading-relaxed">
                  <li className="flex items-start gap-1.5">
                    <ShieldCheck className="h-3 w-3 text-brand-600 mt-0.5 shrink-0" />
                    <span>Your number stays private — used only for order updates and support.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Sparkles className="h-3 w-3 text-brand-600 mt-0.5 shrink-0" />
                    <span>One account across web, WhatsApp, and our showroom counter.</span>
                  </li>
                </ul>
              </form>
            ) : (
              <form onSubmit={submitStage2} className="mt-5 space-y-3.5">
                <Field
                  label="Full name"
                  required
                  value={name}
                  onChange={setName}
                  placeholder="Your full name"
                  autoFocus
                />
                <Field
                  label="Email (optional)"
                  value={email}
                  onChange={setEmail}
                  type="email"
                  placeholder="you@example.com"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Pincode (optional)"
                    value={pincode}
                    onChange={(v) => setPincode(v.replace(/\D/g, '').slice(0, 6))}
                    placeholder="122001"
                    inputMode="numeric"
                  />
                  <Field
                    label="Birthday (optional)"
                    value={dob}
                    onChange={setDob}
                    type="date"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setStage(1)}
                    className="h-12 px-5 rounded-full border border-ink-200 text-sm text-ink-700 hover:bg-ink-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading || name.trim().length < 2}
                    className="flex-1 h-12 rounded-full bg-brand-400 text-ink-900 text-sm font-medium hover:bg-brand-300 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {isLoading ? 'Creating account…' : 'Create account & continue'}
                  </button>
                </div>

                <p className="text-[11px] text-ink-500 text-center leading-relaxed pt-1">
                  By continuing you agree to our terms and privacy policy. We&apos;ll
                  WhatsApp order updates to +91 {phone}.
                </p>
              </form>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
  autoFocus,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  inputMode?: 'numeric' | 'text' | 'email';
}): JSX.Element {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-ink-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        inputMode={inputMode}
        className="mt-1.5 w-full h-11 px-3 rounded-lg border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none text-sm bg-ink-0 transition-colors"
      />
    </label>
  );
}
