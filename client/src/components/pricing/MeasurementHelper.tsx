'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/Icon';
import { LightCard } from '@/components/fy/Surfaces';
import { EyebrowLabel, Body } from '@/components/fy/Text';
import { Button, Field } from '@/components/fy/Controls';
import type { UnitType } from '@/components/pricing/UnitPicker';

/**
 * Helps a customer work out their own measurement.
 *
 * Asking somebody "how many square feet is your wardrobe?" is asking them to
 * do arithmetic they have no reason to know, and a wrong answer here is a
 * wrong bill. So the helper asks for the two numbers anyone can measure with
 * a tape — height and width — and does the multiplication in front of them.
 *
 * For developed area it also asks how many internal shelves there are, and
 * shows the result growing as they add them. That is the clearest possible
 * demonstration of why the two square-foot rates are not the same rate, at
 * exactly the moment it matters.
 *
 * For per-point work it counts fittings instead, because that is what a point
 * is.
 */
export function MeasurementHelper({
  unitType,
  onUse,
}: {
  unitType: UnitType;
  onUse: (quantity: number) => void;
}) {
  const t = useTranslations('pricing.hire');
  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState('');
  const [width, setWidth] = useState('');
  const [shelves, setShelves] = useState('0');
  const [lights, setLights] = useState('0');
  const [fans, setFans] = useState('0');
  const [sockets, setSockets] = useState('0');

  const isArea = unitType === 'sq_ft_face' || unitType === 'sq_ft_developed';
  const isPoints = unitType === 'per_point';
  if (!isArea && !isPoints) return null;

  const faceArea = (Number(height) || 0) * (Number(width) || 0);
  // A shelf is measured as its own surface: the same width, and the depth a
  // wardrobe shelf typically has. This is an estimate the customer can edit,
  // not a claim about their furniture.
  const shelfArea = (Number(shelves) || 0) * (Number(width) || 0) * 1.5;
  const area = unitType === 'sq_ft_developed' ? faceArea + shelfArea : faceArea;
  const points = (Number(lights) || 0) + (Number(fans) || 0) + (Number(sockets) || 0);
  const value = isArea ? Math.round(area * 10) / 10 : points;

  if (!open) {
    return (
      <Button variant="ghost" size="md" glyph="straighten" onClick={() => setOpen(true)}>
        {t('measureHelper')}
      </Button>
    );
  }

  return (
    <LightCard className="flex flex-col gap-3">
      <EyebrowLabel>{t('measureHelper')}</EyebrowLabel>

      {isArea ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="font-body text-label text-fy-muted">{t('helperHeight')}</span>
              <Field type="number" value={height} onChange={(e) => setHeight(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-body text-label text-fy-muted">{t('helperWidth')}</span>
              <Field type="number" value={width} onChange={(e) => setWidth(e.target.value)} />
            </label>
          </div>
          {unitType === 'sq_ft_developed' && (
            <label className="flex flex-col gap-1">
              <span className="font-body text-label text-fy-muted">{t('helperShelves')}</span>
              <Field type="number" value={shelves} onChange={(e) => setShelves(e.target.value)} />
            </label>
          )}
          <Body size="label">
            {unitType === 'sq_ft_developed' ? t('helperDevelopedNote') : t('helperFaceNote')}
          </Body>
        </>
      ) : (
        <>
          <span className="font-body text-label text-fy-muted">{t('helperPoints')}</span>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1">
              <span className="font-body text-label text-fy-muted">{t('helperLights')}</span>
              <Field type="number" value={lights} onChange={(e) => setLights(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-body text-label text-fy-muted">{t('helperFans')}</span>
              <Field type="number" value={fans} onChange={(e) => setFans(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-body text-label text-fy-muted">{t('helperSockets')}</span>
              <Field type="number" value={sockets} onChange={(e) => setSockets(e.target.value)} />
            </label>
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-fy-brown/10 pt-2.5">
        <span className="flex items-center gap-2 min-w-0">
          <Icon name="calculate" size={16} className="text-fy-brown shrink-0" />
          <Body size="label">{t('helperResult', { value })}</Body>
        </span>
        <Button
          size="md"
          glyph="check"
          disabled={value <= 0}
          onClick={() => {
            onUse(value);
            setOpen(false);
          }}
        >
          {t('helperUse')}
        </Button>
      </div>
    </LightCard>
  );
}
