'use client';

/**
 * Loads Razorpay Checkout once and opens it for an order.
 *
 * The script is Razorpay's own hosted file — Checkout cannot be bundled —
 * and it is loaded only when a customer actually taps Pay, never on page
 * load. The CSP allows exactly this origin (see next.config.js headers).
 */
const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', cb: (resp: { error?: { description?: string } }) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;

export function loadCheckout(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.Razorpay) return Promise.resolve();
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CHECKOUT_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        loading = null; // allow a retry
        reject(new Error('checkout script failed to load'));
      };
      document.body.appendChild(s);
    });
  }
  return loading;
}

export type CheckoutOutcome =
  | { kind: 'paid'; response: RazorpayResponse }
  | { kind: 'dismissed' }
  | { kind: 'failed'; reason?: string };

/**
 * Opens Checkout and resolves with what happened. UPI is enabled
 * explicitly and listed first, because it is how most customers here pay.
 */
export function openCheckout(opts: {
  keyId: string;
  orderId: string;
  amountPaise: number;
  description: string;
  prefill?: { name?: string; contact?: string };
}): Promise<CheckoutOutcome> {
  return new Promise((resolve) => {
    const Rzp = window.Razorpay;
    if (!Rzp) {
      resolve({ kind: 'failed', reason: 'checkout not loaded' });
      return;
    }
    let settled = false;
    const done = (o: CheckoutOutcome) => {
      if (!settled) {
        settled = true;
        resolve(o);
      }
    };
    const rzp = new Rzp({
      key: opts.keyId,
      order_id: opts.orderId,
      amount: opts.amountPaise,
      currency: 'INR',
      name: 'FYRO',
      description: opts.description,
      prefill: opts.prefill,
      method: { upi: true, card: true, netbanking: true, wallet: true },
      config: {
        display: {
          preferences: { show_default_blocks: true },
          sequence: ['block.upi'],
          blocks: { upi: { name: 'UPI', instruments: [{ method: 'upi' }] } },
        },
      },
      theme: { color: '#6B4423' },
      handler: (response: RazorpayResponse) => done({ kind: 'paid', response }),
      modal: { ondismiss: () => done({ kind: 'dismissed' }) },
    });
    rzp.on('payment.failed', (resp) => done({ kind: 'failed', reason: resp?.error?.description }));
    rzp.open();
  });
}
