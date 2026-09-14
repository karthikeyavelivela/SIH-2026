'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { Body } from '@/components/fy/Text';

/**
 * The way into "How you charge", from a worker's profile.
 *
 * It carries one piece of live state deliberately: if a society floor has
 * risen past one of this worker's published rates, they are currently
 * invisible to customers, and that is not something to discover by wondering
 * why the work stopped. The warning shows here, on the screen they already
 * visit, rather than only inside the form they have no reason to open.
 */
export function PricingLink({ base }: { base: string }) {
  const t = useTranslations('pricing.worker');
  const [flagged, setFlagged] = useState(false);
  const [modeCount, setModeCount] = useState<number | null>(null);

  useEffect(() => {
    api
      .get<{ profiles: { modesOffered: string[]; societyFloorRespected: boolean }[] }>('/api/pricing/mine')
      .then((res) => {
        setFlagged(res.profiles.some((p) => !p.societyFloorRespected));
        setModeCount(res.profiles.reduce((sum, p) => sum + p.modesOffered.length, 0));
      })
      .catch(() => {});
  }, []);

  return (
    <Link href={`${base}/pricing`} className="block">
      <div className="fy-surface-card flex items-center gap-3 hover:bg-fy-well transition-colors">
        <span className="w-10 h-10 rounded-full bg-fy-brown/10 text-fy-brown flex items-center justify-center shrink-0">
          <Icon name="payments" size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-body text-body font-semibold text-fy-ink">{t('title')}</span>
          <span className="block font-body text-label text-fy-muted">
            {flagged ? t('floorBlocked') : modeCount === 0 ? t('noModes') : t('openSection')}
          </span>
        </span>
        {flagged && <Icon name="warning" size={18} className="text-fy-brown shrink-0" />}
        <Icon name="chevron_right" size={18} className="text-fy-muted shrink-0" />
      </div>
    </Link>
  );
}
