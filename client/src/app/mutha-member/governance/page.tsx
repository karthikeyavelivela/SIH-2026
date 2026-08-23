'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { BackHeader } from '@/components/ui/BackHeader';
import { Skeleton } from '@/components/ui/Skeleton';

interface MemberShareRow {
  _id: string;
  shareCount: number;
  shareValue: number;
}
interface SurplusDistributionRow {
  _id: string;
  periodStart: string;
  periodEnd: string;
  totalSurplus: number;
  perShareAmount: number;
  status: 'computed' | 'distributed';
  lineItems: { userId: string; amount: number }[];
}
interface CommissionRecordRow {
  _id: string;
  bookingId: string;
  grossAmount: number;
  commissionAmount: number;
  welfareAmount: number;
  netAmount: number;
  createdAt: string;
}
interface PollRow {
  _id: string;
  type: 'rate_card' | 'leader_election';
  question: string;
  options: { label: string; value: string }[];
  status: 'open' | 'closed';
  winningOptionIndex?: number;
  hasVoted: boolean;
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="font-heading text-lg font-bold mb-1">{title}</h2>
      {subtitle && <p className="text-xs text-text-muted mb-3">{subtitle}</p>}
      <div className="ip-card space-y-3">{children}</div>
    </div>
  );
}

// A mutha_member's own read-scoped view of the same cooperative-governance
// data the leader page (mutha/governance/page.tsx) manages — the PS's
// "democratic controls" only mean something if members can actually see
// and vote, not just the leader. No bye-law/affiliation/share-issuing
// controls here — those stay leader-only server-side (governance.routes.ts),
// this page simply never renders a control the API would reject anyway.
export default function MuthaMemberGovernancePage() {
  const t = useTranslations('governance');
  const [shares, setShares] = useState<MemberShareRow[] | null>(null);
  const [distributions, setDistributions] = useState<SurplusDistributionRow[] | null>(null);
  const [records, setRecords] = useState<CommissionRecordRow[] | null>(null);
  const [polls, setPolls] = useState<PollRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [sharesRes, distRes, recordsRes, pollsRes] = await Promise.all([
        api.get<{ shares: MemberShareRow[] }>('/api/governance/shares'),
        api.get<{ distributions: SurplusDistributionRow[] }>('/api/governance/surplus'),
        api.get<{ records: CommissionRecordRow[] }>('/api/governance/commission-records/me'),
        api.get<{ polls: PollRow[] }>('/api/governance/polls'),
      ]);
      setShares(sharesRes.shares);
      setDistributions(distRes.distributions);
      setRecords(recordsRes.records);
      setPolls(pollsRes.polls);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorLoad'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function vote(pollId: string, optionIndex: number) {
    setBusyId(pollId);
    setError(null);
    try {
      await api.post(`/api/governance/polls/${pollId}/vote`, { optionIndex });
      const res = await api.get<{ polls: PollRow[] }>('/api/governance/polls');
      setPolls(res.polls);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorGeneric'));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto pb-6">
        <BackHeader title={t('title')} fallbackHref="/mutha-member/profile" />
        <div className="px-5 pt-6 space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-10">
      <BackHeader title={t('title')} fallbackHref="/mutha-member/profile" />
      <div className="px-5 pt-6">
        {error && (
          <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Section title={t('myDeductionsTitle')} subtitle={t('myDeductionsSubtitle')}>
          {!records || records.length === 0 ? (
            <p className="text-sm text-text-muted">{t('noDeductions')}</p>
          ) : (
            <div className="space-y-2">
              {records.map((r) => (
                <div key={r._id} className="flex justify-between text-sm">
                  <span className="text-text-muted">
                    ₹{r.grossAmount} − ₹{r.commissionAmount} − ₹{r.welfareAmount}
                  </span>
                  <span className="font-semibold tabular-nums">₹{r.netAmount}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={t('sharesTitle')} subtitle={t('sharesSubtitle')}>
          {!shares || shares.length === 0 ? (
            <p className="text-sm text-text-muted">{t('noShares')}</p>
          ) : (
            shares.map((s) => (
              <div key={s._id} className="flex justify-between text-sm">
                <span>{t('myShares')}</span>
                <span className="tabular-nums">
                  {s.shareCount} × ₹{s.shareValue}
                </span>
              </div>
            ))
          )}
        </Section>

        <Section title={t('surplusTitle')} subtitle={t('surplusSubtitle')}>
          {!distributions || distributions.length === 0 ? (
            <p className="text-sm text-text-muted">{t('noSurplus')}</p>
          ) : (
            <div className="space-y-2">
              {distributions.map((d) => (
                <div key={d._id} className="flex items-center justify-between text-sm">
                  <span>
                    {new Date(d.periodStart).toLocaleDateString('en-IN')} – {new Date(d.periodEnd).toLocaleDateString('en-IN')}
                  </span>
                  <span className="tabular-nums">{t(`surplusStatus.${d.status}`)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={t('pollsTitle')} subtitle={t('pollsSubtitle')}>
          {!polls || polls.length === 0 ? (
            <p className="text-sm text-text-muted">{t('noPolls')}</p>
          ) : (
            <div className="space-y-3">
              {polls.map((p) => (
                <div key={p._id} className="rounded-ip-input bg-ip-surface-container p-3">
                  <p className="text-sm font-semibold">{p.question}</p>
                  <p className="text-xs text-text-muted mb-2">
                    {t(`pollType.${p.type}`)} · {t(`pollStatus.${p.status}`)}
                    {p.status === 'closed' && p.winningOptionIndex !== undefined && (
                      <> · {t('winner')}: {p.options[p.winningOptionIndex]?.label}</>
                    )}
                  </p>
                  {p.status === 'open' && !p.hasVoted && (
                    <div className="flex flex-wrap gap-2">
                      {p.options.map((o, i) => (
                        <button
                          key={i}
                          type="button"
                          disabled={busyId === p._id}
                          onClick={() => vote(p._id, i)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-full border border-ip-secondary/40 text-ip-secondary disabled:opacity-50"
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {p.status === 'open' && p.hasVoted && <p className="text-xs text-ip-secondary">{t('youVoted')}</p>}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
