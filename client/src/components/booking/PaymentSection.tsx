'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError, API_BASE } from '@/lib/api';
import type { Payment } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

// Extracted out of customer/track/[bookingId]/page.tsx (a Next.js App
// Router page.tsx may only export `default` plus a small fixed allow-list
// of special names — Next's own generated route types fail the build on
// any other named export) so Phase 7.1's client test suite can import and
// exercise this directly. See PaymentSection.test.tsx.
export function PaymentSection({ bookingId }: { bookingId: string }) {
  const t = useTranslations('trackBooking');
  const [payment, setPayment] = useState<Payment | null | undefined>(undefined); // undefined = loading
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api
      .get<{ payment: Payment | null }>(`/api/payments/${bookingId}`)
      .then((res) => setPayment(res.payment))
      .catch(() => setPayment(null));
  }, [bookingId]);

  async function payNow() {
    setPending(true);
    setError(null);
    try {
      const orderRes = await api.post<{ payment: Payment }>(`/api/payments/order/${bookingId}`);
      // Mock mode only — a real deployment redirects into Razorpay's
      // Checkout here instead and lets the webhook confirm success async.
      const captured = await api.post<{ payment: Payment }>(`/api/payments/${bookingId}/mock-capture`);
      setPayment(captured.payment ?? orderRes.payment);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorPayment'));
    } finally {
      setPending(false);
    }
  }

  if (payment === undefined) return <div className="h-16 rounded-lg bg-surface animate-pulse mb-4" />;

  return (
    <Card elevation="raised" className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('payment')}</p>
        {payment && (
          <Badge tone={payment.status === 'success' ? 'success' : payment.status === 'failed' ? 'danger' : 'muted'}>
            {payment.status}
          </Badge>
        )}
      </div>
      {payment?.status === 'success' ? (
        <>
          <p className="text-sm text-text-muted mb-2">{t('paidAmount', { amount: payment.amount })}</p>
          <a
            href={`${API_BASE}/api/bookings/${bookingId}/tax-invoice`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-primary-600 underline"
          >
            {t('downloadTaxInvoice')}
          </a>
        </>
      ) : (
        <>
          {error && <p className="text-sm text-red-700 mb-2">{error}</p>}
          <Button className="w-full mt-2" disabled={pending} onClick={payNow}>
            {pending ? t('processing') : t('payNow')}
          </Button>
        </>
      )}
    </Card>
  );
}
