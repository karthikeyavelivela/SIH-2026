'use client';

import Link from 'next/link';
import { ShieldIcon, ChevronRightIcon } from '@/components/ui/icons';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { Badge } from '@/components/ui/Badge';
import { TopBar } from '@/components/ui/TopBar';
import { DocumentExpiryCard } from '@/components/worker/DocumentExpiryCard';
import { KycDocumentsSection } from '@/components/worker/KycDocumentsSection';
import { AvatarUpload } from '@/components/ui/AvatarUpload';
import { REQUIRED_KYC_DOCS_BY_ROLE } from '@fyro/shared';
import {
  LanguageSection,
  ProfileIdentitySection,
  RoleSwitcherSection,
  HamaliSkillsSection,
  NotificationPreferencesSection,
  PrivacySettingsSection,
  RatingsReceivedSection,
  ComplaintHistorySection,
  PayoutDetailsSection,
  ReferralSection,
  SupportSection,
  AccountDangerZoneSection,
} from '@/components/worker/ProfileSections';

export default function HamaliProfilePage() {
  const t = useTranslations('profile');
  const { user, refetch } = useAuth();
  const [licenseExpiryAt, setLicenseExpiryAt] = useState<string | null>(user?.licenseExpiryAt ?? null);
  if (!user) return null;

  return (
    <div className="min-h-screen bg-fy-bone pb-24">
      <TopBar title={t('pageTitle')} showBack={false} />
      <div className="max-w-lg mx-auto px-gutter pt-4">

      <div className="fy-surface-card flex items-center gap-4 mb-6">
        <AvatarUpload name={user.name} photoUrl={user.profilePhoto} accent="secondary" onUploaded={refetch} />
        <div>
          <p className="font-heading font-bold text-lg">{user.name}</p>
          <p className="text-sm text-fy-ink-soft">{user.phone}</p>
          <Badge tone="secondary" className="mt-1.5">
            {t(`account.statusLabels.${user.accountStatus}`)}
          </Badge>
        </div>
      </div>

      <LanguageSection />
      <ProfileIdentitySection />
      <RoleSwitcherSection />
      <HamaliSkillsSection />

      <KycDocumentsSection requiredTypes={REQUIRED_KYC_DOCS_BY_ROLE.hamali_solo} />

      <DocumentExpiryCard
        license={licenseExpiryAt}
        onSaved={(updated) => {
          if (updated.licenseExpiryAt !== undefined) setLicenseExpiryAt(updated.licenseExpiryAt ?? null);
        }}
      />

      <NotificationPreferencesSection />
      <PrivacySettingsSection />
      <PayoutDetailsSection />
      <RatingsReceivedSection />
      <ComplaintHistorySection />
      <ReferralSection />
      {/* A worker should find their cover without being told it exists.
          Same visual weight as the sections around it. */}
      <Link
        href="/hamali/insurance"
        className="flex items-center justify-between p-4 mb-6 rounded-card bg-fy-card shadow-card hover:bg-fy-panel transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-fy-peach text-fy-brown flex items-center justify-center">
            <ShieldIcon className="w-5 h-5" />
          </span>
          <p className="font-body text-label font-semibold text-fy-ink">{t('insurance.title')}</p>
        </div>
        <ChevronRightIcon className="w-4 h-4 text-fy-muted" />
      </Link>

      <SupportSection />
      <AccountDangerZoneSection />
      </div>
    </div>
  );
}
