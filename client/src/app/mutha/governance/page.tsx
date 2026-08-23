'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { BackHeader } from '@/components/ui/BackHeader';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="font-heading text-lg font-bold mb-1">{title}</h2>
      {subtitle && <p className="text-xs text-text-muted mb-3">{subtitle}</p>}
      <div className="ip-card space-y-4">{children}</div>
    </div>
  );
}

const inputClass =
  'w-full min-h-[40px] px-3 py-1.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm';

interface MuthaMe {
  _id: string;
  name: string;
  societyRegistrationNumber?: string;
  registeredUnderAct?: string;
  affiliationStatus: 'unaffiliated' | 'pending' | 'affiliated' | 'suspended';
  commissionRatePct: number;
  welfareDeductionRatePct: number;
}

interface DistrictFederation {
  _id: string;
  name: string;
  region: string;
}

interface MemberShareRow {
  _id: string;
  userId: { _id: string; name: string; phone: string };
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
}

interface PollRow {
  _id: string;
  type: 'rate_card' | 'leader_election';
  question: string;
  options: { label: string; value: string }[];
  status: 'open' | 'closed';
  closesAt: string;
  winningOptionIndex?: number;
  hasVoted: boolean;
}

// SIH26089 Phase B.2 — one consolidated cooperative-governance surface for
// a Society leader: affiliation request, bye-law rates (bounded by the
// affiliated district federation's own cap once affiliated), member
// shares/equity, surplus distribution, and democratic polls. A member
// (mutha_member) sees a read-scoped view of the same data via
// /mutha-member/governance (see that page) — this one is leader-only.
export default function MuthaGovernancePage() {
  const t = useTranslations('governance');
  const [mutha, setMutha] = useState<MuthaMe | null>(null);
  const [members, setMembers] = useState<{ _id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [districts, setDistricts] = useState<DistrictFederation[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [act, setAct] = useState('AP Cooperative Societies Act 1964');
  const [affiliating, setAffiliating] = useState(false);

  const [commissionPct, setCommissionPct] = useState('0');
  const [welfarePct, setWelfarePct] = useState('0');
  const [savingByLaws, setSavingByLaws] = useState(false);

  const [shares, setShares] = useState<MemberShareRow[] | null>(null);
  const [distributions, setDistributions] = useState<SurplusDistributionRow[] | null>(null);
  const [polls, setPolls] = useState<PollRow[] | null>(null);
  const [pollBusyId, setPollBusyId] = useState<string | null>(null);
  const [newPollQuestion, setNewPollQuestion] = useState('');
  const [creatingPoll, setCreatingPoll] = useState(false);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [muthaRes, sharesRes, distRes, pollsRes] = await Promise.all([
        api.get<{ mutha: MuthaMe; members: { _id: string; name: string }[] }>('/api/mutha/me'),
        api.get<{ shares: MemberShareRow[] }>('/api/governance/shares').catch(() => ({ shares: [] })),
        api.get<{ distributions: SurplusDistributionRow[] }>('/api/governance/surplus').catch(() => ({ distributions: [] })),
        api.get<{ polls: PollRow[] }>('/api/governance/polls').catch(() => ({ polls: [] })),
      ]);
      setMutha(muthaRes.mutha);
      setMembers(muthaRes.members ?? []);
      setCommissionPct(String(muthaRes.mutha.commissionRatePct));
      setWelfarePct(String(muthaRes.mutha.welfareDeductionRatePct));
      setShares(sharesRes.shares);
      setDistributions(distRes.distributions);
      setPolls(pollsRes.polls);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorLoad'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    api
      .get<{ federations: DistrictFederation[] }>('/api/mutha/district-federations')
      .then((res) => setDistricts(res.federations))
      .catch(() => setDistricts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestAffiliation() {
    if (!selectedDistrict || !regNumber) return;
    setAffiliating(true);
    setError(null);
    try {
      await api.post('/api/mutha/affiliation-request', {
        districtFederationId: selectedDistrict,
        societyRegistrationNumber: regNumber,
        registeredUnderAct: act,
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorGeneric'));
    } finally {
      setAffiliating(false);
    }
  }

  async function saveByLaws() {
    setSavingByLaws(true);
    setError(null);
    try {
      await api.patch('/api/governance/bye-laws', {
        commissionRatePct: Number(commissionPct),
        welfareDeductionRatePct: Number(welfarePct),
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorGeneric'));
    } finally {
      setSavingByLaws(false);
    }
  }

  async function proposeRateCard() {
    if (!mutha) return;
    setCreatingPoll(true);
    setError(null);
    try {
      await api.post('/api/governance/polls', {
        type: 'rate_card',
        question: t('rateCardPollQuestion', { commission: commissionPct, welfare: welfarePct }),
        options: [
          { label: t('adoptOption', { commission: commissionPct, welfare: welfarePct }), value: JSON.stringify({ commissionRatePct: Number(commissionPct), welfareDeductionRatePct: Number(welfarePct) }) },
          { label: t('keepOption', { commission: mutha.commissionRatePct, welfare: mutha.welfareDeductionRatePct }), value: JSON.stringify({ commissionRatePct: mutha.commissionRatePct, welfareDeductionRatePct: mutha.welfareDeductionRatePct }) },
        ],
        closesAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const res = await api.get<{ polls: PollRow[] }>('/api/governance/polls');
      setPolls(res.polls);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorGeneric'));
    } finally {
      setCreatingPoll(false);
    }
  }

  async function proposeLeaderElection() {
    if (members.length === 0) return;
    setCreatingPoll(true);
    setError(null);
    try {
      await api.post('/api/governance/polls', {
        type: 'leader_election',
        question: newPollQuestion.trim() || t('leaderElectionDefaultQuestion'),
        options: members.map((m) => ({ label: m.name, value: m._id })),
        closesAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      });
      setNewPollQuestion('');
      const res = await api.get<{ polls: PollRow[] }>('/api/governance/polls');
      setPolls(res.polls);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorGeneric'));
    } finally {
      setCreatingPoll(false);
    }
  }

  async function voteOn(pollId: string, optionIndex: number) {
    setPollBusyId(pollId);
    setError(null);
    try {
      await api.post(`/api/governance/polls/${pollId}/vote`, { optionIndex });
      const res = await api.get<{ polls: PollRow[] }>('/api/governance/polls');
      setPolls(res.polls);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorGeneric'));
    } finally {
      setPollBusyId(null);
    }
  }

  async function closePollNow(pollId: string) {
    setPollBusyId(pollId);
    setError(null);
    try {
      await api.post(`/api/governance/polls/${pollId}/close`);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorGeneric'));
    } finally {
      setPollBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto pb-6">
        <BackHeader title={t('title')} fallbackHref="/mutha/dashboard" />
        <div className="px-5 pt-6 space-y-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (!mutha) {
    return (
      <div className="max-w-lg mx-auto pb-6">
        <BackHeader title={t('title')} fallbackHref="/mutha/dashboard" />
        <p className="px-5 pt-6 text-sm text-text-muted">{error ?? t('errorLoad')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-10">
      <BackHeader title={t('title')} fallbackHref="/mutha/dashboard" />
      <div className="px-5 pt-6">
        {error && (
          <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <SectionCard title={t('affiliationTitle')} subtitle={t('affiliationSubtitle')}>
          <p className="text-sm">
            {t('statusLabel')}: <span className="font-semibold">{t(`affiliationStatus.${mutha.affiliationStatus}`)}</span>
          </p>
          {mutha.affiliationStatus === 'unaffiliated' && (
            <>
              <label className="block">
                <span className="text-xs text-text-muted">{t('districtFederation')}</span>
                <select value={selectedDistrict} onChange={(e) => setSelectedDistrict(e.target.value)} className={inputClass}>
                  <option value="">{t('selectDistrict')}</option>
                  {districts.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-text-muted">{t('regNumber')}</span>
                <input value={regNumber} onChange={(e) => setRegNumber(e.target.value)} className={inputClass} />
              </label>
              <label className="block">
                <span className="text-xs text-text-muted">{t('registeredAct')}</span>
                <select value={act} onChange={(e) => setAct(e.target.value)} className={inputClass}>
                  <option value="AP Cooperative Societies Act 1964">AP Cooperative Societies Act 1964</option>
                  <option value="AP Mutually Aided Cooperative Societies Act 1995">AP Mutually Aided Cooperative Societies Act 1995</option>
                </select>
              </label>
              <Button disabled={affiliating || !selectedDistrict || !regNumber} onClick={requestAffiliation} className="w-full">
                {affiliating ? t('submitting') : t('requestAffiliation')}
              </Button>
            </>
          )}
          {mutha.affiliationStatus !== 'unaffiliated' && mutha.societyRegistrationNumber && (
            <p className="text-xs text-text-muted">
              {mutha.societyRegistrationNumber} · {mutha.registeredUnderAct}
            </p>
          )}
        </SectionCard>

        <SectionCard title={t('byLawsTitle')} subtitle={t('byLawsSubtitle')}>
          <label className="block">
            <span className="text-xs text-text-muted">{t('commissionRate')}</span>
            <input
              type="number"
              min={0}
              max={100}
              value={commissionPct}
              onChange={(e) => setCommissionPct(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs text-text-muted">{t('welfareRate')}</span>
            <input
              type="number"
              min={0}
              max={100}
              value={welfarePct}
              onChange={(e) => setWelfarePct(e.target.value)}
              className={inputClass}
            />
          </label>
          <Button disabled={savingByLaws} onClick={saveByLaws} className="w-full">
            {savingByLaws ? t('saving') : t('saveByLaws')}
          </Button>
        </SectionCard>

        <SectionCard title={t('sharesTitle')} subtitle={t('sharesSubtitle')}>
          {!shares || shares.length === 0 ? (
            <p className="text-sm text-text-muted">{t('noShares')}</p>
          ) : (
            <div className="space-y-2">
              {shares.map((s) => (
                <div key={s._id} className="flex justify-between text-sm">
                  <span>{s.userId?.name ?? '—'}</span>
                  <span className="tabular-nums">
                    {s.shareCount} × ₹{s.shareValue}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title={t('surplusTitle')} subtitle={t('surplusSubtitle')}>
          {!distributions || distributions.length === 0 ? (
            <p className="text-sm text-text-muted">{t('noSurplus')}</p>
          ) : (
            <div className="space-y-2">
              {distributions.map((d) => (
                <div key={d._id} className="flex items-center justify-between text-sm">
                  <span>
                    {new Date(d.periodStart).toLocaleDateString('en-IN')} – {new Date(d.periodEnd).toLocaleDateString('en-IN')}
                  </span>
                  <span className="tabular-nums">
                    ₹{d.totalSurplus} ({t(`surplusStatus.${d.status}`)})
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title={t('pollsTitle')} subtitle={t('pollsSubtitle')}>
          <div className="flex flex-col gap-2 pb-3 border-b border-ip-outline/10">
            <Button variant="ghost" disabled={creatingPoll} onClick={proposeRateCard} className="w-full">
              {t('proposeRateCard')}
            </Button>
            <label className="block">
              <span className="text-xs text-text-muted">{t('electionQuestionLabel')}</span>
              <input
                value={newPollQuestion}
                onChange={(e) => setNewPollQuestion(e.target.value)}
                placeholder={t('leaderElectionDefaultQuestion')}
                className={inputClass}
              />
            </label>
            <Button variant="ghost" disabled={creatingPoll || members.length === 0} onClick={proposeLeaderElection} className="w-full">
              {t('startLeaderElection')}
            </Button>
          </div>

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
                    <div className="flex flex-wrap gap-2 mb-2">
                      {p.options.map((o, i) => (
                        <button
                          key={i}
                          type="button"
                          disabled={pollBusyId === p._id}
                          onClick={() => voteOn(p._id, i)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-full border border-ip-primary/40 text-ip-primary disabled:opacity-50"
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {p.status === 'open' && p.hasVoted && <p className="text-xs text-ip-primary mb-2">{t('youVoted')}</p>}
                  {p.status === 'open' && (
                    <button
                      type="button"
                      disabled={pollBusyId === p._id}
                      onClick={() => closePollNow(p._id)}
                      className="text-xs font-semibold text-ip-error underline disabled:opacity-50"
                    >
                      {t('closePoll')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
