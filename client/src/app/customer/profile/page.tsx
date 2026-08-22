'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useSavedAddresses } from '@/lib/useSavedAddresses';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { AvatarUpload } from '@/components/ui/AvatarUpload';
import { AlertIcon, ChevronRightIcon, MapPinIcon, XIcon } from '@/components/ui/icons';
import {
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

export default function CustomerProfilePage() {
  const { user, refetch } = useAuth();
  const { addresses, remove } = useSavedAddresses();
  if (!user) return null;

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-2xl font-bold mb-6">Profile</h1>

      <Card elevation="raised" className="flex items-center gap-4 mb-6">
        <AvatarUpload name={user.name} photoUrl={user.profilePhoto} accent="primary" onUploaded={refetch} />
        <div>
          <p className="font-heading font-bold text-lg">{user.name}</p>
          <p className="text-sm text-text-muted">{user.phone}</p>
          <Badge tone="secondary" className="mt-1.5">
            {user.accountStatus}
          </Badge>
        </div>
      </Card>

      <ProfileIdentitySection />
      <RoleSwitcherSection />

      {addresses.length > 0 && (
        <Card elevation="raised" className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-3">Saved addresses</p>
          <div className="space-y-2.5">
            {addresses.map((a) => (
              <div key={a._id} className="flex items-start gap-2.5">
                <MapPinIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{a.label}</p>
                  <p className="text-xs text-text-muted truncate">{a.address}</p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${a.label}`}
                  onClick={() => remove(a._id)}
                  className="flex-shrink-0 text-text-muted hover:text-red-600"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <FrequentRoutesSection />
      <BusinessProfileSection />
      <NotificationPreferencesSection />
      <PrivacySettingsSection />
      <RatingsReceivedSection />
      <ComplaintHistorySection />
      <ReferralSection />

      <Link
        href="/customer/support"
        className="flex items-center justify-between p-4 mb-6 rounded-lg bg-surface-raised border border-border shadow-sm hover:shadow-md transition-all duration-base"
      >
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-primary/10 text-primary-600 flex items-center justify-center">
            <AlertIcon className="w-5 h-5" />
          </span>
          <p className="text-sm font-semibold">Support</p>
        </div>
        <ChevronRightIcon className="w-4 h-4 text-text-muted" />
      </Link>

      <AccountDangerZoneSection />
    </div>
  );
}
