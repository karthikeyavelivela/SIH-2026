'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { Media } from '@/components/ui/Media';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body, MutedText } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { MetricBlock, StatRow, ProgressBar } from '@/components/fy/Data';
import { Button, Chip, Field, ScrollRow, Slider } from '@/components/fy/Controls';
import { TopBar } from '@/components/fy/Navigation';
import { SocietyTabBar } from '@/components/fy/RoleNav';
import { DEFAULT_PLATFORM_COMMISSION_PCT } from '@/lib/platformCommission';

/* Built against client/public/design/society_governance.html.

   Section order there: 64px brand bar with the SOCIETY pill -> statutory
   sub-header with the seal chip -> the society portrait plate -> a five-tab
   module strip (Affiliation / Bye-laws / Equity / Surplus / Voting) -> the
   compliance footer -> 5-tab bottom bar.

   Largest element: the surplus total on tab 4. Dark surfaces: the portrait
   plate's scrim and the surplus passbook banner.

   Deviations, all for the same reason — the data does not exist:
   - The design prints a "Board of Trustees" of five elected office-bearers
     with terms. A Mutha has exactly one elected office (leaderId); there is
     no trustee model. Tab 1 shows the real office-bearer register instead,
     which is the leader plus the member roll count.
   - "Download Legal Charter PDF", the QR plate and the "HASH: 7FA4...C09"
     audit stamp have no endpoint behind them and are not reproduced. The
     compliance footer states the Act the society is actually registered
     under, which is a real field.
   - The design's "Audit Grade AAA" is invented; the plate shows the real
     affiliation status, which is the only grade the federation issues.
   - Percentages, share counts and every rupee figure come from
     /api/mutha/me, /api/governance/shares and /api/governance/surplus. */

type TabKey = 'affiliation' | 'byelaws' | 'equity' | 'surplus' | 'voting';

const TABS: { key: TabKey; glyph: string }[] = [
  { key: 'affiliation', glyph: 'apartment' },
  { key: 'byelaws', glyph: 'gavel' },
  { key: 'equity', glyph: 'pie_chart' },
  { key: 'surplus', glyph: 'payments' },
  { key: 'voting', glyph: 'how_to_vote' },
];

const ACTS = [
  'AP Cooperative Societies Act 1964',
  'AP Mutually Aided Cooperative Societies Act 1995',
] as const;

interface MuthaMe {
  _id: string;
  name: string;
  region?: string;
  photo?: string;
  societyRegistrationNumber?: string;
  registeredUnderAct?: string;
  affiliationStatus: 'unaffiliated' | 'pending' | 'affiliated' | 'suspended';
  commissionRatePct: number;
  welfareDeductionRatePct: number;
}

interface FederationCaps {
  _id: string;
  name: string;
  region?: string;
  maxCommissionRatePct?: number;
  maxWelfareDeductionRatePct?: number;
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
  lineItems?: { userId: string; shareCount: number; amount: number }[];
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
  myOptionIndex: number | null;
  optionVoteCounts: number[];
  totalVotes: number;
  eligibleVoters: number;
}

/** The first day of the current month, and today — the default surplus window. */
function defaultPeriod(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(now) };
}

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export default function MuthaGovernancePage() {
  const t = useTranslations('governance');
  const [tab, setTab] = useState<TabKey>('affiliation');

  const [mutha, setMutha] = useState<MuthaMe | null>(null);
  const [federation, setFederation] = useState<FederationCaps | null>(null);
  const [members, setMembers] = useState<{ _id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [districts, setDistricts] = useState<DistrictFederation[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [act, setAct] = useState<string>(ACTS[0]);
  const [affiliating, setAffiliating] = useState(false);

  const [commissionPct, setCommissionPct] = useState(0);
  const [welfarePct, setWelfarePct] = useState(0);
  const [savingByLaws, setSavingByLaws] = useState(false);

  const [shares, setShares] = useState<MemberShareRow[] | null>(null);
  const [totalShares, setTotalShares] = useState(0);
  const [issueTo, setIssueTo] = useState('');
  const [issueCount, setIssueCount] = useState('1');
  const [issueValue, setIssueValue] = useState('100');
  const [issuing, setIssuing] = useState(false);

  const [distributions, setDistributions] = useState<SurplusDistributionRow[] | null>(null);
  const [period, setPeriod] = useState(defaultPeriod);
  const [computing, setComputing] = useState(false);
  const [distributingId, setDistributingId] = useState<string | null>(null);

  const [polls, setPolls] = useState<PollRow[] | null>(null);
  const [pollBusyId, setPollBusyId] = useState<string | null>(null);
  const [newPollQuestion, setNewPollQuestion] = useState('');
  const [creatingPoll, setCreatingPoll] = useState(false);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [muthaRes, sharesRes, distRes, pollsRes] = await Promise.all([
        api.get<{ mutha: MuthaMe; federation: FederationCaps | null; members: { _id: string; name: string }[] }>(
          '/api/mutha/me'
        ),
        api
          .get<{ shares: MemberShareRow[]; totalShares: number }>('/api/governance/shares')
          .catch(() => ({ shares: [], totalShares: 0 })),
        api
          .get<{ distributions: SurplusDistributionRow[] }>('/api/governance/surplus')
          .catch(() => ({ distributions: [] })),
        api.get<{ polls: PollRow[] }>('/api/governance/polls').catch(() => ({ polls: [] })),
      ]);
      setMutha(muthaRes.mutha);
      setFederation(muthaRes.federation ?? null);
      setMembers(muthaRes.members ?? []);
      setCommissionPct(muthaRes.mutha.commissionRatePct);
      setWelfarePct(muthaRes.mutha.welfareDeductionRatePct);
      setShares(sharesRes.shares);
      setTotalShares(sharesRes.totalShares ?? 0);
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

  function fail(err: unknown) {
    setError(err instanceof ApiClientError ? err.message : t('errorGeneric'));
  }

  async function refreshPolls() {
    const res = await api.get<{ polls: PollRow[] }>('/api/governance/polls');
    setPolls(res.polls);
  }

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
      fail(err);
    } finally {
      setAffiliating(false);
    }
  }

  async function saveByLaws() {
    setSavingByLaws(true);
    setError(null);
    setNotice(null);
    try {
      await api.patch('/api/governance/bye-laws', {
        commissionRatePct: commissionPct,
        welfareDeductionRatePct: welfarePct,
      });
      setNotice(t('byLawsSaved'));
      await loadAll();
    } catch (err) {
      fail(err);
    } finally {
      setSavingByLaws(false);
    }
  }

  async function issueShares() {
    if (!issueTo) return;
    setIssuing(true);
    setError(null);
    setNotice(null);
    try {
      await api.post('/api/governance/shares/issue', {
        userId: issueTo,
        shareCount: Number(issueCount),
        shareValue: Number(issueValue),
      });
      setNotice(t('sharesIssued'));
      setIssueTo('');
      await loadAll();
    } catch (err) {
      fail(err);
    } finally {
      setIssuing(false);
    }
  }

  async function computeSurplus() {
    setComputing(true);
    setError(null);
    setNotice(null);
    try {
      await api.post('/api/governance/surplus/compute', {
        periodStart: new Date(period.start).toISOString(),
        periodEnd: new Date(period.end).toISOString(),
      });
      setNotice(t('surplusComputed'));
      await loadAll();
    } catch (err) {
      fail(err);
    } finally {
      setComputing(false);
    }
  }

  async function distribute(id: string) {
    setDistributingId(id);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/api/governance/surplus/${id}/distribute`);
      setNotice(t('surplusDistributed'));
      await loadAll();
    } catch (err) {
      fail(err);
    } finally {
      setDistributingId(null);
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
          {
            label: t('adoptOption', { commission: commissionPct, welfare: welfarePct }),
            value: JSON.stringify({ commissionRatePct: commissionPct, welfareDeductionRatePct: welfarePct }),
          },
          {
            label: t('keepOption', { commission: mutha.commissionRatePct, welfare: mutha.welfareDeductionRatePct }),
            value: JSON.stringify({
              commissionRatePct: mutha.commissionRatePct,
              welfareDeductionRatePct: mutha.welfareDeductionRatePct,
            }),
          },
        ],
        closesAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      });
      setTab('voting');
      await refreshPolls();
    } catch (err) {
      fail(err);
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
      await refreshPolls();
    } catch (err) {
      fail(err);
    } finally {
      setCreatingPoll(false);
    }
  }

  async function voteOn(pollId: string, optionIndex: number) {
    setPollBusyId(pollId);
    setError(null);
    try {
      await api.post(`/api/governance/polls/${pollId}/vote`, { optionIndex });
      await refreshPolls();
    } catch (err) {
      fail(err);
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
      fail(err);
    } finally {
      setPollBusyId(null);
    }
  }

  const capital = useMemo(
    () => (shares ?? []).reduce((s, r) => s + r.shareCount * r.shareValue, 0),
    [shares]
  );
  const commissionCap = federation?.maxCommissionRatePct ?? 100;
  const welfareCap = federation?.maxWelfareDeductionRatePct ?? 100;
  const dirty =
    !!mutha && (commissionPct !== mutha.commissionRatePct || welfarePct !== mutha.welfareDeductionRatePct);

  if (loading) {
    return (
      <div className="min-h-screen bg-fy-bone">
        <TopBar eyebrow="FYRO Cooperative" title={t('title')} showBack />
        <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto flex flex-col gap-3">
          <div className="h-44 rounded-card bg-fy-field animate-pulse" />
          <div className="h-12 rounded-cell bg-fy-field animate-pulse" />
          <div className="h-64 rounded-card bg-fy-field animate-pulse" />
        </main>
        <SocietyTabBar />
      </div>
    );
  }

  if (!mutha) {
    return (
      <div className="min-h-screen bg-fy-bone">
        <TopBar eyebrow="FYRO Cooperative" title={t('title')} showBack />
        <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto">
          <LightCard>
            <Body>{error ?? t('errorLoad')}</Body>
          </LightCard>
        </main>
        <SocietyTabBar />
      </div>
    );
  }

  const affiliated = mutha.affiliationStatus === 'affiliated';

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar
        eyebrow="FYRO Cooperative"
        title={t('title')}
        showBack
        actions={<StatusPill tone="lime">{t('societyPill')}</StatusPill>}
      />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        {/* Statutory sub-header — the seal chip carries the real status. */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-tag bg-fy-lime-tint-1 border border-fy-lime/50">
            <Icon name="verified_user" size={14} className="text-fy-green" />
            <EyebrowLabel tone="green">{t(`affiliationStatus.${mutha.affiliationStatus}`)}</EyebrowLabel>
          </span>
          <EyebrowLabel>
            {mutha.societyRegistrationNumber ? mutha.societyRegistrationNumber : t('unregistered')}
          </EyebrowLabel>
        </div>

        <div className="flex flex-col gap-1">
          <SectionHeading>{t('heading')}</SectionHeading>
          <MutedText>{t('subheading', { society: mutha.name })}</MutedText>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-card border border-fy-error/25 bg-fy-error-bg px-4 py-3 text-body text-fy-on-error-bg"
          >
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-card border border-fy-lime/50 bg-fy-lime-tint-1 px-4 py-3 text-body text-fy-green">
            {notice}
          </div>
        )}

        {/* Society portrait plate */}
        <div className="relative rounded-card overflow-hidden shadow-card h-44 bg-fy-dim">
          {/* Media resolves an asset *id*; a society that uploaded its own
              photo has a URL, so that renders directly. */}
          {mutha.photo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={mutha.photo} alt="" className="w-full h-full object-cover" />
          ) : (
            <Media
              id="society.portrait"
              kind="photo"
              fill
              treatment="full-bleed"
              tint="labour"
              alt=""
              className="w-full h-full"
            />
          )}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-fy-ink/85 via-fy-ink/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <EyebrowLabel tone="on-dark" className="text-fy-lime">
                {mutha.region ? t('guildRegion', { region: mutha.region }) : t('guild')}
              </EyebrowLabel>
              <p className="font-heading text-title text-fy-bone truncate">{mutha.name}</p>
              <p className="font-body text-eyebrow text-fy-bone/80">
                {t('memberOwners', { count: members.length })}
              </p>
            </div>
            <StatusPill tone={affiliated ? 'lime' : 'neutral'}>
              {t(`affiliationStatus.${mutha.affiliationStatus}`)}
            </StatusPill>
          </div>
        </div>

        {/* Five modules do not fit one 375px row, so this is the design's
            horizontally scrolling strip rather than an equal-width segment
            control that would push the page sideways. */}
        <ScrollRow role="tablist" aria-label={t('heading')}>
          {TABS.map((x) => (
            <Chip
              key={x.key}
              role="tab"
              aria-selected={tab === x.key}
              shape="round"
              accent="brown"
              glyph={x.glyph}
              active={tab === x.key}
              onClick={() => setTab(x.key)}
            >
              {t(`tabs.${x.key}`)}
            </Chip>
          ))}
        </ScrollRow>

        {/* ------------------------------------------------ 1. AFFILIATION */}
        {tab === 'affiliation' && (
          <div className="flex flex-col gap-4">
            <LightCard className="relative overflow-hidden">
              <span aria-hidden className="absolute -right-6 -bottom-8 opacity-[0.06] pointer-events-none">
                <Icon name="history_edu" size={150} className="text-fy-brown" />
              </span>
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex flex-col">
                  <EyebrowLabel>{t('statutoryRegistration')}</EyebrowLabel>
                  <SectionHeading>{affiliated ? t('charteredCooperative') : t('notYetChartered')}</SectionHeading>
                </div>
                <IconTile tone={affiliated ? 'lime' : 'slate-pale'} size="lg">
                  <Icon name={affiliated ? 'verified' : 'pending'} size={22} />
                </IconTile>
              </div>

              <Divider className="my-4" />

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col">
                  <EyebrowLabel>{t('federationStatus')}</EyebrowLabel>
                  <Body className="font-semibold">{t(`affiliationStatus.${mutha.affiliationStatus}`)}</Body>
                </div>
                <div className="flex flex-col">
                  <EyebrowLabel>{t('regNumber')}</EyebrowLabel>
                  <span className="font-mono text-label text-fy-ink">{mutha.societyRegistrationNumber ?? '—'}</span>
                </div>
                <div className="flex flex-col col-span-2">
                  <EyebrowLabel>{t('governingAuthority')}</EyebrowLabel>
                  <Body>{mutha.registeredUnderAct ?? '—'}</Body>
                </div>
                {federation && (
                  <div className="flex flex-col col-span-2">
                    <EyebrowLabel>{t('districtFederation')}</EyebrowLabel>
                    <Body>
                      {federation.name}
                      {federation.region ? ` · ${federation.region}` : ''}
                    </Body>
                  </div>
                )}
              </div>
            </LightCard>

            {mutha.affiliationStatus === 'unaffiliated' && (
              <Section title={<SectionHeading>{t('affiliationTitle')}</SectionHeading>}>
                <LightCard className="flex flex-col gap-3">
                  <MutedText>{t('affiliationSubtitle')}</MutedText>
                  <label className="flex flex-col gap-1">
                    <EyebrowLabel>{t('districtFederation')}</EyebrowLabel>
                    <select
                      value={selectedDistrict}
                      onChange={(e) => setSelectedDistrict(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-cell border border-fy-hairline bg-fy-bone font-body text-body"
                    >
                      <option value="">{t('selectDistrict')}</option>
                      {districts.map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <EyebrowLabel>{t('regNumber')}</EyebrowLabel>
                    <Field value={regNumber} onChange={(e) => setRegNumber(e.target.value)} placeholder="AP-GNT-2021-0482" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <EyebrowLabel>{t('registeredAct')}</EyebrowLabel>
                    <select
                      value={act}
                      onChange={(e) => setAct(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-cell border border-fy-hairline bg-fy-bone font-body text-body"
                    >
                      {ACTS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    className="w-full"
                    disabled={affiliating || !selectedDistrict || !regNumber}
                    onClick={requestAffiliation}
                  >
                    {affiliating ? t('submitting') : t('requestAffiliation')}
                  </Button>
                </LightCard>
              </Section>
            )}

            {/* The design's five-trustee board has no model behind it. The
                society's one elected office and its member roll do. */}
            <Section title={<SectionHeading>{t('officeBearers')}</SectionHeading>} aside={<EyebrowLabel>{t('electedCount', { count: 1 })}</EyebrowLabel>}>
              <LightCard className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <IconTile tone="brown">
                      <Icon name="shield_person" size={20} />
                    </IconTile>
                    <span className="flex flex-col min-w-0">
                      <Body className="font-semibold truncate">{t('leaderRole')}</Body>
                      <EyebrowLabel>{t('leaderRoleNote')}</EyebrowLabel>
                    </span>
                  </span>
                  <StatusPill tone="lime">{t('inOffice')}</StatusPill>
                </div>
                <Divider />
                <StatRow label={t('memberRoll')} value={String(members.length)} />
              </LightCard>
            </Section>
          </div>
        )}

        {/* --------------------------------------------------- 2. BYE-LAWS */}
        {tab === 'byelaws' && (
          <div className="flex flex-col gap-4">
            <LightCard className="flex flex-col gap-2">
              <EyebrowLabel>{t('fiscalParameters')}</EyebrowLabel>
              <SectionHeading>{t('ratesEditor')}</SectionHeading>
              <MutedText>{t('ratesEditorNote')}</MutedText>
            </LightCard>

            <LightCard className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <Body className="font-semibold">{t('commissionRate')}</Body>
                <span className="font-heading text-title text-fy-brown font-bold tabular-nums">{commissionPct}%</span>
              </div>
              <MutedText>{t('commissionRateNote')}</MutedText>
              <Slider
                min={0}
                max={100}
                step={0.5}
                accent="slate"
                value={commissionPct}
                onChange={(e) => setCommissionPct(Number(e.target.value))}
              />
              <div className="flex items-center justify-between gap-2">
                <EyebrowLabel>{t('minPct', { pct: 0 })}</EyebrowLabel>
                <span
                  className={`px-2 py-0.5 rounded-tag font-mono text-[10px] font-semibold ${
                    commissionPct > commissionCap
                      ? 'bg-fy-error-bg text-fy-on-error-bg'
                      : 'bg-fy-well text-fy-ink-soft'
                  }`}
                >
                  {federation
                    ? t('statutoryCap', { pct: commissionCap })
                    : t('capUnsetUntilAffiliated')}
                </span>
              </div>
            </LightCard>

            <LightCard className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <Body className="font-semibold">{t('welfareRate')}</Body>
                <span className="font-heading text-title text-fy-green font-bold tabular-nums">{welfarePct}%</span>
              </div>
              <MutedText>{t('welfareRateNote')}</MutedText>
              <Slider
                min={0}
                max={100}
                step={0.5}
                value={welfarePct}
                onChange={(e) => setWelfarePct(Number(e.target.value))}
              />
              <div className="flex items-center justify-between gap-2">
                <EyebrowLabel>{t('minPct', { pct: 0 })}</EyebrowLabel>
                <span
                  className={`px-2 py-0.5 rounded-tag font-mono text-[10px] font-semibold ${
                    welfarePct > welfareCap ? 'bg-fy-error-bg text-fy-on-error-bg' : 'bg-fy-well text-fy-ink-soft'
                  }`}
                >
                  {federation ? t('ceilingGuideline', { pct: welfareCap }) : t('capUnsetUntilAffiliated')}
                </span>
              </div>
            </LightCard>

            {/* What the member actually keeps, with both cuts shown. Neither
                rate compounds on the other — both are taken on the gross. */}
            <Panel className="flex flex-col gap-2">
              <EyebrowLabel>{t('takeHomeTitle')}</EyebrowLabel>
              <StatRow label={t('platformCut', { pct: DEFAULT_PLATFORM_COMMISSION_PCT })} value={`−${DEFAULT_PLATFORM_COMMISSION_PCT}%`} />
              <StatRow label={t('societyReserveCut')} value={`−${commissionPct}%`} />
              <StatRow label={t('welfareCut')} value={`−${welfarePct}%`} />
              <Divider />
              <StatRow
                label={t('memberKeeps')}
                value={`${Math.max(0, 100 - DEFAULT_PLATFORM_COMMISSION_PCT - commissionPct - welfarePct)}%`}
              />
            </Panel>

            <div className="flex flex-col gap-2">
              <Button className="w-full" disabled={savingByLaws || !dirty} onClick={saveByLaws}>
                {savingByLaws ? t('saving') : t('saveByLaws')}
              </Button>
              <Button variant="light" className="w-full" disabled={creatingPoll || !dirty} onClick={proposeRateCard}>
                {t('proposeRateCard')}
              </Button>
              <MutedText>{t('proposeRateCardNote')}</MutedText>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------- 3. EQUITY */}
        {tab === 'equity' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <LightCard>
                <MetricBlock label={t('totalParValue')} value={money(capital)} note={t('fullyPaidUp')} />
              </LightCard>
              <LightCard>
                <MetricBlock label={t('activeShareUnits')} value={String(totalShares)} note={t('shareholders', { count: shares?.length ?? 0 })} />
              </LightCard>
            </div>

            <Section
              title={<SectionHeading>{t('capitalLedger')}</SectionHeading>}
              aside={<EyebrowLabel>{t('patronageHoldings')}</EyebrowLabel>}
            >
              <LightCard className="flex flex-col">
                {!shares || shares.length === 0 ? (
                  <MutedText>{t('noShares')}</MutedText>
                ) : (
                  shares.map((s, i) => (
                    <div key={s._id} className="py-3 flex items-center justify-between gap-3 border-b border-fy-hairline last:border-0">
                      <span className="flex items-center gap-3 min-w-0">
                        <span className="w-8 h-8 rounded-full bg-fy-well flex items-center justify-center font-mono text-[11px] text-fy-ink-soft shrink-0">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="flex flex-col min-w-0">
                          <Body className="font-semibold truncate">{s.userId?.name ?? '—'}</Body>
                          <span className="font-mono text-[10px] text-fy-muted truncate">{s.userId?.phone ?? ''}</span>
                        </span>
                      </span>
                      <span className="flex flex-col items-end shrink-0">
                        <span className="font-heading text-body-lg text-fy-ink font-semibold tabular-nums">
                          {t('sharesCount', { count: s.shareCount })}
                        </span>
                        <span className="font-mono text-[10px] text-fy-green">
                          {money(s.shareCount * s.shareValue)}
                        </span>
                      </span>
                    </div>
                  ))
                )}
              </LightCard>
            </Section>

            <Section title={<SectionHeading>{t('issueSharesTitle')}</SectionHeading>}>
              <LightCard className="flex flex-col gap-3">
                <MutedText>{t('issueSharesNote')}</MutedText>
                <label className="flex flex-col gap-1">
                  <EyebrowLabel>{t('member')}</EyebrowLabel>
                  <select
                    value={issueTo}
                    onChange={(e) => setIssueTo(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-cell border border-fy-hairline bg-fy-bone font-body text-body"
                  >
                    <option value="">{t('selectMember')}</option>
                    {members.map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <EyebrowLabel>{t('shareCount')}</EyebrowLabel>
                    <Field type="number" min={1} value={issueCount} onChange={(e) => setIssueCount(e.target.value)} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <EyebrowLabel>{t('faceParValue')}</EyebrowLabel>
                    <Field type="number" min={0} value={issueValue} onChange={(e) => setIssueValue(e.target.value)} />
                  </label>
                </div>
                <Button className="w-full" disabled={issuing || !issueTo} onClick={issueShares}>
                  {issuing ? t('submitting') : t('issueShares')}
                </Button>
              </LightCard>
            </Section>
          </div>
        )}

        {/* ---------------------------------------------------- 4. SURPLUS */}
        {tab === 'surplus' && (
          <div className="flex flex-col gap-4">
            {(() => {
              const latest = distributions?.[0];
              if (!latest) return null;
              return (
                <div className="bg-fy-brown text-fy-bone rounded-sheet p-5 shadow-card flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <StatusPill tone={latest.status === 'distributed' ? 'lime' : 'neutral'}>
                      {t(`surplusStatus.${latest.status}`)}
                    </StatusPill>
                    <EyebrowLabel tone="on-dark" className="opacity-80">
                      {new Date(latest.periodStart).toLocaleDateString('en-IN')} –{' '}
                      {new Date(latest.periodEnd).toLocaleDateString('en-IN')}
                    </EyebrowLabel>
                  </div>
                  <MetricBlock
                    onDark
                    tone="lime"
                    label={t('totalNetSurplus')}
                    value={money(latest.totalSurplus)}
                    note={t('perShareAmount', { amount: Math.round(latest.perShareAmount) })}
                  />
                  <Divider className="border-fy-bone/15" />
                  <StatRow
                    className="[&>span:first-child]:text-fy-bone/70 [&>span:last-child]:text-fy-bone"
                    label={t('shareholdersInRun')}
                    value={String(latest.lineItems?.length ?? 0)}
                  />
                  {latest.status === 'computed' && (
                    <Button
                      className="w-full"
                      disabled={distributingId === latest._id}
                      onClick={() => distribute(latest._id)}
                    >
                      {distributingId === latest._id ? t('submitting') : t('distributeNow')}
                    </Button>
                  )}
                </div>
              );
            })()}

            <Section title={<SectionHeading>{t('computeTitle')}</SectionHeading>}>
              <LightCard className="flex flex-col gap-3">
                <MutedText>{t('computeNote')}</MutedText>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <EyebrowLabel>{t('periodStart')}</EyebrowLabel>
                    <Field
                      type="date"
                      value={period.start}
                      onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <EyebrowLabel>{t('periodEnd')}</EyebrowLabel>
                    <Field
                      type="date"
                      value={period.end}
                      onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))}
                    />
                  </label>
                </div>
                <Button className="w-full" disabled={computing} onClick={computeSurplus}>
                  {computing ? t('submitting') : t('computeSurplus')}
                </Button>
              </LightCard>
            </Section>

            <Section
              title={<SectionHeading>{t('distributionHistory')}</SectionHeading>}
              aside={<EyebrowLabel>{t('runsCount', { count: distributions?.length ?? 0 })}</EyebrowLabel>}
            >
              {!distributions || distributions.length === 0 ? (
                <LightCard>
                  <MutedText>{t('noSurplus')}</MutedText>
                </LightCard>
              ) : (
                <LightCard className="flex flex-col">
                  {distributions.map((d) => (
                    <div key={d._id} className="py-3 flex items-center justify-between gap-3 border-b border-fy-hairline last:border-0">
                      <span className="flex flex-col min-w-0">
                        <Body className="font-semibold">
                          {new Date(d.periodStart).toLocaleDateString('en-IN')} –{' '}
                          {new Date(d.periodEnd).toLocaleDateString('en-IN')}
                        </Body>
                        <EyebrowLabel>{t('perShareAmount', { amount: Math.round(d.perShareAmount) })}</EyebrowLabel>
                      </span>
                      <span className="flex flex-col items-end gap-1 shrink-0">
                        <span className="font-heading text-body-lg text-fy-ink font-semibold tabular-nums">
                          {money(d.totalSurplus)}
                        </span>
                        {d.status === 'computed' ? (
                          <button
                            type="button"
                            disabled={distributingId === d._id}
                            onClick={() => distribute(d._id)}
                            className="font-mono text-[10px] uppercase tracking-wider text-fy-brown font-bold disabled:opacity-50"
                          >
                            {t('distributeNow')}
                          </button>
                        ) : (
                          <StatusPill tone="lime">{t('surplusStatus.distributed')}</StatusPill>
                        )}
                      </span>
                    </div>
                  ))}
                </LightCard>
              )}
            </Section>
          </div>
        )}

        {/* ----------------------------------------------------- 5. VOTING */}
        {tab === 'voting' && (
          <div className="flex flex-col gap-4">
            {!polls || polls.length === 0 ? (
              <LightCard>
                <MutedText>{t('noPolls')}</MutedText>
              </LightCard>
            ) : (
              polls.map((p) => {
                const open = p.status === 'open';
                // An open poll whose closing time has passed still shows as
                // open, but castVote rejects it — so it must not read "live".
                // It is waiting for the leader to close and seal it.
                const closingIn = new Date(p.closesAt).getTime() - Date.now();
                const expired = closingIn <= 0;
                const votable = open && !expired;
                const hours = Math.max(1, Math.round(closingIn / 3600000));
                return (
                  <LightCard key={p._id} className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex flex-col min-w-0">
                        <span className="flex items-center gap-1.5">
                          {votable && <span aria-hidden className="w-2 h-2 rounded-full bg-fy-green animate-pulse" />}
                          <EyebrowLabel tone={votable ? 'green' : 'muted'}>
                            {votable
                              ? t('votingLive', { hours })
                              : open
                                ? t('awaitingSeal')
                                : t('pollStatus.closed')}
                          </EyebrowLabel>
                        </span>
                        <SectionHeading>{p.question}</SectionHeading>
                        <EyebrowLabel>{t(`pollType.${p.type}`)}</EyebrowLabel>
                      </span>
                    </div>

                    <div className="flex flex-col gap-2">
                      {p.options.map((o, i) => {
                        const count = p.optionVoteCounts?.[i] ?? 0;
                        const pct = p.totalVotes > 0 ? Math.round((count / p.totalVotes) * 100) : 0;
                        const mine = p.myOptionIndex === i;
                        const won = !open && p.winningOptionIndex === i;
                        const canVote = votable && !p.hasVoted;
                        return (
                          <button
                            key={i}
                            type="button"
                            disabled={!canVote || pollBusyId === p._id}
                            onClick={() => voteOn(p._id, i)}
                            className={`w-full text-left rounded-cell border px-4 py-3 transition-colors ${
                              won || mine ? 'border-fy-green bg-fy-lime-tint-1' : 'border-fy-hairline bg-fy-well'
                            } ${canVote ? 'hover:border-fy-brown' : 'cursor-default'}`}
                          >
                            <span className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-2 min-w-0">
                                {mine && <Icon name="check_circle" size={16} className="text-fy-green shrink-0" />}
                                <Body className="font-semibold truncate">{o.label}</Body>
                              </span>
                              <span className="font-mono text-label font-semibold text-fy-ink-soft shrink-0 tabular-nums">
                                {t('votePct', { pct, count })}
                              </span>
                            </span>
                            <ProgressBar value={pct} tone={won || mine ? 'green' : 'brown'} className="mt-2" />
                          </button>
                        );
                      })}
                    </div>

                    <Divider />
                    <div className="flex items-center justify-between gap-3">
                      <EyebrowLabel>
                        {t('turnout', { votes: p.totalVotes, eligible: p.eligibleVoters })}
                      </EyebrowLabel>
                      {open && (
                        <button
                          type="button"
                          disabled={pollBusyId === p._id}
                          onClick={() => closePollNow(p._id)}
                          className="font-mono text-[10px] uppercase tracking-wider text-fy-brown font-bold disabled:opacity-50"
                        >
                          {t('closePoll')}
                        </button>
                      )}
                    </div>
                    {open && (
                      <Panel className="flex items-start gap-2">
                        <Icon name="lock_clock" size={18} className="text-fy-brown shrink-0 mt-0.5" />
                        <span className="flex flex-col">
                          <Body className="font-semibold">{t('sealTitle')}</Body>
                          <MutedText>
                            {p.type === 'rate_card' ? t('sealNoteRateCard') : t('sealNoteElection')}
                          </MutedText>
                        </span>
                      </Panel>
                    )}
                  </LightCard>
                );
              })
            )}

            <Section title={<SectionHeading>{t('startPoll')}</SectionHeading>}>
              <LightCard className="flex flex-col gap-3">
                <label className="flex flex-col gap-1">
                  <EyebrowLabel>{t('electionQuestionLabel')}</EyebrowLabel>
                  <Field
                    value={newPollQuestion}
                    onChange={(e) => setNewPollQuestion(e.target.value)}
                    placeholder={t('leaderElectionDefaultQuestion')}
                  />
                </label>
                <Button
                  variant="light"
                  className="w-full"
                  disabled={creatingPoll || members.length === 0}
                  onClick={proposeLeaderElection}
                >
                  {t('startLeaderElection')}
                </Button>
                {members.length === 0 && <MutedText>{t('noMembersForElection')}</MutedText>}
              </LightCard>
            </Section>
          </div>
        )}

        {/* Compliance footer — the Act is a real field, so it is the only
            thing stated here. */}
        <Panel className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 min-w-0">
            <Icon name="security" size={18} className="text-fy-green shrink-0" />
            <EyebrowLabel className="truncate">{mutha.registeredUnderAct ?? t('unregistered')}</EyebrowLabel>
          </span>
          <span className="font-mono text-[9px] text-fy-muted shrink-0">{mutha._id.slice(-6).toUpperCase()}</span>
        </Panel>
      </main>

      <SocietyTabBar />
    </div>
  );
}
