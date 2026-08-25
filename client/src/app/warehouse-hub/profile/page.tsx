'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { api, ApiClientError } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { AvatarUpload } from '@/components/ui/AvatarUpload';
import { KycDocumentsSection } from '@/components/worker/KycDocumentsSection';
import { REQUIRED_KYC_DOCS_BY_ROLE } from '@fyro/shared';
import Link from 'next/link';
import { XIcon, ShieldIcon, ChevronRightIcon } from '@/components/ui/icons';
import {
  LanguageSection,
  ProfileIdentitySection,
  NotificationPreferencesSection,
  PrivacySettingsSection,
  ComplaintHistorySection,
  SupportSection,
  AccountDangerZoneSection,
} from '@/components/worker/ProfileSections';

interface Hub {
  name: string;
  address: string;
  totalDockSlots: number;
  operatingHours?: string;
  gateContacts: { name: string; phone: string }[];
}

function FacilityProfileSection() {
  const t = useTranslations('facilityProfile');
  const [hub, setHub] = useState<Hub | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [operatingHours, setOperatingHours] = useState('');
  const [gateContacts, setGateContacts] = useState<{ name: string; phone: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ hub: Hub }>('/api/warehouse-hub/me')
      .then((res) => {
        setHub(res.hub);
        setName(res.hub.name);
        setAddress(res.hub.address);
        setOperatingHours(res.hub.operatingHours ?? '');
        setGateContacts(res.hub.gateContacts ?? []);
      })
      .catch(() => setHub(null));
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.patch('/api/warehouse-hub/me', { name, address, operatingHours, gateContacts });
      setHub((h) => (h ? { ...h, name, address, operatingHours, gateContacts } : h));
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorSave'));
    } finally {
      setSaving(false);
    }
  }

  if (!hub) return null;

  return (
    <div className="mb-6">
      <h2 className="font-heading text-lg font-bold mb-3">{t('title')}</h2>
      <div className="ip-card space-y-3">
        {!editing ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ip-on-surface-variant">{t('facilityName')}</span>
              <span className="font-medium">{hub.name}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ip-on-surface-variant">{t('dockSlots')}</span>
              <span className="font-medium">{hub.totalDockSlots}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ip-on-surface-variant">{t('operatingHours')}</span>
              <span className="font-medium">{hub.operatingHours || t('notSet')}</span>
            </div>
            {hub.gateContacts.length > 0 && (
              <div className="pt-2 border-t border-ip-outline/10">
                <p className="text-xs text-ip-on-surface-variant mb-1.5">{t('gateContacts')}</p>
                {hub.gateContacts.map((c, i) => (
                  <p key={i} className="text-sm">
                    {c.name} — {c.phone}
                  </p>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setEditing(true)} className="text-sm font-semibold text-ip-primary">
              {t('edit')}
            </button>
          </>
        ) : (
          <>
            <input
              placeholder={t('facilityNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[40px] px-3.5 py-2 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
            />
            <input
              placeholder={t('addressPlaceholder')}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full min-h-[40px] px-3.5 py-2 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
            />
            <input
              placeholder={t('operatingHoursPlaceholder')}
              value={operatingHours}
              onChange={(e) => setOperatingHours(e.target.value)}
              className="w-full min-h-[40px] px-3.5 py-2 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
            />
            <div className="space-y-2">
              <p className="text-xs text-ip-on-surface-variant">{t('gateContacts')}</p>
              {gateContacts.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    placeholder={t('contactNamePlaceholder')}
                    value={c.name}
                    onChange={(e) => setGateContacts((prev) => prev.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)))}
                    className="flex-1 min-h-[36px] px-3 py-1.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
                  />
                  <input
                    placeholder={t('contactPhonePlaceholder')}
                    value={c.phone}
                    onChange={(e) => setGateContacts((prev) => prev.map((x, xi) => (xi === i ? { ...x, phone: e.target.value } : x)))}
                    className="flex-1 min-h-[36px] px-3 py-1.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
                  />
                  <button type="button" onClick={() => setGateContacts((prev) => prev.filter((_, xi) => xi !== i))}>
                    <XIcon className="w-4 h-4 text-ip-on-surface-variant" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setGateContacts((prev) => [...prev, { name: '', phone: '' }])}
                className="text-xs font-semibold text-ip-primary"
              >
                {t('addContact')}
              </button>
            </div>
            {error && <p className="text-xs text-ip-error">{error}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={saving} onClick={save} className="text-sm font-semibold text-ip-primary">
                {saving ? t('saving') : t('save')}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="text-sm text-ip-on-surface-variant">
                {t('cancel')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function WarehouseHubProfilePage() {
  const t = useTranslations('profile');
  const { user, refetch } = useAuth();
  if (!user) return null;

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">{t('accountEyebrow')}</p>
      <h1 className="font-heading text-ip-display-md font-extrabold mb-6">{t('pageTitle')}</h1>

      <div className="ip-card flex items-center gap-4 mb-6 max-w-2xl">
        <AvatarUpload name={user.name} photoUrl={user.profilePhoto} accent="secondary" onUploaded={refetch} />
        <div>
          <p className="font-heading font-bold text-lg">{user.name}</p>
          <p className="text-sm text-ip-on-surface-variant">{user.phone}</p>
          <Badge tone="secondary" className="mt-1.5">
            {t(`account.statusLabels.${user.accountStatus}`)}
          </Badge>
        </div>
      </div>

      <div className="max-w-2xl">
        <LanguageSection />
        <ProfileIdentitySection />
        <FacilityProfileSection />
        <KycDocumentsSection requiredTypes={REQUIRED_KYC_DOCS_BY_ROLE.warehouse_hub} />
        <NotificationPreferencesSection />
        <PrivacySettingsSection />
        <ComplaintHistorySection />
        <Link
          href="/warehouse-hub/insurance"
          className="flex items-center justify-between p-4 rounded-ip-card bg-ip-surface-container hover:bg-ip-surface-container-high transition-colors duration-base mb-6"
        >
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-secondary/10 text-secondary-600 flex items-center justify-center">
              <ShieldIcon className="w-5 h-5" />
            </span>
            <p className="text-sm font-semibold">{t('insurance.title')}</p>
          </div>
          <ChevronRightIcon className="w-4 h-4 text-ip-on-surface-variant" />
        </Link>
        <SupportSection />
        <AccountDangerZoneSection />
      </div>
    </div>
  );
}
