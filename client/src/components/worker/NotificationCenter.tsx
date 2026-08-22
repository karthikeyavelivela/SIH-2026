'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { usePolling } from '@/lib/usePolling';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { BellIcon, AlertIcon } from '@/components/ui/icons';

interface NotificationDoc {
  _id: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

// Shared list view for every role's /{role}/notifications page — each
// role's page.tsx is a thin wrapper around this, same pattern as
// TrainingAcademy/InsuranceDashboard elsewhere in this codebase.
export function NotificationCenter({ accent = 'primary' }: { accent?: 'primary' | 'secondary' }) {
  const t = useTranslations('notifications');
  const router = useRouter();
  const { data, state, reload } = usePolling(
    () => api.get<{ notifications: NotificationDoc[]; unreadCount: number }>('/api/notifications'),
    30000
  );

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
      // Non-critical — the list still functions, the bell badge will just
      // catch up on its next poll.
    }
  }

  const notifications = data?.notifications ?? [];
  const tone = accent === 'primary' ? 'text-primary-600' : 'text-secondary-600';

  return (
    <div className="max-w-lg mx-auto px-5 pt-6 pb-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-bold">{t('title')}</h1>
        {(data?.unreadCount ?? 0) > 0 && (
          <button type="button" onClick={markAllRead} className={`text-sm font-semibold ${tone} hover:underline`}>
            {t('markAllRead')}
          </button>
        )}
      </div>

      {state === 'loading' && (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      )}

      {state === 'error' && (
        <div className="ip-card">
          <EmptyState
            icon={<AlertIcon className="w-7 h-7" />}
            title={t('loadError')}
            action={
              <Button variant="ghost" onClick={() => reload()}>
                {t('tryAgain')}
              </Button>
            }
          />
        </div>
      )}

      {state !== 'loading' && state !== 'error' && notifications.length === 0 && (
        <div className="ip-card">
          <EmptyState icon={<BellIcon className="w-7 h-7" />} title={t('empty')} description={t('emptyDesc')} />
        </div>
      )}

      <div className="space-y-2">
        {notifications.map((n) => (
          <button
            key={n._id}
            type="button"
            onClick={() => open(n)}
            className={`w-full text-left ip-card flex items-start gap-3 transition-colors ${
              n.read ? '' : 'border-l-4 ' + (accent === 'primary' ? 'border-l-primary-600' : 'border-l-secondary-600')
            }`}
          >
            {!n.read && (
              <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${accent === 'primary' ? 'bg-primary-600' : 'bg-secondary-600'}`} aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${n.read ? 'text-ip-on-surface-variant' : 'text-ip-on-surface'}`}>{n.title}</p>
              <p className="text-sm text-ip-on-surface-variant">{n.body}</p>
              <p className="text-xs text-ip-outline mt-1">{new Date(n.createdAt).toLocaleString('en-IN')}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
