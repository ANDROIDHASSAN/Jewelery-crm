import { useEffect, useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { useCreateEnquiryMutation } from './storefrontApi';
import { useAppSelector } from '@/app/hooks';

// Storefront lead-capture popup (M3 FR#8). An OPT-IN inquiry form: it appears a
// few seconds into a visit and the customer chooses whether to share their
// details — nothing is captured automatically. On submit it creates a CRM lead
// via /website/enquiry with source "website-popup". Dismissing or submitting
// sets a localStorage flag so we don't nag the same visitor again for a while.

const STORAGE_KEY = 'zelora.leadPopup.seenAt';
// Don't show again for this long after a dismiss/submit.
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
// Delay before first appearance so it doesn't slam the visitor on arrival.
const APPEAR_DELAY_MS = 8000;

const INTERESTS = ['Bridal', 'Gold jewellery', 'Diamond', 'Silver', 'Just browsing'] as const;

function recentlySeen(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < SNOOZE_MS;
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* ignore (private mode etc.) */
  }
}

export function LeadCapturePopup(): JSX.Element | null {
  const brandName = useAppSelector((s) => s.storefrontContent.brand.name);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [interest, setInterest] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [createEnquiry, { isLoading }] = useCreateEnquiryMutation();

  // Appear once, after a delay, only if the visitor hasn't recently seen it.
  useEffect(() => {
    if (recentlySeen()) return;
    const t = setTimeout(() => setOpen(true), APPEAR_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  function close(): void {
    markSeen();
    setOpen(false);
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError('Please enter your name.');
      return;
    }
    // Accept a 10-digit Indian mobile and normalise to +91XXXXXXXXXX.
    const digits = phone.replace(/\D/g, '').replace(/^91/, '');
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    try {
      await createEnquiry({
        source: 'website-popup',
        name: trimmedName,
        phone: `+91${digits}`,
        interest: interest || undefined,
      }).unwrap();
      markSeen();
      setDone(true);
    } catch {
      setError('Could not send right now. Please try again.');
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Stay in touch"
    >
      {/* Backdrop — clicking it dismisses (counts as opt-out). */}
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 bg-ink-900/50 backdrop-blur-[2px]"
      />
      <div className="relative w-full max-w-md rounded-2xl bg-ink-0 shadow-2xl border border-ink-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={close}
          className="absolute top-3 right-3 h-8 w-8 inline-flex items-center justify-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900 z-10"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {done ? (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-brand-100 text-brand-600 inline-flex items-center justify-center mb-4">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="font-display text-xl text-ink-900">Thank you!</h3>
            <p className="mt-2 text-sm text-ink-600">
              Our team will reach out to you shortly. Happy browsing ✨
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-5 h-10 px-5 rounded-full bg-brand-500 text-ink-0 text-sm font-medium hover:bg-brand-600"
            >
              Continue shopping
            </button>
          </div>
        ) : (
          <>
            <div className="px-6 pt-7 pb-4 text-center bg-gradient-to-b from-brand-50 to-transparent">
              <div className="mx-auto h-11 w-11 rounded-full bg-brand-100 text-brand-600 inline-flex items-center justify-center mb-3">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="font-display text-xl text-ink-900">Let's stay in touch</h3>
              <p className="mt-1.5 text-sm text-ink-600">
                Leave your details and {brandName || 'our'} team will help you find the perfect piece —
                new collections, offers &amp; more.
              </p>
            </div>
            <form onSubmit={submit} className="px-6 pb-6 pt-1 space-y-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-ink-500 mb-1">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full h-11 px-3 rounded-lg border border-ink-200 text-sm focus:border-brand-400 focus:ring-1 focus:ring-brand-300 outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-ink-500 mb-1">Mobile number</label>
                <div className="flex items-center rounded-lg border border-ink-200 focus-within:border-brand-400 focus-within:ring-1 focus-within:ring-brand-300 overflow-hidden">
                  <span className="px-3 text-sm text-ink-500 bg-ink-50 h-11 inline-flex items-center border-r border-ink-200">+91</span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10-digit mobile"
                    className="flex-1 h-11 px-3 text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-ink-500 mb-1">
                  Interested in <span className="text-ink-400 normal-case">(optional)</span>
                </label>
                <select
                  value={interest}
                  onChange={(e) => setInterest(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border border-ink-200 text-sm focus:border-brand-400 focus:ring-1 focus:ring-brand-300 outline-none bg-ink-0"
                >
                  <option value="">Select…</option>
                  {INTERESTS.map((i) => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
              </div>

              {error && <p className="text-xs text-rose-600">{error}</p>}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 rounded-full bg-brand-500 text-ink-0 text-sm font-medium hover:bg-brand-600 disabled:opacity-60"
              >
                {isLoading ? 'Sending…' : 'Submit'}
              </button>
              <button
                type="button"
                onClick={close}
                className="w-full text-center text-xs text-ink-400 hover:text-ink-600"
              >
                No thanks, I'll keep browsing
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
