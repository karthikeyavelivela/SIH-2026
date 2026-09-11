'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body, MutedText } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { MetricBlock } from '@/components/fy/Data';
import { Button, Field } from '@/components/fy/Controls';

/* Built against the worker referral dashboard screen: the code plate, the
   share row, the invite form and the tracked list.

   Deviation: the design prints a QR code beside the share link. Nothing
   generates one — there is no QR endpoint and no encoder bundled — so the
   link itself is shown large and copyable instead of a decorative square
   that would scan to nothing.

   Every figure comes from GET /api/referrals/me: the code, the link, what
   has actually been paid, what is still pending, and each referral's real
   status. */

type ReferralStatus = 'invited' | 'signed_up' | 'first_job_completed' | 'bonus_paid';

interface ReferralDoc {
  _id: string;
  referredPhone: string;
  status: ReferralStatus;
  bonusAmount: number;
  createdAt: string;
}

interface ReferralsResponse {
  code: string;
  link: string;
  stats: { totalEarned: number; pending: number; referrals: ReferralDoc[] };
}

const STATUS_TONE: Record<ReferralStatus, 'neutral' | 'slate' | 'lime'> = {
  invited: 'neutral',
  signed_up: 'slate',
  first_job_completed: 'slate',
  bonus_paid: 'lime',
};

const STATUS_GLYPH: Record<ReferralStatus, string> = {
  invited: 'outgoing_mail',
  signed_up: 'how_to_reg',
  first_job_completed: 'task_alt',
  bonus_paid: 'payments',
};

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function ReferralDashboard({ accent = 'primary' }: { accent?: 'primary' | 'secondary' }) {
  const t = useTranslations('referrals');
  const { data, state, error, reload } = usePolling(() => api.get<ReferralsResponse>('/api/referrals/me'), 20000);
  const [phone, setPhone] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const dark = accent === 'primary' ? 'bg-fy-brown' : 'bg-fy-green';

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviting(true);
    try {
      await api.post('/api/referrals/invite', { phone });
      setPhone('');
      await reload();
    } catch (err) {
      setInviteError(err instanceof ApiClientError ? err.message : t('errorInvite'));
    } finally {
      setInviting(false);
    }
  }

  async function handleCopy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (permissions, insecure context) —
      // the link is still visible on-screen to copy manually.
      setCopied(false);
    }
  }

  if (state === 'loading' && !data) {
    return (
      <div className="flex flex-col gap-3">
        <div className="h-36 rounded-card bg-fy-field animate-pulse" />
        <div className="h-28 rounded-card bg-fy-field animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <LightCard className="flex flex-col gap-3">
        <Body>{error ?? t('loadError')}</Body>
        <Button variant="light" className="w-full" onClick={() => reload()}>
          {t('tryAgain')}
        </Button>
      </LightCard>
    );
  }

  const { code, link, stats } = data;

  return (
    <div className="flex flex-col gap-4">
      {/* Code plate */}
      <div className={`${dark} text-fy-bone rounded-sheet p-5 shadow-card flex flex-col gap-4`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <EyebrowLabel tone="on-dark" className="opacity-75">
              {t('yourCode')}
            </EyebrowLabel>
            <p className="font-heading text-heading text-fy-lime tracking-[0.2em] mt-1 break-all">{code}</p>
          </div>
          <IconTile tone="lime" size="lg">
            <Icon name="redeem" size={22} />
          </IconTile>
        </div>

        <Divider className="border-fy-bone/15" />

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-fy-bone/10 rounded-cell p-3">
            <EyebrowLabel tone="on-dark" className="opacity-75">
              {t('totalEarned')}
            </EyebrowLabel>
            <span className="font-heading text-title text-fy-bone block mt-1">{money(stats.totalEarned)}</span>
          </div>
          <div className="bg-fy-bone/10 rounded-cell p-3">
            <EyebrowLabel tone="on-dark" className="opacity-75">
              {t('pending')}
            </EyebrowLabel>
            <span className="font-heading text-title text-fy-lime block mt-1">{money(stats.pending)}</span>
          </div>
        </div>

        {/* The design's QR square has nothing behind it; the link itself is
            what actually gets shared, so it is shown in full and copyable. */}
        <div className="bg-fy-bone/10 rounded-cell p-3 flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] text-fy-bone/85 truncate min-w-0">{link}</span>
          <button
            type="button"
            onClick={() => handleCopy(link)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-fy-bone/15 hover:bg-fy-bone/25 font-mono text-[10px] uppercase tracking-wider font-semibold transition-colors"
          >
            <Icon name={copied ? 'check' : 'content_copy'} size={14} className="text-fy-lime" />
            {copied ? t('linkCopied') : t('copyLink')}
          </button>
        </div>
      </div>

      {/* Invite */}
      <Section title={<SectionHeading>{t('logInvite')}</SectionHeading>}>
        <LightCard>
          <form onSubmit={handleInvite} className="flex flex-col gap-3">
            <MutedText>{t('trackHint')}</MutedText>
            {inviteError && (
              <div
                role="alert"
                className="rounded-cell bg-fy-error-bg px-4 py-3 font-body text-label text-fy-on-error-bg"
              >
                {inviteError}
              </div>
            )}
            <Field
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('phonePlaceholder')}
            />
            <Button
              type="submit"
              variant={accent === 'primary' ? 'brown' : 'green'}
              className="w-full"
              glyph="person_add"
              disabled={inviting || !phone.trim()}
            >
              {inviting ? t('saving') : t('add')}
            </Button>
          </form>
        </LightCard>
      </Section>

      {/* Tracked list */}
      <Section
        title={<SectionHeading>{t('statusHeading')}</SectionHeading>}
        aside={<EyebrowLabel>{stats.referrals.length}</EyebrowLabel>}
      >
        {stats.referrals.length === 0 ? (
          <LightCard className="flex flex-col gap-1.5">
            <Body className="font-semibold">{t('emptyTitle')}</Body>
            <MutedText>{t('emptyDescription')}</MutedText>
          </LightCard>
        ) : (
          <LightCard className="flex flex-col">
            {stats.referrals.map((r) => (
              <div
                key={r._id}
                className="py-3 flex items-center justify-between gap-3 border-b border-fy-hairline last:border-0"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <IconTile tone={r.status === 'bonus_paid' ? 'lime' : 'slate-pale'} size="sm">
                    <Icon name={STATUS_GLYPH[r.status]} size={16} />
                  </IconTile>
                  <span className="flex flex-col min-w-0">
                    <Body className="font-semibold truncate">{r.referredPhone}</Body>
                    <EyebrowLabel>{new Date(r.createdAt).toLocaleDateString('en-IN')}</EyebrowLabel>
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1 shrink-0">
                  <StatusPill tone={STATUS_TONE[r.status]}>{t(`status.${r.status}`)}</StatusPill>
                  {r.bonusAmount > 0 && (
                    <span className="font-mono text-[10px] text-fy-green font-semibold">{money(r.bonusAmount)}</span>
                  )}
                </span>
              </div>
            ))}
          </LightCard>
        )}
      </Section>
    </div>
  );
}
