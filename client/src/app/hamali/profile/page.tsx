'use client';

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
    <div className="min-h-screen bg-ip-surface pb-24">
      <TopBar title={t('pageTitle')} showBack={false} />
      <div className="max-w-lg mx-auto px-ip-edge pt-ip-sm">

      <div className="ip-card flex items-center gap-4 mb-6">
        <AvatarUpload name={user.name} photoUrl={user.profilePhoto} accent="secondary" onUploaded={refetch} />
        <div>
          <p className="font-heading font-bold text-lg">{user.name}</p>
          <p className="text-sm text-ip-on-surface-variant">{user.phone}</p>
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
      <SupportSection />
      <AccountDangerZoneSection />
      </div>
    </div>
  );
}
