'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { MetricCard } from '@/components/ui/MetricCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { UsersIcon, LayersIcon, WalletIcon, ShieldIcon, ClockIcon, AlertIcon } from '@/components/ui/icons';

interface FederationDashboardResponse {
  federation: {
    _id: string;
    name: string;
    type: 'state' | 'district';
    region: string;
    registrationNumber: string;
    registeredUnderAct: string;
    maxCommissionRatePct?: number;
    maxWelfareDeductionRatePct?: number;
  };
  districts?: { _id: string; name: string; region: string; societyCount: number }[];
  counts: {
    societies: number;
    workers: number;
    jobsCompleted: number;
    earningsDistributed: number;
    trainingCompletionRatePct: number;
    welfareEnrolmentRatePct: number;
    grievancesOpen: number;
  };
  societies: {
    _id: string;
    name: string;
    region?: string;
    memberCount: number;
    ratingAvg: number;
    activeJobsCount: number;
    commissionRatePct: number;
    welfareDeductionRatePct: number;
  }[];
}

interface TrainingNeedsResponse {
  assessment: { muthaId: string; name: string; region?: string; memberCount: number; skillGapPct: number; dueForRefreshCount: number }[];
}

interface AffiliationRequest {
  _id: string;
  name: string;
  region?: string;
  societyRegistrationNumber?: string;
  registeredUnderAct?: string;
  leaderId: { name: string; phone: string };
}

// Shared by /federation-state/dashboard and /federation-district/dashboard
// (SIH26089 Phase B.1) — the actual `type` field on the fetched Federation
// document is what decides what renders (districts rollup vs. affiliation-
// request review + bye-law bounds), never a client-supplied prop, so the
// two pages can never accidentally show the wrong tier's controls.
export function FederationDashboardView() {
  const t = useTranslations('federation');
  const { data, state, reload } = usePolling(() => api.get<FederationDashboardResponse>('/api/federation/me'), 30000);
  const { data: needsData } = usePolling(() => api.get<TrainingNeedsResponse>('/api/federation/training-needs'), 60000);
  const [requests, setRequests] = useState<AffiliationRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isDistrict = data?.federation.type === 'district';

  async function loadRequests() {
    try {
      const res = await api.get<{ requests: AffiliationRequest[] }>('/api/federation/affiliation-requests');
      setRequests(res.requests);
    } catch {
      setRequests([]);
    }
  }

  async function decide(muthaId: string, approve: boolean) {
    setBusyId(muthaId);
    setError(null);
    try {
      await api.patch(`/api/federation/affiliation-requests/${muthaId}/decide`, { approve });
      await Promise.all([loadRequests(), reload()]);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorGeneric'));
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    if (isDistrict) loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDistrict]);

  if (state === 'loading' && !data) {
    return (
      <div className="min-h-screen bg-ip-surface">
        <TopBar title={t('title')} showBack={false} />
        <div className="max-w-3xl mx-auto px-ip-edge pt-ip-sm space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-ip-surface">
        <TopBar title={t('title')} showBack={false} />
        <EmptyState icon={<AlertIcon className="w-7 h-7" />} title={t('errorGeneric')} className="mt-10" />
      </div>
    );
  }

  const { federation, counts, societies, districts } = data;

  return (
    <div className="min-h-screen bg-ip-surface pb-16">
      <TopBar title={t('title')} showBack={false} />
      <div className="max-w-3xl mx-auto px-ip-edge pt-ip-sm space-y-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-1">
            {federation.type === 'state' ? t('tierState') : t('tierDistrict')}
          </p>
          <h1 className="font-heading text-ip-display-md font-extrabold mb-1">{federation.name}</h1>
          <p className="text-sm text-ip-on-surface-variant">
            {t('registrationLine', { number: federation.registrationNumber, act: federation.registeredUnderAct })}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard label={t('societies')} value={counts.societies} icon={<LayersIcon className="w-5 h-5" />} />
          <MetricCard label={t('workers')} value={counts.workers} icon={<UsersIcon className="w-5 h-5" />} />
          <MetricCard label={t('jobsCompleted')} value={counts.jobsCompleted} icon={<ShieldIcon className="w-5 h-5" />} />
          <MetricCard label={t('earningsDistributed')} value={`₹${counts.earningsDistributed}`} icon={<WalletIcon className="w-5 h-5" />} />
          <MetricCard label={t('trainingCompletion')} value={`${counts.trainingCompletionRatePct}%`} />
          <MetricCard label={t('welfareEnrolment')} value={`${counts.welfareEnrolmentRatePct}%`} />
          <MetricCard label={t('grievancesOpen')} value={counts.grievancesOpen} icon={<AlertIcon className="w-5 h-5" />} />
        </div>

        {federation.type === 'state' && districts && (
          <Card>
            <p className="font-heading font-semibold mb-3">{t('districtsHeading')}</p>
            {districts.length === 0 ? (
              <p className="text-sm text-ip-on-surface-variant">{t('noDistricts')}</p>
            ) : (
              <div className="space-y-2">
                {districts.map((d) => (
                  <div key={d._id} className="flex items-center justify-between text-sm py-1.5 border-b border-ip-outline/10 last:border-0">
                    <span>{d.name}</span>
                    <span className="text-ip-on-surface-variant">{t('societyCount', { count: d.societyCount })}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {isDistrict && (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <p className="font-heading font-semibold">{t('affiliationRequestsHeading')}</p>
              <span className="text-xs text-ip-on-surface-variant">
                {t('bylawBounds', {
                  commission: federation.maxCommissionRatePct ?? '—',
                  welfare: federation.maxWelfareDeductionRatePct ?? '—',
                })}
              </span>
            </div>
            {error && (
              <p role="alert" className="text-sm text-ip-error mb-3">
                {error}
              </p>
            )}
            {!requests || requests.length === 0 ? (
              <p className="text-sm text-ip-on-surface-variant">{t('noAffiliationRequests')}</p>
            ) : (
              <div className="space-y-3">
                {requests.map((r) => (
                  <div key={r._id} className="flex items-center justify-between gap-3 p-3 rounded-ip-input bg-ip-surface-container">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{r.name}</p>
                      <p className="text-xs text-ip-on-surface-variant truncate">
                        {r.leaderId?.name} · {r.societyRegistrationNumber} · {r.registeredUnderAct}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button size="md" disabled={busyId === r._id} onClick={() => decide(r._id, true)}>
                        {t('approve')}
                      </Button>
                      <Button variant="ghost" size="md" disabled={busyId === r._id} onClick={() => decide(r._id, false)}>
                        {t('reject')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        <Card>
          <p className="font-heading font-semibold mb-3">{t('societiesHeading')}</p>
          {societies.length === 0 ? (
            <EmptyState icon={<LayersIcon className="w-7 h-7" />} title={t('noSocieties')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ip-on-surface-variant">
                    <th className="pb-2 pr-3">{t('colName')}</th>
                    <th className="pb-2 pr-3">{t('colMembers')}</th>
                    <th className="pb-2 pr-3">{t('colRating')}</th>
                    <th className="pb-2 pr-3">{t('colCommission')}</th>
                    <th className="pb-2">{t('colWelfare')}</th>
                  </tr>
                </thead>
                <tbody>
                  {societies.map((s) => (
                    <tr key={s._id} className="border-t border-ip-outline/10">
                      <td className="py-2 pr-3 font-medium">{s.name}</td>
                      <td className="py-2 pr-3 tabular-nums">{s.memberCount}</td>
                      <td className="py-2 pr-3 tabular-nums">{s.ratingAvg.toFixed(1)}</td>
                      <td className="py-2 pr-3 tabular-nums">{s.commissionRatePct}%</td>
                      <td className="py-2 tabular-nums">{s.welfareDeductionRatePct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <p className="font-heading font-semibold mb-1">{t('trainingNeedsHeading')}</p>
          <p className="text-xs text-ip-on-surface-variant mb-3">{t('trainingNeedsSubtitle')}</p>
          {!needsData || needsData.assessment.length === 0 ? (
            <p className="text-sm text-ip-on-surface-variant">{t('noTrainingData')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ip-on-surface-variant">
                    <th className="pb-2 pr-3">{t('colName')}</th>
                    <th className="pb-2 pr-3">{t('colSkillGap')}</th>
                    <th className="pb-2 flex items-center gap-1">
                      <ClockIcon className="w-3.5 h-3.5" /> {t('colDueForRefresh')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {needsData.assessment.map((a) => (
                    <tr key={a.muthaId} className="border-t border-ip-outline/10">
                      <td className="py-2 pr-3 font-medium">{a.name}</td>
                      <td className={`py-2 pr-3 tabular-nums ${a.skillGapPct > 50 ? 'text-ip-error font-semibold' : ''}`}>
                        {a.skillGapPct}%
                      </td>
                      <td className="py-2 tabular-nums">{a.dueForRefreshCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
