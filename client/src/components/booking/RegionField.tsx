'use client';

import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/Icon';
import { EyebrowLabel, Body } from '@/components/fy/Text';
import { Field } from '@/components/fy/Controls';

/**
 * "Priced for" — the district a booking's fare rules are looked up under.
 *
 * It was a plain labelled input on four screens with four copies of the
 * same strings, and when the geocoder could not classify the pickup it sat
 * silently empty. That is the one state where the customer has to act, and
 * it was the one state that said nothing: the booking then came back "No
 * active fare rule for /vehicle_large", an empty slug in front of a slash,
 * which reads like a missing tariff rather than a missing district.
 *
 * So the empty case is now the loud one. The value itself is still fully
 * correctable when it IS derived — the server never cross-checks the region
 * against the pickup's coordinates, so someone who knows their address sits
 * in the next district over can say so.
 */
export function RegionField({
  value,
  onChange,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const t = useTranslations('regionField');
  const missing = !value.trim();

  return (
    <div className={className}>
      <EyebrowLabel>{t('label')}</EyebrowLabel>
      <Field
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('placeholder')}
        aria-invalid={missing || undefined}
      />
      {missing ? (
        <span className="mt-1 flex items-start gap-1.5 text-fy-brown">
          <Icon name="error" size={14} className="shrink-0 mt-px" />
          <span className="font-body text-label">{t('missing')}</span>
        </span>
      ) : (
        <Body size="label" className="mt-1">
          {t('hint')}
        </Body>
      )}
    </div>
  );
}
