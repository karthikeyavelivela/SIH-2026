'use client';

import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel } from '@/components/fy/Surfaces';
import { EyebrowLabel, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';

/**
 * The quotation itself, as both sides see it.
 *
 * One component for the worker's view and the customer's, because a
 * quotation is an agreement between them and showing each party a differently
 * arranged version of it invites exactly the disagreements this whole flow
 * exists to prevent.
 *
 * Labour and materials are totalled separately, and an estimated material
 * price says "estimate" on its face: the customer is agreeing to a range
 * there, not to a number, and that difference belongs on the document rather
 * than in a footnote.
 */

export interface LineItem {
  description: string;
  unitType?: string;
  quantity: number;
  rate: number;
  amount: number;
  isMaterial: boolean;
  materialIsEstimate: boolean;
}

export interface QuotationView {
  _id: string;
  status: string;
  jobDescription: string;
  lineItems: LineItem[];
  labourSubtotal: number;
  materialSubtotal: number;
  total: number;
  frozenTotal?: number;
  validUntil?: string;
  revisions?: { total: number; note?: string; submittedAt: string }[];
  siteVisit?: { scheduledAt?: string; completedAt?: string; fee: number; feeAdjustable: boolean };
}

export function QuotationDocument({ quotation }: { quotation: QuotationView }) {
  const t = useTranslations('pricing.quotation');
  const tUnits = useTranslations('pricing.units');

  const daysLeft = quotation.validUntil
    ? Math.ceil((new Date(quotation.validUntil).getTime() - Date.now()) / 86_400_000)
    : null;

  const labour = quotation.lineItems.filter((l) => !l.isMaterial);
  const materials = quotation.lineItems.filter((l) => l.isMaterial);

  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <EyebrowLabel tone="brown">{t(`status.${quotation.status}` as never)}</EyebrowLabel>
          <Body size="label">{quotation.jobDescription}</Body>
        </span>
        {quotation.frozenTotal !== undefined && <StatusPill tone="lime">₹{quotation.frozenTotal}</StatusPill>}
      </div>

      {/* The countdown is on the document, not in a toast — a price with a
          deadline should carry its deadline. */}
      {quotation.validUntil && quotation.status === 'submitted' && (
        <LightCard className="flex items-center gap-2.5">
          <Icon name="schedule" size={16} className="text-fy-brown shrink-0" />
          <Body size="label">
            {daysLeft !== null && daysLeft > 0
              ? t('expiresIn', { days: daysLeft })
              : t('expiredNote')}
          </Body>
        </LightCard>
      )}
      {quotation.status === 'expired' && (
        <LightCard>
          <Body size="label">{t('expiredNote')}</Body>
        </LightCard>
      )}

      {labour.length > 0 && (
        <Group title={t('labour')} subtotal={quotation.labourSubtotal}>
          {labour.map((l, i) => (
            <Line key={i} line={l} unitLabel={l.unitType ? tUnits(`${l.unitType}.label` as never) : undefined} />
          ))}
        </Group>
      )}

      {materials.length > 0 && (
        <Group title={t('materials')} subtotal={quotation.materialSubtotal}>
          {materials.map((l, i) => (
            <Line
              key={i}
              line={l}
              unitLabel={l.unitType ? tUnits(`${l.unitType}.label` as never) : undefined}
              badge={l.materialIsEstimate ? t('materialEstimate') : t('materialFixed')}
            />
          ))}
        </Group>
      )}

      <div className="flex items-baseline justify-between gap-3 border-t border-fy-brown/15 pt-3">
        <span className="font-body text-body font-semibold text-fy-ink">{t('total')}</span>
        <span className="font-mono text-title text-fy-ink">₹{quotation.total}</span>
      </div>

      {quotation.frozenTotal !== undefined && (
        <Body size="label">{t('frozenNote', { amount: quotation.frozenTotal })}</Body>
      )}

      {quotation.revisions && quotation.revisions.length > 0 && (
        <div className="border-t border-fy-brown/10 pt-3 flex flex-col gap-1.5">
          <EyebrowLabel>{t('previousVersions')}</EyebrowLabel>
          {quotation.revisions.map((r, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3">
              <span className="font-body text-label text-fy-muted min-w-0 truncate">
                {r.note ?? t('versionNote', { n: i + 1, total: r.total })}
              </span>
              <span className="font-mono text-label text-fy-ink-soft">₹{r.total}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Group({
  title,
  subtotal,
  children,
}: {
  title: string;
  subtotal: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <EyebrowLabel>{title}</EyebrowLabel>
        <span className="font-mono text-label text-fy-ink-soft">₹{subtotal}</span>
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Line({ line, unitLabel, badge }: { line: LineItem; unitLabel?: string; badge?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block font-body text-body text-fy-ink">{line.description}</span>
        <span className="block font-mono text-[10px] text-fy-muted">
          {line.quantity} × ₹{line.rate}
          {unitLabel ? ` · ${unitLabel}` : ''}
          {badge ? ` · ${badge}` : ''}
        </span>
      </span>
      <span className="font-mono text-body text-fy-ink shrink-0">₹{line.amount}</span>
    </div>
  );
}
