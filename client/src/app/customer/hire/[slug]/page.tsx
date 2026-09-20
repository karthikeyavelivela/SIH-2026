'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { StatutoryFloorNote, type StatutoryFloor } from '@/components/pricing/StatutoryFloorNote';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { Button, Field } from '@/components/fy/Controls';
import { StatusPill } from '@/components/fy/Status';
import { TopBar } from '@/components/fy/Navigation';
import { AddressField, type GeoPoint } from '@/components/booking/AddressField';
import { MeasurementHelper } from '@/components/pricing/MeasurementHelper';
import type { UnitType } from '@/components/pricing/UnitPicker';

/**
 * Hiring a tradesperson at their own published rate.
 *
 * The shape of this screen follows the shape of the decision: first WHO
 * (because a carpenter's rate is a carpenter's, not a market's), then HOW they
 * charge, then HOW MUCH work there is, and only then the price — with every
 * deduction named before the customer confirms anything.
 *
 * The measurement method is displayed in full next to the number it multiplies
 * and is submitted back to the server with the booking, so what freezes onto
 * the record is the sentence this customer actually read.
 */

type Mode = 'hourly' | 'per_unit' | 'per_task' | 'quotation';
const MODE_FILTERS: Mode[] = ['hourly', 'per_unit', 'per_task', 'quotation'];

interface Worker {
  workerId: string;
  name: string;
  ratingAvg?: number;
  ratingCount?: number;
  availabilityStatus?: string;
  modesOffered: Mode[];
  hourly?: { rate: number; minimumBlockHours: number; travelIncluded: boolean };
  perUnit: { unitType: UnitType; rate: number; minimumQuantity: number; description?: string }[];
  perTask: { taskSlug?: string; taskName: string; fixedPrice: number; estimatedDurationMinutes?: number }[];
  quotation?: { accepts: boolean; siteVisitFee: number; siteVisitAdjustable: boolean };
}

interface WorkFare {
  mode: Mode;
  unitType?: UnitType;
  rate: number;
  quantity: number;
  billedQuantity: number;
  minimumApplied: boolean;
  total: number;
  unitDeclaration?: string;
}

interface Disclosure {
  total: number;
  platformFee: number;
  platformRatePct: number;
  societyReserve: number;
  societyWelfare: number;
  societyRatePct: number;
  welfareRatePct: number;
  workerTakeHome: number;
  societyName?: string;
  statutoryFloor?: StatutoryFloor;
}

export default function HirePage() {
  const t = useTranslations('pricing.hire');
  const tModes = useTranslations('pricing.modes');
  const tUnits = useTranslations('pricing.units');
  const tTasks = useTranslations('pricing.tasks');
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [filter, setFilter] = useState<Mode | null>(null);
  const [chosen, setChosen] = useState<Worker | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [unitType, setUnitType] = useState<UnitType | null>(null);
  const [quantity, setQuantity] = useState('');
  const [taskName, setTaskName] = useState('');
  const [where, setWhere] = useState<GeoPoint | null>(null);
  const [fare, setFare] = useState<WorkFare | null>(null);
  const [disclosure, setDisclosure] = useState<Disclosure | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams({ categorySlug: slug });
    if (filter) query.set('mode', filter);
    api
      .get<{ workers: Worker[] }>(`/api/pricing/workers?${query.toString()}`)
      .then((res) => setWorkers(res.workers))
      .catch(() => setError(t('error')));
  }, [slug, filter, t]);

  // The live estimate. Re-quoted on every change, server-side — the client
  // never multiplies a rate by a quantity and calls it a price.
  useEffect(() => {
    if (!chosen || !mode || mode === 'quotation') {
      setFare(null);
      setDisclosure(null);
      return;
    }
    const needsQuantity = mode === 'hourly' || mode === 'per_unit';
    if (needsQuantity && (!quantity || Number(quantity) <= 0)) return;
    if (mode === 'per_unit' && !unitType) return;
    if (mode === 'per_task' && !taskName) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await api.post<{ fare: WorkFare; disclosure: Disclosure }>('/api/pricing/quote', {
          workerId: chosen.workerId,
          categorySlug: slug,
          mode,
          ...(unitType ? { unitType } : {}),
          ...(needsQuantity ? { quantity: Number(quantity) } : {}),
          ...(taskName ? { taskName } : {}),
        });
        if (!cancelled) {
          setFare(res.fare);
          setDisclosure(res.disclosure);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiClientError ? err.message : t('error'));
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chosen, mode, unitType, quantity, taskName, slug, t]);

  const unitLine = useMemo(
    () => (fare?.unitType ? tUnits(`${fare.unitType}.declaration` as never) : undefined),
    [fare?.unitType, tUnits]
  );

  function taskLabel(task: Worker['perTask'][number]) {
    if (!task.taskSlug) return task.taskName;
    const translated = tTasks(task.taskSlug as never);
    return translated.includes(task.taskSlug) ? task.taskName : translated;
  }

  function cheapestFrom(w: Worker): number | null {
    const candidates = [
      w.hourly?.rate,
      ...w.perUnit.map((u) => u.rate),
      ...w.perTask.map((task) => task.fixedPrice),
    ].filter((x): x is number => typeof x === 'number');
    return candidates.length ? Math.min(...candidates) : null;
  }

  async function confirm() {
    if (!chosen || !mode || !where) {
      setError(!where ? t('needAddress') : t('needQuantity'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const booking = await api.post<{ booking: { _id: string } }>('/api/bookings', {
        serviceCategorySlug: slug,
        workerId: chosen.workerId,
        pricingMode: mode,
        ...(unitType ? { unitType } : {}),
        ...(quantity ? { quantity: Number(quantity) } : {}),
        ...(taskName ? { taskName } : {}),
        // The exact sentence this customer read, sent back so that is what
        // freezes onto the booking and prints on the invoice.
        ...(unitLine ? { unitDeclaration: unitLine } : {}),
        region: where.region,
        cargoDetails: { weightKg: 0 },
        pickupLocation: { coordinates: [where.lng, where.lat], address: where.address },
        dropLocation: { coordinates: [where.lng, where.lat], address: where.address },
        requiredHamaliCount: 1,
      });
      router.push(`/customer/track/${booking.booking._id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------ worker list
  if (!chosen) {
    return (
      <div className="min-h-screen bg-fy-bone fy-pad-nav">
        <TopBar title={t('title')} showBack onBack={() => router.back()} />
        <main className="pt-16 px-gutter max-w-2xl mx-auto flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilter(null)}
              className={`min-h-[36px] px-3 rounded-control border font-body text-label ${
                filter === null ? 'border-fy-brown bg-fy-brown/8 text-fy-ink' : 'border-fy-brown/15 text-fy-muted'
              }`}
            >
              {t('filterAll')}
            </button>
            {MODE_FILTERS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setFilter(m)}
                className={`min-h-[36px] px-3 rounded-control border font-body text-label ${
                  filter === m ? 'border-fy-brown bg-fy-brown/8 text-fy-ink' : 'border-fy-brown/15 text-fy-muted'
                }`}
              >
                {tModes(`${m}.name` as never)}
              </button>
            ))}
          </div>

          {workers.length === 0 ? (
            <LightCard>
              <Body size="label">{t('noWorkers')}</Body>
            </LightCard>
          ) : (
            <div className="flex flex-col gap-3">
              {workers.map((w) => {
                const from = cheapestFrom(w);
                return (
                  <Panel key={w.workerId} className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <Body className="font-semibold">{w.name}</Body>
                        {typeof w.ratingAvg === 'number' && w.ratingCount ? (
                          <span className="font-mono text-[10px] text-fy-muted">
                            {w.ratingAvg.toFixed(2)} ★ · {w.ratingCount}
                          </span>
                        ) : null}
                      </span>
                      {from !== null && <StatusPill tone="lime">{t('from', { amount: from })}</StatusPill>}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {w.modesOffered.map((m) => (
                        <span
                          key={m}
                          className="px-2 py-1 rounded-full bg-fy-field font-body text-label text-fy-ink-soft"
                        >
                          {tModes(`${m}.name` as never)}
                        </span>
                      ))}
                    </div>

                    <Button
                      size="md"
                      glyph="arrow_forward"
                      onClick={() => {
                        setChosen(w);
                        setMode(w.modesOffered[0] ?? null);
                        setUnitType(w.perUnit[0]?.unitType ?? null);
                        setTaskName(w.perTask[0]?.taskName ?? '');
                        setQuantity('');
                      }}
                    >
                      {t('choose')}
                    </Button>
                  </Panel>
                );
              })}
            </div>
          )}
        </main>
      </div>
    );
  }

  // ------------------------------------------------------------ one worker
  const selectedUnit = chosen.perUnit.find((u) => u.unitType === unitType);

  return (
    <div className="min-h-screen bg-fy-bone fy-pad-nav">
      <TopBar title={chosen.name} showBack onBack={() => setChosen(null)} />
      <main className="pt-16 px-gutter max-w-2xl mx-auto flex flex-col gap-4">
        <Button variant="ghost" size="md" glyph="arrow_back" onClick={() => setChosen(null)}>
          {t('back')}
        </Button>

        <Section title={<SectionHeading>{t('modesLabel')}</SectionHeading>}>
          <div className="flex flex-wrap gap-2">
            {chosen.modesOffered.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setQuantity('');
                }}
                className={`min-h-[40px] px-3 rounded-control border font-body text-label ${
                  mode === m ? 'border-fy-brown bg-fy-brown/8 text-fy-ink' : 'border-fy-brown/15 text-fy-muted'
                }`}
              >
                {tModes(`${m}.name` as never)}
              </button>
            ))}
          </div>
        </Section>

        {mode === 'hourly' && chosen.hourly && (
          <Section title={<SectionHeading>{t('howMuch')}</SectionHeading>}>
            <Panel className="flex flex-col gap-2">
              <label className="flex flex-col gap-1">
                <EyebrowLabel>{t('hours')}</EyebrowLabel>
                <Field type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </label>
              <Body size="label">
                {t('minimumBlockNote', { hours: chosen.hourly.minimumBlockHours })}
              </Body>
              <span className="font-mono text-[10px] text-fy-muted">
                {t('rate')}: ₹{chosen.hourly.rate}
              </span>
            </Panel>
          </Section>
        )}

        {mode === 'per_unit' && (
          <Section title={<SectionHeading>{t('howMuch')}</SectionHeading>}>
            <Panel className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                {chosen.perUnit.map((u) => (
                  <button
                    key={u.unitType}
                    type="button"
                    onClick={() => setUnitType(u.unitType)}
                    className={`text-left rounded-card border p-3 ${
                      unitType === u.unitType ? 'border-fy-brown bg-fy-brown/6' : 'border-fy-brown/15'
                    }`}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block font-body text-body font-semibold text-fy-ink">
                          {tUnits(`${u.unitType}.label` as never)}
                        </span>
                        {/* The method, in full, beside the number it multiplies. */}
                        <span className="block font-body text-label text-fy-ink-soft">
                          {tUnits(`${u.unitType}.declaration` as never)}
                        </span>
                        {u.description && (
                          <span className="block font-mono text-[10px] text-fy-muted">{u.description}</span>
                        )}
                      </span>
                      <StatusPill tone="neutral">₹{u.rate}</StatusPill>
                    </span>
                  </button>
                ))}
              </div>

              {unitType && (
                <>
                  <label className="flex flex-col gap-1">
                    <EyebrowLabel>{t('quantity')}</EyebrowLabel>
                    <Field type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                  </label>
                  {selectedUnit && selectedUnit.minimumQuantity > 0 && (
                    <Body size="label">
                      {t('minimumQuantityNote', { quantity: selectedUnit.minimumQuantity })}
                    </Body>
                  )}
                  <MeasurementHelper unitType={unitType} onUse={(q) => setQuantity(String(q))} />
                </>
              )}
            </Panel>
          </Section>
        )}

        {mode === 'per_task' && (
          <Section title={<SectionHeading>{t('pickTask')}</SectionHeading>}>
            <div className="flex flex-col gap-2">
              {chosen.perTask.map((task) => (
                <button
                  key={task.taskName}
                  type="button"
                  onClick={() => setTaskName(task.taskName)}
                  className={`text-left rounded-card border p-3 flex items-center justify-between gap-3 ${
                    taskName === task.taskName ? 'border-fy-brown bg-fy-brown/6' : 'border-fy-brown/15'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block font-body text-body text-fy-ink">{taskLabel(task)}</span>
                    {task.estimatedDurationMinutes ? (
                      <span className="block font-mono text-[10px] text-fy-muted">
                        {task.estimatedDurationMinutes} min
                      </span>
                    ) : null}
                  </span>
                  {/* Fixed, and shown before it is chosen. */}
                  <StatusPill tone="lime">₹{task.fixedPrice}</StatusPill>
                </button>
              ))}
            </div>
          </Section>
        )}

        {mode === 'quotation' && chosen.quotation && (
          <Section title={<SectionHeading>{tModes('quotation.name')}</SectionHeading>}>
            <Panel className="flex flex-col gap-3">
              <Body size="label">
                {chosen.quotation.siteVisitFee > 0
                  ? t('quotationNote', { fee: chosen.quotation.siteVisitFee })
                  : t('quotationNoteFree')}
              </Body>
              {chosen.quotation.siteVisitAdjustable && chosen.quotation.siteVisitFee > 0 && (
                <span className="font-mono text-[10px] text-fy-muted">{t('visitAdjustable')}</span>
              )}
              <Button
                glyph="event"
                onClick={() =>
                  router.push(`/customer/quotations/new?worker=${chosen.workerId}&category=${slug}`)
                }
              >
                {t('quotationCta')}
              </Button>
            </Panel>
          </Section>
        )}

        {mode !== 'quotation' && (
          <>
            <Section title={<SectionHeading>{t('whereLabel')}</SectionHeading>}>
              <AddressField
                label={t('whereLabel')}
                placeholder={t('whereLabel')}
                value={where}
                onChange={setWhere}
                markerColorClass="text-fy-brown"
              />
            </Section>

            {fare && disclosure && (
              <Section title={<SectionHeading>{t('estimate')}</SectionHeading>}>
                <Panel className="flex flex-col gap-2.5 border-l-[3px] border-l-fy-brown">
                  <Row label={t('rate')} value={`₹${fare.rate}`} />
                  {fare.unitType && (
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-fy-muted">
                        {t('measured')}
                      </span>
                      <Body size="label">{unitLine}</Body>
                    </div>
                  )}
                  {(fare.mode === 'hourly' || fare.mode === 'per_unit') && (
                    <Row
                      label={t('billedAs')}
                      value={`${fare.billedQuantity}${fare.minimumApplied ? ' *' : ''}`}
                    />
                  )}

                  <div className="border-t border-fy-brown/10 pt-2.5 flex flex-col gap-1.5">
                    <EyebrowLabel>{t('breakdown')}</EyebrowLabel>
                    <Row label={t('subtotal')} value={`₹${disclosure.total}`} strong />
                    <Row
                      label={t('platformFee', { pct: disclosure.platformRatePct })}
                      value={`−₹${disclosure.platformFee}`}
                    />
                    {disclosure.societyReserve > 0 && (
                      <Row
                        label={t('societyReserve', {
                          society: disclosure.societyName ?? '',
                          pct: disclosure.societyRatePct,
                        })}
                        value={`−₹${disclosure.societyReserve}`}
                      />
                    )}
                    {disclosure.societyWelfare > 0 && (
                      <Row
                        label={t('societyWelfare', { pct: disclosure.welfareRatePct })}
                        value={`−₹${disclosure.societyWelfare}`}
                      />
                    )}
                    <Row
                      label={t('takeHome', { name: chosen.name })}
                      value={`₹${disclosure.workerTakeHome}`}
                      strong
                    />
                    <span className="font-mono text-[10px] text-fy-muted">{t('disclosureNote')}</span>
                    {/* The last line of the breakdown, after the worker's
                        take-home: the one number on this screen that is not
                        FYRO's own. Absent for a state whose notification has
                        not been entered, rather than a badge that implies a
                        check nobody ran. */}
                    {disclosure.statutoryFloor && <StatutoryFloorNote floor={disclosure.statutoryFloor} />}
                  </div>
                </Panel>
              </Section>
            )}

            {error && (
              <LightCard>
                <Body size="label">{error}</Body>
              </LightCard>
            )}

            <Button glyph="check" disabled={busy || !fare || !where} onClick={confirm}>
              {busy ? t('confirming') : t('confirm')}
            </Button>
          </>
        )}
      </main>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`font-body text-label ${strong ? 'text-fy-ink font-semibold' : 'text-fy-muted'}`}>
        {label}
      </span>
      <span className={`font-mono text-body ${strong ? 'text-fy-ink font-semibold' : 'text-fy-ink-soft'}`}>
        {value}
      </span>
    </div>
  );
}
