'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, ApiClientError, API_BASE } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Panel, LightCard } from '@/components/fy/Surfaces';
import { EyebrowLabel, Body, SectionHeading } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { Button, Field } from '@/components/fy/Controls';
import { useCategoryName } from '@/lib/categoryName';

export type ContractViewer = 'institution' | 'leader' | 'federation';

interface Contract {
  _id: string;
  categorySlug: string;
  scope: string;
  kind: 'one_off' | 'recurring';
  schedule: { startDate: string; endDate?: string; frequency?: 'weekly' | 'monthly'; daysOfWeek?: number[]; dayOfMonth?: number; time: string; durationHours: number };
  workersPerVisit: number;
  ratePerWorkerPerVisit: number;
  status: 'proposed' | 'countered' | 'active' | 'paused' | 'completed' | 'cancelled' | 'rejected';
  counter?: { ratePerWorkerPerVisit?: number; workersPerVisit?: number; note?: string };
  history: { status: string; at: string; note?: string }[];
  location: { address: string };
  institutionId?: { name: string; institutionProfile?: { orgName: string } } | string;
  muthaId?: { name: string } | string;
}

interface Visit {
  _id: string;
  contractVisitDate: string;
  status: string;
  assignedHamaliIds: string[];
  requiredHamaliCount: number;
}

interface Statement {
  month: string;
  lines: { bookingId: string; date: string; workers: number; workerRate: number; serviceFee: number; total: number; feeParts: { society: number; welfarePool: number; guaranteeReserve: number; platform: number } }[];
  pendingVisits: number;
  totals: { workerRate: number; serviceFee: number; total: number; visits: number };
}

const TONE: Record<Contract['status'], 'lime' | 'outline' | 'brown'> = {
  proposed: 'outline',
  countered: 'brown',
  active: 'lime',
  paused: 'outline',
  completed: 'outline',
  cancelled: 'outline',
  rejected: 'outline',
};

function orgOf(c: Contract): string {
  return typeof c.institutionId === 'object' ? (c.institutionId.institutionProfile?.orgName ?? c.institutionId.name) : '';
}
function societyOf(c: Contract): string {
  return typeof c.muthaId === 'object' ? c.muthaId.name : '';
}

/** The contract list, for any of the three viewers. */
export function ContractList({ contracts, detailHref }: { contracts: Contract[]; detailHref: (id: string) => string }) {
  const t = useTranslations('contracts');
  const categoryName = useCategoryName();
  if (contracts.length === 0) {
    return (
      <LightCard>
        <Body size="label">{t('none')}</Body>
      </LightCard>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {contracts.map((c) => (
        <Link key={c._id} href={detailHref(c._id)} className="block">
          <Panel className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-body text-body font-semibold text-fy-ink truncate">
                {categoryName({ slug: c.categorySlug, name: c.categorySlug })} · {orgOf(c) || societyOf(c)}
              </p>
              <Body size="label">
                {t('summary', { workers: c.workersPerVisit, rate: c.ratePerWorkerPerVisit, hours: c.schedule.durationHours })}
              </Body>
            </div>
            <StatusPill tone={TONE[c.status]} className="shrink-0">
              {t(`status.${c.status}`)}
            </StatusPill>
          </Panel>
        </Link>
      ))}
    </div>
  );
}

/** The mine-list page body for an institution or a leader. */
export function MyContracts({ detailHref }: { detailHref: (id: string) => string }) {
  const { data } = usePolling(() => api.get<{ contracts: Contract[] }>('/api/contracts/mine'), 20000);
  if (!data) return <div className="h-32 rounded-card bg-fy-panel animate-pulse" />;
  return <ContractList contracts={data.contracts} detailHref={detailHref} />;
}

/**
 * One contract: its terms, its history, the actions the viewer may take,
 * the visits generated so far, and the month's statement with the invoice.
 */
export function ContractDetail({ id, viewer }: { id: string; viewer: ContractViewer }) {
  const t = useTranslations('contracts');
  const tDays = useTranslations('contracts.days');
  const categoryName = useCategoryName();
  const { data, reload } = usePolling(() => api.get<{ contract: Contract; visits: Visit[] }>(`/api/contracts/${id}`), 20000, [id]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [statement, setStatement] = useState<Statement | null>(null);
  const [counterRate, setCounterRate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Statement>(`/api/contracts/${id}/statement?month=${month}`)
      .then(setStatement)
      .catch(() => setStatement(null));
  }, [id, month, data]);

  async function act(path: 'leader' | 'institution', body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/contracts/${id}/${path}`, body);
      setNote('');
      setCounterRate('');
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <div className="h-48 rounded-card bg-fy-panel animate-pulse" />;
  const c = data.contract;
  const when =
    c.kind === 'one_off'
      ? t('once', { date: c.schedule.startDate.slice(0, 10) })
      : c.schedule.frequency === 'weekly'
        ? t('weeklyOn', { days: (c.schedule.daysOfWeek ?? []).map((d) => tDays(String(d))).join(', ') })
        : t('monthlyOn', { day: c.schedule.dayOfMonth ?? 1 });

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <EyebrowLabel>{t('contractRef', { ref: c._id.slice(-6).toUpperCase() })}</EyebrowLabel>
            <SectionHeading as="h2">{categoryName({ slug: c.categorySlug, name: c.categorySlug })}</SectionHeading>
          </div>
          <StatusPill tone={TONE[c.status]}>{t(`status.${c.status}`)}</StatusPill>
        </div>
        <Body size="label">{c.scope}</Body>
        <Body size="label">{c.location.address}</Body>
        <Body size="label">
          {when} · {c.schedule.time} · {t('hoursLong', { hours: c.schedule.durationHours })}
        </Body>
        <Body size="label">{t('summary', { workers: c.workersPerVisit, rate: c.ratePerWorkerPerVisit, hours: c.schedule.durationHours })}</Body>
        {c.counter && c.status === 'countered' && (
          <LightCard>
            <Body size="label">
              {t('counterOffer', {
                rate: c.counter.ratePerWorkerPerVisit ?? c.ratePerWorkerPerVisit,
                workers: c.counter.workersPerVisit ?? c.workersPerVisit,
              })}
              {c.counter.note ? ` — ${c.counter.note}` : ''}
            </Body>
          </LightCard>
        )}
      </Panel>

      {viewer === 'leader' && c.status === 'proposed' && (
        <Panel className="flex flex-col gap-2">
          <EyebrowLabel>{t('yourAnswer')}</EyebrowLabel>
          <Field type="number" min={1} value={counterRate} onChange={(e) => setCounterRate(e.target.value)} placeholder={t('counterRate')} aria-label={t('counterRate')} />
          <Field value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('note')} aria-label={t('note')} />
          <div className="flex flex-wrap gap-2">
            <Button size="md" disabled={busy} onClick={() => act('leader', { action: 'accept' })}>{t('accept')}</Button>
            <Button size="md" variant="light" disabled={busy || !counterRate} onClick={() => act('leader', { action: 'counter', ratePerWorkerPerVisit: Number(counterRate), note: note || undefined })}>{t('counter')}</Button>
            <Button size="md" variant="ghost" disabled={busy} onClick={() => act('leader', { action: 'reject', note: note || undefined })}>{t('reject')}</Button>
          </div>
        </Panel>
      )}
      {viewer === 'institution' && c.status === 'countered' && (
        <div className="flex flex-wrap gap-2">
          <Button size="md" disabled={busy} onClick={() => act('institution', { action: 'accept_counter' })}>{t('acceptCounter')}</Button>
          <Button size="md" variant="ghost" disabled={busy} onClick={() => act('institution', { action: 'reject_counter' })}>{t('rejectCounter')}</Button>
        </div>
      )}
      {viewer === 'institution' && (c.status === 'active' || c.status === 'paused') && (
        <div className="flex flex-wrap gap-2">
          {c.status === 'active' ? (
            <Button size="md" variant="light" disabled={busy} onClick={() => act('institution', { action: 'pause' })}>{t('pause')}</Button>
          ) : (
            <Button size="md" variant="light" disabled={busy} onClick={() => act('institution', { action: 'resume' })}>{t('resume')}</Button>
          )}
          <Button size="md" variant="ghost" disabled={busy} onClick={() => act('institution', { action: 'cancel' })}>{t('cancel')}</Button>
        </div>
      )}
      {viewer === 'leader' && (c.status === 'active' || c.status === 'paused') && (
        <Button size="md" variant="ghost" disabled={busy} onClick={() => act('leader', { action: 'cancel' })}>{t('cancel')}</Button>
      )}
      {error && <p className="text-sm text-fy-on-error-bg">{error}</p>}

      <Panel className="flex flex-col gap-2">
        <EyebrowLabel>{t('visits')}</EyebrowLabel>
        {data.visits.length === 0 ? (
          <Body size="label">{t('noVisits')}</Body>
        ) : (
          data.visits.map((v) => (
            <div key={v._id} className="flex items-center justify-between gap-3 text-sm">
              <span>{v.contractVisitDate}</span>
              <span className="text-fy-ink-soft">
                {t(`visitStatus.${v.status}` as never)} · {t('crew', { assigned: v.assignedHamaliIds.length, required: v.requiredHamaliCount })}
              </span>
              {viewer === 'leader' && ['accepted', 'in_progress'].includes(v.status) && (
                <Link href={`/mutha/assign-members?bookingId=${v._id}`} className="font-semibold text-fy-green underline shrink-0">
                  {t('assignCrew')}
                </Link>
              )}
            </div>
          ))
        )}
      </Panel>

      <Panel className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <EyebrowLabel>{t('statement')}</EyebrowLabel>
          <Field type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="max-w-[10rem]" aria-label={t('month')} />
        </div>
        {!statement || statement.lines.length === 0 ? (
          <Body size="label">{t('noCompletedVisits')}</Body>
        ) : (
          <>
            {statement.lines.map((l) => (
              <div key={l.bookingId} className="flex flex-col text-sm border-b border-fy-muted/10 pb-1.5">
                <div className="flex justify-between">
                  <span>{l.date}</span>
                  <span className="tabular-nums font-semibold">₹{l.total}</span>
                </div>
                <span className="text-xs text-fy-ink-soft">
                  {t('lineSplit', { workers: l.workerRate, fee: l.serviceFee, society: l.feeParts.society, welfare: l.feeParts.welfarePool, reserve: l.feeParts.guaranteeReserve, platform: l.feeParts.platform })}
                </span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-semibold pt-1">
              <span>{t('monthTotal', { visits: statement.totals.visits })}</span>
              <span className="tabular-nums">₹{statement.totals.total}</span>
            </div>
          </>
        )}
        {statement && statement.pendingVisits > 0 && <Body size="label">{t('pendingVisits', { count: statement.pendingVisits })}</Body>}
        <a
          href={`${API_BASE}/api/contracts/${id}/invoice?month=${month}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-body text-label font-semibold text-fy-brown underline"
        >
          {t('downloadInvoice')}
        </a>
      </Panel>

      <Panel className="flex flex-col gap-1">
        <EyebrowLabel>{t('history')}</EyebrowLabel>
        {c.history.map((h, i) => (
          <span key={i} className="text-xs text-fy-ink-soft">
            {new Date(h.at).toLocaleString('en-IN')} · {t(`status.${h.status}` as never)}
            {h.note ? ` — ${h.note}` : ''}
          </span>
        ))}
      </Panel>
    </div>
  );
}
