'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { useAuth, AuthUser } from '@/lib/auth-context';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { StarIcon, LockIcon, EyeIcon, TrashIcon, BankIcon, SwitchIcon, ChevronRightIcon } from '@/components/ui/icons';

// ═══════════════════════════════════════════════════════════════════
// Phase 2 profile remediation (AUDIT_REPORT.md Section 3). Shared across
// every role's profile page — "a profile page of read-only text is the
// failure mode we are fixing." Every field below actually persists to the
// backend endpoints added alongside this file (auth.controller.ts).
// Uses the `ip-*` design tokens (the current design system — see
// DocumentUploadCard.tsx/KycDocumentsSection.tsx, the last things wired
// into these same profile pages).
// Phase 5 — every string below reads from the `profile` i18n namespace
// (client/src/i18n/messages/{en,hi,te}.json) rather than a literal, since
// this file is shared across 8 of 9 roles and was the single highest-
// leverage untranslated surface in the app.
// ═══════════════════════════════════════════════════════════════════

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="font-heading text-lg font-bold mb-3">{title}</h2>
      <div className="ip-card space-y-4">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-7 rounded-full transition-colors duration-base flex-shrink-0 disabled:opacity-50 ${
        checked ? 'bg-ip-primary' : 'bg-ip-outline/30'
      }`}
    >
      <span
        className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-base ease-out-expo ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// ---- Identity: name/email edit, phone change (OTP), password change ----

export function ProfileIdentitySection() {
  const t = useTranslations('profile.identity');
  const { user, refetch } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  if (!user) return null;

  async function saveProfile() {
    setSaving(true);
    setError(null);
    try {
      await api.patch('/api/auth/me/profile', { name, email });
      await refetch();
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorSave'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title={t('title')}>
      {!editing ? (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ip-on-surface-variant">{t('name')}</span>
            <span className="font-medium">{user.name}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ip-on-surface-variant">{t('email')}</span>
            <span className="font-medium">{user.email || t('notSet')}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ip-on-surface-variant">{t('phone')}</span>
            <div className="flex items-center gap-2">
              <span className="font-medium">{user.phone}</span>
              <button type="button" onClick={() => setPhoneModalOpen(true)} className="text-xs font-semibold text-ip-primary">
                {t('change')}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ip-on-surface-variant">{t('accountCreated')}</span>
            <span className="font-medium">{user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN') : '—'}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ip-on-surface-variant">{t('userId')}</span>
            <span className="font-mono text-xs text-ip-on-surface-variant">{user._id.slice(-10)}</span>
          </div>
          <div className="flex gap-3 pt-2 border-t border-ip-outline/10">
            <button type="button" onClick={() => setEditing(true)} className="text-sm font-semibold text-ip-primary">
              {t('editNameEmail')}
            </button>
            <button
              type="button"
              onClick={() => setPasswordModalOpen(true)}
              className="flex items-center gap-1 text-sm font-semibold text-ip-primary"
            >
              <LockIcon className="w-3.5 h-3.5" /> {t('changePassword')}
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="block">
            <span className="text-xs text-ip-on-surface-variant">{t('name')}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full min-h-[44px] px-3.5 py-2 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-ip-on-surface-variant">{t('email')}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full min-h-[44px] px-3.5 py-2 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
            />
          </label>
          {error && <p className="text-xs text-ip-error">{error}</p>}
          <div className="flex gap-2">
            <Button size="md" disabled={saving} onClick={saveProfile} className="flex-1">
              {saving ? t('saving') : t('save')}
            </Button>
            <Button size="md" variant="ghost" onClick={() => setEditing(false)}>
              {t('cancel')}
            </Button>
          </div>
        </>
      )}

      <PhoneChangeModal open={phoneModalOpen} onClose={() => setPhoneModalOpen(false)} />
      <PasswordChangeModal open={passwordModalOpen} onClose={() => setPasswordModalOpen(false)} />
    </SectionCard>
  );
}

function PhoneChangeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('profile.phoneModal');
  const { refetch } = useAuth();
  const [step, setStep] = useState<'enter' | 'verify'>('enter');
  const [newPhone, setNewPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setStep('enter');
    setNewPhone('');
    setOtp('');
    setDevOtp(null);
    setError(null);
  }

  async function requestOtp() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ devOtp?: string }>('/api/auth/me/phone/request-otp', { newPhone });
      setDevOtp(res.devOtp ?? null);
      setStep('verify');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorSend'));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/me/phone/confirm', { otp });
      await refetch();
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorConfirm'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={t('title')}
    >
      {step === 'enter' ? (
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-ip-on-surface-variant">{t('newPhoneLabel')}</span>
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              inputMode="tel"
              className="mt-1 w-full min-h-[44px] px-3.5 py-2 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
            />
          </label>
          {error && <p className="text-xs text-ip-error">{error}</p>}
          <Button className="w-full" disabled={busy || newPhone.length < 10} onClick={requestOtp}>
            {busy ? t('sending') : t('sendCode')}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ip-on-surface-variant">{t('enterCode', { phone: newPhone })}</p>
          {devOtp && (
            <p className="text-xs rounded-ip-input bg-ip-primary/10 text-ip-primary px-3 py-2">
              {t('devModeNotice', { otp: devOtp })}
            </p>
          )}
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            className="w-full min-h-[44px] px-3.5 py-2 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-center text-lg tracking-[0.4em]"
            placeholder="000000"
          />
          {error && <p className="text-xs text-ip-error">{error}</p>}
          <Button className="w-full" disabled={busy || otp.length !== 6} onClick={confirm}>
            {busy ? t('verifying') : t('confirm')}
          </Button>
        </div>
      )}
    </Modal>
  );
}

function PasswordChangeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('profile.passwordModal');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.patch('/api/auth/me/password', { currentPassword, newPassword });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorSave'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setCurrentPassword('');
        setNewPassword('');
        setError(null);
        setDone(false);
        onClose();
      }}
      title={t('title')}
    >
      {done ? (
        <p className="text-sm">{t('done')}</p>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-ip-on-surface-variant">{t('currentPassword')}</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 w-full min-h-[44px] px-3.5 py-2 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-ip-on-surface-variant">{t('newPassword')}</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full min-h-[44px] px-3.5 py-2 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
            />
          </label>
          {error && <p className="text-xs text-ip-error">{error}</p>}
          <Button className="w-full" disabled={busy || newPassword.length < 8 || !currentPassword} onClick={save}>
            {busy ? t('saving') : t('changePassword')}
          </Button>
        </div>
      )}
    </Modal>
  );
}

// ---- Hamali skills + physical capacity (hamali_solo / mutha_member) ----

const ALL_SKILLS = ['cement', 'steel', 'fragile', 'furniture', 'appliances', 'agricultural', 'construction_material'];
const SKILL_KEY: Record<string, string> = { construction_material: 'constructionMaterial' };

export function HamaliSkillsSection() {
  const t = useTranslations('profile.hamaliSkills');
  const [skills, setSkills] = useState<string[] | null>(null);
  const [capacity, setCapacity] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<{ skills: string[]; physicalCapacityKg: number | null }>('/api/hamali-profile/me')
      .then((res) => {
        setSkills(res.skills);
        setCapacity(res.physicalCapacityKg ? String(res.physicalCapacityKg) : '');
      })
      .catch(() => setSkills([]));
  }, []);

  async function toggleSkill(skill: string) {
    if (!skills) return;
    const next = skills.includes(skill) ? skills.filter((s) => s !== skill) : [...skills, skill];
    setSkills(next);
    await api.patch('/api/hamali-profile/me', { skills: next });
  }

  async function saveCapacity() {
    setSaving(true);
    try {
      await api.patch('/api/hamali-profile/me', { physicalCapacityKg: capacity ? Number(capacity) : null });
    } finally {
      setSaving(false);
    }
  }

  if (skills === null) return null;

  return (
    <SectionCard title={t('title')}>
      <div className="flex flex-wrap gap-2">
        {ALL_SKILLS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggleSkill(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors duration-fast ${
              skills.includes(s) ? 'border-ip-secondary bg-ip-secondary/10 text-ip-secondary' : 'border-ip-outline/20 text-ip-on-surface-variant'
            }`}
          >
            {t(`skills.${SKILL_KEY[s] ?? s}`)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-3 border-t border-ip-outline/10">
        <label className="flex-1">
          <span className="text-xs text-ip-on-surface-variant">{t('capacityLabel')}</span>
          <input
            type="number"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className="mt-1 w-full min-h-[40px] px-3 py-1.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
          />
        </label>
        <button type="button" disabled={saving} onClick={saveCapacity} className="text-xs font-semibold text-ip-secondary mt-4">
          {saving ? t('saving') : t('save')}
        </button>
      </div>
    </SectionCard>
  );
}

// ---- Preferences: notifications + privacy ----

const NOTIF_CATEGORY_KEYS = ['jobUpdates', 'payments', 'promotions'] as const;

export function NotificationPreferencesSection() {
  const t = useTranslations('profile.notifications');
  const { user, refetch } = useAuth();
  const prefs = user?.notificationPreferences;
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function toggle(channel: 'push' | 'sms', category: string, enabled: boolean) {
    setBusyKey(`${channel}.${category}`);
    try {
      await api.patch('/api/auth/me/notification-preferences', { channel, category, enabled });
      await refetch();
    } finally {
      setBusyKey(null);
    }
  }

  if (!prefs) return null;

  return (
    <SectionCard title={t('title')}>
      {(['push', 'sms'] as const).map((channel) => (
        <div key={channel}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-2">{t(channel)}</p>
          <div className="space-y-2.5">
            {NOTIF_CATEGORY_KEYS.map((cat) => (
              <div key={cat} className="flex items-center justify-between">
                <span className="text-sm">{t(`categories.${cat}`)}</span>
                <Toggle
                  checked={prefs[channel][cat]}
                  disabled={busyKey === `${channel}.${cat}`}
                  onChange={(v) => toggle(channel, cat, v)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </SectionCard>
  );
}

export function PrivacySettingsSection() {
  const t = useTranslations('profile.privacy');
  const { user, refetch } = useAuth();
  const privacy = user?.privacySettings;
  const [busy, setBusy] = useState(false);

  async function update(patch: { shareLocationWhileOffline?: boolean; profileVisibility?: 'public' | 'private' }) {
    setBusy(true);
    try {
      await api.patch('/api/auth/me/privacy', patch);
      await refetch();
    } finally {
      setBusy(false);
    }
  }

  if (!privacy) return null;

  return (
    <SectionCard title={t('title')}>
      <div className="flex items-center justify-between">
        <div className="pr-4">
          <p className="text-sm font-medium">{t('shareLocation')}</p>
          <p className="text-xs text-ip-on-surface-variant">{t('shareLocationHint')}</p>
        </div>
        <Toggle
          checked={privacy.shareLocationWhileOffline}
          disabled={busy}
          onChange={(v) => update({ shareLocationWhileOffline: v })}
        />
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-ip-outline/10">
        <div className="flex items-center gap-2">
          <EyeIcon className="w-4 h-4 text-ip-on-surface-variant" />
          <span className="text-sm">{t('profileVisibility')}</span>
        </div>
        <select
          value={privacy.profileVisibility}
          disabled={busy}
          onChange={(e) => update({ profileVisibility: e.target.value as 'public' | 'private' })}
          className="text-sm rounded-ip-input border border-ip-outline/20 bg-ip-surface px-3 py-1.5"
        >
          <option value="public">{t('public')}</option>
          <option value="private">{t('private')}</option>
        </select>
      </div>
    </SectionCard>
  );
}

// ---- Trust: ratings received + complaint history ----

interface RatingsResponse {
  distribution: Record<number, number>;
  recentComments: { _id: string; score: number; comment: string; createdAt: string }[];
}

export function RatingsReceivedSection() {
  const t = useTranslations('profile.ratings');
  const [data, setData] = useState<RatingsResponse | null>(null);

  useEffect(() => {
    api.get<RatingsResponse>('/api/ratings/mine').then(setData).catch(() => setData(null));
  }, []);

  if (!data) return null;
  const total = Object.values(data.distribution).reduce((a, b) => a + b, 0);

  return (
    <SectionCard title={t('title')}>
      {total === 0 ? (
        <p className="text-sm text-ip-on-surface-variant">{t('none')}</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((score) => {
              const count = data.distribution[score] ?? 0;
              const pct = total > 0 ? (count / total) * 100 : 0;
              return (
                <div key={score} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-ip-on-surface-variant">{score}</span>
                  <StarIcon className="w-3 h-3 text-ip-primary" fill="currentColor" />
                  <div className="flex-1 h-1.5 rounded-full bg-ip-outline/15 overflow-hidden">
                    <div className="h-full bg-ip-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-6 text-right text-ip-on-surface-variant">{count}</span>
                </div>
              );
            })}
          </div>
          {data.recentComments.length > 0 && (
            <div className="pt-3 border-t border-ip-outline/10 space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant">{t('recentComments')}</p>
              {data.recentComments.slice(0, 5).map((c) => (
                <div key={c._id} className="text-sm">
                  <span className="inline-flex items-center gap-0.5 mr-1.5 text-ip-primary">
                    {c.score}
                    <StarIcon className="w-3 h-3" fill="currentColor" />
                  </span>
                  <span className="text-ip-on-surface-variant">{c.comment}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

interface ComplaintRow {
  _id: string;
  category: string;
  description: string;
  status: 'open' | 'in_review' | 'resolved';
  createdAt: string;
}

export function ComplaintHistorySection() {
  const t = useTranslations('profile.complaints');
  const [complaints, setComplaints] = useState<ComplaintRow[] | null>(null);

  useEffect(() => {
    api
      .get<{ complaints: ComplaintRow[] }>('/api/complaints/mine')
      .then((res) => setComplaints(res.complaints))
      .catch(() => setComplaints([]));
  }, []);

  if (complaints === null) return null;

  return (
    <SectionCard title={t('title')}>
      {complaints.length === 0 ? (
        <p className="text-sm text-ip-on-surface-variant">{t('none')}</p>
      ) : (
        <div className="space-y-2.5">
          {complaints.slice(0, 10).map((c) => (
            <div key={c._id} className="flex items-center justify-between text-sm">
              <div className="min-w-0 flex-1 pr-3">
                <p className="capitalize font-medium truncate">{c.category.replace('_', ' ')}</p>
                <p className="text-xs text-ip-on-surface-variant truncate">{c.description}</p>
              </div>
              <span className="text-xs capitalize text-ip-on-surface-variant flex-shrink-0">{c.status.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ---- Money: payout details ----

export function PayoutDetailsSection() {
  const t = useTranslations('profile.payout');
  const { user, refetch } = useAuth();
  const [editing, setEditing] = useState(false);
  const [method, setMethod] = useState<'bank' | 'upi'>(user?.payoutDetails?.method ?? 'upi');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [upiId, setUpiId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.patch(
        '/api/auth/me/payout-details',
        method === 'bank' ? { method, accountHolderName, bankAccountNumber, ifsc } : { method, upiId }
      );
      await refetch();
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorSave'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title={t('title')}>
      {!editing ? (
        <>
          {user?.payoutDetails ? (
            <div className="flex items-center gap-3">
              <BankIcon className="w-5 h-5 text-ip-on-surface-variant flex-shrink-0" />
              <div>
                <p className="text-sm font-medium uppercase">{user.payoutDetails.method}</p>
                <p className="text-xs text-ip-on-surface-variant font-mono">
                  {user.payoutDetails.method === 'bank' ? user.payoutDetails.bankAccountNumber : user.payoutDetails.upiId}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ip-on-surface-variant">{t('none')}</p>
          )}
          <button type="button" onClick={() => setEditing(true)} className="text-sm font-semibold text-ip-primary">
            {user?.payoutDetails ? t('update') : t('add')}
          </button>
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMethod('upi')}
              className={`flex-1 py-2 rounded-ip-input border text-sm font-semibold ${method === 'upi' ? 'border-ip-primary text-ip-primary bg-ip-primary/10' : 'border-ip-outline/20'}`}
            >
              {t('upi')}
            </button>
            <button
              type="button"
              onClick={() => setMethod('bank')}
              className={`flex-1 py-2 rounded-ip-input border text-sm font-semibold ${method === 'bank' ? 'border-ip-primary text-ip-primary bg-ip-primary/10' : 'border-ip-outline/20'}`}
            >
              {t('bank')}
            </button>
          </div>
          {method === 'upi' ? (
            <input
              placeholder={t('upiPlaceholder')}
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
            />
          ) : (
            <>
              <input
                placeholder={t('accountHolderPlaceholder')}
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
              />
              <input
                placeholder={t('accountNumberPlaceholder')}
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
              />
              <input
                placeholder={t('ifscPlaceholder')}
                value={ifsc}
                onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
              />
            </>
          )}
          {error && <p className="text-xs text-ip-error">{error}</p>}
          <div className="flex gap-2">
            <Button size="md" disabled={saving} onClick={save} className="flex-1">
              {saving ? t('saving') : t('save')}
            </Button>
            <Button size="md" variant="ghost" onClick={() => setEditing(false)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ---- Customer-only: business/GST profile + frequent routes ----

export function BusinessProfileSection() {
  const t = useTranslations('profile.business');
  const { user, refetch } = useAuth();
  const biz = user?.businessProfile;
  const [editing, setEditing] = useState(false);
  const [gstin, setGstin] = useState(biz?.gstin ?? '');
  const [companyName, setCompanyName] = useState(biz?.companyName ?? '');
  const [saving, setSaving] = useState(false);

  async function toggleBusiness(isBusiness: boolean) {
    setEditing(isBusiness);
    if (!isBusiness) {
      await saveBusiness(false);
    }
  }

  async function saveBusiness(isBusiness: boolean) {
    setSaving(true);
    try {
      await api.patch('/api/auth/me/business-profile', { isBusiness, gstin, companyName });
      await refetch();
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <SectionCard title={t('title')}>
      <div className="flex items-center justify-between">
        <span className="text-sm">{t('toggleLabel')}</span>
        <Toggle checked={!!biz?.isBusiness} onChange={toggleBusiness} disabled={saving} />
      </div>
      {(editing || biz?.isBusiness) && (
        <div className="space-y-3 pt-3 border-t border-ip-outline/10">
          <input
            placeholder={t('companyNamePlaceholder')}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full min-h-[40px] px-3.5 py-2 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
          />
          <input
            placeholder={t('gstinPlaceholder')}
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
            className="w-full min-h-[40px] px-3.5 py-2 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => saveBusiness(true)}
            className="text-xs font-semibold text-ip-primary"
          >
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      )}
    </SectionCard>
  );
}

interface FrequentRoute {
  pickup: string;
  drop: string;
  count: number;
}

export function FrequentRoutesSection() {
  const t = useTranslations('profile.frequentRoutes');
  const [routes, setRoutes] = useState<FrequentRoute[] | null>(null);

  useEffect(() => {
    api
      .get<{ routes: FrequentRoute[] }>('/api/bookings/frequent-routes')
      .then((res) => setRoutes(res.routes))
      .catch(() => setRoutes([]));
  }, []);

  if (!routes || routes.length === 0) return null;

  return (
    <SectionCard title={t('title')}>
      {routes.map((r, i) => (
        <div key={i} className="flex items-center justify-between text-sm">
          <span className="truncate pr-3">
            {r.pickup} → {r.drop}
          </span>
          <span className="text-xs text-ip-on-surface-variant flex-shrink-0">{r.count}×</span>
        </div>
      ))}
    </SectionCard>
  );
}

// ---- Support: help + referrals ----

interface ReferralResponse {
  code: string;
  link: string;
  stats: { totalEarned: number; pending: number; referrals: { name: string; status: string }[] };
}

export function ReferralSection() {
  const t = useTranslations('profile.referral');
  const [data, setData] = useState<ReferralResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get<ReferralResponse>('/api/referrals/me').then(setData).catch(() => setData(null));
  }, []);

  if (!data) return null;

  return (
    <SectionCard title={t('title')}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-ip-on-surface-variant">{t('yourCode')}</p>
          <p className="font-mono font-bold">{data.code}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(data.link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="text-sm font-semibold text-ip-primary"
        >
          {copied ? t('copied') : t('copyLink')}
        </button>
      </div>
      <div className="flex items-center justify-between text-sm pt-3 border-t border-ip-outline/10">
        <span className="text-ip-on-surface-variant">{t('earnedSoFar')}</span>
        <span className="font-semibold">₹{data.stats.totalEarned}</span>
      </div>
    </SectionCard>
  );
}

export function SupportSection() {
  const t = useTranslations('profile.support');
  return (
    <SectionCard title={t('title')}>
      <Link href="/customer/support" className="flex items-center justify-between text-sm py-1">
        <span>{t('helpCentre')}</span>
        <ChevronRightIcon className="w-4 h-4 text-ip-on-surface-variant" />
      </Link>
    </SectionCard>
  );
}

// ---- Role switcher (Phase 6.1 — backend already existed via /api/auth/switch-role) ----

const ROLE_HOME: Record<string, string> = {
  customer: '/customer/dashboard',
  driver: '/driver/dashboard',
  hamali_solo: '/hamali/dashboard',
  mutha_leader: '/mutha/dashboard',
  mutha_member: '/mutha-member/job',
  fleet_owner: '/fleet-owner/dashboard',
  warehouse_hub: '/warehouse-hub/dashboard',
  manager: '/admin/dashboard',
  admin: '/admin/dashboard',
};

export function RoleSwitcherSection() {
  const t = useTranslations('profile.roleSwitcher');
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || user.roles.length <= 1) return null;

  async function switchTo(role: string) {
    setBusy(true);
    setError(null);
    try {
      await api.patch('/api/auth/switch-role', { role });
      window.location.href = ROLE_HOME[role] ?? '/';
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorSwitch'));
      setBusy(false);
    }
  }

  return (
    <SectionCard title={t('title')}>
      <p className="text-xs text-ip-on-surface-variant -mt-1">{t('subtitle')}</p>
      <div className="space-y-2">
        {user.roles
          .filter((r) => r !== user.role)
          .map((r) => (
            <button
              key={r}
              type="button"
              disabled={busy}
              onClick={() => switchTo(r)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-ip-input border border-ip-outline/20 text-sm font-medium hover:bg-ip-surface-container disabled:opacity-50"
            >
              <span className="flex items-center gap-2">
                <SwitchIcon className="w-4 h-4 text-ip-on-surface-variant" />
                {t(`roles.${r}` as never)}
              </span>
              <ChevronRightIcon className="w-4 h-4 text-ip-on-surface-variant" />
            </button>
          ))}
      </div>
      {error && <p className="text-xs text-ip-error">{error}</p>}
    </SectionCard>
  );
}

// ---- Account: logout + delete ----

export function AccountDangerZoneSection() {
  const t = useTranslations('profile.account');
  const { logout } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function deleteAccount() {
    setDeleting(true);
    setError(null);
    try {
      await api.delete('/api/auth/me');
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorDelete'));
      setDeleting(false);
    }
  }

  return (
    <SectionCard title={t('title')}>
      <Button variant="ghost" className="w-full" onClick={() => logout()}>
        {t('logout')}
      </Button>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-ip-error py-2"
      >
        <TrashIcon className="w-4 h-4" /> {t('deleteAccount')}
      </button>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title={t('deleteModalTitle')}>
        <div className="space-y-3">
          <p className="text-sm text-ip-on-surface-variant">{t('deleteModalBody')}</p>
          <label className="block">
            <span className="text-xs text-ip-on-surface-variant">{t('confirmLabel')}</span>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="mt-1 w-full min-h-[44px] px-3.5 py-2 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
            />
          </label>
          {error && <p className="text-xs text-ip-error">{error}</p>}
          <Button
            variant="danger"
            className="w-full"
            disabled={confirmText !== 'DELETE' || deleting}
            onClick={deleteAccount}
          >
            {deleting ? t('deleting') : t('confirmDelete')}
          </Button>
        </div>
      </Modal>
    </SectionCard>
  );
}

export type { AuthUser };
