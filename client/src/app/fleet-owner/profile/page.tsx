'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { api, ApiClientError } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { AvatarUpload } from '@/components/ui/AvatarUpload';
import Link from 'next/link';
import { ShieldIcon, ChevronRightIcon } from '@/components/ui/icons';
import { KycDocumentsSection } from '@/components/worker/KycDocumentsSection';
import { REQUIRED_KYC_DOCS_BY_ROLE } from '@fyro/shared';
import {
  LanguageSection,
  ProfileIdentitySection,
  NotificationPreferencesSection,
  PrivacySettingsSection,
  ComplaintHistorySection,
  SupportSection,
  AccountDangerZoneSection,
} from '@/components/worker/ProfileSections';

interface Fleet {
  name: string;
  vehicleIds: unknown[];
  driverIds: unknown[];
}

function CompanyProfileSection() {
  const t = useTranslations('companyProfile');
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ fleet: Fleet }>('/api/fleet/me')
      .then((res) => {
        setFleet(res.fleet);
        setName(res.fleet.name);
      })
      .catch(() => setFleet(null));
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.patch('/api/fleet/me', { name });
      setFleet((f) => (f ? { ...f, name } : f));
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorSave'));
    } finally {
      setSaving(false);
    }
  }

  if (!fleet) return null;

  return (
    <div className="mb-6">
      <h2 className="font-heading text-lg font-bold mb-3">{t('title')}</h2>
      <div className="fy-surface-card space-y-3">
        {!editing ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-fy-ink-soft">{t('companyName')}</span>
              <span className="font-medium">{fleet.name}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-fy-ink-soft">{t('fleetSize')}</span>
              <span className="font-medium">
                {t('fleetSizeValue', { vehicles: fleet.vehicleIds.length, drivers: fleet.driverIds.length })}
              </span>
            </div>
            <p className="text-xs text-fy-ink-soft pt-2 border-t border-fy-muted/10">{t('gstinNote')}</p>
            <button type="button" onClick={() => setEditing(true)} className="text-sm font-semibold text-fy-brown">
              {t('editName')}
            </button>
          </>
        ) : (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-control border border-fy-muted/20 bg-fy-bone text-sm"
            />
            {error && <p className="text-xs text-fy-error">{error}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={saving} onClick={save} className="text-sm font-semibold text-fy-brown">
                {saving ? t('saving') : t('save')}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="text-sm text-fy-ink-soft">
                {t('cancel')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function FleetOwnerProfilePage() {
  const t = useTranslations('profile');
  const { user, refetch } = useAuth();
  if (!user) return null;

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-fy-brown mb-2">{t('accountEyebrow')}</p>
      <h1 className="font-heading text-heading font-extrabold mb-6">{t('pageTitle')}</h1>

      <div className="fy-surface-card flex items-center gap-4 mb-6 max-w-2xl">
        <AvatarUpload name={user.name} photoUrl={user.profilePhoto} accent="primary" onUploaded={refetch} />
        <div>
          <p className="font-heading font-bold text-lg">{user.name}</p>
          <p className="text-sm text-fy-ink-soft">{user.phone}</p>
          <Badge tone="secondary" className="mt-1.5">
            {t(`account.statusLabels.${user.accountStatus}`)}
          </Badge>
        </div>
      </div>

      <div className="max-w-2xl">
        <LanguageSection />
        <ProfileIdentitySection />
        <CompanyProfileSection />
        <KycDocumentsSection requiredTypes={REQUIRED_KYC_DOCS_BY_ROLE.fleet_owner} />
        <NotificationPreferencesSection />
        <PrivacySettingsSection />
        <ComplaintHistorySection />
        <Link
          href="/fleet-owner/insurance"
          className="flex items-center justify-between p-4 rounded-card bg-fy-field hover:bg-fy-well transition-colors duration-base mb-6"
        >
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-fy-brown/10 text-fy-brown flex items-center justify-center">
              <ShieldIcon className="w-5 h-5" />
            </span>
            <p className="text-sm font-semibold">{t('insurance.title')}</p>
          </div>
          <ChevronRightIcon className="w-4 h-4 text-fy-ink-soft" />
        </Link>
        <SupportSection />
        <AccountDangerZoneSection />
      </div>
    </div>
  );
}
