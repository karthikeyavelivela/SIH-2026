'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { api, ApiClientError } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { AvatarUpload } from '@/components/ui/AvatarUpload';
import { KycDocumentsSection } from '@/components/worker/KycDocumentsSection';
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
import { AlertIcon, ShieldIcon, ChevronRightIcon } from '@/components/ui/icons';

interface MyGroup {
  mutha: { _id: string; name: string; ratingAvg: number; ratingCount: number };
  leader: { name: string; phone: string };
}

// Group info, leader contact, self-service leave, and the earnings-
// discrepancy flag (worker-protection requirement — reaches admin
// directly, bypasses the leader entirely, see mutha.controller.ts's
// flagEarningsDiscrepancy doc comment).
function MuthaGroupSection() {
  const t = useTranslations('muthaGroup');
  const [group, setGroup] = useState<MyGroup | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const [flagOpen, setFlagOpen] = useState(false);
  const [bookingId, setBookingId] = useState('');
  const [description, setDescription] = useState('');
  const [flagError, setFlagError] = useState<string | null>(null);
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [flagSubmitted, setFlagSubmitted] = useState(false);

  useEffect(() => {
    api.get<MyGroup>('/api/mutha/my-group').then(setGroup).catch(() => setGroup(null));
  }, []);

  async function leave() {
    setLeaving(true);
    setLeaveError(null);
    try {
      await api.post('/api/mutha/leave');
      window.location.reload();
    } catch (err) {
      setLeaveError(err instanceof ApiClientError ? err.message : t('errorLeave'));
      setLeaving(false);
    }
  }

  async function submitFlag() {
    setFlagSubmitting(true);
    setFlagError(null);
    try {
      await api.post('/api/mutha/earnings-discrepancy', { bookingId, description });
      setFlagSubmitted(true);
    } catch (err) {
      setFlagError(err instanceof ApiClientError ? err.message : t('errorFlag'));
    } finally {
      setFlagSubmitting(false);
    }
  }

  if (!group) return null;

  return (
    <div className="mb-6">
      <h2 className="font-heading text-lg font-bold mb-3">{t('title')}</h2>
      <div className="fy-surface-card space-y-3">
        <div>
          <p className="font-semibold">{group.mutha.name}</p>
          <p className="text-xs text-fy-ink-soft">
            {group.mutha.ratingCount > 0 ? `${group.mutha.ratingAvg.toFixed(1)}★ (${group.mutha.ratingCount})` : t('newGroup')}
          </p>
        </div>
        <div className="pt-3 border-t border-fy-muted/10 text-sm">
          <p className="text-xs text-fy-ink-soft">{t('leader')}</p>
          <p className="font-medium">{group.leader.name}</p>
          <p className="text-fy-ink-soft">{group.leader.phone}</p>
        </div>
        <Link href="/mutha-member/governance" className="block pt-3 border-t border-fy-muted/10 text-sm font-semibold text-fy-green">
          {t('viewGovernance')}
        </Link>
        <div className="flex gap-3 pt-3 border-t border-fy-muted/10">
          <button type="button" onClick={() => setFlagOpen(true)} className="flex items-center gap-1 text-sm font-semibold text-fy-error">
            <AlertIcon className="w-3.5 h-3.5" /> {t('flagIssue')}
          </button>
          <button type="button" onClick={() => setLeaveOpen(true)} className="text-sm font-semibold text-fy-ink-soft">
            {t('leaveGroup')}
          </button>
        </div>
      </div>

      <Modal open={leaveOpen} onClose={() => setLeaveOpen(false)} title={t('leaveModalTitle')}>
        <div className="space-y-3">
          <p className="text-sm text-fy-ink-soft">{t('leaveModalBody')}</p>
          {leaveError && <p className="text-xs text-fy-error">{leaveError}</p>}
          <Button variant="danger" className="w-full" disabled={leaving} onClick={leave}>
            {leaving ? t('leaving') : t('leaveGroup')}
          </Button>
        </div>
      </Modal>

      <Modal open={flagOpen} onClose={() => setFlagOpen(false)} title={t('flagModalTitle')}>
        {flagSubmitted ? (
          <p className="text-sm">{t('flagSentNotice')}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-fy-ink-soft">{t('flagHint')}</p>
            <label className="block">
              <span className="text-xs text-fy-ink-soft">{t('bookingIdLabel')}</span>
              <input
                value={bookingId}
                onChange={(e) => setBookingId(e.target.value)}
                className="mt-1 w-full min-h-[44px] px-3.5 py-2 rounded-control border border-fy-muted/20 bg-fy-bone text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-fy-ink-soft">{t('whatHappenedLabel')}</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="mt-1 w-full px-3.5 py-2 rounded-control border border-fy-muted/20 bg-fy-bone text-sm"
              />
            </label>
            {flagError && <p className="text-xs text-fy-error">{flagError}</p>}
            <Button
              variant="danger"
              className="w-full"
              disabled={flagSubmitting || !bookingId || !description}
              onClick={submitFlag}
            >
              {flagSubmitting ? t('sending') : t('sendToSupport')}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function MuthaMemberProfilePage() {
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
          <p className="text-sm text-fy-muted">{user.phone}</p>
          <Badge tone="secondary" className="mt-1.5">
            {t(`account.statusLabels.${user.accountStatus}`)}
          </Badge>
        </div>
      </Card>

      <LanguageSection />
      <ProfileIdentitySection />
      <RoleSwitcherSection />
      <MuthaGroupSection />
      <HamaliSkillsSection />

      <KycDocumentsSection requiredTypes={REQUIRED_KYC_DOCS_BY_ROLE.mutha_member} />

      <NotificationPreferencesSection />
      <PrivacySettingsSection />
      <PayoutDetailsSection />
      <RatingsReceivedSection />
      <ComplaintHistorySection />
      <ReferralSection />
      {/* A worker should find their cover without being told it exists.
          Same visual weight as the sections around it. */}
      <Link
        href="/mutha-member/insurance"
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
  );
}
