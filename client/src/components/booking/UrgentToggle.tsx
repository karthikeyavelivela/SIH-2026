'use client';

import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/Icon';

/**
 * P1.4 — "I need someone now". Offered first to the nearest workers, in
 * widening rings, with a shorter countdown. No extra charge, and the screen
 * says so, because an urgent button that quietly costs more is the pattern
 * this platform exists to avoid.
 */
export function UrgentToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const t = useTranslations('urgent');
  return (
    <label className="flex items-start gap-3 rounded-control border border-fy-muted/20 bg-fy-bone px-3.5 py-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 accent-fy-brown"
      />
      <span className="flex flex-col gap-0.5">
        <span className="font-body text-label font-semibold text-fy-ink">{t('toggle')}</span>
        <span className="font-body text-xs text-fy-muted">{t('toggleHint')}</span>
      </span>
    </label>
  );
}

/** The worker-side badge on an urgent job or offer. */
export function UrgentBadge() {
  const t = useTranslations('urgent');
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-fy-peach/80 px-2 py-0.5 font-body text-[11px] font-bold uppercase tracking-wide text-fy-ink">
      <Icon name="bolt" size={12} />
      {t('badge')}
    </span>
  );
}
