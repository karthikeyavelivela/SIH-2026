'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { usePolling } from '@/lib/usePolling';
import { useAuth } from '@/lib/auth-context';
import { useCustomerMode, CUSTOMER_MODES } from '@/lib/customerMode';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { TopBar } from '@/components/fy/Navigation';
import { LightCard, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, Body } from '@/components/fy/Text';

interface NotificationDoc {
  _id: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

/**
 * Every role's notification list.
 *
 * Rebuilt onto the design system. The previous version was a flat stack of
 * identical cards with a coloured left border for unread and a full
 * `toLocaleString` timestamp on each — so eight notifications read as eight
 * indistinguishable grey rectangles stamped "21/09/2026, 09:14:32", and
 * nothing told you at a glance whether a row was about money, a job or a
 * document.
 *
 * Three changes, each doing one job:
 *
 *   - a glyph per notification TYPE, so the eye can sort a payout from a
 *     KYC decision without reading;
 *   - relative time ("2h ago") rather than a full stamp, because the
 *     question a notification answers is "how fresh is this", not "what
 *     second did it arrive";
 *   - grouped under Today / Yesterday / Earlier, so a list that spans a
 *     fortnight does not read as one undifferentiated run.
 */

/** One glyph and one tone per notification type. Unmapped types fall back rather than break. */
const TYPE_CHROME: Record<string, { glyph: string; tone: 'brown' | 'green' | 'peach' | 'slate' }> = {
  booking_matched: { glyph: 'handshake', tone: 'green' },
  booking_status: { glyph: 'local_shipping', tone: 'slate' },
  kyc_decision: { glyph: 'badge', tone: 'brown' },
  payout: { glyph: 'payments', tone: 'green' },
  insurance_trigger: { glyph: 'health_and_safety', tone: 'peach' },
  dispute_update: { glyph: 'gavel', tone: 'peach' },
  complaint_update: { glyph: 'support_agent', tone: 'brown' },
  unplanned_halt: { glyph: 'warning', tone: 'peach' },
  emergency_alert: { glyph: 'emergency', tone: 'peach' },
  quotation_update: { glyph: 'request_quote', tone: 'brown' },
  system_alert: { glyph: 'notification_important', tone: 'brown' },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Which bucket a notification falls in. Compared on calendar days, not elapsed hours — 00:30 today is "today". */
function bucketFor(iso: string): 'today' | 'yesterday' | 'earlier' {
  const when = new Date(iso);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (when.getTime() >= startOfToday.getTime()) return 'today';
  if (when.getTime() >= startOfToday.getTime() - DAY_MS) return 'yesterday';
  return 'earlier';
}

export function NotificationCenter({ accent = 'primary' }: { accent?: 'primary' | 'secondary' }) {
  const t = useTranslations('notifications');
  const tMode = useTranslations('customerMode');
  const router = useRouter();
  /*
   * The customer's list is scoped to the mode they are in — switching mode
   * changes everything on screen, and this was the last thing ignoring it.
   * Every other role has one world and asks for the unscoped list.
   *
   * `otherModesCount` is surfaced below rather than swallowed: scoping a
   * person cannot see past is scoping that loses things.
   */
  const { user } = useAuth();
  const { mode, setMode } = useCustomerMode();
  const scoped = user?.role === 'customer';

  const { data, state, reload } = usePolling(
    () =>
      api.get<{ notifications: NotificationDoc[]; unreadCount: number; otherModesCount?: number }>(
        scoped ? `/api/notifications?mode=${mode}` : '/api/notifications'
      ),
    30000
  );

  const notifications = useMemo(() => data?.notifications ?? [], [data]);
  const unread = data?.unreadCount ?? 0;

  /** Relative, and honest about precision: nothing here claims to the second. */
  function relativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return t('justNow');
    if (mins < 60) return t('minutesAgo', { count: mins });
    const hours = Math.round(mins / 60);
    if (hours < 24) return t('hoursAgo', { count: hours });
    const days = Math.round(hours / 24);
    if (days < 7) return t('daysAgo', { count: days });
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  const groups = useMemo(() => {
    const out: Record<'today' | 'yesterday' | 'earlier', NotificationDoc[]> = {
      today: [],
      yesterday: [],
      earlier: [],
    };
    for (const n of notifications) out[bucketFor(n.createdAt)].push(n);
    return out;
  }, [notifications]);

  async function open(n: NotificationDoc) {
    if (!n.read) {
      api.patch(`/api/notifications/${n._id}/read`).catch(() => {});
    }
    if (n.link) router.push(n.link);
    await reload();
  }

  async function markAllRead() {
    try {
      await api.patch('/api/notifications/read-all');
      await reload();
    } catch {
      // Non-critical — the list still functions, and the bell badge catches
      // up on its next poll.
    }
  }

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar
        title={t('title')}
        showBack
        actions={
          unread > 0 ? (
            <button
              type="button"
              onClick={markAllRead}
              className="font-body text-label font-semibold text-fy-brown hover:underline shrink-0"
            >
              {t('markAllRead')}
            </button>
          ) : undefined
        }
      />

      <main className="pt-16 fy-pad-nav px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        {scoped && (
          <span className="font-mono text-[10px] text-fy-muted">
            {t('scopedTo', { mode: tMode(`modes.${mode}` as never) })}
          </span>
        )}

        {unread > 0 && (
          <EyebrowLabel tone={accent === 'primary' ? 'brown' : 'green'}>
            {t('unreadCount', { count: unread })}
          </EyebrowLabel>
        )}

        {/* What is waiting in the other two modes. Named and reachable, so
            nothing is hidden by the scoping — only sorted by it. */}
        {scoped && (data?.otherModesCount ?? 0) > 0 && (
          <LightCard className="flex items-center justify-between gap-3">
            <span className="font-body text-label text-fy-ink-soft min-w-0">
              {t('inOtherModes', { count: data!.otherModesCount! })}
            </span>
            <span className="flex gap-2 shrink-0">
              {CUSTOMER_MODES.filter((m) => m !== mode).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className="font-body text-label font-semibold text-fy-brown hover:underline"
                >
                  {tMode(`modes.${m}` as never)}
                </button>
              ))}
            </span>
          </LightCard>
        )}

        {state === 'loading' && <Skeleton lines={4} className="h-16" />}
        {state === 'error' && <ErrorState onRetry={reload} />}

        {state !== 'loading' && state !== 'error' && notifications.length === 0 && (
          <EmptyState
            icon={<Icon name="notifications" size={26} />}
            title={t('empty')}
            description={t('emptyDesc')}
          />
        )}

        {(['today', 'yesterday', 'earlier'] as const).map((bucket) =>
          groups[bucket].length === 0 ? null : (
            <section key={bucket} className="flex flex-col gap-2">
              <EyebrowLabel>{t(`groups.${bucket}` as never)}</EyebrowLabel>
              {groups[bucket].map((n) => {
                const chrome = TYPE_CHROME[n.type] ?? { glyph: 'notifications', tone: 'brown' as const };
                return (
                  <button key={n._id} type="button" onClick={() => open(n)} className="w-full text-left">
                    <LightCard
                      className={`flex items-start gap-3 transition-colors ${
                        n.read ? '' : 'bg-fy-card ring-1 ring-fy-brown/15'
                      }`}
                    >
                      <IconTile tone={chrome.tone} size="sm" className="rounded-full shrink-0">
                        <Icon name={chrome.glyph} size={18} />
                      </IconTile>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span
                            className={`font-body text-body leading-tight ${
                              n.read ? 'text-fy-ink-soft' : 'font-semibold text-fy-ink'
                            }`}
                          >
                            {n.title}
                          </span>
                          <span className="font-mono text-[10px] text-fy-muted shrink-0">
                            {relativeTime(n.createdAt)}
                          </span>
                        </span>
                        <Body size="label" className="mt-0.5">
                          {n.body}
                        </Body>
                      </span>

                      {/* An unread dot AND a link chevron would be two marks
                          competing for the same corner. The dot wins when
                          there is one, because "new" beats "tappable". */}
                      {!n.read ? (
                        <span aria-hidden className="w-2 h-2 rounded-full bg-fy-brown mt-2 shrink-0" />
                      ) : n.link ? (
                        <Icon name="chevron_right" size={16} className="text-fy-muted shrink-0 mt-1.5" />
                      ) : null}
                    </LightCard>
                  </button>
                );
              })}
            </section>
          )
        )}
      </main>
    </div>
  );
}
