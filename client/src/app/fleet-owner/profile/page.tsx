'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api, ApiClientError } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { AvatarUpload } from '@/components/ui/AvatarUpload';
import { KycDocumentsSection } from '@/components/worker/KycDocumentsSection';
import { REQUIRED_KYC_DOCS_BY_ROLE } from '@fyro/shared';
import {
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
      setError(err instanceof ApiClientError ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  if (!fleet) return null;

  return (
    <div className="mb-6">
      <h2 className="font-heading text-lg font-bold mb-3">Company profile</h2>
      <div className="ip-card space-y-3">
        {!editing ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ip-on-surface-variant">Company name</span>
              <span className="font-medium">{fleet.name}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ip-on-surface-variant">Fleet size</span>
              <span className="font-medium">{fleet.vehicleIds.length} vehicles, {fleet.driverIds.length} drivers</span>
            </div>
            <p className="text-xs text-ip-on-surface-variant pt-2 border-t border-ip-outline/10">
              GSTIN is verified as a KYC document below, not free text here. Billing isn&apos;t built — there&apos;s no
              platform-charges-fleet-owner model in this product yet.
            </p>
            <button type="button" onClick={() => setEditing(true)} className="text-sm font-semibold text-ip-primary">
              Edit name
            </button>
          </>
        ) : (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
            />
            {error && <p className="text-xs text-ip-error">{error}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={saving} onClick={save} className="text-sm font-semibold text-ip-primary">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="text-sm text-ip-on-surface-variant">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function FleetOwnerProfilePage() {
  const { user, refetch } = useAuth();
  if (!user) return null;

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">Account</p>
      <h1 className="font-heading text-ip-display-md font-extrabold mb-6">Profile</h1>

      <div className="ip-card flex items-center gap-4 mb-6 max-w-2xl">
        <AvatarUpload name={user.name} photoUrl={user.profilePhoto} accent="primary" onUploaded={refetch} />
        <div>
          <p className="font-heading font-bold text-lg">{user.name}</p>
          <p className="text-sm text-ip-on-surface-variant">{user.phone}</p>
          <Badge tone="secondary" className="mt-1.5">
            {user.accountStatus}
          </Badge>
        </div>
      </div>

      <div className="max-w-2xl">
        <ProfileIdentitySection />
        <CompanyProfileSection />
        <KycDocumentsSection requiredTypes={REQUIRED_KYC_DOCS_BY_ROLE.fleet_owner} />
        <NotificationPreferencesSection />
        <PrivacySettingsSection />
        <ComplaintHistorySection />
        <SupportSection />
        <AccountDangerZoneSection />
      </div>
    </div>
  );
}
