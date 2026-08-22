'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Complaint, COMPLAINT_CATEGORIES, ComplaintCategory, Booking } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { BackHeader } from '@/components/ui/BackHeader';
import { AlertIcon } from '@/components/ui/icons';

const inputClass =
  'w-full min-h-[44px] px-4 py-2.5 rounded-md border border-border bg-background text-text-primary placeholder:text-text-muted/70 transition-colors duration-fast focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20';

const statusTone: Record<Complaint['status'], 'muted' | 'secondary' | 'success'> = {
  open: 'muted',
  in_review: 'secondary',
  resolved: 'success',
};

function SupportForm() {
  const t = useTranslations('customerSupport');
  const CATEGORY_LABEL = t.raw('category') as Record<ComplaintCategory, string>;
  const FAQ = t.raw('faq') as { q: string; a: string }[];
  const params = useSearchParams();
  const { data, reload } = usePolling(() => api.get<{ complaints: Complaint[] }>('/api/complaints/mine'), 15000);
  const { data: historyData } = usePolling(() => api.get<{ bookings: Booking[] }>('/api/bookings'), 30000);

  const [bookingId, setBookingId] = useState(params.get('bookingId') ?? '');
  const [category, setCategory] = useState<ComplaintCategory>('other');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const fromQuery = params.get('bookingId');
    if (fromQuery) setBookingId(fromQuery);
  }, [params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/api/complaints', { bookingId, category, description });
      setDescription('');
      setSubmitted(true);
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorSubmit'));
    } finally {
      setSubmitting(false);
    }
  }

  const complaints = data?.complaints ?? [];
  const bookings = historyData?.bookings ?? [];

  return (
    <div className="max-w-lg mx-auto pb-4">
      <BackHeader title={t('title')} fallbackHref="/customer/dashboard" />
      <div className="px-5 pt-6">
      <p className="text-sm text-text-muted mb-6">{t('subtitle')}</p>

      <Card elevation="raised" className="mb-8">
        <h2 className="font-heading text-lg font-bold mb-4">{t('reportIssue')}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <select value={bookingId} onChange={(e) => setBookingId(e.target.value)} className={inputClass} required aria-label={t('bookingAria')}>
            <option value="" disabled>
              {t('selectBooking')}
            </option>
            {bookings.map((b) => (
              <option key={b._id} value={b._id}>
                {new Date(b.createdAt).toLocaleDateString('en-IN')} — {b.pickupLocation.address.slice(0, 40)}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
            className={inputClass}
            aria-label={t('categoryAria')}
          >
            {COMPLAINT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('descriptionPlaceholder')}
            aria-label={t('descriptionAria')}
            rows={4}
            required
            className={inputClass}
          />
          {error && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {submitted && !error && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {t('submittedNotice')}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={submitting || !bookingId}>
            {submitting ? t('submitting') : t('submit')}
          </Button>
        </form>
      </Card>

      {complaints.length > 0 && (
        <>
          <h2 className="font-heading text-lg font-bold mb-3">{t('yourReports')}</h2>
          <div className="space-y-3 mb-8">
            {complaints.map((c) => (
              <Card key={c._id} elevation="raised">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold">{CATEGORY_LABEL[c.category]}</p>
                  <Badge tone={statusTone[c.status]}>{t(`status.${c.status}`)}</Badge>
                </div>
                <p className="text-sm text-text-muted mb-1">{c.description}</p>
                {c.resolutionNote && (
                  <p className="text-xs text-text-muted mt-2 pt-2 border-t border-border">
                    <span className="font-semibold">{t('resolutionLabel')}</span>
                    {c.resolutionNote}
                  </p>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      <h2 className="font-heading text-lg font-bold mb-3">{t('faqTitle')}</h2>
      <div className="space-y-3">
        {FAQ.map((f) => (
          <Card key={f.q} elevation="flat">
            <p className="text-sm font-semibold mb-1 flex items-center gap-2">
              <AlertIcon className="w-4 h-4 text-primary-600 flex-shrink-0" />
              {f.q}
            </p>
            <p className="text-sm text-text-muted">{f.a}</p>
          </Card>
        ))}
      </div>
      </div>
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={null}>
      <SupportForm />
    </Suspense>
  );
}
