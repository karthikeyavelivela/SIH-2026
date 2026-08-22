'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { AvatarUpload } from '@/components/ui/AvatarUpload';
import { KycDocumentsSection } from '@/components/worker/KycDocumentsSection';
import { REQUIRED_KYC_DOCS_BY_ROLE } from '@fyro/shared';
import { ChevronRightIcon, UsersIcon } from '@/components/ui/icons';
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

// Mutha leaders had no way to log out at all before this page existed —
// found live: /mutha's bottom tabs were Group/Requests/Jobs/Members/
// Earnings, none of which carry a logout affordance, unlike every other
// role.
export default function MuthaLeaderProfilePage() {
  const t = useTranslations('profile');
  const { user, refetch } = useAuth();
  if (!user) return null;

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-2xl font-bold mb-6">{t('pageTitle')}</h1>

      <Card elevation="raised" className="flex items-center gap-4 mb-6">
        <AvatarUpload name={user.name} photoUrl={user.profilePhoto} accent="secondary" onUploaded={refetch} />
        <div>
          <p className="font-heading font-bold text-lg">{user.name}</p>
          <p className="text-sm text-text-muted">{user.phone}</p>
          <Badge tone="secondary" className="mt-1.5">
            {t(`account.statusLabels.${user.accountStatus}`)}
          </Badge>
        </div>
      </Card>

      <LanguageSection />
      <ProfileIdentitySection />
      <RoleSwitcherSection />

      <Link
        href="/mutha/create-group"
        className="flex items-center justify-between p-4 rounded-lg bg-surface-raised border border-border shadow-sm hover:shadow-md transition-all duration-base mb-6"
      >
        <span className="flex items-center gap-2.5 text-sm font-semibold">
          <UsersIcon className="w-4 h-4 text-text-muted" />
          {t('groupSettingsLink')}
        </span>
        <ChevronRightIcon className="w-4 h-4 text-text-muted" />
      </Link>

      <KycDocumentsSection requiredTypes={REQUIRED_KYC_DOCS_BY_ROLE.mutha_leader} />

      <NotificationPreferencesSection />
      <PrivacySettingsSection />
      <PayoutDetailsSection />
      <RatingsReceivedSection />
      <ComplaintHistorySection />
      <ReferralSection />
      <SupportSection />
      <AccountDangerZoneSection />
    </div>
  );
}
