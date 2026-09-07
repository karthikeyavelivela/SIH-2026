'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { useAuth } from '@/lib/auth-context';
import { REQUIRED_KYC_DOCS_BY_ROLE } from '@fyro/shared';
import { AvatarUpload } from '@/components/ui/AvatarUpload';
import { Icon } from '@/components/ui/Icon';
import { DocumentExpiryCard } from '@/components/worker/DocumentExpiryCard';
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
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill, VerifiedBadge } from '@/components/fy/Status';
import { MetricBlock } from '@/components/fy/Data';
import { Button, Field } from '@/components/fy/Controls';
import { TopBar, TabRow } from '@/components/fy/Navigation';

/* Built against client/public/design/worker_profile.html.

   Section order there, top to bottom: 64px brand bar with the MEMBER pill
   -> a member-id credential card with the portrait, name, society line and
   an ACTIVE pill -> a five-tab row (Vehicle / Documents / Reputation /
   Payouts / Settings) -> the selected tab's records -> 5-tab bar.

   Largest element: the member's name, then the payload figure on the
   vehicle tab. Dark surfaces: none.

   Every section the page carried before is still here, grouped under the
   tab its subject belongs to rather than stacked in one column.

   Not invented: the design prints a "Transit health 98.4% · OBD-II Clear"
   gauge, a telemetry node id, a "verified 2 mins ago" heartbeat and a
   "Consensus Standing: Exemplary Peer Record" line. There is no telemetry
   integration, no OBD feed and no peer-standing metric — a vehicle stores
   a type, capacity, registration, verification flag and compliance status,
   and those are what the vehicle tab shows. */

const TABS = ['vehicle', 'documents', 'reputation', 'payouts', 'settings'] as const;
type Tab = (typeof TABS)[number];

const TAB_GLYPH: Record<Tab, string> = {
  vehicle: 'local_shipping',
  documents: 'description',
  reputation: 'stars',
  payouts: 'account_balance',
  settings: 'tune',
};

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
  const tw = useTranslations('workerProfile');
  const { user, refetch } = useAuth();
  const [tab, setTab] = useState<Tab>('vehicle');

  const { data, state, reload } = usePolling(
    () =>
      api.get<{ vehicle: Vehicle }>('/api/vehicles/me').catch((err) => {
        if (err instanceof ApiClientError && err.status === 404) return { vehicle: null as unknown as Vehicle };
        throw err;
      }),
    60000
  );
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

  const vehicle = data?.vehicle;

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar
        eyebrow="FYRO Cooperative"
        title={tw('pageTitle')}
        actions={user.accountStatus === 'active' ? <StatusPill tone="lime">{tw('memberPill')}</StatusPill> : undefined}
      />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <Panel className="p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <EyebrowLabel tone="brown">{tw('memberId', { id: user._id.slice(-6).toUpperCase() })}</EyebrowLabel>
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
              <Body size="label" className="truncate">
                {user.region ? `${user.region} · ` : ''}
                {user.ratingCount ? tw('ratingLine', { rating: (user.ratingAvg ?? 0).toFixed(2), count: user.ratingCount }) : tw('noRatings')}
              </Body>
            </div>
          </div>
        </Panel>

        <TabRow
          variant="inset"
          active={tab}
          onChange={(k) => setTab(k as Tab)}
          tabs={TABS.map((k) => ({ key: k, label: tw(`tabs.${k}`), glyph: TAB_GLYPH[k] }))}
          className="overflow-x-auto"
        />

        {tab === 'vehicle' && (
          <Section
            title={<SectionHeading>{t('vehicle.sectionTitle')}</SectionHeading>}
            aside={
              vehicle ? (
                <StatusPill tone={vehicle.verified ? 'lime' : 'outline'}>
                  {vehicle.verified ? t('vehicle.verified') : t('vehicle.verificationPending')}
                </StatusPill>
              ) : undefined
            }
          >
            {state === 'loading' && <div className="h-24 rounded-card bg-fy-field animate-pulse" />}

            {state !== 'loading' && !vehicle && (
              <LightCard className="flex items-center gap-3">
                <IconTile tone="peach" size="md">
                  <Icon name="local_shipping" size={20} />
                </IconTile>
                <Body size="label">{t('vehicle.noneYet')}</Body>
              </LightCard>
            )}

            {vehicle && (
              <Panel className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <EyebrowLabel>{tw('registeredAsset')}</EyebrowLabel>
                    <SectionHeading as="h3" className="capitalize">
                      {vehicle.type.replace('_', ' ')}
                    </SectionHeading>
                    <Body size="label">{vehicle.registrationNumber}</Body>
                  </div>
                  {vehicle.complianceStatus === 'non_compliant' && (
                    <StatusPill tone="critical" className="shrink-0">
                      {t('vehicle.complianceFailed')}
                    </StatusPill>
                  )}
                </div>

                <Divider />

                {!editingVehicle ? (
                  <div className="flex items-end justify-between gap-3">
                    <MetricBlock
                      label={tw('maxPayload')}
                      value={vehicle.capacityKg.toLocaleString('en-IN')}
                      unit="kg"
                      tone="brown"
                    />
                    <Button variant="light" size="md" glyph="edit" onClick={() => setEditingVehicle(true)}>
                      {t('vehicle.editCapacity')}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <EyebrowLabel>{tw('maxPayload')}</EyebrowLabel>
                    <div className="flex items-center gap-2">
                      <Field
                        type="number"
                        inputMode="numeric"
                        value={capacityKg}
                        onChange={(e) => setCapacityKg(e.target.value)}
                        className="flex-1"
                      />
                      <Button size="md" disabled={vehicleSaving} onClick={saveVehicle} className="shrink-0">
                        {vehicleSaving ? t('vehicle.saving') : t('vehicle.save')}
                      </Button>
                      <Button variant="ghost" size="md" onClick={() => setEditingVehicle(false)} className="shrink-0">
                        {t('vehicle.cancel')}
                      </Button>
                    </div>
                  </div>
                )}
              </Panel>
            )}
          </Section>
        )}

        {tab === 'documents' && (
          <>
            <KycDocumentsSection requiredTypes={REQUIRED_KYC_DOCS_BY_ROLE.driver} />
            <DocumentExpiryCard
              license={licenseExpiryAt}
              insurance={insuranceExpiryAt}
              onSaved={(updated) => {
                if (updated.licenseExpiryAt !== undefined) setLicenseExpiryAt(updated.licenseExpiryAt ?? null);
                if (updated.insuranceExpiryAt !== undefined) setInsuranceExpiryAt(updated.insuranceExpiryAt ?? null);
              }}
            />
          </>
        )}

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
