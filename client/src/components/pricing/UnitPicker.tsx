'use client';

import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/Icon';
import { Body, EyebrowLabel } from '@/components/fy/Text';

export const UNIT_TYPES = [
  'sq_ft_face',
  'sq_ft_developed',
  'per_point',
  'per_running_ft',
  'per_item',
] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

/**
 * The choice this whole feature exists to force.
 *
 * "₹300 per sq ft" is genuinely ambiguous in Indian carpentry: the front face
 * of a wardrobe, or the developed area counting every internal shelf — a
 * difference of up to 40% of the bill, and the most common cause of real
 * disputes in the trade. So this is not a dropdown with five entries that
 * look alike. Each option shows its full declaration and a worked example, the
 * two square-foot options sit side by side where the difference is visible,
 * and nothing is selected by default — a worker has to choose.
 *
 * The same component serves the customer's side, read-only, so both parties
 * are looking at identical words.
 */
export function UnitPicker({
  value,
  onChange,
  only,
  readOnly = false,
}: {
  value: UnitType | null;
  onChange?: (unit: UnitType) => void;
  /** Restrict to the units this trade actually uses. */
  only?: readonly UnitType[];
  readOnly?: boolean;
}) {
  const t = useTranslations('pricing');
  const options = only && only.length > 0 ? only : UNIT_TYPES;
  const showsBothSqFt = options.includes('sq_ft_face') && options.includes('sq_ft_developed');

  return (
    <div className="flex flex-col gap-2">
      {!readOnly && (
        <EyebrowLabel>{t('worker.chooseUnit')}</EyebrowLabel>
      )}

      <div className="flex flex-col gap-2">
        {options.map((unit) => {
          const selected = value === unit;
          return (
            <button
              key={unit}
              type="button"
              disabled={readOnly}
              onClick={() => onChange?.(unit)}
              className={`text-left rounded-card border p-3 transition-colors ${
                selected ? 'border-fy-brown bg-fy-brown/6' : 'border-fy-brown/15 hover:border-fy-brown/35'
              } ${readOnly ? 'cursor-default' : ''}`}
            >
              <span className="flex items-start gap-2.5">
                <Icon
                  name={selected ? 'radio_button_checked' : 'radio_button_unchecked'}
                  size={18}
                  className={`shrink-0 mt-0.5 ${selected ? 'text-fy-brown' : 'text-fy-muted'}`}
                />
                <span className="min-w-0 flex flex-col gap-1">
                  <span className="font-body text-body font-semibold text-fy-ink">
                    {t(`units.${unit}.label` as never)}
                  </span>
                  <span className="font-body text-label text-fy-ink-soft">
                    {t(`units.${unit}.declaration` as never)}
                  </span>
                  <span className="font-mono text-[10px] text-fy-muted">
                    {t(`units.${unit}.help` as never)}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {showsBothSqFt && !readOnly && (
        <p className="flex items-start gap-2 font-body text-eyebrow text-fy-brown">
          <Icon name="info" size={14} className="shrink-0 mt-0.5" />
          {t('worker.unitWarning')}
        </p>
      )}
    </div>
  );
}
