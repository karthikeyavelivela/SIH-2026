'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { Panel, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { MetricBlock } from '@/components/fy/Data';
import { Icon } from '@/components/ui/Icon';

export interface WelfareRule {
  triggerIndex: number;
  payoutCapPct: number;
  perMemberCap: number;
  minActiveDays: number;
  minSocietyMembers: number;
  historyWeeks: number;
}

interface WelfareCheckRow {
  _id: string;
  scope: 'district' | 'society';
  scopeName: string;
  periodStart: string;
  demandIndex: number | null;
  triggered: boolean;
  note?: string;
}

interface MyWelfare {
  district: { id: string; name: string; poolBalance: number } | null;
  society: { id: string; name: string } | null;
  recentChecks: WelfareCheckRow[];
  payouts: { _id: string; amount: number; period: string; status: string }[];
  availableDaysLast28: number;
  rule: WelfareRule;
}

/** The rule, in plain words, with the real parameters. Shared with the federation panel. */
export function WelfareRuleExplainer({ rule }: { rule: WelfareRule }) {
  const t = useTranslations('welfare');
  return (
    <div className="flex items-start gap-2.5">
      <Icon name="auto_mode" size={18} className="text-fy-green shrink-0 mt-px" />
      <Body size="label">
        {t('rule', {
          weeks: rule.historyWeeks,
          days: rule.minActiveDays,
          index: rule.triggerIndex,
          cap: rule.payoutCapPct,
          perMember: rule.perMemberCap.toLocaleString('en-IN'),
        })}
      </Body>
    </div>
  );
}

/**
 * P1.2 — a worker's welfare card: their district's pool, the last weekly
 * demand checks, what they have been paid, and the rule in plain words.
 * Replaces the old personal-earnings gauge, whose trigger is retired.
 */
export function WelfareCard() {
  const t = useTranslations('welfare');
  const [data, setData] = useState<MyWelfare | null | undefined>(undefined);

  useEffect(() => {
    api
      .get<MyWelfare>('/api/welfare/me')
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (data === undefined) return <div className="h-40 rounded-card bg-fy-panel animate-pulse" />;
  if (data === null) return null;

  const latest = data.recentChecks[0];
  const counted = data.availableDaysLast28 >= data.rule.minActiveDays;

  return (
    <Panel className="p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 min-w-0">
          <IconTile tone="lime" size="sm">
            <Icon name="volunteer_activism" size={18} />
          </IconTile>
          <EyebrowLabel tone="green">{t('title')}</EyebrowLabel>
        </span>
        {latest && (
          <StatusPill tone={latest.triggered ? 'lime' : 'outline'} className="shrink-0">
            {latest.triggered ? t('belowNormal') : t('normal')}
          </StatusPill>
        )}
      </div>

      {data.district ? (
        <MetricBlock
          tone="green"
          label={t('poolOf', { district: data.district.name })}
          value={`₹${data.district.poolBalance.toLocaleString('en-IN')}`}
          note={
            latest?.demandIndex != null
              ? t('lastIndex', { index: latest.demandIndex, week: latest.periodStart.slice(0, 10) })
              : latest?.note ?? t('noCheckYet')
          }
        />
      ) : (
        <Body size="label">{t('noDistrict')}</Body>
      )}

      <Body size="label">
        {counted
          ? t('youCount', { days: data.availableDaysLast28 })
          : t('youDoNotCount', { days: data.availableDaysLast28, min: data.rule.minActiveDays })}
      </Body>

      {data.payouts.length > 0 && (
        <div className="flex flex-col gap-1">
          <EyebrowLabel>{t('yourPayments')}</EyebrowLabel>
          {data.payouts.map((p) => (
            <div key={p._id} className="flex justify-between text-sm">
              <span className="text-fy-ink-soft">{t('weekOf', { week: p.period })}</span>
              <span className="tabular-nums">
                ₹{p.amount.toLocaleString('en-IN')} {p.status === 'pending' ? `· ${t('pending')}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      <Divider />
      <WelfareRuleExplainer rule={data.rule} />
    </Panel>
  );
}
