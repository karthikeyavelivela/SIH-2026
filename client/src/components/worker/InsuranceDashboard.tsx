'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import type {
  InsuranceMeResponse,
  InsurancePolicyWithPlan,
  InsuranceClaim,
  InsuranceClaimStatus,
  InsurancePlanCategory,
} from '@/lib/types';
import { TopBar } from '@/components/fy/Navigation';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { MetricBlock, ProgressBar } from '@/components/fy/Data';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth-context';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/StatusChip';
import { DataRow } from '@/components/ui/DataRow';
import { ListDivider } from '@/components/ui/ListDivider';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { TicketCard } from '@/components/ui/TicketCard';
import { Modal } from '@/components/ui/Modal';
import { ShieldIcon, TruckIcon, BoxIcon, AlertIcon, CameraIcon, XIcon } from '@/components/ui/icons';

interface InsuranceDashboardProps {
  /** Where BackHeader falls back to when there's no page history (e.g. deep link). */
  dashboardHref: string;
}

const CATEGORY_ICON: Record<InsurancePlanCategory, typeof ShieldIcon> = {
  commercial_auto: TruckIcon,
  work_compensation: ShieldIcon,
  cargo_transit: BoxIcon,
};

const POLICY_STATUS_TONE: Record<InsurancePolicyWithPlan['status'], 'success' | 'muted' | 'danger'> = {
  active: 'success',
  expired: 'muted',
  cancelled: 'danger',
};

const CLAIM_STATUS_TONE: Record<InsuranceClaimStatus, 'secondary' | 'warning' | 'primary' | 'danger' | 'success'> = {
  submitted: 'secondary',
  under_review: 'warning',
  approved: 'primary',
  rejected: 'danger',
  paid: 'success',
};

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatMoney(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

// Per-policy coverage card — insurance_claims_portal / worker_insurance_plans
// screens' "Active Coverage" cards, built from the DataRow pattern.
function PolicyCard({ policy }: { policy: InsurancePolicyWithPlan }) {
  const t = useTranslations('insurance');
  const plan = policy.plan;
  const CategoryGlyph = plan ? CATEGORY_ICON[plan.category] : ShieldIcon;

  return (
    <Panel className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <IconTile tone={plan?.type === 'parametric' ? 'lime' : 'peach'} size="md">
            <CategoryGlyph className="w-5 h-5" />
          </IconTile>
          <div className="min-w-0">
            <p className="font-body text-body font-semibold text-fy-ink truncate">
              {plan?.name ?? t('genericPolicyName')}
            </p>
            {plan && (
              <EyebrowLabel>
                {t(`category.${plan.category}`)} · {plan.type === 'parametric' ? t('parametric') : t('standard')}
              </EyebrowLabel>
            )}
          </div>
        </div>
        <StatusChip tone={POLICY_STATUS_TONE[policy.status]} className="shrink-0">
          {t(`policyStatus.${policy.status}`)}
        </StatusChip>
      </div>
      {plan?.description && <Body size="label">{plan.description}</Body>}
      <Divider />
      <DataRow label={t('coverageAmount')} value={plan ? formatMoney(plan.coverageAmount) : '—'} />
      <DataRow label={t('validUntil')} value={formatDate(policy.endDate)} />
    </Panel>
  );
}

interface ReportIncidentModalProps {
  open: boolean;
  onClose: () => void;
  policies: InsurancePolicyWithPlan[];
  onFiled: () => void;
}

// "Report New Incident" flow — form → POST /api/insurance/claims. Photos are
// captured as base64 data URLs client-side (no dedicated media-upload
// endpoint exists for insurance claims in this build) and submitted as
// plain strings, which fits InsuranceClaim.photos's string[] shape as-is.
function ReportIncidentModal({ open, onClose, policies, onFiled }: ReportIncidentModalProps) {
  const t = useTranslations('insurance.report');
  const [policyId, setPolicyId] = useState('');
  const [incidentDate, setIncidentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [incidentDescription, setIncidentDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedPolicyId = policyId || policies[0]?._id || '';

  function resetAndClose() {
    setPolicyId('');
    setIncidentDate(new Date().toISOString().slice(0, 10));
    setIncidentDescription('');
    setPhotos([]);
    setError(null);
    onClose();
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setPhotos((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPolicyId) {
      setError(t('errorSelectPolicy'));
      return;
    }
    if (incidentDescription.trim().length === 0) {
      setError(t('errorDescribe'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/api/insurance/claims', {
        policyId: selectedPolicyId,
        incidentDescription: incidentDescription.trim(),
        incidentDate: new Date(incidentDate).toISOString(),
        photos,
      });
      onFiled();
      resetAndClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorSubmit'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title={t('title')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {policies.length === 0 ? (
          <p className="text-sm text-fy-muted">{t('noPolicies')}</p>
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-fy-muted mb-1.5">
                {t('policy')}
              </label>
              <select
                value={selectedPolicyId}
                onChange={(e) => setPolicyId(e.target.value)}
                className="w-full rounded-control border border-fy-hairline bg-fy-panel px-3 py-2.5 text-sm min-h-[44px]"
              >
                {policies.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.plan?.name ?? t('genericPolicy')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-fy-muted mb-1.5">
                {t('incidentDate')}
              </label>
              <input
                type="date"
                value={incidentDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setIncidentDate(e.target.value)}
                className="w-full rounded-control border border-fy-hairline bg-fy-panel px-3 py-2.5 text-sm min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-fy-muted mb-1.5">
                {t('whatHappened')}
              </label>
              <textarea
                value={incidentDescription}
                onChange={(e) => setIncidentDescription(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder={t('describePlaceholder')}
                className="w-full rounded-control border border-fy-hairline bg-fy-panel px-3 py-2.5 text-sm resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-fy-muted mb-1.5">
                {t('photosOptional')}
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={handleFiles}
                className="hidden"
              />
              <div className="flex flex-wrap gap-2">
                {photos.map((src, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-control overflow-hidden border border-fy-hairline">
                    <img src={src} alt={`Incident photo ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label={t('removePhoto')}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-16 h-16 rounded-control border border-dashed border-fy-hairline flex items-center justify-center text-fy-muted"
                  aria-label={t('addPhoto')}
                >
                  <CameraIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        )}

        {error && <p className="text-sm text-fy-error">{error}</p>}

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="ghost" className="flex-1" onClick={resetAndClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" variant="danger" className="flex-1" disabled={submitting || policies.length === 0}>
            {submitting ? t('submitting') : t('submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function InsuranceDashboard({ dashboardHref }: InsuranceDashboardProps) {
  const router = useRouter();
  const t = useTranslations('insurance');
  const { data, state, reload } = usePolling(() => api.get<InsuranceMeResponse>('/api/insurance/me'), 30000);
  const [reportOpen, setReportOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);

  const activePolicies = useMemo(() => (data?.policies ?? []).filter((p) => p.status === 'active'), [data]);

  // Payout ledger: paid claims + fired parametric-trigger events, newest
  // first. Parametric payouts have no linked Payment record (see
  // parametricInsurance.service.ts's doc comment) — this trigger-event
  // history IS that ledger, which is exactly what this list renders.
  const payoutHistory = useMemo(() => {
    const fromClaims = (data?.claims ?? [])
      .filter((c) => c.status === 'paid' && c.payoutAmount > 0)
      .map((c) => ({
        id: `claim-${c._id}`,
        label: t('claimPayoutLabel'),
        hint: `${formatDate(c.updatedAt)} · ${c.incidentDescription.slice(0, 40)}`,
        amount: c.payoutAmount,
        at: c.updatedAt,
      }));

    const fromParametric = (data?.parametricTriggerHistory ?? []).flatMap((trigger) =>
      trigger.events
        .filter((e) => e.triggered && e.paidAt)
        .map((e) => ({
          id: `trigger-${trigger._id}-${e.periodIndex}`,
          label: t('parametricPayoutLabel'),
          hint: `${formatDate(e.paidAt)} · ${t('parametricAutoHint', { threshold: trigger.thresholdValue.toLocaleString('en-IN') })}`,
          amount: trigger.payoutAmount,
          at: e.paidAt as string,
        }))
    );

    return [...fromClaims, ...fromParametric].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const { user } = useAuth();

  // The design's solvency gauge. Real numbers only: the accrual is what the
  // parametric trigger has actually measured this period, the threshold is
  // the trigger's own, and the payout is what would be paid if the period
  // closes under it. Shown only for 'earnings_below_threshold', the one
  // condition anything actually computes.
  const gauge = (data?.parametricTriggers ?? []).find((tr) => tr.condition === 'earnings_below_threshold');

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar
        eyebrow="FYRO Cooperative"
        title={t('headerTitle')}
        showBack
        onBack={() => router.push(dashboardHref)}
        actions={user?.accountStatus === 'active' ? <StatusPill tone="lime">{t('memberPill')}</StatusPill> : undefined}
      />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <div className="pt-2">
          <EyebrowLabel tone="brown">{t('guaranteeEyebrow')}</EyebrowLabel>
          <h2 className="font-heading text-heading text-fy-ink leading-[1.05]">{t('yourCover')}</h2>
          <Body className="mt-1.5">{t('subtitle')}</Body>
        </div>

        <div className="flex gap-3">
          <Button size="lg" className="flex-1" onClick={() => setEnrollOpen(true)}>
            {t('explorePlans')}
          </Button>
          <Button variant="ghost" size="lg" className="flex-1" onClick={() => setReportOpen(true)}>
            {t('reportIncident')}
          </Button>
        </div>

        {state === 'loading' && (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        )}

        {state === 'error' && (
          <div role="alert" className="rounded-control bg-fy-error-bg px-4 py-3 font-body text-label text-fy-on-error-bg">
            {t('loadError')}
          </div>
        )}

        {state !== 'loading' && (
          <>
            {/* Solvency gauge — the design's headline card. */}
            {gauge && (
              <Panel className="p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <IconTile tone="lime" size="sm">
                      <Icon name="shield_with_heart" size={18} />
                    </IconTile>
                    <EyebrowLabel tone="green">{t('solvencyGauge')}</EyebrowLabel>
                  </span>
                  <StatusPill tone={gauge.triggered ? 'lime' : 'outline'} className="shrink-0">
                    {gauge.triggered ? t('cyclePaid') : t('cycleActive')}
                  </StatusPill>
                </div>

                <MetricBlock
                  tone="green"
                  label={t('currentAccrual')}
                  value={formatMoney(gauge.actualValue)}
                  note={t('thresholdNote', { threshold: gauge.thresholdValue.toLocaleString('en-IN') })}
                />

                <ProgressBar
                  value={
                    gauge.thresholdValue > 0
                      ? Math.min(100, Math.round((gauge.actualValue / gauge.thresholdValue) * 100))
                      : 0
                  }
                  tone="green"
                />

                <Divider />

                <div className="flex items-start gap-2.5">
                  <Icon name="auto_mode" size={18} className="text-fy-green shrink-0 mt-px" />
                  <Body size="label">
                    {t('parametricExplainer', {
                      threshold: gauge.thresholdValue.toLocaleString('en-IN'),
                      days: gauge.periodDays,
                      amount: gauge.payoutAmount.toLocaleString('en-IN'),
                    })}
                  </Body>
                </div>
              </Panel>
            )}

            <Section
              title={<SectionHeading>{t('activeCoverage')}</SectionHeading>}
              aside={<EyebrowLabel>{t('coversActive', { count: activePolicies.length })}</EyebrowLabel>}
            >
              {activePolicies.length === 0 ? (
                <LightCard>
                  <EmptyState title={t('noCoverageTitle')} description={t('noCoverageDescription')} />
                </LightCard>
              ) : (
                activePolicies.map((policy) => <PolicyCard key={policy._id} policy={policy} />)
              )}
            </Section>

            {(() => {
              // 'days_unable_to_work' has no real backing data source anywhere
              // in this codebase (see parametricInsurance.service.ts) — it
              // always evaluates actualValue:0, triggered:false. A meter for it
              // would present a condition as "being tracked" when nothing
              // computes it, so only the real condition gets one, and the rest
              // are named as not yet live.
              const comingSoonCount = (data?.parametricTriggers ?? []).filter(
                (tr) => tr.condition !== 'earnings_below_threshold'
              ).length;
              if (comingSoonCount === 0) return null;
              return (
                <LightCard>
                  <Body size="label">{t('comingSoonNotice')}</Body>
                </LightCard>
              );
            })()}

            <Section
              title={<SectionHeading>{t('claimStatus')}</SectionHeading>}
              aside={<EyebrowLabel>{t('claimCount', { count: data?.claims.length ?? 0 })}</EyebrowLabel>}
            >
              {(data?.claims.length ?? 0) === 0 ? (
                <LightCard>
                  <EmptyState title={t('noClaimsTitle')} description={t('noClaimsDescription')} />
                </LightCard>
              ) : (
                <Panel className="py-0">
                  {data!.claims.map((claim, i) => (
                    <div key={claim._id}>
                      {i > 0 && <ListDivider />}
                      <TicketCard
                        ticketId={claim._id.slice(-6).toUpperCase()}
                        title={claim.incidentDescription}
                        status={t(`claim.${claim.status}`)}
                        statusTone={CLAIM_STATUS_TONE[claim.status]}
                        updatedAt={formatDate(claim.updatedAt)}
                        trailing={
                          claim.payoutAmount > 0 ? (
                            <span className="font-body text-label font-bold text-fy-green">
                              +{formatMoney(claim.payoutAmount)}
                            </span>
                          ) : undefined
                        }
                      />
                    </div>
                  ))}
                </Panel>
              )}
            </Section>

            <Section
              title={<SectionHeading>{t('payoutHistory')}</SectionHeading>}
              aside={<EyebrowLabel>{t('ledgerEyebrow')}</EyebrowLabel>}
            >
              {payoutHistory.length === 0 ? (
                <LightCard>
                  <EmptyState title={t('noPayoutsTitle')} description={t('noPayoutsDescription')} />
                </LightCard>
              ) : (
                <Panel className="py-0">
                  {payoutHistory.map((entry, i) => (
                    <div key={entry.id}>
                      {i > 0 && <ListDivider />}
                      <DataRow
                        label={entry.label}
                        hint={entry.hint}
                        value={<span className="text-fy-green">+{formatMoney(entry.amount)}</span>}
                      />
                    </div>
                  ))}
                </Panel>
              )}
            </Section>
          </>
        )}
      </main>

      <ReportIncidentModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        policies={activePolicies}
        onFiled={reload}
      />
      <EnrollModal
        open={enrollOpen}
        onClose={() => setEnrollOpen(false)}
        enrolledPlanIds={activePolicies.map((p) => p.planId)}
        onEnrolled={reload}
      />
    </div>
  );
}

interface AvailablePlan {
  _id: string;
  name: string;
  type: 'standard' | 'parametric';
  category: InsurancePlanCategory;
  coverageAmount: number;
  description: string;
  premium: number;
  defaultTrigger?: { condition: string; thresholdValue: number; periodDays: number; payoutAmount: number };
}

// Phase 3.2 — enrolment with explicit consent, and plain-language framing
// for a worker with limited financial literacy for the parametric case,
// per the spec's own example copy.
function EnrollModal({
  open,
  onClose,
  enrolledPlanIds,
  onEnrolled,
}: {
  open: boolean;
  onClose: () => void;
  enrolledPlanIds: string[];
  onEnrolled: () => void;
}) {
  const t = useTranslations('insurance.enroll');
  const [plans, setPlans] = useState<AvailablePlan[] | null>(null);
  const [selected, setSelected] = useState<AvailablePlan | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setConsent(false);
    setError(null);
    setDone(false);
    api
      .get<{ plans: AvailablePlan[] }>('/api/insurance/plans')
      .then((res) => setPlans(res.plans.filter((p) => !enrolledPlanIds.includes(p._id))))
      .catch(() => setPlans([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function enroll() {
    if (!selected) return;
    setEnrolling(true);
    setError(null);
    try {
      await api.post('/api/insurance/enroll', { planId: selected._id, consent: true });
      setDone(true);
      onEnrolled();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorEnroll'));
    } finally {
      setEnrolling(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('title')}>
      {done ? (
        <p className="text-sm">{t('done')}</p>
      ) : selected ? (
        <div className="space-y-4">
          <button type="button" onClick={() => setSelected(null)} className="text-xs font-semibold text-fy-brown">
            {t('backToPlans')}
          </button>
          <div className="fy-surface-card">
            <p className="font-heading font-bold mb-1">{selected.name}</p>
            <p className="text-sm text-fy-muted mb-3">{selected.description}</p>
            {selected.type === 'parametric' && selected.defaultTrigger && (
              <p className="text-sm bg-fy-brown/5 text-fy-ink rounded-control px-3 py-2.5 mb-3">
                {t('parametricExplainer', {
                  threshold: selected.defaultTrigger.thresholdValue.toLocaleString('en-IN'),
                  days: selected.defaultTrigger.periodDays,
                  amount: selected.defaultTrigger.payoutAmount.toLocaleString('en-IN'),
                })}
              </p>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-fy-muted">{t('coverage')}</span>
              <span className="font-semibold">₹{selected.coverageAmount.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-fy-muted">{t('premium')}</span>
              <span className="font-semibold">₹{selected.premium.toLocaleString('en-IN')}</span>
            </div>
          </div>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
            <span>{t('consentLabel')}</span>
          </label>
          {error && <p className="text-xs text-fy-error">{error}</p>}
          <Button className="w-full" disabled={!consent || enrolling} onClick={enroll}>
            {enrolling ? t('confirming') : t('confirm')}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {plans === null && <p className="text-sm text-fy-muted">{t('loading')}</p>}
          {plans?.length === 0 && <p className="text-sm text-fy-muted">{t('noNewPlans')}</p>}
          {plans?.map((p) => (
            <button
              key={p._id}
              type="button"
              onClick={() => setSelected(p)}
              className="w-full text-left fy-surface-card hover:bg-fy-field transition-colors"
            >
              <p className="font-heading font-bold">{p.name}</p>
              <p className="text-xs text-fy-muted">{p.type === 'parametric' ? t('parametricTag') : t('standardTag')} · ₹{p.premium}/mo</p>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
