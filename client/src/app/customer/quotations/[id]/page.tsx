'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { Button, Field } from '@/components/fy/Controls';
import { StatusPill } from '@/components/fy/Status';
import { TopBar } from '@/components/fy/Navigation';
import { AddressField, type GeoPoint } from '@/components/booking/AddressField';
import { QuotationDocument, type QuotationView } from '@/components/pricing/QuotationDocument';

/**
 * One quotation, from the customer's side.
 *
 * The decisions available change with the state, and only the real ones are
 * shown: you cannot accept a quotation nobody has sent, and you cannot ask
 * for changes twice. Accepting says plainly what accepting means — the price
 * is fixed, and extra work later needs approval item by item.
 */

interface Variation {
  _id: string;
  description: string;
  amount: number;
  status: 'requested' | 'approved' | 'rejected';
}

interface Payable {
  frozenTotal: number;
  variationTotal: number;
  payable: number;
}

interface Milestone {
  label: string;
  percentage: number;
  amount: number;
  status: 'pending' | 'confirmed' | 'paid';
}

export default function CustomerQuotationPage() {
  const t = useTranslations('pricing.quotation');
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [quotation, setQuotation] = useState<(QuotationView & { milestones: Milestone[] }) | null>(null);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [payable, setPayable] = useState<Payable | null>(null);
  const [where, setWhere] = useState<GeoPoint | null>(null);
  const [note, setNote] = useState('');
  const [showNegotiate, setShowNegotiate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{
        quotation: QuotationView & { milestones: Milestone[] };
        variations: Variation[];
        payable: Payable | null;
      }>(`/api/quotations/${id}`);
      setQuotation(res.quotation);
      setVariations(res.variations);
      setPayable(res.payable);
    } catch {
      setError(t('error'));
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  if (!quotation) {
    return (
      <div className="min-h-screen bg-fy-bone">
        <TopBar title={t('title')} showBack onBack={() => router.back()} />
      </div>
    );
  }

  const canDecide = quotation.status === 'submitted';
  const accepted = quotation.status === 'accepted';

  return (
    <div className="min-h-screen bg-fy-bone pb-28">
      <TopBar title={t('title')} showBack onBack={() => router.back()} />
      <main className="pt-16 px-gutter max-w-2xl mx-auto flex flex-col gap-4">
        <QuotationDocument quotation={quotation} />

        {canDecide && (
          <Section title={<SectionHeading>{t('accept')}</SectionHeading>}>
            <Panel className="flex flex-col gap-3">
              <Body size="label">{t('acceptNote')}</Body>
              <AddressField
                label={t('whereLabel')}
                placeholder={t('whereLabel')}
                value={where}
                onChange={setWhere}
                markerColorClass="text-fy-brown"
              />
              <Button
                glyph="check"
                disabled={busy || !where}
                onClick={() =>
                  act(() =>
                    api.post(`/api/quotations/${id}/accept`, {
                      coordinates: [where!.lng, where!.lat],
                      address: where!.address,
                      region: where!.region,
                    })
                  )
                }
              >
                {busy ? t('accepting') : t('accept')}
              </Button>

              {showNegotiate ? (
                <div className="flex flex-col gap-2">
                  <Field
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t('negotiatePlaceholder')}
                  />
                  <span className="font-mono text-[10px] text-fy-muted">{t('oneRoundNote')}</span>
                  <Button
                    variant="ghost"
                    size="md"
                    glyph="send"
                    disabled={busy || note.trim().length < 3}
                    onClick={() => act(() => api.post(`/api/quotations/${id}/negotiate`, { note: note.trim() }))}
                  >
                    {t('negotiateSend')}
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="md" glyph="edit" onClick={() => setShowNegotiate(true)}>
                  {t('negotiate')}
                </Button>
              )}

              <Button
                variant="ghost"
                size="md"
                glyph="close"
                disabled={busy}
                onClick={() => act(() => api.post(`/api/quotations/${id}/reject`, {}))}
              >
                {t('reject')}
              </Button>
            </Panel>
          </Section>
        )}

        {accepted && quotation.milestones.length > 0 && (
          <Section title={<SectionHeading>{t('milestones')}</SectionHeading>}>
            <div className="flex flex-col gap-2">
              {quotation.milestones.map((m, i) => (
                <LightCard key={i} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <Body size="label" className="font-semibold">
                      {m.label === 'advance'
                        ? t('milestoneAdvance')
                        : m.label === 'progress'
                          ? t('milestoneProgress')
                          : t('milestoneFinal')}
                    </Body>
                    <span className="font-mono text-[10px] text-fy-muted">
                      {m.percentage}% · ₹{m.amount}
                    </span>
                  </span>
                  {m.status === 'pending' ? (
                    <Button
                      size="md"
                      glyph="check"
                      disabled={busy}
                      onClick={() => act(() => api.post(`/api/quotations/${id}/milestones/${i}/confirm`, {}))}
                    >
                      {t('confirmMilestone')}
                    </Button>
                  ) : (
                    <StatusPill tone="lime">{t('milestoneConfirmed')}</StatusPill>
                  )}
                </LightCard>
              ))}
            </div>
          </Section>
        )}

        {variations.length > 0 && (
          <Section title={<SectionHeading>{t('variations')}</SectionHeading>}>
            <div className="flex flex-col gap-2">
              {variations.map((v) => (
                <Panel key={v._id} className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <Body size="label">{v.description}</Body>
                    <span className="font-mono text-body text-fy-ink shrink-0">
                      {v.amount >= 0 ? '+' : ''}₹{v.amount}
                    </span>
                  </div>
                  {v.status === 'requested' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="ghost"
                        size="md"
                        glyph="close"
                        disabled={busy}
                        onClick={() =>
                          act(() => api.post(`/api/quotations/variations/${v._id}/decide`, { approve: false }))
                        }
                      >
                        {t('decline')}
                      </Button>
                      <Button
                        size="md"
                        glyph="check"
                        disabled={busy}
                        onClick={() =>
                          act(() => api.post(`/api/quotations/variations/${v._id}/decide`, { approve: true }))
                        }
                      >
                        {t('approve')}
                      </Button>
                    </div>
                  ) : (
                    <StatusPill tone={v.status === 'approved' ? 'lime' : 'neutral'}>
                      {v.status === 'approved' ? t('variationApproved') : t('variationRejected')}
                    </StatusPill>
                  )}
                </Panel>
              ))}
            </div>
          </Section>
        )}

        {payable && payable.variationTotal !== 0 && (
          <Panel className="flex flex-col gap-1.5 border-l-[3px] border-l-fy-lime">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-body text-body font-semibold text-fy-ink">{t('payable')}</span>
              <span className="font-mono text-title text-fy-ink">₹{payable.payable}</span>
            </div>
            <span className="font-mono text-[10px] text-fy-muted">{t('payableNote')}</span>
          </Panel>
        )}

        {error && (
          <LightCard>
            <Body size="label">{error}</Body>
          </LightCard>
        )}
      </main>
    </div>
  );
}
