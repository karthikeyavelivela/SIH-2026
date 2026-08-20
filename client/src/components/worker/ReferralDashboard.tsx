'use client';

import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { QRCodeDisplay } from '@/components/ui/QRCodeDisplay';
import { UsersIcon, CheckIcon } from '@/components/ui/icons';

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

const STATUS_LABEL: Record<ReferralStatus, string> = {
  invited: 'Invited',
  signed_up: 'Signed up — awaiting 1st job',
  first_job_completed: 'First job done',
  bonus_paid: 'Bonus earned',
};

const STATUS_TONE: Record<ReferralStatus, 'muted' | 'secondary' | 'success'> = {
  invited: 'muted',
  signed_up: 'secondary',
  first_job_completed: 'secondary',
  bonus_paid: 'success',
};

// Shared presentational referral view for driver/hamali_solo — code + share
// link + QR + tracked list, per worker_referral_dashboard.
export function ReferralDashboard({ accent = 'primary' }: { accent?: 'primary' | 'secondary' }) {
  const { data, state, error, reload } = usePolling(() => api.get<ReferralsResponse>('/api/referrals/me'), 20000);
  const [phone, setPhone] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviting(true);
    try {
      await api.post('/api/referrals/invite', { phone });
      setPhone('');
      await reload();
    } catch (err) {
      setInviteError(err instanceof ApiClientError ? err.message : 'Could not save this invite.');
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
    }
  }

  if (state === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (state === 'error' || !data) {
    return (
      <Card>
        <EmptyState title="Couldn't load your referrals" description={error ?? undefined} action={<Button onClick={() => reload()}>Try again</Button>} />
      </Card>
    );
  }

  const accentText = accent === 'secondary' ? 'text-secondary-600' : 'text-primary-600';

  return (
    <div className="space-y-5">
      <Card className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Your referral code</p>
        <p className={`font-heading text-2xl font-extrabold tracking-wider mb-4 ${accentText}`}>{data.code}</p>
        <div className="flex justify-center mb-4">
          <QRCodeDisplay value={data.link} size={140} />
        </div>
        <Button variant={accent === 'secondary' ? 'secondary' : 'primary'} className="w-full" onClick={() => handleCopy(data.link)}>
          {copied ? 'Link copied!' : 'Copy invite link'}
        </Button>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1">Total earned</p>
          <p className={`font-heading text-xl font-extrabold ${accentText}`}>₹{data.stats.totalEarned}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1">Pending</p>
          <p className="font-heading text-xl font-extrabold text-text-primary">₹{data.stats.pending}</p>
        </Card>
      </div>

      <Card>
        <p className="font-heading font-bold mb-3">Log an invite</p>
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            required
            type="tel"
            placeholder="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="flex-1 min-h-[44px] px-3.5 py-2 rounded-md border border-border bg-background text-sm"
          />
          <Button type="submit" disabled={inviting} size="md">
            {inviting ? 'Saving…' : 'Add'}
          </Button>
        </form>
        {inviteError && <p className="text-xs text-red-600 mt-2">{inviteError}</p>}
        <p className="text-xs text-text-muted mt-2">
          Track someone you&apos;ve invited by phone. We&apos;ll link them up automatically once they join FYRO.
        </p>
      </Card>

      <div>
        <h3 className="font-heading font-bold text-base mb-3">Referral status</h3>
        {data.stats.referrals.length === 0 ? (
          <Card>
            <EmptyState icon={<UsersIcon className="w-7 h-7" />} title="No referrals yet" description="Share your code to start earning bonuses." />
          </Card>
        ) : (
          <div className="space-y-2.5">
            {data.stats.referrals.map((r) => (
              <Card key={r._id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{r.referredPhone}</p>
                  <p className="text-xs text-text-muted">{new Date(r.createdAt).toLocaleDateString('en-IN')}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <Badge tone={STATUS_TONE[r.status]}>
                    {r.status === 'bonus_paid' && <CheckIcon className="w-3 h-3 mr-1 inline" />}
                    {STATUS_LABEL[r.status]}
                  </Badge>
                  <p className="text-xs text-text-muted mt-1">₹{r.bonusAmount}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
