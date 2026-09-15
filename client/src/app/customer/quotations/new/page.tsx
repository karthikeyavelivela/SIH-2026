'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { Button, Field } from '@/components/fy/Controls';
import { TopBar } from '@/components/fy/Navigation';

/**
 * Asking a worker to come and look.
 *
 * The visit fee is stated here, before the request is sent, along with
 * whether it comes off the final bill. A fee a customer discovers after
 * someone has already driven to their house is not a fee, it is a surprise.
 */
function RequestQuotationForm() {
  const t = useTranslations('pricing.quotation');
  const router = useRouter();
  const params = useSearchParams();
  const workerId = params.get('worker') ?? '';
  const categorySlug = params.get('category') ?? '';

  const [worker, setWorker] = useState<{
    name: string;
    quotation?: { siteVisitFee: number; siteVisitAdjustable: boolean };
  } | null>(null);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!categorySlug || !workerId) return;
    api
      .get<{ workers: { workerId: string; name: string; quotation?: { siteVisitFee: number; siteVisitAdjustable: boolean } }[] }>(
        `/api/pricing/workers?categorySlug=${categorySlug}&mode=quotation`
      )
      .then((res) => setWorker(res.workers.find((w) => w.workerId === workerId) ?? null))
      .catch(() => {});
  }, [categorySlug, workerId]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ quotation: { _id: string } }>('/api/quotations', {
        workerId,
        categorySlug,
        jobDescription: description.trim(),
      });
      router.push(`/customer/quotations/${res.quotation._id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-fy-bone fy-pad-nav">
      <TopBar title={t('requestTitle')} showBack onBack={() => router.back()} />
      <main className="pt-16 px-gutter max-w-2xl mx-auto flex flex-col gap-4">
        {worker?.quotation && (
          <LightCard className="flex items-start gap-2.5 border-l-[3px] border-l-fy-brown">
            <Icon name="payments" size={18} className="text-fy-brown shrink-0 mt-px" />
            <Body size="label">
              {t('visitFeeNote', {
                fee: worker.quotation.siteVisitFee,
                adjustable: worker.quotation.siteVisitAdjustable
                  ? t('visitFeeAdjustable')
                  : t('visitFeeNotAdjustable'),
              })}
            </Body>
          </LightCard>
        )}

        <Section title={<SectionHeading>{t('describe')}</SectionHeading>}>
          <Panel className="flex flex-col gap-2">
            <EyebrowLabel>{t('describe')}</EyebrowLabel>
            <Field
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('describePlaceholder')}
            />
          </Panel>
        </Section>

        {error && (
          <LightCard>
            <Body size="label">{error}</Body>
          </LightCard>
        )}

        <Button glyph="send" disabled={busy || description.trim().length < 10} onClick={send}>
          {busy ? t('sending') : t('send')}
        </Button>
      </main>
    </div>
  );
}

export default function NewQuotationPage() {
  return (
    <Suspense fallback={null}>
      <RequestQuotationForm />
    </Suspense>
  );
}
