'use client';

import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Panel, Section, Divider } from '@/components/fy/Surfaces';
import { SectionHeading, Body, EyebrowLabel } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { MetricBlock } from '@/components/fy/Data';
import { WelfareRuleExplainer, type WelfareRule } from '@/components/worker/WelfareCard';

interface CheckRow {
  _id: string;
  scope: 'district' | 'society';
  scopeName: string;
  periodStart: string;
  demandIndex: number | null;
  triggered: boolean;
  paidTotal: number;
  activeMembers: number;
  completedBookings: number;
  note?: string;
  killSwitchOff: boolean;
}

interface FederationWelfare {
  districts: { id: string; name: string; region: string; poolBalance: number; checks: CheckRow[] }[];
  rule: WelfareRule;
}

/**
 * P1.2 — the welfare pool as a federation sees it: the pool balance, the
 * weekly demand index per district and society (newest first), and what
 * each check paid. Every number is read from the ledger and the stored
 * checks; nothing here is computed in the browser.
 */
export function WelfarePanel() {
  const t = useTranslations('welfare');
  const { data } = usePolling(() => api.get<FederationWelfare>('/api/federation/welfare'), 60000);

  return (
    <Section title={<SectionHeading>{t('panelTitle')}</SectionHeading>}>
      {!data ? (
        <div className="h-32 rounded-card bg-fy-panel animate-pulse" />
      ) : (
        <div className="flex flex-col gap-3">
          {data.districts.map((d) => (
            <Panel key={d.id} className="p-5 flex flex-col gap-3">
              <MetricBlock
                tone="green"
                label={t('poolOf', { district: d.name })}
                value={`₹${d.poolBalance.toLocaleString('en-IN')}`}
                note={t('checksCount', { count: d.checks.length })}
              />
              {d.checks.length === 0 ? (
                <Body size="label">{t('noCheckYet')}</Body>
              ) : (
                <div className="flex flex-col divide-y divide-fy-muted/10">
                  {d.checks.map((c) => (
                    <div key={c._id} className="py-2 flex flex-col gap-0.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-fy-ink truncate">
                          {c.scopeName} · {t('weekOf', { week: c.periodStart.slice(0, 10) })}
                        </span>
                        <StatusPill tone={c.triggered ? 'lime' : 'outline'} className="shrink-0">
                          {c.demandIndex === null ? t('noIndex') : t('indexValue', { index: c.demandIndex })}
                        </StatusPill>
                      </div>
                      <span className="text-xs text-fy-ink-soft">
                        {t('checkLine', { jobs: c.completedBookings, active: c.activeMembers, paid: c.paidTotal.toLocaleString('en-IN') })}
                        {c.killSwitchOff && c.triggered ? ` · ${t('awaitingApproval')}` : ''}
                      </span>
                      {c.note && <span className="text-xs text-fy-muted">{c.note}</span>}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ))}
          <Divider />
          <EyebrowLabel>{t('howItWorks')}</EyebrowLabel>
          <WelfareRuleExplainer rule={data.rule} />
        </div>
      )}
    </Section>
  );
}
