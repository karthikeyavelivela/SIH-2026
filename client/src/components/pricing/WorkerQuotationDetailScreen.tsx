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
import { QuotationDocument, type QuotationView } from '@/components/pricing/QuotationDocument';
import { UNIT_TYPES, type UnitType } from '@/components/pricing/UnitPicker';

/**
 * The worker's side of one quotation: arrange the visit, write the quote,
 * and — once the job is agreed — ask for any extra work.
 *
 * The builder totals as it goes and keeps materials visibly separate from
 * labour, because that separation is what lets a customer see what they are
 * actually agreeing to. A material line can be marked an estimate, which
 * prints as "estimate" on the customer's copy: quoting a material price you
 * cannot guarantee is normal, presenting it as fixed is not.
 */

interface LineRow {
  description: string;
  unitType: UnitType | '';
  quantity: string;
  rate: string;
  isMaterial: boolean;
  materialIsEstimate: boolean;
}

interface Variation {
  _id: string;
  description: string;
  amount: number;
  status: 'requested' | 'approved' | 'rejected';
}

const EMPTY_LINE: LineRow = {
  description: '',
  unitType: '',
  quantity: '1',
  rate: '',
  isMaterial: false,
  materialIsEstimate: false,
};

export default function WorkerQuotationDetailScreen() {
  const t = useTranslations('pricing.quotation');
  const tUnits = useTranslations('pricing.units');
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [quotation, setQuotation] = useState<QuotationView | null>(null);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [visitAt, setVisitAt] = useState('');
  const [lines, setLines] = useState<LineRow[]>([{ ...EMPTY_LINE }]);
  const [validityDays, setValidityDays] = useState('7');
  const [variationText, setVariationText] = useState('');
  const [variationAmount, setVariationAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ quotation: QuotationView; variations: Variation[] }>(`/api/quotations/${id}`);
      setQuotation(res.quotation);
      setVariations(res.variations);
      if (res.quotation.lineItems.length > 0) {
        setLines(
          res.quotation.lineItems.map((l) => ({
            description: l.description,
            unitType: (l.unitType as UnitType) ?? '',
            quantity: String(l.quantity),
            rate: String(l.rate),
            isMaterial: l.isMaterial,
            materialIsEstimate: l.materialIsEstimate,
          }))
        );
      }
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

  // Shown as the worker types. The server recomputes it on submit — this is
  // the worker's own running total, not the authority.
  const runningTotal = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.rate) || 0),
    0
  );

  if (!quotation) {
    return (
      <div className="min-h-screen bg-fy-bone">
        <TopBar title={t('title')} showBack onBack={() => router.back()} />
      </div>
    );
  }

  const canSchedule = quotation.status === 'requested';
  const canCompleteVisit = quotation.status === 'visit_scheduled';
  const canQuote = ['visit_done', 'negotiating', 'submitted'].includes(quotation.status);
  const accepted = quotation.status === 'accepted';

  return (
    <div className="min-h-screen bg-fy-bone fy-pad-nav">
      <TopBar title={t('title')} showBack onBack={() => router.back()} />
      <main className="pt-16 px-gutter max-w-2xl mx-auto flex flex-col gap-4">
        <QuotationDocument quotation={quotation} />

        {canSchedule && (
          <Section title={<SectionHeading>{t('scheduleVisit')}</SectionHeading>}>
            <Panel className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <EyebrowLabel>{t('visitAt')}</EyebrowLabel>
                <Field type="datetime-local" value={visitAt} onChange={(e) => setVisitAt(e.target.value)} />
              </label>
              <Button
                glyph="event"
                disabled={busy || !visitAt}
                onClick={() =>
                  act(() =>
                    api.post(`/api/quotations/${id}/schedule-visit`, {
                      scheduledAt: new Date(visitAt).toISOString(),
                    })
                  )
                }
              >
                {t('confirmSchedule')}
              </Button>
            </Panel>
          </Section>
        )}

        {canCompleteVisit && (
          <Button
            glyph="check"
            disabled={busy}
            onClick={() => act(() => api.post(`/api/quotations/${id}/visit-done`, {}))}
          >
            {t('markVisitDone')}
          </Button>
        )}

        {canQuote && (
          <Section title={<SectionHeading>{t('buildQuote')}</SectionHeading>}>
            <div className="flex flex-col gap-3">
              {lines.map((line, i) => (
                <Panel key={i} className="flex flex-col gap-2.5">
                  <label className="flex flex-col gap-1">
                    <EyebrowLabel>{t('lineDescription')}</EyebrowLabel>
                    <Field
                      value={line.description}
                      onChange={(e) =>
                        setLines((rows) => rows.map((r, j) => (j === i ? { ...r, description: e.target.value } : r)))
                      }
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">
                      <EyebrowLabel>{t('lineQuantity')}</EyebrowLabel>
                      <Field
                        type="number"
                        value={line.quantity}
                        onChange={(e) =>
                          setLines((rows) => rows.map((r, j) => (j === i ? { ...r, quantity: e.target.value } : r)))
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <EyebrowLabel>{t('lineRate')}</EyebrowLabel>
                      <Field
                        type="number"
                        value={line.rate}
                        onChange={(e) =>
                          setLines((rows) => rows.map((r, j) => (j === i ? { ...r, rate: e.target.value } : r)))
                        }
                      />
                    </label>
                  </div>

                  {!line.isMaterial && (
                    <label className="flex flex-col gap-1">
                      <EyebrowLabel>{tUnits('sq_ft_face.label')}</EyebrowLabel>
                      <select
                        value={line.unitType}
                        onChange={(e) =>
                          setLines((rows) =>
                            rows.map((r, j) => (j === i ? { ...r, unitType: e.target.value as UnitType | '' } : r))
                          )
                        }
                        className="min-h-[44px] px-3 rounded-control border border-fy-brown/15 bg-fy-bone font-body text-body text-fy-ink"
                      >
                        <option value="">—</option>
                        {UNIT_TYPES.map((u) => (
                          <option key={u} value={u}>
                            {tUnits(`${u}.label` as never)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setLines((rows) => rows.map((r, j) => (j === i ? { ...r, isMaterial: !r.isMaterial } : r)))
                    }
                    className="flex items-center gap-2 text-left"
                  >
                    <Icon
                      name={line.isMaterial ? 'check_box' : 'check_box_outline_blank'}
                      size={18}
                      className={line.isMaterial ? 'text-fy-brown' : 'text-fy-muted'}
                    />
                    <Body size="label">{t('lineIsMaterial')}</Body>
                  </button>

                  {line.isMaterial && (
                    <button
                      type="button"
                      onClick={() =>
                        setLines((rows) =>
                          rows.map((r, j) => (j === i ? { ...r, materialIsEstimate: !r.materialIsEstimate } : r))
                        )
                      }
                      className="flex items-center gap-2 text-left"
                    >
                      <Icon
                        name={line.materialIsEstimate ? 'check_box' : 'check_box_outline_blank'}
                        size={18}
                        className={line.materialIsEstimate ? 'text-fy-brown' : 'text-fy-muted'}
                      />
                      <Body size="label">{t('lineIsEstimate')}</Body>
                    </button>
                  )}

                  {lines.length > 1 && (
                    <Button
                      variant="ghost"
                      size="md"
                      glyph="delete"
                      onClick={() => setLines((rows) => rows.filter((_, j) => j !== i))}
                    >
                      {t('removeLine')}
                    </Button>
                  )}
                </Panel>
              ))}

              <Button
                variant="ghost"
                size="md"
                glyph="add"
                onClick={() => setLines((rows) => [...rows, { ...EMPTY_LINE }])}
              >
                {t('addLine')}
              </Button>

              <Panel className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-body text-body font-semibold text-fy-ink">{t('total')}</span>
                  <span className="font-mono text-title text-fy-ink">₹{Math.round(runningTotal * 100) / 100}</span>
                </div>
                <label className="flex flex-col gap-1">
                  <EyebrowLabel>{t('validityDays')}</EyebrowLabel>
                  <Field
                    type="number"
                    value={validityDays}
                    onChange={(e) => setValidityDays(e.target.value)}
                  />
                </label>
                <Button
                  glyph="send"
                  disabled={busy || lines.every((l) => !l.description || !l.rate)}
                  onClick={() =>
                    act(() =>
                      api.post(`/api/quotations/${id}/submit`, {
                        validityDays: Number(validityDays) || 7,
                        lineItems: lines
                          .filter((l) => l.description && l.rate)
                          .map((l) => ({
                            description: l.description,
                            ...(l.unitType ? { unitType: l.unitType } : {}),
                            quantity: Number(l.quantity) || 0,
                            rate: Number(l.rate) || 0,
                            isMaterial: l.isMaterial,
                            materialIsEstimate: l.materialIsEstimate,
                          })),
                      })
                    )
                  }
                >
                  {t('submitQuote')}
                </Button>
              </Panel>
            </div>
          </Section>
        )}

        {accepted && (
          <Section title={<SectionHeading>{t('raiseVariation')}</SectionHeading>}>
            <Panel className="flex flex-col gap-3">
              <Body size="label">{t('variationNote')}</Body>
              <label className="flex flex-col gap-1">
                <EyebrowLabel>{t('variationDescription')}</EyebrowLabel>
                <Field value={variationText} onChange={(e) => setVariationText(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <EyebrowLabel>{t('variationAmount')}</EyebrowLabel>
                <Field
                  type="number"
                  value={variationAmount}
                  onChange={(e) => setVariationAmount(e.target.value)}
                />
              </label>
              <Button
                glyph="send"
                disabled={busy || variationText.trim().length < 5 || !variationAmount}
                onClick={() =>
                  act(async () => {
                    await api.post(`/api/quotations/${id}/variations`, {
                      description: variationText.trim(),
                      amount: Number(variationAmount),
                    });
                    setVariationText('');
                    setVariationAmount('');
                  })
                }
              >
                {t('variationSend')}
              </Button>
            </Panel>
          </Section>
        )}

        {variations.length > 0 && (
          <Section title={<SectionHeading>{t('variations')}</SectionHeading>}>
            <div className="flex flex-col gap-2">
              {variations.map((v) => (
                <LightCard key={v._id} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <Body size="label">{v.description}</Body>
                    <span className="font-mono text-[10px] text-fy-muted">
                      {v.amount >= 0 ? '+' : ''}₹{v.amount}
                    </span>
                  </span>
                  <StatusPill tone={v.status === 'approved' ? 'lime' : v.status === 'rejected' ? 'critical' : 'neutral'}>
                    {v.status === 'approved'
                      ? t('variationApproved')
                      : v.status === 'rejected'
                        ? t('variationRejected')
                        : t('variationRequested')}
                  </StatusPill>
                </LightCard>
              ))}
            </div>
          </Section>
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
