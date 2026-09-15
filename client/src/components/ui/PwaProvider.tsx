'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/Icon';

/**
 * Registers the service worker and offers the install prompt.
 *
 * Two rules shaped this:
 *
 *  - Registration happens AFTER load, not during it. A service worker
 *    registering while the page is still painting competes with the page for
 *    the main thread, which is exactly the kind of thing that makes an app
 *    feel slow on the mid-range Android phones this product targets.
 *  - The install prompt is offered once and then never again unless the
 *    person asks. A banner that reappears on every visit is an ad.
 *
 * In development the worker is deliberately not registered: a cached shell is
 * a miserable thing to debug against.
 */

const DISMISS_KEY = 'fyro.pwa.dismissed';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaProvider() {
  const t = useTranslations('pwa');
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // A failed registration costs the install prompt and offline page and
        // nothing else. The app works exactly as before.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  useEffect(() => {
    function onPrompt(e: Event) {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
      try {
        if (!localStorage.getItem(DISMISS_KEY)) setVisible(true);
      } catch {
        setVisible(true);
      }
    }
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* a dismissal we cannot remember is still a dismissal for this visit */
    }
  }

  async function install() {
    if (!deferred) return;
    setVisible(false);
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* see dismiss */
    }
  }

  if (!visible || !deferred) return null;

  return (
    <div className="fixed inset-x-0 fy-above-cta z-50 px-gutter pointer-events-none">
      <div className="max-w-2xl mx-auto pointer-events-auto rounded-card bg-fy-ink text-white shadow-lg px-4 py-3 flex items-center gap-3">
        <span className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0">
          <Icon name="install_mobile" size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-body text-body font-semibold">{t('installTitle')}</span>
          <span className="block font-body text-label opacity-80">{t('installBody')}</span>
        </span>
        <button type="button" onClick={dismiss} className="font-body text-label opacity-70 shrink-0 px-2">
          {t('dismiss')}
        </button>
        <button
          type="button"
          onClick={install}
          className="shrink-0 rounded-control bg-white text-fy-ink font-body text-label font-semibold px-3 py-2"
        >
          {t('install')}
        </button>
      </div>
    </div>
  );
}
