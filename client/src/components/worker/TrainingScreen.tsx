'use client';

import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { useAuth } from '@/lib/auth-context';
import { TrainingAcademy } from '@/components/worker/TrainingAcademy';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { ProgressBar } from '@/components/fy/Data';
import { TopBar } from '@/components/fy/Navigation';

/* Built against client/public/design/worker_training_academy.html.

   Section order there, top to bottom: 64px brand bar with the MEMBER pill
   -> "Syndicate vocational accreditation" eyebrow over "Training Academy"
   -> an accreditation card with a completion percentage, a credit-hours
   figure and a benefit tile -> "Curriculum Roadmap" as a sequential unit
   list -> 5-tab bar.

   Largest element: the completion percentage. Dark surfaces: none.

   Three figures on the design's accreditation card have nothing behind
   them and are not shown: a named rank ("Level 3 Senior Transport
   Operator"), a "NEXT AUDIT" date, and a "₹450 / shift bump" stipend.
   Nothing stores ranks, audit schedules or training-linked pay bumps. The
   two that ARE real — how many modules are validated, and how many of the
   curriculum's hours that represents — carry the card instead. */

interface TrainingModuleDoc {
  _id: string;
  title: string;
  durationMinutes: number;
}

interface ProgressEntry {
  module: TrainingModuleDoc;
  status: 'locked' | 'in_progress' | 'completed';
  completedAt: string | null;
}

export function TrainingScreen({ accent = 'primary' }: { accent?: 'primary' | 'secondary' }) {
  const t = useTranslations('training');
  const { user } = useAuth();
  const { data } = usePolling(() => api.get<{ modules: ProgressEntry[] }>('/api/training/progress'), 30000);

  const modules = data?.modules ?? [];
  const completed = modules.filter((m) => m.status === 'completed');
  const pct = modules.length ? Math.round((completed.length / modules.length) * 100) : 0;

  // Real credit hours: the curriculum's own durationMinutes, summed.
  const doneMinutes = completed.reduce((s, m) => s + (m.module.durationMinutes ?? 0), 0);
  const totalMinutes = modules.reduce((s, m) => s + (m.module.durationMinutes ?? 0), 0);
  const hrs = (m: number) => Math.round((m / 60) * 10) / 10;

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar
        eyebrow="FYRO Cooperative"
        title={t('academyTitle')}
        actions={user?.accountStatus === 'active' ? <StatusPill tone="lime">{t('memberPill')}</StatusPill> : undefined}
      />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <div className="pt-2">
          <EyebrowLabel tone={accent === 'primary' ? 'brown' : 'green'}>{t('accreditationEyebrow')}</EyebrowLabel>
          <h2 className="font-heading text-heading text-fy-ink leading-[1.05]">{t('academyTitle')}</h2>
          <Body className="mt-1.5">{t('academySubtitle')}</Body>
        </div>

        <Panel className="p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <span className="flex items-center gap-2 min-w-0">
              <IconTile tone={pct === 100 ? 'lime' : 'peach'} size="sm">
                <Icon name="military_tech" size={18} />
              </IconTile>
              <EyebrowLabel tone={accent === 'primary' ? 'brown' : 'green'}>{t('accreditationStanding')}</EyebrowLabel>
            </span>
            <StatusPill tone={pct === 100 ? 'lime' : 'outline'} className="shrink-0">
              {pct === 100 ? t('curriculumComplete') : t('inProgress')}
            </StatusPill>
          </div>

          <div className="flex items-baseline gap-2">
            <span className={`font-heading text-metric leading-none ${accent === 'primary' ? 'text-fy-brown' : 'text-fy-green'}`}>
              {pct}%
            </span>
            <Body size="label">{t('modulesValidated', { done: completed.length, total: modules.length })}</Body>
          </div>

          <ProgressBar value={pct} tone={accent === 'primary' ? 'brown' : 'green'} />

          <Divider />

          <div className="flex items-center justify-between gap-3">
            <div>
              <EyebrowLabel>{t('creditHours')}</EyebrowLabel>
              <p className="font-body text-body font-semibold text-fy-ink">
                {t('hoursOf', { done: hrs(doneMinutes), total: hrs(totalMinutes) })}
              </p>
            </div>
            <Icon name="workspace_premium" size={22} className="text-fy-muted shrink-0" />
          </div>
        </Panel>

        <Section
          title={<SectionHeading>{t('curriculumRoadmap')}</SectionHeading>}
          aside={<EyebrowLabel>{t('unitCount', { count: modules.length })}</EyebrowLabel>}
        >
          <TrainingAcademy accent={accent} />
        </Section>
      </main>
    </div>
  );
}
