'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { useAuth } from '@/lib/auth-context';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Section, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { Chip, ChipRow } from '@/components/fy/Controls';
import { TopBar } from '@/components/fy/Navigation';
import { LoadBoardCard, type LoadBoardBooking, type LoadBoardBid } from './LoadBoardCard';

/* Built against client/public/design/worker_load_board.html.

   Section order there, top to bottom: 64px brand bar with the MEMBER pill
   -> a corridor eyebrow -> "Open Load Board" heading and blurb -> a stat
   strip -> filter chips (All / Heavy freight 3T+ / Local tempo /
   Agricultural mandi) -> "Available hauls (N verified)" list -> 5-tab bar.

   Largest element: the heading. Dark surfaces: none; each haul is a white
   panel on bone.

   The design's stat strip also shows a diesel floor rate and a "+14% vs
   yesterday" trend. Neither exists: nothing tracks fuel prices and nothing
   stores a day-over-day load count, so the strip carries the two figures
   that are real — how many loads are open, and how many of them you have
   already bid on.

   The server decides which type (truck vs hamali) the caller is eligible
   for from their role alone, so this component sends nothing role-specific. */

type Filter = 'all' | 'heavy' | 'local' | 'mandi';

/** 3T, matching the design's "Heavy Freight (3T+)" chip. */
const HEAVY_KG = 3000;
/** Under this, the design calls it a local tempo run. */
const LOCAL_KM = 50;

export function LoadBoardPage({ accent = 'primary' }: { accent?: 'primary' | 'secondary' }) {
  const t = useTranslations('loadBoard');
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');
  const { data, state, reload, setData } = usePolling(
    () => api.get<{ loads: LoadBoardBooking[] }>('/api/loadboard'),
    8000
  );

  async function placeBid(bookingId: string, amount: number, message?: string) {
    const res = await api.post<{ bid: LoadBoardBid }>(`/api/loadboard/${bookingId}/bids`, { amount, message });
    setData((prev) => (prev ? { loads: prev.loads.map((l) => (l._id === bookingId ? { ...l, myBid: res.bid } : l)) } : prev));
  }

  async function withdrawBid(bookingId: string, bidId: string) {
    await api.post(`/api/loadboard/${bookingId}/bids/${bidId}/withdraw`);
    setData((prev) => (prev ? { loads: prev.loads.map((l) => (l._id === bookingId ? { ...l, myBid: null } : l)) } : prev));
    await reload();
  }

  const loads = useMemo(() => data?.loads ?? [], [data]);

  function matches(l: LoadBoardBooking, f: Filter) {
    if (f === 'all') return true;
    const kg = l.cargoDetails?.weightKg ?? 0;
    if (f === 'heavy') return kg >= HEAVY_KG;
    if (f === 'local') return l.distanceKm > 0 && l.distanceKm <= LOCAL_KM;
    return l.cargoDetails?.goodsType === 'perishables';
  }

  const counts = useMemo(() => {
    const out = {} as Record<Filter, number>;
    for (const f of ['all', 'heavy', 'local', 'mandi'] as Filter[]) out[f] = loads.filter((l) => matches(l, f)).length;
    return out;
  }, [loads]);

  const visible = loads.filter((l) => matches(l, filter));
  const myBidCount = loads.filter((l) => l.myBid).length;

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar
        eyebrow="FYRO Cooperative"
        title={t('pageTitle')}
        showBack
        actions={user?.accountStatus === 'active' ? <StatusPill tone="lime">{t('memberPill')}</StatusPill> : undefined}
      />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <div className="pt-2">
          <EyebrowLabel tone={accent === 'primary' ? 'brown' : 'green'}>{t('corridorEyebrow')}</EyebrowLabel>
          <h2 className="font-heading text-heading text-fy-ink leading-[1.05]">{t('heading')}</h2>
          <Body className="mt-1.5">{t('subtitle')}</Body>
        </div>

        {/* Two real figures. The design's diesel floor rate and day-over-day
            trend have no source behind them. */}
        <div className="grid grid-cols-2 gap-3">
          <LightCard className="flex items-center gap-3">
            <IconTile tone={accent === 'primary' ? 'peach' : 'lime'} size="sm">
              <Icon name="local_shipping" size={18} />
            </IconTile>
            <div className="min-w-0">
              <p className="font-heading text-title text-fy-ink leading-none">{loads.length}</p>
              <EyebrowLabel>{t('openLoads')}</EyebrowLabel>
            </div>
          </LightCard>
          <LightCard className="flex items-center gap-3">
            <IconTile tone="slate-pale" size="sm">
              <Icon name="gavel" size={18} />
            </IconTile>
            <div className="min-w-0">
              <p className="font-heading text-title text-fy-ink leading-none">{myBidCount}</p>
              <EyebrowLabel>{t('yourOpenBids')}</EyebrowLabel>
            </div>
          </LightCard>
        </div>

        <ChipRow>
          {(['all', 'heavy', 'local', 'mandi'] as Filter[]).map((f) => (
            <Chip
              key={f}
              type="button"
              shape="round"
              accent={accent === 'primary' ? 'brown' : 'lime'}
              active={filter === f}
              onClick={() => setFilter(f)}
            >
              {t(`filters.${f}`)} ({counts[f] ?? 0})
            </Chip>
          ))}
        </ChipRow>

        <Section
          title={<SectionHeading>{t('availableHauls')}</SectionHeading>}
          aside={<EyebrowLabel>{t('haulCount', { count: visible.length })}</EyebrowLabel>}
        >
          {state === 'loading' && (
            <div className="flex flex-col gap-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-40 rounded-card bg-fy-panel animate-pulse" />
              ))}
            </div>
          )}

          {state !== 'loading' && visible.length === 0 && (
            <LightCard>
              <EmptyState
                title={loads.length === 0 ? t('noLoads') : t('noneInFilter')}
                description={loads.length === 0 ? t('noLoadsHint') : undefined}
              />
            </LightCard>
          )}

          {visible.map((l) => (
            <LoadBoardCard key={l._id} booking={l} accent={accent} onBid={placeBid} onWithdraw={withdrawBid} />
          ))}
        </Section>
      </main>
    </div>
  );
}
