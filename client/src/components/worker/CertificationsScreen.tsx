'use client';

import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { useAuth } from '@/lib/auth-context';
import { CertificationList } from '@/components/worker/CertificationList';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Section, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { TopBar } from '@/components/fy/Navigation';

/* Built against client/public/design/worker_certifications.html.

   Section order there, top to bottom: 64px brand bar with the MEMBER pill
   -> "Syndicate Register" eyebrow over "Earned Certifications" and a
   blurb -> an indemnity-standing card -> one card per credential ->
   5-tab bar.

   Largest element: the heading. Dark surfaces: none.

   The indemnity card is the worker's REAL active insurance policy and its
   real coverage amount, read from /api/insurance/me. The design
   hard-codes a "Class-A Tier · ₹12,50,000 Pool"; a worker with no policy
   is told they have none rather than shown someone else's tier. */

interface Policy {
  _id: string;
  status: string;
  /** GET /api/insurance/me joins the catalog entry on as `plan`. */
  plan?: { name?: string; coverageAmount?: number; category?: string } | null;
  coverageAmount?: number;
}

export function CertificationsScreen({ accent = 'primary' }: { accent?: 'primary' | 'secondary' }) {
  const t = useTranslations('certifications');
  const { user } = useAuth();
  const { data } = usePolling(() => api.get<{ policies: Policy[] }>('/api/insurance/me'), 60000);

  const active = (data?.policies ?? []).find((p) => p.status === 'active');
  const coverage = active?.plan?.coverageAmount ?? active?.coverageAmount;

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar
        eyebrow="FYRO Cooperative"
        title={t('pageTitle')}
        showBack
        actions={user?.accountStatus === 'active' ? <StatusPill tone="lime">{t('memberPill')}</StatusPill> : undefined}
      />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <div className="pt-2">
          <EyebrowLabel tone={accent === 'primary' ? 'brown' : 'green'}>{t('registerEyebrow')}</EyebrowLabel>
          <h2 className="font-heading text-heading text-fy-ink leading-[1.05]">{t('earnedHeading')}</h2>
          <Body className="mt-1.5">{t('pageSubtitle')}</Body>
        </div>

        <LightCard className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <IconTile tone={active ? 'lime' : 'peach'} size="md">
              <Icon name="verified_user" size={20} />
            </IconTile>
            <div className="min-w-0">
              <EyebrowLabel>{t('indemnityStanding')}</EyebrowLabel>
              <p className="font-body text-body font-semibold text-fy-ink truncate">
                {active ? (active.plan?.name ?? t('coverActive')) : t('noCover')}
              </p>
              {coverage != null && <Body size="label">{t('coverageAmount', { amount: coverage.toLocaleString('en-IN') })}</Body>}
            </div>
          </div>
          <StatusPill tone={active ? 'lime' : 'outline'} className="shrink-0">
            {active ? t('bonded') : t('notBonded')}
          </StatusPill>
        </LightCard>

        <Section title={<SectionHeading>{t('credentialsHeading')}</SectionHeading>}>
          <CertificationList />
        </Section>
      </main>
    </div>
  );
}
