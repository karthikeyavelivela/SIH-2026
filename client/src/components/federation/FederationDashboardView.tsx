'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body, MutedText } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { MetricBlock, StatRow, ProgressBar } from '@/components/fy/Data';
import { Button } from '@/components/fy/Controls';
import { TopBar } from '@/components/fy/Navigation';

/* Built against client/public/design/federation_ap_state_dashboard.html and
   federation_district_action_console.html.

   Section order there: the apex seal header with the registration plate ->
   seven statutory metric cards -> the AP cartogram with its inspector
   drawer -> the district breakdown table -> the society registry.

   Largest elements: the seven metric numerals. Dark surface: the apex
   header plate.

   All seven statutory metrics are real and come straight from
   GET /api/federation/me: affiliated societies, worker-members, jobs
   completed, earnings disbursed, training completion rate, welfare
   enrolment rate and open grievances.

   Deviations, all because the data does not exist:
   - The NIC-CertIn token, the "SHA256: 8FA0·91E4·CC32·AP01" escrow audit
     hash, the "Gazette Tier-1" clearance badge and the named Registrar of
     Cooperative Societies are invented. The header plate carries the
     federation's real registration number and the Act it is registered
     under, which are real fields.
   - The AP geometric cartogram places 26 district nodes on a drawn
     coastline. No district geometry or coordinates exist in the data; the
     district rollup the backend does compute is a count of societies per
     district, so that is rendered as the breakdown table the design also
     has, and the cartogram is not faked.
   - "Export Legislative Dossier" has no endpoint behind it. */

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
  assessment: {
    muthaId: string;
    name: string;
    region?: string;
    memberCount: number;
    skillGapPct: number;
    dueForRefreshCount: number;
  }[];
}

interface AffiliationRequest {
  _id: string;
  name: string;
  region?: string;
  societyRegistrationNumber?: string;
  registeredUnderAct?: string;
  leaderId: { name: string; phone: string };
}

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** One of the seven statutory cards. */
function Statutory({
  label,
  value,
  note,
  glyph,
  tone = 'ink',
  highlight = false,
}: {
  label: string;
  value: string | number;
  note?: string;
  glyph: string;
  tone?: 'ink' | 'green' | 'brown' | 'error';
  highlight?: boolean;
}) {
  const valueTone = { ink: 'text-fy-ink', green: 'text-fy-green', brown: 'text-fy-brown', error: 'text-fy-error' }[
    tone
  ];
  return (
    <div
      className={`rounded-card p-4 shadow-card flex flex-col gap-2 min-w-0 ${
        highlight ? 'bg-fy-lime-tint-1 border border-fy-lime/50' : 'bg-fy-card'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <EyebrowLabel className="truncate">{label}</EyebrowLabel>
        <Icon name={glyph} size={18} className="text-fy-brown shrink-0" />
      </div>
      <span className={`font-heading text-metric leading-none ${valueTone}`}>{value}</span>
      {note && <span className="font-body text-eyebrow text-fy-muted">{note}</span>}
    </div>
  );
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
      <div className="min-h-screen bg-fy-bone">
        <TopBar eyebrow="FYRO Cooperative" title={t('title')} />
        <main className="pt-16 pb-16 px-gutter max-w-5xl mx-auto flex flex-col gap-3">
          <div className="h-28 rounded-card bg-fy-field animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-28 rounded-card bg-fy-field animate-pulse" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-fy-bone">
        <TopBar eyebrow="FYRO Cooperative" title={t('title')} />
        <main className="pt-16 px-gutter max-w-5xl mx-auto">
          <LightCard>
            <Body>{t('errorGeneric')}</Body>
          </LightCard>
        </main>
      </div>
    );
  }

  const { federation, counts, societies, districts } = data;

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar
        eyebrow="FYRO Cooperative"
        title={t('title')}
        actions={<StatusPill tone="lime">{t(isDistrict ? 'tierDistrict' : 'tierState')}</StatusPill>}
      />

      <main className="pt-16 pb-16 px-gutter max-w-5xl mx-auto relative z-10 flex flex-col gap-5">
        {error && (
          <div role="alert" className="mt-2 rounded-card border border-fy-error/25 bg-fy-error-bg px-4 py-3 text-body text-fy-on-error-bg">
            {error}
          </div>
        )}

        {/* Apex header plate — real registration record only. */}
        <div className="bg-fy-brown text-fy-on-brown rounded-sheet p-5 shadow-card flex flex-col gap-3 mt-2">
          <div className="flex items-start justify-between gap-3">
            <span className="flex items-center gap-3 min-w-0">
              <IconTile tone="lime" size="lg">
                <Icon name="account_balance" size={22} />
              </IconTile>
              <span className="flex flex-col min-w-0">
                <EyebrowLabel tone="on-dark" className="opacity-75">
                  {t('apexAuthority')}
                </EyebrowLabel>
                <p className="font-heading text-title text-fy-bone truncate">{federation.name}</p>
              </span>
            </span>
            <StatusPill tone="lime" dot>
              {t('liveSynchronised')}
            </StatusPill>
          </div>
          <Divider className="border-fy-bone/15" />
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <EyebrowLabel tone="on-dark" className="opacity-75">
                {t('registrationNo')}
              </EyebrowLabel>
              <p className="font-mono text-label text-fy-bone mt-0.5">{federation.registrationNumber}</p>
            </div>
            <div>
              <EyebrowLabel tone="on-dark" className="opacity-75">
                {t('registeredUnder')}
              </EyebrowLabel>
              <p className="font-body text-label text-fy-bone mt-0.5">{federation.registeredUnderAct}</p>
            </div>
          </div>
        </div>

        {/* Seven statutory metrics — every one of them real. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Statutory label={t('affiliatedSocieties')} value={counts.societies} glyph="apartment" />
          <Statutory label={t('workerMembers')} value={counts.workers.toLocaleString('en-IN')} glyph="groups" />
          <Statutory label={t('jobsCompleted')} value={counts.jobsCompleted.toLocaleString('en-IN')} glyph="task_alt" />
          <Statutory
            label={t('earningsDisbursed')}
            value={money(counts.earningsDistributed)}
            glyph="payments"
            tone="green"
            highlight
          />
          <Statutory
            label={t('trainingRate')}
            value={`${counts.trainingCompletionRatePct}%`}
            note={t('ofExpectedModules')}
            glyph="school"
            tone="brown"
          />
          <Statutory
            label={t('welfareEnrolment')}
            value={`${counts.welfareEnrolmentRatePct}%`}
            note={t('membersWithCover')}
            glyph="health_and_safety"
            tone="brown"
          />
          <Statutory
            label={t('openGrievances')}
            value={counts.grievancesOpen}
            note={t('disputesAndComplaints')}
            glyph="gavel"
            tone={counts.grievancesOpen > 0 ? 'error' : 'ink'}
          />
          {isDistrict && (
            <Statutory
              label={t('byeLawCeilings')}
              value={`${federation.maxCommissionRatePct ?? '—'}% / ${federation.maxWelfareDeductionRatePct ?? '—'}%`}
              note={t('reserveAndWelfare')}
              glyph="rule"
            />
          )}
        </div>

        {/* Affiliation requests — district tier only, and a real decision. */}
        {isDistrict && (
          <Section
            title={<SectionHeading>{t('affiliationRequests')}</SectionHeading>}
            aside={<EyebrowLabel>{t('pendingCount', { count: requests?.length ?? 0 })}</EyebrowLabel>}
          >
            {!requests || requests.length === 0 ? (
              <LightCard>
                <MutedText>{t('noRequests')}</MutedText>
              </LightCard>
            ) : (
              <div className="flex flex-col gap-2">
                {requests.map((r) => (
                  <Panel key={r._id} className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex flex-col min-w-0">
                        <Body className="font-semibold truncate">{r.name}</Body>
                        <MutedText className="truncate">
                          {r.societyRegistrationNumber ?? t('noRegNumber')}
                          {r.region ? ` · ${r.region}` : ''}
                        </MutedText>
                      </span>
                      <StatusPill tone="neutral">{t('pending')}</StatusPill>
                    </div>
                    <StatRow label={t('societyLeader')} value={`${r.leaderId.name} · ${r.leaderId.phone}`} />
                    {r.registeredUnderAct && <StatRow label={t('registeredUnder')} value={r.registeredUnderAct} />}
                    <Divider />
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="light"
                        className="w-full"
                        disabled={busyId === r._id}
                        onClick={() => decide(r._id, false)}
                      >
                        {t('reject')}
                      </Button>
                      <Button
                        variant="green"
                        className="w-full"
                        disabled={busyId === r._id}
                        onClick={() => decide(r._id, true)}
                      >
                        {busyId === r._id ? t('submitting') : t('approve')}
                      </Button>
                    </div>
                  </Panel>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* District breakdown — the real rollup the cartogram stands in for. */}
        {districts && districts.length > 0 && (
          <Section
            title={<SectionHeading>{t('districtBreakdown')}</SectionHeading>}
            aside={<EyebrowLabel>{t('districtCount', { count: districts.length })}</EyebrowLabel>}
          >
            <LightCard className="p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px]">
                  <thead>
                    <tr className="border-b border-fy-hairline">
                      <th scope="col" className="text-left px-4 py-3">
                        <EyebrowLabel>{t('district')}</EyebrowLabel>
                      </th>
                      <th scope="col" className="text-left px-4 py-3">
                        <EyebrowLabel>{t('region')}</EyebrowLabel>
                      </th>
                      <th scope="col" className="text-right px-4 py-3">
                        <EyebrowLabel>{t('societiesCol')}</EyebrowLabel>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-fy-hairline/60">
                    {districts.map((d) => (
                      <tr key={d._id} className="hover:bg-fy-well/60 transition-colors">
                        <td className="px-4 py-3">
                          <Body className="font-semibold">{d.name}</Body>
                        </td>
                        <td className="px-4 py-3">
                          <MutedText>{d.region}</MutedText>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`font-heading text-title font-semibold ${
                              d.societyCount === 0 ? 'text-fy-muted' : 'text-fy-brown'
                            }`}
                          >
                            {d.societyCount}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </LightCard>
          </Section>
        )}

        {/* Society registry */}
        <Section
          title={<SectionHeading>{t('societyRegistry')}</SectionHeading>}
          aside={<EyebrowLabel>{t('societiesCount', { count: societies.length })}</EyebrowLabel>}
        >
          {societies.length === 0 ? (
            <LightCard>
              <MutedText>{t('noSocieties')}</MutedText>
            </LightCard>
          ) : (
            <div className="flex flex-col gap-2">
              {societies.map((s, i) => (
                <Panel key={s._id} className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex items-center gap-3 min-w-0">
                      <IconTile tone="slate-pale" size="lg">
                        <span className="font-mono text-[11px] font-bold">{String(i + 1).padStart(2, '0')}</span>
                      </IconTile>
                      <span className="flex flex-col min-w-0">
                        <Body className="font-semibold truncate">{s.name}</Body>
                        <MutedText className="truncate">
                          {s.region ?? t('regionUnset')} · {t('membersCount', { count: s.memberCount })}
                        </MutedText>
                      </span>
                    </span>
                    {s.activeJobsCount > 0 && (
                      <StatusPill tone="lime">{t('activeJobs', { count: s.activeJobsCount })}</StatusPill>
                    )}
                  </div>
                  <Divider />
                  <div className="grid grid-cols-2 gap-3">
                    <StatRow stacked label={t('reserveRate')} value={`${s.commissionRatePct}%`} />
                    <StatRow stacked label={t('welfareRate')} value={`${s.welfareDeductionRatePct}%`} />
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </Section>

        {/* Training needs — a real per-society skill-gap assessment. */}
        {needsData && needsData.assessment.length > 0 && (
          <Section
            title={<SectionHeading>{t('trainingNeeds')}</SectionHeading>}
            aside={<EyebrowLabel>{t('skillGapAside')}</EyebrowLabel>}
          >
            <LightCard className="flex flex-col gap-4">
              {needsData.assessment.map((a) => (
                <div key={a.muthaId} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <Body className="font-semibold truncate">{a.name}</Body>
                    <EyebrowLabel tone={a.skillGapPct > 50 ? 'brown' : 'green'}>
                      {t('skillGap', { pct: a.skillGapPct })}
                    </EyebrowLabel>
                  </div>
                  <ProgressBar value={100 - a.skillGapPct} tone={a.skillGapPct > 50 ? 'error' : 'green'} />
                  <MutedText>
                    {t('dueForRefresh', { count: a.dueForRefreshCount, members: a.memberCount })}
                  </MutedText>
                </div>
              ))}
            </LightCard>
          </Section>
        )}
      </main>
    </div>
  );
}
