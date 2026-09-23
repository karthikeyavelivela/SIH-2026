'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useNotificationPermission } from '@/lib/useNotificationPermission';
import { Icon } from '@/components/ui/Icon';

interface NotificationPromptProps {
  accent?: 'primary' | 'secondary';
  copy?: string;
  /**
   * Which ask this is. Dismissals are remembered per scope, because the
   * app asks at more than one moment and they are not the same request:
   * waving away a worker-dashboard banner should not also silence the
   * "your worker is on the way" ask on a customer's first booking.
   */
  scope?: string;
}

const DISMISSED_KEY = 'fyro.notifyPrompt.dismissed';

/**
 * The opt-in banner for browser alerts.
 *
 * Deliberately a banner with a stated reason rather than a native prompt
 * fired on page load — a permission dialog with no explanation in front of
 * it is the thing people click "Block" on, and a block is permanent.
 *
 * Two things were wrong with it:
 *
 * Dismissal lived in component state, so it unmounted on every navigation
 * and the banner came back on the next screen, and the next. Asking once is
 * a request; asking on every screen is nagging, and it trains people to
 * dismiss without reading. It is now remembered in localStorage.
 *
 * And its two labels were hardcoded English in a trilingual app, so a
 * Telugu reader got "Enable alerts" in the middle of a Telugu screen.
 */
export function NotificationPrompt({ accent = 'primary', copy, scope }: NotificationPromptProps) {
  const storageKey = scope ? `${DISMISSED_KEY}.${scope}` : DISMISSED_KEY;
  const t = useTranslations('notifyPrompt');
  const { permission, request } = useNotificationPermission();
  const [dismissed, setDismissed] = useState(true);

  // Starts dismissed and un-dismisses after reading storage, so the banner
  // never flashes in on first paint and then disappear.
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(storageKey) === '1');
    } catch {
      // Private window or blocked storage: show it, and this session's
      // dismissal simply will not persist.
      setDismissed(false);
    }
  }, [storageKey]);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, '1');
    } catch {
      /* see above */
    }
  }

  // 'granted' needs no banner and 'denied' must not produce one: the
  // browser will not show its prompt again, so re-offering the button
  // would be a control that does nothing. Re-enabling after a denial is
  // only possible in browser settings, and the profile screen says that.
  if (dismissed || permission !== 'default') return null;

  const tint = accent === 'primary' ? 'bg-fy-brown/10 text-fy-brown' : 'bg-fy-green/10 text-fy-green';

  return (
    <div className={`flex items-start gap-2.5 rounded-card px-3.5 py-3 ${tint}`}>
      <Icon name="notifications_active" size={18} className="shrink-0 mt-0.5" />

      {/* Wraps under the text on a narrow screen rather than squeezing the
          sentence into two words per line. */}
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <p className="font-body text-label leading-snug">{copy ?? t('copy')}</p>
        <button
          type="button"
          onClick={() => request()}
          className="self-start font-body text-label font-semibold underline"
        >
          {t('enable')}
        </button>
      </div>

      <button type="button" onClick={dismiss} aria-label={t('dismiss')} className="shrink-0 -mr-1 -mt-0.5 p-1">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
