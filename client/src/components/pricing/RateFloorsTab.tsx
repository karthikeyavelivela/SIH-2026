'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { Button, Field } from '@/components/fy/Controls';
import { StatusPill } from '@/components/fy/Status';
import { UNIT_TYPES, type UnitType } from '@/components/pricing/UnitPicker';

/**
 * The society's rate floors — the fair-wage lever, in the governance console.
 *
 * It sits beside the bye-law rates because it is the same kind of instrument:
 * a rule the society sets for itself, bounded above by the federation, and
 * binding on every member. The difference is direction. A bye-law rate is the
 * most the society takes from a member; a floor is the least a member may
 * charge a customer.
 *
 * The screen states the consequence honestly. Raising a floor above what
 * members currently publish takes them off the customer-facing list until
 * they re-price, and the response says how many that is — so a leader learns
 * it at the moment of the decision rather than from members asking why the
 * work stopped.
 */

type Mode = 'hourly' | 'per_unit' | 'per_task';
const MODES: Mode[] = ['hourly', 'per_unit', 'per_task'];

interface Floor {
  _id: string;
  categorySlug: string;
  mode: Mode;
  unitType?: UnitType;
  minimumRate: number;
  updatedAt: string;
}

export function RateFloorsTab() {
  const t = useTranslations('pricing.floors');
  const tUnits = useTranslations('pricing.units');
  const tModes = useTranslations('pricing.modes');

  const [categories, setCategories] = useState<{ slug: string; name: string }[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [societyName, setSocietyName] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [mode, setMode] = useState<Mode>('hourly');
  const [unitType, setUnitType] = useState<UnitType>('sq_ft_face');
  const [minimumRate, setMinimumRate] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ flagged: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [cats, mine] = await Promise.all([
        api.get<{ categories: { slug: string; name: string }[] }>('/api/service-categories'),
        api.get<{ societyName: string; floors: Floor[] }>('/api/pricing/society/floors'),
      ]);
      setCategories(cats.categories);
      setCategorySlug((c) => c || cats.categories[0]?.slug || '');
      setFloors(mine.floors);
      setSocietyName(mine.societyName);
    } catch {
      setError(t('loadError'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.put<{ membersNowBelowFloor: number }>('/api/pricing/society/floors', {
        categorySlug,
        mode,
        ...(mode === 'per_unit' ? { unitType } : {}),
        minimumRate: Number(minimumRate),
      });
      setResult({ flagged: res.membersNowBelowFloor });
      setMinimumRate('');
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  function categoryName(slug: string) {
    return categories.find((c) => c.slug === slug)?.name ?? slug;
  }

  return (
    <div className="flex flex-col gap-4">
      <LightCard className="flex items-start gap-2.5 border-l-[3px] border-l-fy-green">
        <Icon name="shield" size={18} className="text-fy-green shrink-0 mt-px" />
        <Body size="label">{t('intro', { society: societyName || t('yourSociety') })}</Body>
      </LightCard>

      <Section
        title={<SectionHeading>{t('current')}</SectionHeading>}
        aside={<EyebrowLabel>{t('count', { count: floors.length })}</EyebrowLabel>}
      >
        {floors.length === 0 ? (
          <LightCard>
            <Body size="label">{t('none')}</Body>
          </LightCard>
        ) : (
          <div className="flex flex-col gap-2">
            {floors.map((f) => (
              <LightCard key={f._id} className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <Body size="label" className="font-semibold">
                    {categoryName(f.categorySlug)}
                  </Body>
                  <span className="block font-body text-label text-fy-muted">
                    {f.mode === 'per_unit' && f.unitType
                      ? tUnits(`${f.unitType}.label` as never)
                      : tModes(`${f.mode}.name` as never)}
                  </span>
                </span>
                <StatusPill tone="lime">₹{f.minimumRate}</StatusPill>
              </LightCard>
            ))}
          </div>
        )}
      </Section>

      <Section title={<SectionHeading>{t('setHeading')}</SectionHeading>}>
        <Panel className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <EyebrowLabel>{t('category')}</EyebrowLabel>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => setCategorySlug(c.slug)}
                  className={`min-h-[36px] px-3 rounded-control border font-body text-label ${
                    categorySlug === c.slug
                      ? 'border-fy-brown bg-fy-brown/8 text-fy-ink'
                      : 'border-fy-brown/15 text-fy-muted'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <EyebrowLabel>{t('mode')}</EyebrowLabel>
            <div className="flex flex-wrap gap-2">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`min-h-[36px] px-3 rounded-control border font-body text-label ${
                    mode === m ? 'border-fy-brown bg-fy-brown/8 text-fy-ink' : 'border-fy-brown/15 text-fy-muted'
                  }`}
                >
                  {tModes(`${m}.name` as never)}
                </button>
              ))}
            </div>
          </label>

          {mode === 'per_unit' && (
            <label className="flex flex-col gap-1">
              <EyebrowLabel>{t('unit')}</EyebrowLabel>
              <div className="flex flex-col gap-1.5">
                {UNIT_TYPES.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnitType(u)}
                    className={`text-left min-h-[36px] px-3 py-2 rounded-control border font-body text-label ${
                      unitType === u ? 'border-fy-brown bg-fy-brown/8 text-fy-ink' : 'border-fy-brown/15 text-fy-muted'
                    }`}
                  >
                    {tUnits(`${u}.label` as never)}
                  </button>
                ))}
              </div>
              {/* A floor on one square-foot definition says nothing about the
                  other — they measure different things. */}
              <span className="font-mono text-[10px] text-fy-muted">{t('unitNote')}</span>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <EyebrowLabel>{t('minimum')}</EyebrowLabel>
            <Field type="number" value={minimumRate} onChange={(e) => setMinimumRate(e.target.value)} />
          </label>

          <Body size="label">{t('consequence')}</Body>

          <Button glyph="shield" disabled={saving || !minimumRate || !categorySlug} onClick={save}>
            {saving ? t('saving') : t('save')}
          </Button>

          {result && (
            <LightCard className="flex items-start gap-2.5">
              <Icon name="info" size={18} className="text-fy-brown shrink-0 mt-px" />
              <Body size="label">
                {result.flagged === 0 ? t('savedNoneAffected') : t('savedAffected', { count: result.flagged })}
              </Body>
            </LightCard>
          )}
          {error && (
            <LightCard>
              <Body size="label">{error}</Body>
            </LightCard>
          )}
        </Panel>
      </Section>
    </div>
  );
}
