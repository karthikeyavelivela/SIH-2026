'use client';

import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/Icon';
import { IconTile, Panel } from '@/components/fy/Surfaces';
import { EyebrowLabel, Body } from '@/components/fy/Text';
import { Stepper } from '@/components/fy/Controls';

/**
 * The combo add-on, entered from either side.
 *
 * Moving goods usually needs both a lorry and hands to load it, and a
 * customer arrives having thought of one of the two. So Transit offers
 * "add loading workers" and Hamali offers "also need a truck", and both
 * produce the SAME record: one booking of `type: 'combo'`, carrying a
 * vehicle requirement and a crew requirement, priced once and dispatched to
 * two parties who are tracked together.
 *
 * One component rather than two similar-looking blocks, because the failure
 * mode of two is that they drift: one gains a minimum crew size, the other
 * does not; one updates the quote immediately, the other on blur; and six
 * months later they are two features that happen to share a name. What
 * differs between the two entry points is the sentence and which control is
 * shown — which is all this takes as props.
 */
export function ComboAddOn({
  side,
  enabled,
  onToggle,
  crewSize,
  onCrewSize,
  weightKg,
  onWeightKg,
  vehicleClassLabel,
}: {
  /** 'crew' adds loading workers to a truck booking; 'truck' adds a truck to a crew booking. */
  side: 'crew' | 'truck';
  enabled: boolean;
  onToggle: (next: boolean) => void;
  crewSize: number;
  onCrewSize: (n: number) => void;
  /** Only used by the 'truck' side, where the customer has to say how heavy the load is. */
  weightKg?: number;
  onWeightKg?: (kg: number) => void;
  /** Which vehicle class that weight buckets into, so the customer sees what they are getting. */
  vehicleClassLabel?: string;
}) {
  const t = useTranslations('combo');

  return (
    <>
      <button
        type="button"
        onClick={() => onToggle(!enabled)}
        aria-pressed={enabled}
        className={`w-full rounded-card p-4 flex items-center justify-between gap-3 text-left transition-colors ${
          enabled ? 'bg-fy-lime text-fy-on-lime' : 'bg-fy-lime-tint-2 text-fy-ink'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <IconTile tone="green">
            <Icon name={side === 'crew' ? 'engineering' : 'local_shipping'} size={20} />
          </IconTile>
          <div className="min-w-0">
            <p className="font-body text-body font-semibold">{t(`${side}.title`)}</p>
            <p className="font-body text-label text-fy-green">{t(`${side}.hint`)}</p>
          </div>
        </div>
        <Icon name={enabled ? 'check_circle' : 'add_circle'} size={22} className="shrink-0 text-fy-green" />
      </button>

      {enabled && (
        <Panel className="flex flex-col gap-3">
          {side === 'crew' ? (
            <>
              <EyebrowLabel>{t('crewSize')}</EyebrowLabel>
              <Stepper value={crewSize} onChange={onCrewSize} min={1} max={20} label={t('handlers')} />
            </>
          ) : (
            <>
              <EyebrowLabel>{t('loadWeight')}</EyebrowLabel>
              <input
                type="range"
                min={100}
                max={15000}
                step={100}
                value={weightKg ?? 500}
                onChange={(e) => onWeightKg?.(Number(e.target.value))}
                className="w-full accent-fy-green"
                aria-label={t('loadWeight')}
              />
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-heading text-title text-fy-ink">
                  {t('kg', { kg: (weightKg ?? 500).toLocaleString('en-IN') })}
                </span>
                {vehicleClassLabel && <EyebrowLabel>{vehicleClassLabel}</EyebrowLabel>}
              </div>
            </>
          )}

          {/* Said plainly, because a combo booking behaves differently from
              the one the customer started: two parties accept it, and it is
              not offered on the bidding board. */}
          <Body size="label">{t('oneBooking')}</Body>
        </Panel>
      )}
    </>
  );
}
