// client/src/lib/razorpay.ts — Razorpay Checkout integration.
//
// Loads the Razorpay JS SDK on demand (we don't preload it on every storefront
// page) and exposes a typed `openRazorpayCheckout` helper that resolves with
// the payment details once the customer completes the modal.
//
// When the server returns `simulated: true` (no real Razorpay keys configured
// yet), we skip the SDK entirely and synthesize a fake success response so the
// checkout UX can be tested end-to-end before the merchant pastes real keys.

const RAZORPAY_SDK_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpayCheckoutOptions {
  key: string;
  amount: number; // paise
  currency: 'INR';
  name: string; // jeweller / brand name on the modal header
  description?: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayWindow {
  Razorpay?: new (options: RazorpayCheckoutOptions) => { open: () => void };
}

let scriptPromise: Promise<void> | null = null;

function loadRazorpaySdk(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    if ((window as RazorpayWindow).Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = RAZORPAY_SDK_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Failed to load Razorpay SDK'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface OpenCheckoutArgs {
  keyId: string;
  orderId: string;
  amountPaise: number;
  brandName: string;
  description: string;
  customer: { name: string; phone: string; email?: string };
  simulated: boolean;
  themeColor?: string;
}

export interface CheckoutResult {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

/**
 * Opens the Razorpay Checkout modal and resolves once the customer completes
 * the payment. Rejects if the modal is dismissed without paying.
 *
 * In simulated mode (server returned simulated=true), returns a synthetic
 * response immediately so the rest of the checkout flow can be verified
 * without real keys.
 */
export async function openRazorpayCheckout(args: OpenCheckoutArgs): Promise<CheckoutResult> {
  if (args.simulated) {
    // Demo / no-keys path: skip the SDK and synthesize a success. The server
    // accepts any non-empty signature when simulated, so this round-trips
    // cleanly without ever touching Razorpay's infra.
    return {
      razorpayOrderId: args.orderId,
      razorpayPaymentId: `pay_sim_${Date.now()}`,
      razorpaySignature: `sig_sim_${Math.random().toString(36).slice(2)}`,
    };
  }

  await loadRazorpaySdk();
  const RazorpayCtor = (window as RazorpayWindow).Razorpay;
  if (!RazorpayCtor) throw new Error('Razorpay SDK not available after load');

  return new Promise<CheckoutResult>((resolve, reject) => {
    const checkout = new RazorpayCtor({
      key: args.keyId,
      amount: args.amountPaise,
      currency: 'INR',
      name: args.brandName,
      description: args.description,
      order_id: args.orderId,
      prefill: {
        name: args.customer.name,
        contact: args.customer.phone,
        email: args.customer.email,
      },
      theme: { color: args.themeColor ?? '#B8860B' }, // brand-500 default
      handler: (response) => {
        resolve({
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });
      },
      modal: {
        ondismiss: () => reject(new Error('CHECKOUT_DISMISSED')),
      },
    });
    checkout.open();
  });
}
