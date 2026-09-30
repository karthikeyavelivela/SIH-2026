'use client';

import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { LightCard, Section } from '@/components/fy/Surfaces';
import { SectionHeading, Body } from '@/components/fy/Text';

interface FairnessResponse {
  windowDays: number;
  societies: {
    societyId: string;
    name: string;
    members: number;
    min: number;
    median: number;
    max: number;
    spread: number;
    membersWithNoWork: number;
    distribution: number[];
  }[];
  recommendations: { decided: number; followed: number; fromMl: number };
}

/**
 * P2.2 — how evenly work is spread inside each society: one bar per member
 * (job-days over the last four weeks), sorted, with the gap between the
 * busiest and least-busy. Counts come from the bookings themselves.
 */
export function FairnessPanel() {
  const t = useTranslations('fairness');
  const { data } = usePolling(() => api.get<FairnessResponse>('/api/federation/fairness'), 60000);

  return (
    <Section title={<SectionHeading>{t('panelTitle')}</SectionHeading>}>
      {!data ? (
        <div className="h-24 rounded-card bg-fy-panel animate-pulse" />
      ) : (
        <div className="flex flex-col gap-3">
          <Body size="label">{t('intro', { days: data.windowDays })}</Body>
          {data.societies.length === 0 ? (
            <LightCard>
              <Body size="label">{t('empty')}</Body>
            </LightCard>
          ) : (
            data.societies.map((s) => {
              const top = Math.max(1, s.max);
              return (
                <LightCard key={s.societyId} className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-body text-body font-semibold text-fy-ink truncate">{s.name}</p>
                    <span className="text-xs font-semibold text-fy-brown">{t('spread', { spread: s.spread })}</span>
                  </div>
                  <div className="flex items-end gap-0.5 h-10" aria-hidden>
                    {s.distribution.map((n, i) => (
                      <span
                        key={i}
                        className="flex-1 min-w-[3px] rounded-sm bg-fy-green/70"
                        style={{ height: `${Math.max(4, (n / top) * 100)}%` }}
                      />
                    ))}
                  </div>
                  <Body size="label">
                    {t('societyLine', { members: s.members, max: s.max, median: s.median, min: s.min })}
                    {s.membersWithNoWork > 0 && ` · ${t('noWork', { count: s.membersWithNoWork })}`}
                  </Body>
                </LightCard>
              );
            })
          )}
          <Body size="label">
            {data.recommendations.decided > 0
              ? t('uptake', { followed: data.recommendations.followed, decided: data.recommendations.decided })
              : t('uptakeNone')}
          </Body>
        </div>
      )}
    </Section>
  );
}
