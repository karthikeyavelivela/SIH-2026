'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useLocale } from 'next-intl';
import { Icon } from '@/components/ui/Icon';
import { useRouter } from 'next/navigation';
import { setLocaleAction } from '@/i18n/setLocale';

/**
 * The language switcher, as one small button.
 *
 * It was a 108px sliding dial showing all three languages at once, sitting
 * inline beside the wordmark. Three permanently visible options is the
 * right shape for a control people use constantly and the wrong one for a
 * control people touch once ever: it took a third of the header's width
 * and squeezed the brand mark down to fit beside it.
 *
 * So the current language is a badge, and the other two appear on tap. The
 * information is identical — "you are reading English, two others exist" —
 * and the header gets its width back.
 *
 * A native <select> would have been smaller still and is what a form would
 * use, but its options render in the platform's own font, which on Android
 * routinely lacks the Telugu and Devanagari faces this app ships. A
 * language picker that shows its languages as boxes is worse than one that
 * takes a tap.
 */

const LANGS = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'te', label: 'తెలుగు', short: 'తె' },
  { code: 'hi', label: 'हिंदी', short: 'हि' },
] as const;

export function LanguageMenu({ className = '' }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = LANGS.find((l) => l.code === locale) ?? LANGS[0];

  // Closes on an outside tap and on Escape. Without the first, a menu on a
  // phone has no obvious way out — there is no cursor to move away.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(code: string) {
    setOpen(false);
    if (code === locale) return;
    // Same path the sliding dial used: a server action writes the
    // NEXT_LOCALE cookie, then a refresh re-renders with the new messages.
    startTransition(async () => {
      await setLocaleAction(code as Parameters<typeof setLocaleAction>[0]);
      router.refresh();
    });
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Language: ${current.label}`}
        className="w-10 h-10 rounded-full flex items-center justify-center gap-0.5 text-fy-ink-soft hover:bg-fy-well transition-colors"
      >
        <Icon name="language" size={18} />
        <span className="font-mono text-[10px] font-semibold leading-none">{current.short}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 z-50 min-w-[148px] rounded-card bg-fy-card border border-fy-hairline/60 shadow-float overflow-hidden"
        >
          {LANGS.map((lang) => {
            const active = lang.code === locale;
            return (
              <button
                key={lang.code}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => pick(lang.code)}
                className={`w-full min-h-[44px] px-3.5 flex items-center justify-between gap-3 text-left transition-colors ${
                  active ? 'bg-fy-brown/8 text-fy-ink' : 'text-fy-ink-soft hover:bg-fy-field'
                }`}
              >
                <span className="font-body text-body">{lang.label}</span>
                {active && <Icon name="check" size={16} className="text-fy-brown shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
