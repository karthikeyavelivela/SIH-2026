'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { Button, Field } from '@/components/fy/Controls';
import { StatusPill } from '@/components/fy/Status';
import { TopBar } from '@/components/fy/Navigation';
import { UnitPicker, type UnitType } from '@/components/pricing/UnitPicker';

/**
 * "How you charge" — where a worker publishes their own rates.
 *
 * Written for someone who has never used a pricing tool. Each mode is
 * explained in a sentence before it is offered, the trade's common jobs come
 * pre-listed with the band other workers charge so the task is to confirm a
 * number rather than invent one, and the society's floor sits beside every
 * control the way the federation's cap already sits beside the society's own
 * bye-law rates.
 *
 * The floor shown here is a courtesy. The API is what enforces it — a rate
 * below the floor is rejected with the floor named, never silently raised.
 */

type Mode = 'hourly' | 'per_unit' | 'per_task' | 'quotation';
const ALL_MODES: Mode[] = ['hourly', 'per_unit', 'per_task', 'quotation'];

interface UnitRow {
  unitType: UnitType | null;
  rate: string;
  minimumQuantity: string;
  description: string;
}

interface TaskRow {
  taskSlug?: string;
  taskName: string;
  fixedPrice: string;
  estimatedDurationMinutes: string;
}

interface Guide {
  suggestedModes: Mode[];
  units: { unitType: UnitType; typicalMin: number; typicalMax: number }[];
  tasks: { slug: string; typicalMin: number; typicalMax: number; estimatedDurationMinutes: number }[];
}

type Floors = Record<string, { minimumRate: number; societyName: string } | null>;

interface Profile {
  categorySlug: string;
  modesOffered: Mode[];
  hourly?: { rate: number; minimumBlockHours: number; travelIncluded: boolean };
  perUnit: { unitType: UnitType; rate: number; minimumQuantity: number; description?: string }[];
  perTask: { taskSlug?: string; taskName: string; fixedPrice: number; estimatedDurationMinutes?: number }[];
  quotation?: { accepts: boolean; siteVisitFee: number; siteVisitAdjustable: boolean; typicalTurnaroundHours?: number };
  societyFloorRespected: boolean;
}

export default function WorkerPricingScreen() {
  const t = useTranslations('pricing');
  const router = useRouter();
  const { user } = useAuth();

  const [categories, setCategories] = useState<{ slug: string; name: string }[]>([]);
  const [categorySlug, setCategorySlug] = useState('');
  const [guide, setGuide] = useState<Guide | null>(null);
  const [floors, setFloors] = useState<Floors>({});
  const [modes, setModes] = useState<Mode[]>([]);
  const [hourlyRate, setHourlyRate] = useState('');
  const [minimumBlock, setMinimumBlock] = useState('1');
  const [travelIncluded, setTravelIncluded] = useState(false);
  const [unitRows, setUnitRows] = useState<UnitRow[]>([]);
  const [taskRows, setTaskRows] = useState<TaskRow[]>([]);
  const [acceptsQuotation, setAcceptsQuotation] = useState(false);
  const [siteVisitFee, setSiteVisitFee] = useState('0');
  const [siteVisitAdjustable, setSiteVisitAdjustable] = useState(true);
  const [turnaround, setTurnaround] = useState('48');
  const [flagged, setFlagged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ categories: { slug: string; name: string }[] }>('/api/service-categories')
      .then((res) => {
        setCategories(res.categories);
        setCategorySlug((current) => current || res.categories[0]?.slug || '');
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!categorySlug) return;
    setSaved(false);
    setError(null);

    Promise.all([
      api.get<{ guide: Guide }>(`/api/pricing/guide?categorySlug=${categorySlug}`),
      api.get<{ floors: Floors }>(`/api/pricing/mine/floors?categorySlug=${categorySlug}`),
      api.get<{ profiles: Profile[] }>('/api/pricing/mine'),
    ])
      .then(([g, f, p]) => {
        setGuide(g.guide);
        setFloors(f.floors);

        const existing = p.profiles.find((x) => x.categorySlug === categorySlug);
        if (existing) {
          setModes(existing.modesOffered);
          setHourlyRate(existing.hourly?.rate ? String(existing.hourly.rate) : '');
          setMinimumBlock(String(existing.hourly?.minimumBlockHours ?? 1));
          setTravelIncluded(!!existing.hourly?.travelIncluded);
          setUnitRows(
            existing.perUnit.map((u) => ({
              unitType: u.unitType,
              rate: String(u.rate),
              minimumQuantity: String(u.minimumQuantity),
              description: u.description ?? '',
            }))
          );
          setTaskRows(
            existing.perTask.map((task) => ({
              taskSlug: task.taskSlug,
              taskName: task.taskName,
              fixedPrice: String(task.fixedPrice),
              estimatedDurationMinutes: String(task.estimatedDurationMinutes ?? ''),
            }))
          );
          setAcceptsQuotation(!!existing.quotation?.accepts);
          setSiteVisitFee(String(existing.quotation?.siteVisitFee ?? 0));
          setSiteVisitAdjustable(existing.quotation?.siteVisitAdjustable ?? true);
          setTurnaround(String(existing.quotation?.typicalTurnaroundHours ?? 48));
          setFlagged(!existing.societyFloorRespected);
        } else {
          // A worker opening this for the first time gets their trade's usual
          // modes pre-ticked, not an empty form.
          setModes(g.guide.suggestedModes.slice(0, 2));
          setHourlyRate('');
          setUnitRows([]);
          setTaskRows([]);
          setAcceptsQuotation(false);
          setFlagged(false);
        }
      })
      .catch(() => setError(t('worker.error')));
  }, [categorySlug, t]);

  function toggleMode(mode: Mode) {
    setModes((current) => (current.includes(mode) ? current.filter((m) => m !== mode) : [...current, mode]));
  }

  function floorFor(key: string) {
    return floors[key] ?? null;
  }

  function taskLabel(row: TaskRow) {
    if (!row.taskSlug) return row.taskName;
    const translated = t(`tasks.${row.taskSlug}` as never);
    return translated.includes(row.taskSlug) ? row.taskName : translated;
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.put('/api/pricing/mine', {
        categorySlug,
        modesOffered: modes,
        ...(modes.includes('hourly') && hourlyRate
          ? {
              hourly: {
                rate: Number(hourlyRate),
                minimumBlockHours: Number(minimumBlock) || 1,
                travelIncluded,
              },
            }
          : {}),
        perUnit: modes.includes('per_unit')
          ? unitRows
              .filter((r) => r.unitType && r.rate)
              .map((r) => ({
                unitType: r.unitType,
                rate: Number(r.rate),
                minimumQuantity: Number(r.minimumQuantity) || 1,
                ...(r.description ? { description: r.description } : {}),
              }))
          : [],
        perTask: modes.includes('per_task')
          ? taskRows
              .filter((r) => r.taskName && r.fixedPrice)
              .map((r) => ({
                ...(r.taskSlug ? { taskSlug: r.taskSlug } : {}),
                taskName: r.taskName,
                fixedPrice: Number(r.fixedPrice),
                ...(r.estimatedDurationMinutes
                  ? { estimatedDurationMinutes: Number(r.estimatedDurationMinutes) }
                  : {}),
              }))
          : [],
        ...(modes.includes('quotation')
          ? {
              quotation: {
                accepts: acceptsQuotation,
                siteVisitFee: Number(siteVisitFee) || 0,
                siteVisitAdjustable,
                typicalTurnaroundHours: Number(turnaround) || 48,
              },
            }
          : {}),
      });
      setSaved(true);
      setFlagged(false);
    } catch (err) {
      // The server names the floor and the society in this message — show it
      // verbatim rather than replacing it with something generic.
      setError(err instanceof ApiClientError ? err.message : t('worker.error'));
    } finally {
      setSaving(false);
    }
  }

  const availableUnits = guide?.units.map((u) => u.unitType) ?? [];

  return (
    <div className="min-h-screen bg-fy-bone fy-pad-nav">
      <TopBar title={t('worker.title')} showBack onBack={() => router.back()} />

      <main className="pt-16 px-gutter max-w-2xl mx-auto flex flex-col gap-5">
        <Body size="label">{t('worker.intro')}</Body>

        {flagged && (
          <LightCard className="flex items-start gap-2.5 border-l-[3px] border-l-fy-brown">
            <Icon name="warning" size={18} className="text-fy-brown shrink-0 mt-px" />
            <Body size="label">{t('worker.belowFloorWarning')}</Body>
          </LightCard>
        )}

        <Section title={<SectionHeading>{t('worker.pickCategory')}</SectionHeading>}>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => setCategorySlug(c.slug)}
                className={`min-h-[40px] px-3 rounded-control border font-body text-label transition-colors ${
                  categorySlug === c.slug
                    ? 'border-fy-brown bg-fy-brown/8 text-fy-ink'
                    : 'border-fy-brown/15 text-fy-muted'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </Section>

        <Section title={<SectionHeading>{t('worker.openSection')}</SectionHeading>}>
          <div className="flex flex-col gap-2">
            {ALL_MODES.map((mode) => {
              const on = modes.includes(mode);
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => toggleMode(mode)}
                  className={`text-left rounded-card border p-3 transition-colors ${
                    on ? 'border-fy-brown bg-fy-brown/6' : 'border-fy-brown/15'
                  }`}
                >
                  <span className="flex items-start gap-2.5">
                    <Icon
                      name={on ? 'check_box' : 'check_box_outline_blank'}
                      size={18}
                      className={`shrink-0 mt-0.5 ${on ? 'text-fy-brown' : 'text-fy-muted'}`}
                    />
                    <span className="min-w-0">
                      <span className="block font-body text-body font-semibold text-fy-ink">
                        {t(`modes.${mode}.name` as never)}
                      </span>
                      <span className="block font-body text-label text-fy-ink-soft">
                        {t(`modes.${mode}.blurb` as never)}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        {modes.includes('hourly') && (
          <Section title={<SectionHeading>{t('modes.hourly.name')}</SectionHeading>}>
            <Panel className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <EyebrowLabel>{t('worker.hourlyRate')}</EyebrowLabel>
                <Field type="number" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
                <FloorNote floor={floorFor('hourly')} value={hourlyRate} />
              </label>
              <label className="flex flex-col gap-1">
                <EyebrowLabel>{t('worker.minimumBlock')}</EyebrowLabel>
                <Field type="number" value={minimumBlock} onChange={(e) => setMinimumBlock(e.target.value)} />
              </label>
              <button
                type="button"
                onClick={() => setTravelIncluded((v) => !v)}
                className="flex items-center gap-2 text-left"
              >
                <Icon
                  name={travelIncluded ? 'check_box' : 'check_box_outline_blank'}
                  size={18}
                  className={travelIncluded ? 'text-fy-brown' : 'text-fy-muted'}
                />
                <Body size="label">{t('worker.travelIncluded')}</Body>
              </button>
            </Panel>
          </Section>
        )}

        {modes.includes('per_unit') && (
          <Section title={<SectionHeading>{t('modes.per_unit.name')}</SectionHeading>}>
            <div className="flex flex-col gap-3">
              {unitRows.map((row, i) => {
                const band = guide?.units.find((u) => u.unitType === row.unitType);
                return (
                  <Panel key={i} className="flex flex-col gap-3">
                    <UnitPicker
                      value={row.unitType}
                      only={availableUnits.length ? availableUnits : undefined}
                      onChange={(unit) =>
                        setUnitRows((rows) => rows.map((r, j) => (j === i ? { ...r, unitType: unit } : r)))
                      }
                    />
                    <label className="flex flex-col gap-1">
                      <EyebrowLabel>{t('worker.unitRate')}</EyebrowLabel>
                      <Field
                        type="number"
                        value={row.rate}
                        onChange={(e) =>
                          setUnitRows((rows) => rows.map((r, j) => (j === i ? { ...r, rate: e.target.value } : r)))
                        }
                      />
                      {band && (
                        <span className="font-mono text-[10px] text-fy-muted">
                          {t('worker.typicalBand', { min: band.typicalMin, max: band.typicalMax })}
                        </span>
                      )}
                      <FloorNote
                        floor={row.unitType ? floorFor(`per_unit:${row.unitType}`) : null}
                        value={row.rate}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <EyebrowLabel>{t('worker.minimumQuantity')}</EyebrowLabel>
                      <Field
                        type="number"
                        value={row.minimumQuantity}
                        onChange={(e) =>
                          setUnitRows((rows) =>
                            rows.map((r, j) => (j === i ? { ...r, minimumQuantity: e.target.value } : r))
                          )
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <EyebrowLabel>{t('worker.unitDescription')}</EyebrowLabel>
                      <Field
                        value={row.description}
                        onChange={(e) =>
                          setUnitRows((rows) =>
                            rows.map((r, j) => (j === i ? { ...r, description: e.target.value } : r))
                          )
                        }
                      />
                    </label>
                    <Button
                      variant="ghost"
                      size="md"
                      glyph="delete"
                      onClick={() => setUnitRows((rows) => rows.filter((_, j) => j !== i))}
                    >
                      {t('worker.removeRow')}
                    </Button>
                  </Panel>
                );
              })}
              <Button
                variant="ghost"
                size="md"
                glyph="add"
                onClick={() =>
                  setUnitRows((rows) => [
                    ...rows,
                    { unitType: null, rate: '', minimumQuantity: '1', description: '' },
                  ])
                }
              >
                {t('worker.addUnitRate')}
              </Button>
            </div>
          </Section>
        )}

        {modes.includes('per_task') && (
          <Section title={<SectionHeading>{t('modes.per_task.name')}</SectionHeading>}>
            <div className="flex flex-col gap-3">
              {guide && guide.tasks.length > 0 && (
                <LightCard className="flex flex-col gap-2">
                  <EyebrowLabel>{t('worker.commonTasks')}</EyebrowLabel>
                  <div className="flex flex-wrap gap-2">
                    {guide.tasks
                      .filter((task) => !taskRows.some((r) => r.taskSlug === task.slug))
                      .map((task) => (
                        <button
                          key={task.slug}
                          type="button"
                          onClick={() =>
                            setTaskRows((rows) => [
                              ...rows,
                              {
                                taskSlug: task.slug,
                                taskName: t(`tasks.${task.slug}` as never),
                                fixedPrice: String(task.typicalMin),
                                estimatedDurationMinutes: String(task.estimatedDurationMinutes),
                              },
                            ])
                          }
                          className="min-h-[36px] px-3 rounded-control border border-fy-brown/20 font-body text-label text-fy-ink"
                        >
                          + {t(`tasks.${task.slug}` as never)}
                        </button>
                      ))}
                  </div>
                </LightCard>
              )}

              {taskRows.map((row, i) => {
                const band = guide?.tasks.find((task) => task.slug === row.taskSlug);
                return (
                  <Panel key={i} className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1">
                      <EyebrowLabel>{t('worker.addTask')}</EyebrowLabel>
                      <Field
                        value={taskLabel(row)}
                        onChange={(e) =>
                          setTaskRows((rows) =>
                            rows.map((r, j) =>
                              j === i ? { ...r, taskName: e.target.value, taskSlug: undefined } : r
                            )
                          )
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <EyebrowLabel>{t('worker.taskPrice')}</EyebrowLabel>
                      <Field
                        type="number"
                        value={row.fixedPrice}
                        onChange={(e) =>
                          setTaskRows((rows) =>
                            rows.map((r, j) => (j === i ? { ...r, fixedPrice: e.target.value } : r))
                          )
                        }
                      />
                      {band && (
                        <span className="font-mono text-[10px] text-fy-muted">
                          {t('worker.typicalBand', { min: band.typicalMin, max: band.typicalMax })}
                        </span>
                      )}
                      <FloorNote floor={floorFor('per_task')} value={row.fixedPrice} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <EyebrowLabel>{t('worker.taskDuration')}</EyebrowLabel>
                      <Field
                        type="number"
                        value={row.estimatedDurationMinutes}
                        onChange={(e) =>
                          setTaskRows((rows) =>
                            rows.map((r, j) =>
                              j === i ? { ...r, estimatedDurationMinutes: e.target.value } : r
                            )
                          )
                        }
                      />
                    </label>
                    <Button
                      variant="ghost"
                      size="md"
                      glyph="delete"
                      onClick={() => setTaskRows((rows) => rows.filter((_, j) => j !== i))}
                    >
                      {t('worker.removeRow')}
                    </Button>
                  </Panel>
                );
              })}

              <Button
                variant="ghost"
                size="md"
                glyph="add"
                onClick={() =>
                  setTaskRows((rows) => [
                    ...rows,
                    { taskName: '', fixedPrice: '', estimatedDurationMinutes: '' },
                  ])
                }
              >
                {t('worker.addTask')}
              </Button>
            </div>
          </Section>
        )}

        {modes.includes('quotation') && (
          <Section title={<SectionHeading>{t('modes.quotation.name')}</SectionHeading>}>
            <Panel className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setAcceptsQuotation((v) => !v)}
                className="flex items-start gap-2 text-left"
              >
                <Icon
                  name={acceptsQuotation ? 'check_box' : 'check_box_outline_blank'}
                  size={18}
                  className={`shrink-0 mt-0.5 ${acceptsQuotation ? 'text-fy-brown' : 'text-fy-muted'}`}
                />
                <Body size="label">{t('worker.acceptsQuotation')}</Body>
              </button>
              <label className="flex flex-col gap-1">
                <EyebrowLabel>{t('worker.siteVisitFee')}</EyebrowLabel>
                <Field type="number" value={siteVisitFee} onChange={(e) => setSiteVisitFee(e.target.value)} />
              </label>
              <button
                type="button"
                onClick={() => setSiteVisitAdjustable((v) => !v)}
                className="flex items-start gap-2 text-left"
              >
                <Icon
                  name={siteVisitAdjustable ? 'check_box' : 'check_box_outline_blank'}
                  size={18}
                  className={`shrink-0 mt-0.5 ${siteVisitAdjustable ? 'text-fy-brown' : 'text-fy-muted'}`}
                />
                <Body size="label">{t('worker.siteVisitAdjustable')}</Body>
              </button>
              <label className="flex flex-col gap-1">
                <EyebrowLabel>{t('worker.turnaround')}</EyebrowLabel>
                <Field type="number" value={turnaround} onChange={(e) => setTurnaround(e.target.value)} />
              </label>
            </Panel>
          </Section>
        )}

        {error && (
          <LightCard className="border-l-[3px] border-l-fy-brown">
            <Body size="label">{error}</Body>
          </LightCard>
        )}
        {saved && (
          <LightCard className="flex items-center gap-2.5">
            <Icon name="check_circle" size={18} className="text-fy-green" />
            <Body size="label">{t('worker.saved')}</Body>
          </LightCard>
        )}

        <Button glyph="check" disabled={saving || modes.length === 0} onClick={save}>
          {saving ? t('worker.saving') : t('worker.save')}
        </Button>
        {modes.length === 0 && <Body size="label">{t('worker.noModes')}</Body>}

        {!user && <span className="sr-only">signed out</span>}
      </main>
    </div>
  );
}

/**
 * The society's floor, beside the control it binds.
 *
 * Shown the same way the federation's cap is already shown beside a society's
 * bye-law rates — as a fact about the control, not a validation error that
 * appears only after a failed save.
 */
function FloorNote({
  floor,
  value,
}: {
  floor: { minimumRate: number; societyName: string } | null;
  value: string;
}) {
  const t = useTranslations('pricing.worker');
  if (!floor) return <span className="font-mono text-[10px] text-fy-muted">{t('noFloor')}</span>;

  const below = value !== '' && Number(value) < floor.minimumRate;
  return (
    <span className={`font-mono text-[10px] ${below ? 'text-fy-brown font-semibold' : 'text-fy-muted'}`}>
      {t('floorLabel', { rate: floor.minimumRate })}
      {below ? ` · ${t('floorBlocked')}` : ''}
    </span>
  );
}
