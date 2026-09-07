'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { useSavedAddresses } from '@/lib/useSavedAddresses';
import { AvatarUpload } from '@/components/ui/AvatarUpload';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill, VerifiedBadge } from '@/components/fy/Status';
import { DataList, DataRow } from '@/components/fy/Data';
import { TopBar, TabRow } from '@/components/fy/Navigation';
import { CustomerTabBar } from '@/components/fy/CustomerTabBar';
import {
  LanguageSection,
  ProfileIdentitySection,
  RoleSwitcherSection,
  BusinessProfileSection,
  FrequentRoutesSection,
  NotificationPreferencesSection,
  PrivacySettingsSection,
  RatingsReceivedSection,
  ComplaintHistorySection,
  ReferralSection,
  AccountDangerZoneSection,
} from '@/components/worker/ProfileSections';

/* Built against client/public/design/customer_profile_1.html.

   Section order there, top to bottom: 64px brand bar -> passbook
   credential card (circular portrait with a verified badge, name, "member
   since" line, tier, an Active pill) -> credential ID row with a copy
   action -> five-tab row (Identity / Addresses / Payments / Reputation /
   Settings) -> the selected tab's record rows -> bottom bar.

   Largest element: the member's name. Dark surfaces: none — the whole
   screen is light on bone, with the brown accent on the badge and tabs.

   Every section the page carried before is still here, grouped under the
   tab its subject belongs to rather than stacked in one long column. */

const TABS = ['identity', 'addresses', 'payments', 'reputation', 'settings'] as const;
type Tab = (typeof TABS)[number];

const TAB_GLYPH: Record<Tab, string> = {
  identity: 'badge',
  addresses: 'pin_drop',
  payments: 'account_balance',
  reputation: 'stars',
  settings: 'tune',
};

export default function CustomerProfilePage() {
  const t = useTranslations('profile');
  const tc = useTranslations('customerProfile');
  const { user, refetch } = useAuth();
  const { addresses, remove } = useSavedAddresses();
  const [tab, setTab] = useState<Tab>('identity');
  const [copied, setCopied] = useState(false);

  if (!user) return null;

  // The design prints a "Passbook Credential ID". There is no such field on
  // the User model, and inventing an identifier a member could quote at a
  // society office would be worse than useless — so this shows the real
  // record id the platform actually knows them by.
  const credentialId = `FYRO-${user.role.toUpperCase()}-${user._id.slice(-6).toUpperCase()}`;

  async function copyCredential() {
    try {
      await navigator.clipboard.writeText(credentialId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context, or permission denied) — the id
      // is on screen and selectable either way.
    }
  }

  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar
        eyebrow="FYRO Cooperative"
        title={tc('title')}
        actions={
          <Link
            href="/customer/history"
            aria-label={tc('ledger')}
            className="w-11 h-11 rounded-full flex items-center justify-center text-fy-ink-soft hover:text-fy-ink transition-colors"
          >
            <Icon name="receipt_long" size={22} />
          </Link>
        }
      />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <Panel className="p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <EyebrowLabel tone="brown">{tc('verifiedPassbook')}</EyebrowLabel>
            <StatusPill tone="lime" className="shrink-0">
              {t(`account.statusLabels.${user.accountStatus}`)}
            </StatusPill>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <AvatarUpload name={user.name} photoUrl={user.profilePhoto} accent="primary" onUploaded={refetch} />
              {user.accountStatus === 'active' && (
                <span className="absolute -bottom-0.5 -right-0.5">
                  <VerifiedBadge />
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="font-heading text-heading text-fy-ink leading-tight truncate">{user.name}</h2>
              <Body size="label" className="mt-0.5">
                {memberSince ? tc('memberSince', { date: memberSince }) : t(`roles.${user.role}` as never)}
              </Body>
            </div>
          </div>
          <div className="rounded-control bg-fy-field p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <EyebrowLabel>{tc('credentialId')}</EyebrowLabel>
              <p className="font-body text-label font-semibold text-fy-ink truncate">{credentialId}</p>
            </div>
            <button
              type="button"
              onClick={copyCredential}
              className="shrink-0 inline-flex items-center gap-1.5 font-body text-label font-semibold text-fy-brown hover:underline"
            >
              <Icon name={copied ? 'check' : 'content_copy'} size={16} />
              {copied ? tc('copied') : tc('copy')}
            </button>
          </div>
        </Panel>

        <TabRow
          variant="inset"
          active={tab}
          onChange={(k) => setTab(k as Tab)}
          tabs={TABS.map((k) => ({ key: k, label: tc(`tabs.${k}`), glyph: TAB_GLYPH[k] }))}
          className="overflow-x-auto"
        />

        {tab === 'identity' && (
          <>
            <ProfileIdentitySection />
            <RoleSwitcherSection />
            <BusinessProfileSection />
          </>
        )}

        {tab === 'addresses' && (
          <>
            <Section
              title={<SectionHeading>{t('savedAddresses.title')}</SectionHeading>}
              aside={<EyebrowLabel>{tc('addressCount', { count: addresses.length })}</EyebrowLabel>}
            >
              {addresses.length === 0 ? (
                <LightCard>
                  <Body size="label">{tc('noAddresses')}</Body>
                </LightCard>
              ) : (
                <DataList>
                  {addresses.map((a) => (
                    <DataRow
                      key={a._id}
                      lead={
                        <IconTile tone="peach" size="md" className="rounded-full">
                          <Icon name="location_on" size={18} />
                        </IconTile>
                      }
                      title={a.label}
                      meta={a.address}
                      trailing={
                        <button
                          type="button"
                          aria-label={t('savedAddresses.removeAria', { label: a.label })}
                          onClick={() => remove(a._id)}
                          className="text-fy-muted hover:text-fy-error"
                        >
                          <Icon name="close" size={18} />
                        </button>
                      }
                    />
                  ))}
                </DataList>
              )}
            </Section>
            <FrequentRoutesSection />
          </>
        )}

        {tab === 'payments' && (
          <>
            {/* The design shows an "Enterprise Invoicing Mode" GSTIN toggle;
                that is exactly what BusinessProfileSection already is, and it
                belongs with billing rather than identity. */}
            <BusinessProfileSection />
            <Link href="/customer/insurance" className="block">
              <Panel className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <IconTile tone="brown" className="rounded-full">
                    <Icon name="shield" size={18} />
                  </IconTile>
                  <p className="font-body text-label font-semibold text-fy-ink">{t('insurance.title')}</p>
                </div>
                <Icon name="chevron_right" size={18} className="text-fy-muted shrink-0" />
              </Panel>
            </Link>
            <Link href="/customer/history" className="block">
              <Panel className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <IconTile tone="lime" className="rounded-full">
                    <Icon name="account_balance_wallet" size={18} />
                  </IconTile>
                  <p className="font-body text-label font-semibold text-fy-ink">{tc('passbookLedger')}</p>
                </div>
                <Icon name="chevron_right" size={18} className="text-fy-muted shrink-0" />
              </Panel>
            </Link>
          </>
        )}

        {tab === 'reputation' && (
          <>
            <RatingsReceivedSection />
            <ComplaintHistorySection />
            <ReferralSection />
          </>
        )}

        {tab === 'settings' && (
          <>
            <LanguageSection />
            <NotificationPreferencesSection />
            <PrivacySettingsSection />
            <Link href="/customer/support" className="block">
              <Panel className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <IconTile tone="peach" className="rounded-full">
                    <Icon name="support_agent" size={18} />
                  </IconTile>
                  <p className="font-body text-label font-semibold text-fy-ink">{t('support.title')}</p>
                </div>
                <Icon name="chevron_right" size={18} className="text-fy-muted shrink-0" />
              </Panel>
            </Link>
            <AccountDangerZoneSection />
          </>
        )}
      </main>

      <CustomerTabBar />
    </div>
  );
}
