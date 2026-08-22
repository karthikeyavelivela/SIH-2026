'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Badge } from '@/components/ui/Badge';
import { TopBar } from '@/components/ui/TopBar';
import { DocumentExpiryCard } from '@/components/worker/DocumentExpiryCard';
import { KycDocumentsSection } from '@/components/worker/KycDocumentsSection';
import { AvatarUpload } from '@/components/ui/AvatarUpload';
import { TruckIcon } from '@/components/ui/icons';
import { REQUIRED_KYC_DOCS_BY_ROLE } from '@fyro/shared';
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

interface Vehicle {
  type: string;
  capacityKg: number;
  registrationNumber: string;
  verified: boolean;
  complianceStatus?: 'compliant' | 'non_compliant';
  insuranceExpiryAt?: string;
}

export default function DriverProfilePage() {
  const t = useTranslations('profile');
  const { user, refetch } = useAuth();
  const { data, state, reload } = usePolling(() => api.get<{ vehicle: Vehicle }>('/api/vehicles/me').catch((err) => {
    if (err instanceof ApiClientError && err.status === 404) return { vehicle: null as unknown as Vehicle };
    throw err;
  }), 60000);
  const [licenseExpiryAt, setLicenseExpiryAt] = useState<string | null>(user?.licenseExpiryAt ?? null);
  const [insuranceExpiryAt, setInsuranceExpiryAt] = useState<string | null>(null);

  const [editingVehicle, setEditingVehicle] = useState(false);
  const [capacityKg, setCapacityKg] = useState('');
  const [vehicleSaving, setVehicleSaving] = useState(false);

  useEffect(() => {
    if (data?.vehicle?.insuranceExpiryAt !== undefined) setInsuranceExpiryAt(data.vehicle.insuranceExpiryAt ?? null);
    if (data?.vehicle?.capacityKg !== undefined) setCapacityKg(String(data.vehicle.capacityKg));
  }, [data?.vehicle?.insuranceExpiryAt, data?.vehicle?.capacityKg]);

  async function saveVehicle() {
    setVehicleSaving(true);
    try {
      await api.patch('/api/vehicles/me', { capacityKg: Number(capacityKg) });
      await reload();
      setEditingVehicle(false);
    } finally {
      setVehicleSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-ip-surface pb-24">
      <TopBar title={t('pageTitle')} showBack={false} />
      <div className="max-w-lg mx-auto px-ip-edge pt-ip-sm">

      <div className="ip-card flex items-center gap-4 mb-6">
        <AvatarUpload name={user.name} photoUrl={user.profilePhoto} accent="primary" onUploaded={refetch} />
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

      <h2 className="font-heading text-lg font-bold mb-3">{t('vehicle.sectionTitle')}</h2>
      {state === 'loading' && <div className="h-24 rounded-ip-card bg-ip-surface-container animate-pulse mb-6" />}
      {state !== 'loading' && !data?.vehicle && (
        <div className="ip-card text-center py-8 mb-6">
          <TruckIcon className="w-8 h-8 text-ip-on-surface-variant/50 mx-auto mb-3" />
          <p className="text-sm text-ip-on-surface-variant">{t('vehicle.noneYet')}</p>
        </div>
      )}
      {data?.vehicle && (
        <div className="ip-card mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="font-heading font-bold capitalize">{data.vehicle.type.replace('_', ' ')}</p>
            <div className="flex gap-1.5">
              <Badge tone={data.vehicle.verified ? 'success' : 'muted'}>
                {data.vehicle.verified ? t('vehicle.verified') : t('vehicle.verificationPending')}
              </Badge>
              {data.vehicle.complianceStatus === 'non_compliant' && <Badge tone="danger">{t('vehicle.complianceFailed')}</Badge>}
            </div>
          </div>
          <p className="text-sm text-ip-on-surface-variant">{t('vehicle.reg', { reg: data.vehicle.registrationNumber })}</p>
          {!editingVehicle ? (
            <div className="flex items-center justify-between mt-1">
              <p className="text-sm text-ip-on-surface-variant">{t('vehicle.capacity', { kg: data.vehicle.capacityKg })}</p>
              <button type="button" onClick={() => setEditingVehicle(true)} className="text-xs font-semibold text-ip-primary">
                {t('vehicle.editCapacity')}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number"
                value={capacityKg}
                onChange={(e) => setCapacityKg(e.target.value)}
                className="flex-1 min-h-[40px] px-3 py-1.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
              />
              <button type="button" disabled={vehicleSaving} onClick={saveVehicle} className="text-xs font-semibold text-ip-primary">
                {vehicleSaving ? t('vehicle.saving') : t('vehicle.save')}
              </button>
              <button type="button" onClick={() => setEditingVehicle(false)} className="text-xs text-ip-on-surface-variant">
                {t('vehicle.cancel')}
              </button>
            </div>
          )}
        </div>
      )}

      <KycDocumentsSection requiredTypes={REQUIRED_KYC_DOCS_BY_ROLE.driver} />

      <DocumentExpiryCard
        license={licenseExpiryAt}
        insurance={insuranceExpiryAt}
        onSaved={(updated) => {
          if (updated.licenseExpiryAt !== undefined) setLicenseExpiryAt(updated.licenseExpiryAt ?? null);
          if (updated.insuranceExpiryAt !== undefined) setInsuranceExpiryAt(updated.insuranceExpiryAt ?? null);
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
