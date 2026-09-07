'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Complaint, COMPLAINT_CATEGORIES, ComplaintCategory, Booking } from '@/lib/types';
import { SupportAgentWidget } from '@/components/worker/AgentWidgets';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { DataList, DataRow } from '@/components/fy/Data';
import { Button, Field } from '@/components/fy/Controls';
import { TopBar, TabRow } from '@/components/fy/Navigation';

/* Built against client/public/design/support_complaints.html.

   Section order there, top to bottom: back bar -> "Cooperative Charter
   Desk" header with a desk reference -> "Help & Resolution" heading and
   blurb -> AI concierge triage card with suggested questions -> consensus
   engine record card that expands into timestamps and proof -> grievance
   form -> report list.

   Largest element: the "Help & Resolution" heading. Dark surfaces: none.
   Brown is the accent throughout.

   Two things on this screen have no mechanism behind them, and are not
   faked: the design's "Consensus Hash #9f02c-vja-coop" and its automatic
   "Arbitration Pool: Self-Certified (₹140 Credited)". Nothing computes a
   consensus hash and nothing auto-credits compensation. What DOES exist
   and had no UI at all is the dispute channel — GET /api/disputes/mine and
   POST /api/disputes are open to a customer and were unreachable from
   anywhere in the app — so that is what the second tab is. */

interface Dispute {
  _id: string;
  bookingId: string;
  claim: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: string;
  resolutionNote?: string;
  createdAt: string;
}

const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

function complaintTone(s: Complaint['status']): 'lime' | 'neutral' | 'outline' {
  if (s === 'resolved') return 'lime';
  if (s === 'in_review') return 'neutral';
  return 'outline';
}

function disputeTone(s: string): 'lime' | 'neutral' | 'critical' | 'outline' {
  if (s === 'resolved' || s === 'closed') return 'lime';
  if (s === 'rejected') return 'critical';
  if (s === 'open') return 'outline';
  return 'neutral';
}

function SupportInner() {
  const t = useTranslations('customerSupport');
  const td = useTranslations('customerDisputes');
  const CATEGORY_LABEL = t.raw('category') as Record<ComplaintCategory, string>;
  const FAQ = t.raw('faq') as { q: string; a: string }[];
  const params = useSearchParams();

  const { data, reload } = usePolling(() => api.get<{ complaints: Complaint[] }>('/api/complaints/mine'), 15000);
  const { data: historyData } = usePolling(() => api.get<{ bookings: Booking[] }>('/api/bookings'), 30000);
  const { data: disputeData, reload: reloadDisputes } = usePolling(
    () => api.get<{ disputes: Dispute[] }>('/api/disputes/mine'),
    20000
  );

  const [tab, setTab] = useState<'report' | 'dispute' | 'faq'>('report');

  const [bookingId, setBookingId] = useState(params.get('bookingId') ?? '');
  const [category, setCategory] = useState<ComplaintCategory>('other');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [disputeBookingId, setDisputeBookingId] = useState(params.get('bookingId') ?? '');
  const [claim, setClaim] = useState('');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('medium');
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [disputeSubmitted, setDisputeSubmitted] = useState(false);

  useEffect(() => {
    const fromQuery = params.get('bookingId');
    if (fromQuery) {
      setBookingId(fromQuery);
      setDisputeBookingId(fromQuery);
    }
  }, [params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/api/complaints', { bookingId, category, description });
      setDescription('');
      setSubmitted(true);
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorSubmit'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDispute(e: React.FormEvent) {
    e.preventDefault();
    setDisputeError(null);
    setDisputeSubmitting(true);
    try {
      await api.post('/api/disputes', { bookingId: disputeBookingId, claim, priority });
      setClaim('');
      setDisputeSubmitted(true);
      await reloadDisputes();
    } catch (err) {
      setDisputeError(err instanceof ApiClientError ? err.message : td('errorSubmit'));
    } finally {
      setDisputeSubmitting(false);
    }
  }

  const complaints = data?.complaints ?? [];
  const disputes = disputeData?.disputes ?? [];
  const bookings = historyData?.bookings ?? [];

  const selectClass =
    'w-full h-14 px-4 rounded-control bg-fy-field font-body text-body text-fy-ink outline-none border-0 focus:ring-2 focus:ring-fy-brown/25';

  function bookingOptions() {
    return bookings.map((b) => (
      <option key={b._id} value={b._id}>
        {new Date(b.createdAt).toLocaleDateString('en-IN')} — {b.pickupLocation.address.slice(0, 40)}
      </option>
    ));
  }

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar eyebrow="FYRO Cooperative" title={t('title')} showBack />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <div className="pt-2">
          <EyebrowLabel tone="brown">{t('deskEyebrow')}</EyebrowLabel>
          <h2 className="font-heading text-heading text-fy-ink leading-[1.05]">{t('heading')}</h2>
          <Body className="mt-1.5">{t('subtitle')}</Body>
        </div>

        <SupportAgentWidget accent="primary" />

        <TabRow
          variant="inset"
          active={tab}
          onChange={(k) => setTab(k as typeof tab)}
          tabs={[
            { key: 'report', label: t('tabReport'), glyph: 'flag' },
            { key: 'dispute', label: td('tabDispute'), glyph: 'gavel' },
            { key: 'faq', label: t('tabFaq'), glyph: 'help' },
          ]}
        />

        {tab === 'report' && (
          <>
            <Panel className="flex flex-col gap-3">
              <SectionHeading as="h3">{t('reportIssue')}</SectionHeading>
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <div>
                  <EyebrowLabel>{t('bookingAria')}</EyebrowLabel>
                  <select
                    value={bookingId}
                    onChange={(e) => setBookingId(e.target.value)}
                    className={selectClass}
                    required
                    aria-label={t('bookingAria')}
                  >
                    <option value="" disabled>
                      {t('selectBooking')}
                    </option>
                    {bookingOptions()}
                  </select>
                </div>
                <div>
                  <EyebrowLabel>{t('categoryAria')}</EyebrowLabel>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
                    className={selectClass}
                    aria-label={t('categoryAria')}
                  >
                    {COMPLAINT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <EyebrowLabel>{t('descriptionAria')}</EyebrowLabel>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('descriptionPlaceholder')}
                    aria-label={t('descriptionAria')}
                    rows={4}
                    required
                    className="w-full px-4 py-3 rounded-control bg-fy-field font-body text-body text-fy-ink placeholder:text-fy-muted/70 outline-none border-0 focus:ring-2 focus:ring-fy-brown/25"
                  />
                </div>
                {error && (
                  <div role="alert" className="rounded-control bg-fy-error-bg px-4 py-3 font-body text-label text-fy-on-error-bg">
                    {error}
                  </div>
                )}
                {submitted && !error && (
                  <div role="status" className="rounded-control bg-fy-lime-tint-1 px-4 py-3 font-body text-label text-fy-green">
                    {t('submittedNotice')}
                  </div>
                )}
                <Button type="submit" glyph="send" disabled={submitting || !bookingId} className="w-full">
                  {submitting ? t('submitting') : t('submit')}
                </Button>
              </form>
            </Panel>

            <Section
              title={<SectionHeading>{t('yourReports')}</SectionHeading>}
              aside={<EyebrowLabel>{t('reportCount', { count: complaints.length })}</EyebrowLabel>}
            >
              {complaints.length === 0 ? (
                <LightCard>
                  <Body size="label">{t('noReports')}</Body>
                </LightCard>
              ) : (
                complaints.map((c) => (
                  <LightCard key={c._id} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-body text-label font-semibold text-fy-ink">{CATEGORY_LABEL[c.category]}</p>
                      <StatusPill tone={complaintTone(c.status)}>{t(`status.${c.status}`)}</StatusPill>
                    </div>
                    <Body size="label">{c.description}</Body>
                    {c.resolutionNote && (
                      <>
                        <Divider />
                        <div>
                          <EyebrowLabel tone="green">{t('resolutionLabel')}</EyebrowLabel>
                          <Body size="label">{c.resolutionNote}</Body>
                        </div>
                      </>
                    )}
                  </LightCard>
                ))
              )}
            </Section>
          </>
        )}

        {tab === 'dispute' && (
          <>
            <LightCard className="flex items-start gap-3">
              <IconTile tone="peach" size="sm">
                <Icon name="balance" size={18} />
              </IconTile>
              <div className="min-w-0">
                <p className="font-body text-label font-semibold text-fy-ink">{td('whenToUse')}</p>
                <Body size="label" className="mt-0.5">
                  {td('whenToUseBody')}
                </Body>
              </div>
            </LightCard>

            <Panel className="flex flex-col gap-3">
              <SectionHeading as="h3">{td('raiseDispute')}</SectionHeading>
              <form onSubmit={handleDispute} className="flex flex-col gap-3">
                <div>
                  <EyebrowLabel>{t('bookingAria')}</EyebrowLabel>
                  <select
                    value={disputeBookingId}
                    onChange={(e) => setDisputeBookingId(e.target.value)}
                    className={selectClass}
                    required
                    aria-label={t('bookingAria')}
                  >
                    <option value="" disabled>
                      {t('selectBooking')}
                    </option>
                    {bookingOptions()}
                  </select>
                </div>
                <div>
                  <EyebrowLabel>{td('priority')}</EyebrowLabel>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as (typeof PRIORITIES)[number])}
                    className={selectClass}
                    aria-label={td('priority')}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {td(`priorities.${p}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <EyebrowLabel>{td('claim')}</EyebrowLabel>
                  <textarea
                    value={claim}
                    onChange={(e) => setClaim(e.target.value)}
                    placeholder={td('claimPlaceholder')}
                    aria-label={td('claim')}
                    rows={4}
                    required
                    maxLength={2000}
                    className="w-full px-4 py-3 rounded-control bg-fy-field font-body text-body text-fy-ink placeholder:text-fy-muted/70 outline-none border-0 focus:ring-2 focus:ring-fy-brown/25"
                  />
                </div>
                {disputeError && (
                  <div role="alert" className="rounded-control bg-fy-error-bg px-4 py-3 font-body text-label text-fy-on-error-bg">
                    {disputeError}
                  </div>
                )}
                {disputeSubmitted && !disputeError && (
                  <div role="status" className="rounded-control bg-fy-lime-tint-1 px-4 py-3 font-body text-label text-fy-green">
                    {td('submittedNotice')}
                  </div>
                )}
                <Button
                  type="submit"
                  glyph="gavel"
                  disabled={disputeSubmitting || !disputeBookingId}
                  className="w-full"
                >
                  {disputeSubmitting ? td('submitting') : td('submit')}
                </Button>
              </form>
            </Panel>

            <Section
              title={<SectionHeading>{td('yourDisputes')}</SectionHeading>}
              aside={<EyebrowLabel>{td('disputeCount', { count: disputes.length })}</EyebrowLabel>}
            >
              {disputes.length === 0 ? (
                <LightCard>
                  <Body size="label">{td('noDisputes')}</Body>
                </LightCard>
              ) : (
                disputes.map((d) => (
                  <LightCard key={d._id} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <EyebrowLabel>{td('ref', { id: d._id.slice(-6).toUpperCase() })}</EyebrowLabel>
                      <StatusPill tone={disputeTone(d.status)}>{td(`statuses.${d.status}` as never) ?? d.status}</StatusPill>
                    </div>
                    <Body size="label">{d.claim}</Body>
                    <div className="flex items-center justify-between gap-3">
                      <EyebrowLabel>{td(`priorities.${d.priority}`)}</EyebrowLabel>
                      <EyebrowLabel>{new Date(d.createdAt).toLocaleDateString('en-IN')}</EyebrowLabel>
                    </div>
                    {d.resolutionNote && (
                      <>
                        <Divider />
                        <div>
                          <EyebrowLabel tone="green">{t('resolutionLabel')}</EyebrowLabel>
                          <Body size="label">{d.resolutionNote}</Body>
                        </div>
                      </>
                    )}
                  </LightCard>
                ))
              )}
            </Section>
          </>
        )}

        {tab === 'faq' && (
          <Section title={<SectionHeading>{t('faqTitle')}</SectionHeading>}>
            <Panel className="py-0">
              <DataList>
                {FAQ.map((f) => (
                  <DataRow
                    key={f.q}
                    lead={
                      <IconTile tone="peach" size="md" className="rounded-full">
                        <Icon name="help" size={18} />
                      </IconTile>
                    }
                    title={f.q}
                    meta={f.a}
                  />
                ))}
              </DataList>
            </Panel>
          </Section>
        )}
      </main>
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={null}>
      <SupportInner />
    </Suspense>
  );
}
