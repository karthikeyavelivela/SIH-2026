'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { useAuth } from '@/lib/auth-context';
import { MuthaResponse } from '@/lib/types';
import { REQUIRED_KYC_DOCS_BY_ROLE } from '@fyro/shared';
import { AvatarUpload } from '@/components/ui/AvatarUpload';
import { Icon } from '@/components/ui/Icon';
import { KycDocumentsSection } from '@/components/worker/KycDocumentsSection';
import {
  LanguageSection,
  ProfileIdentitySection,
  RoleSwitcherSection,
  NotificationPreferencesSection,
  PrivacySettingsSection,
  RatingsReceivedSection,
  ComplaintHistorySection,
  PayoutDetailsSection,
  ReferralSection,
  SupportSection,
  AccountDangerZoneSection,
} from '@/components/worker/ProfileSections';
import { Panel, Section, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill, VerifiedBadge } from '@/components/fy/Status';
import { DataList, DataRow } from '@/components/fy/Data';
import { TopBar, TabRow } from '@/components/fy/Navigation';

/* Built against client/public/design/society_profile.html.

   Section order there, top to bottom: 64px brand bar -> a society
   credential card (portrait, leader name, the society they lead, an ACTIVE
   pill) -> a tab row (Society / Documents / Reputation / Payouts /
   Settings) -> the selected tab's records.

   Largest element: the leader's name. Dark surfaces: none.

   Every section the page carried before is still here, grouped under the
   tab its subject belongs to. The society tab surfaces the shortcuts a
   leader needs — group settings, insurance and governance — which had been
   buried among the settings rows or, for insurance, only linked from the
   dashboard. */

const TABS = ['society', 'documents', 'reputation', 'payouts', 'settings'] as const;
type Tab = (typeof TABS)[number];

const TAB_GLYPH: Record<Tab, string> = {
  society: 'diversity_3',
  documents: 'description',
  reputation: 'stars',
  payouts: 'account_balance',
  settings: 'tune',
};

export default function MuthaLeaderProfilePage() {
  const t = useTranslations('profile');
  const tm = useTranslations('muthaProfile');
  const { user, refetch } = useAuth();
  const [tab, setTab] = useState<Tab>('society');
  const { data } = usePolling(() => api.get<MuthaResponse>('/api/mutha/me'), 60000);

  if (!user) return null;

  const shortcuts = [
    { href: '/mutha/create-group', glyph: 'settings', label: t('groupSettingsLink'), tone: 'lime' as const },
    { href: '/mutha/governance', glyph: 'how_to_vote', label: tm('governanceLink'), tone: 'peach' as const },
    { href: '/mutha/insurance', glyph: 'shield', label: tm('insuranceLink'), tone: 'slate-pale' as const },
    { href: '/mutha/operations', glyph: 'hub', label: tm('operationsLink'), tone: 'peach' as const },
  ];

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar
        eyebrow="FYRO Society"
        title={tm('pageTitle')}
        actions={user.accountStatus === 'active' ? <StatusPill tone="lime">{tm('memberPill')}</StatusPill> : undefined}
      />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <Panel className="p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <EyebrowLabel tone="green">{tm('credentialId', { id: user._id.slice(-6).toUpperCase() })}</EyebrowLabel>
            <StatusPill tone="lime" className="shrink-0">
              {t(`account.statusLabels.${user.accountStatus}`)}
            </StatusPill>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <AvatarUpload name={user.name} photoUrl={user.profilePhoto} accent="secondary" onUploaded={refetch} />
              {user.accountStatus === 'active' && (
                <span className="absolute -bottom-0.5 -right-0.5">
                  <VerifiedBadge />
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="font-heading text-heading text-fy-ink leading-tight truncate">{user.name}</h2>
              <Body size="label" className="truncate">
                {data?.mutha.name ? tm('leaderOf', { society: data.mutha.name }) : user.phone}
              </Body>
            </div>
          </div>
        </Panel>

        <TabRow
          variant="inset"
          active={tab}
          onChange={(k) => setTab(k as Tab)}
          tabs={TABS.map((k) => ({ key: k, label: tm(`tabs.${k}`), glyph: TAB_GLYPH[k] }))}
          className="overflow-x-auto"
        />

        {tab === 'society' && (
          <Section title={<SectionHeading>{tm('societySection')}</SectionHeading>}>
            <Panel className="py-0">
              <DataList>
                {shortcuts.map((s) => (
                  <DataRow
                    key={s.href}
                    lead={
                      <IconTile tone={s.tone} size="md" className="rounded-full">
                        <Icon name={s.glyph} size={18} />
                      </IconTile>
                    }
                    title={s.label}
                    trailing={<Icon name="chevron_right" size={18} className="text-fy-muted" />}
                    onClick={() => {
                      window.location.href = s.href;
                    }}
                  />
                ))}
              </DataList>
            </Panel>
            {data && (
              <Panel className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <EyebrowLabel>{tm('inviteCode')}</EyebrowLabel>
                  <p className="font-heading text-title text-fy-green tracking-[0.12em]">{data.mutha.inviteCode}</p>
                </div>
                <Link href="/mutha/members" className="font-body text-label font-semibold text-fy-green hover:underline shrink-0">
                  {tm('manageMembers')}
                </Link>
              </Panel>
            )}
          </Section>
        )}

        {tab === 'documents' && <KycDocumentsSection requiredTypes={REQUIRED_KYC_DOCS_BY_ROLE.mutha_leader} />}

        {tab === 'reputation' && (
          <>
            <RatingsReceivedSection />
            <ComplaintHistorySection />
            <ReferralSection />
          </>
        )}

        {tab === 'payouts' && <PayoutDetailsSection />}

        {tab === 'settings' && (
          <>
            <LanguageSection />
            <ProfileIdentitySection />
            <RoleSwitcherSection />
            <NotificationPreferencesSection />
            <PrivacySettingsSection />
            <SupportSection />
            <AccountDangerZoneSection />
          </>
        )}
      </main>
    </div>
  );
}
