'use client';

import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/Icon';
import { Panel } from '@/components/fy/Surfaces';
import { SectionHeading, Body } from '@/components/fy/Text';
import { Button } from '@/components/fy/Controls';

/**
 * What the service worker shows when the network is gone.
 *
 * It deliberately does not pretend to have data. FYRO's screens are live —
 * where the truck is, what the job pays, whether the document was approved —
 * and a cached copy of any of those would be a confident lie. So this page
 * says the one true thing and offers the one useful action.
 */
export default function OfflinePage() {
  const t = useTranslations('pwa');

  return (
    <div className="min-h-screen bg-fy-bone flex items-center justify-center px-gutter">
      <Panel className="max-w-sm w-full flex flex-col items-center gap-4 text-center py-8">
        <span className="w-14 h-14 rounded-full bg-fy-brown/10 text-fy-brown flex items-center justify-center">
          <Icon name="wifi_off" size={26} />
        </span>
        <SectionHeading>{t('offlineTitle')}</SectionHeading>
        <Body size="label">{t('offlineBody')}</Body>
        <Button glyph="refresh" onClick={() => window.location.reload()}>
          {t('retry')}
        </Button>
      </Panel>
    </div>
  );
}
