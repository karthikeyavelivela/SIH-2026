'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useApiState } from '@/lib/useApiState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { StatRow } from '@/components/fy/Data';
import { Button, Chip, ChipRow, SearchField } from '@/components/fy/Controls';
import { TopBar } from '@/components/fy/Navigation';

/* Built against client/public/design/booking_history_1.html.

   Section order there, top to bottom: 64px brand bar -> "Cooperative
   Ledger & Archive" heading -> search field + filter chips with live
   counts -> the latest dispatch as a full card (status pill, reference,
   service, worker, address, fare, and two actions) -> the remaining
   dispatches as expandable ledger rows, each opening an audit block ->
   bottom bar.

   Largest element: the page heading. Dark surfaces: none. Brown is the
   accent on the primary action; lime marks a sealed/completed record.

   The design's audit block prints a sha256 ledger digest, a crew-share
   percentage and a welfare-fund figure. A booking carries none of those
   — see the comment at the audit block for what is shown instead. */

interface BookingSummary {
  _id: string;
  type: 'truck' | 'hamali' | 'combo';
  status: string;
  fareBreakdown: { baseFare: number; distanceFare: number; hamaliFare: number; surgeMultiplier: number; total: number };
  pickupLocation: { address: string };
  dropLocation: { address: string };
  serviceCategorySlug?: string;
  createdAt: string;
}

type Filter = 'all' | 'household' | 'labour' | 'transport' | 'month';

const FILTERS: Filter[] = ['all', 'household', 'labour', 'transport', 'month'];

/** Sealed = the record is final and can no longer change. */
function isSealed(status: string) {
  return status === 'completed' || status === 'cancelled';
}

function short(address: string) {
  return address.split(',')[0];
}

export default function CustomerHistoryPage() {
  const t = useTranslations('customerHistory');
  const th = useTranslations('customerLedger');
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const state = useApiState(
    () => api.get<{ bookings: BookingSummary[] }>('/api/bookings').then((r) => r.bookings),
    []
  );
  const bookings = useMemo(() => state.data ?? [], [state.data]);

  // Bucketed the same way the booking screens are: general_labour is the
  // hamali crew category, anything vehicle-dispatched is transit, the rest
  // are household trades.
  function bucketOf(b: BookingSummary): Filter {
    if (b.serviceCategorySlug === 'general_labour' || b.type === 'hamali') return 'labour';
    if (b.type === 'truck' || b.type === 'combo') return 'transport';
    return 'household';
  }

  const startOfMonth = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }, []);

  function matchesFilter(b: BookingSummary, f: Filter) {
    if (f === 'all') return true;
    if (f === 'month') return new Date(b.createdAt).getTime() >= startOfMonth;
    return bucketOf(b) === f;
  }

  const counts = useMemo(() => {
    const out = {} as Record<Filter, number>;
    for (const f of FILTERS) out[f] = bookings.filter((b) => matchesFilter(b, f)).length;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, startOfMonth]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookings
      .filter((b) => matchesFilter(b, filter))
      .filter(
        (b) =>
          !q ||
          b.pickupLocation.address.toLowerCase().includes(q) ||
          b.dropLocation.address.toLowerCase().includes(q) ||
          (b.serviceCategorySlug ?? '').toLowerCase().includes(q)
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, filter, query, startOfMonth]);

  const [latest, ...rest] = visible;

  function dateLine(b: BookingSummary) {
    return new Date(b.createdAt).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar eyebrow="FYRO Cooperative" title={th('title')} showBack />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <div className="pt-2">
          <EyebrowLabel>{th('eyebrow')}</EyebrowLabel>
          <h2 className="font-heading text-heading text-fy-ink leading-[1.05]">{th('heading')}</h2>
        </div>

        <SearchField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={th('searchPlaceholder')}
          trailingGlyph={query ? 'close' : undefined}
          onTrailingClick={() => setQuery('')}
        />

        <ChipRow>
          {FILTERS.map((f) => (
            <Chip key={f} type="button" shape="round" active={filter === f} onClick={() => setFilter(f)}>
              {th(`filters.${f}`)} ({counts[f] ?? 0})
            </Chip>
          ))}
        </ChipRow>

        {state.status === 'loading' && <Skeleton lines={4} className="h-16" />}
        {state.status === 'error' && <ErrorState onRetry={state.reload} />}
        {state.status !== 'loading' && bookings.length === 0 && (
          <LightCard>
            <EmptyState
              title={t('emptyTitle')}
              description={t('emptyDescription')}
              action={
                <Link href="/customer/dashboard" className="font-body text-label font-semibold text-fy-brown hover:underline">
                  {t('bookFirst')}
                </Link>
              }
            />
          </LightCard>
        )}
        {bookings.length > 0 && visible.length === 0 && (
          <LightCard>
            <Body size="label">{th('noMatches')}</Body>
          </LightCard>
        )}

        {latest && (
          <Section title={<EyebrowLabel>{th('latestDispatch')}</EyebrowLabel>}>
            <Panel className="p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <EyebrowLabel>
                    {th(`bucket.${bucketOf(latest)}`)} · {th('ref', { id: latest._id.slice(-6).toUpperCase() })}
                  </EyebrowLabel>
                  <SectionHeading as="h3" className="truncate">
                    {short(latest.pickupLocation.address)} → {short(latest.dropLocation.address)}
                  </SectionHeading>
                </div>
                <StatusPill tone={isSealed(latest.status) ? 'lime' : 'neutral'} className="shrink-0">
                  {t(`status.${latest.status}` as never)}
                </StatusPill>
              </div>
              <Body size="label">{dateLine(latest)}</Body>
              <Divider />
              <div className="flex items-end justify-between gap-3">
                <div>
                  <EyebrowLabel>{th('fareLabel')}</EyebrowLabel>
                  <p className="font-heading text-metric text-fy-brown leading-none">₹{latest.fareBreakdown.total}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="light"
                    size="md"
                    glyph="replay"
                    onClick={() => router.push('/customer/dashboard')}
                  >
                    {th('rebook')}
                  </Button>
                  <Button
                    type="button"
                    size="md"
                    glyph="verified"
                    onClick={() => router.push(`/customer/track/${latest._id}`)}
                  >
                    {th('viewRecord')}
                  </Button>
                </div>
              </div>
            </Panel>
          </Section>
        )}

        {rest.length > 0 && (
          <Section title={<SectionHeading>{th('archive')}</SectionHeading>}>
            <div className="flex flex-col gap-2">
              {rest.map((b) => {
                const open = expanded === b._id;
                return (
                  <LightCard key={b._id} className="p-0 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : b._id)}
                      aria-expanded={open}
                      className="w-full p-4 flex items-center justify-between gap-3 text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <IconTile tone="peach" size="md" className="bg-fy-edge text-fy-ink-soft rounded-full">
                          <Icon
                            name={bucketOf(b) === 'transport' ? 'local_shipping' : bucketOf(b) === 'labour' ? 'engineering' : 'home_repair_service'}
                            size={18}
                          />
                        </IconTile>
                        <div className="min-w-0">
                          <p className="font-body text-label font-semibold text-fy-ink truncate">
                            {short(b.pickupLocation.address)} → {short(b.dropLocation.address)}
                          </p>
                          <Body size="label" className="truncate">
                            {dateLine(b)}
                          </Body>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-heading text-title text-fy-ink">₹{b.fareBreakdown.total}</span>
                        <Icon name={open ? 'expand_less' : 'expand_more'} size={18} className="text-fy-muted" />
                      </div>
                    </button>

                    {open && (
                      <div className="px-4 pb-4">
                        <Divider className="mb-3" />
                        {/* The design prints a sha256 ledger digest, a
                            "Co-op Crew Share: 94.2%" and a welfare-fund
                            figure. A Booking carries none of them: there is
                            no per-booking hash, no crew-share percentage,
                            and the welfare deduction lives on the society,
                            not the booking. Printing a fabricated hash next
                            to the words "Signature Validated" would be the
                            worst possible thing to invent, so this shows the
                            fare breakdown the server really returned. */}
                        <div className="flex flex-col gap-2">
                          <StatRow label={th('baseFare')} value={`₹${b.fareBreakdown.baseFare}`} />
                          {b.fareBreakdown.distanceFare > 0 && (
                            <StatRow label={th('distanceFare')} value={`₹${b.fareBreakdown.distanceFare}`} />
                          )}
                          {b.fareBreakdown.hamaliFare > 0 && (
                            <StatRow label={th('crewFare')} value={`₹${b.fareBreakdown.hamaliFare}`} />
                          )}
                          {b.fareBreakdown.surgeMultiplier > 1 && (
                            <StatRow label={th('surge')} value={`×${b.fareBreakdown.surgeMultiplier}`} />
                          )}
                          <StatRow label={th('total')} value={`₹${b.fareBreakdown.total}`} valueTone="green" />
                        </div>
                        <div className="flex items-center justify-between gap-3 mt-3">
                          <StatusPill tone={isSealed(b.status) ? 'lime' : 'neutral'}>
                            {t(`status.${b.status}` as never)}
                          </StatusPill>
                          <Link
                            href={`/customer/track/${b._id}`}
                            className="font-body text-label font-semibold text-fy-brown hover:underline"
                          >
                            {th('viewRecord')}
                          </Link>
                        </div>
                      </div>
                    )}
                  </LightCard>
                );
              })}
            </div>
          </Section>
        )}
      </main>

    </div>
  );
}
