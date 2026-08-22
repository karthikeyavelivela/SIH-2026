'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePolling } from '@/lib/usePolling';
import { api } from '@/lib/api';
import { BellIcon } from './icons';

interface NotificationBellProps {
  /** This role's own notifications page, e.g. /driver/notifications. */
  href: string;
  className?: string;
}

// Phase 5.7 — the one always-visible entry point into the Notification
// Center from every role's dashboard. Polls the cheap unread-count-only
// endpoint (not the full list) at the same 30s cadence usePolling already
// uses elsewhere in this codebase, paused while the tab is hidden.
export function NotificationBell({ href, className = '' }: NotificationBellProps) {
  const t = useTranslations('notifications');
  const { data } = usePolling(() => api.get<{ unreadCount: number }>('/api/notifications/unread-count'), 30000);
  const count = data?.unreadCount ?? 0;

  return (
    <Link
      href={href}
      aria-label={count > 0 ? t('bellAria', { count }) : t('bellAriaNone')}
      className={`relative w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center text-ip-on-surface-variant hover:bg-ip-surface-container-high transition-colors ${className}`}
    >
      <BellIcon className="w-5 h-5" />
      {count > 0 && (
        <span
          className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-ip-error text-white text-[10px] font-bold flex items-center justify-center leading-none"
          aria-hidden="true"
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}
