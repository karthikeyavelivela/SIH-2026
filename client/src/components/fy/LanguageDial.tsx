'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { setLocaleAction } from '@/i18n/setLocale';
import { type LanguageCode } from '@/components/ui/LanguagePill';

/**
 * The language dial — three positions you *slide* between, not a menu you
 * pick from.
 *
 * A member changing languages is usually doing it one-handed on a cheap
 * phone, so the whole control is one continuous drag: put a thumb anywhere
 * on the track and move it, and the knob follows the finger in real time
 * with the label under it updating as you cross each detent. Letting go
 * snaps to the nearest of the three positions and commits that locale.
 *
 * It is still a real radiogroup underneath — tapping a position works, and
 * so do arrow keys — because a drag-only control would be unusable with a
 * keyboard or a screen reader.
 */

const LANGS: { code: LanguageCode; short: string; full: string }[] = [
  { code: 'en', short: 'EN', full: 'English' },
  { code: 'te', short: 'తె', full: 'తెలుగు' },
  { code: 'hi', short: 'हि', full: 'हिंदी' },
];

export function LanguageDial({
  className = '',
  size = 'md',
}: {
  className?: string;
  /** `sm` is the 32px-high header form; `md` the 40px one. */
  size?: 'sm' | 'md';
}) {
  const locale = useLocale() as LanguageCode;
  const router = useRouter();
  const [, startTransition] = useTransition();

  const trackRef = useRef<HTMLDivElement | null>(null);
  const activeIndex = Math.max(0, LANGS.findIndex((l) => l.code === locale));
  // While a finger is down this holds the *continuous* position (0..2) so
  // the knob tracks the thumb between detents instead of jumping.
  const [dragPos, setDragPos] = useState<number | null>(null);
  const dragging = dragPos !== null;

  const pos = dragging ? dragPos : activeIndex;

  const commit = useCallback(
    (index: number) => {
      const next = LANGS[index]?.code;
      if (!next || next === locale) return;
      startTransition(async () => {
        await setLocaleAction(next);
        router.refresh();
      });
    },
    [locale, router]
  );

  /** Where along the track (0..2) a client X coordinate falls. */
  const posFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const knob = rect.width / LANGS.length;
    // Measure from the centre of the first slot to the centre of the last,
    // so dragging to either end lands exactly on a detent.
    const usable = Math.max(1, rect.width - knob);
    const x = clientX - rect.left - knob / 2;
    return Math.min(LANGS.length - 1, Math.max(0, (x / usable) * (LANGS.length - 1)));
  }, []);

  // Pointer events are bound to the window for the duration of the drag so
  // the knob keeps following a thumb that slides off the control.
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      e.preventDefault();
      setDragPos(posFromClientX(e.clientX));
    };
    const up = (e: PointerEvent) => {
      const snapped = Math.round(posFromClientX(e.clientX));
      setDragPos(null);
      commit(snapped);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging, posFromClientX, commit]);

  function onPointerDown(e: React.PointerEvent) {
    // Only a primary pointer starts a drag; right-clicks and secondary
    // touches are ignored.
    if (e.button !== 0) return;
    setDragPos(posFromClientX(e.clientX));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      commit(Math.min(LANGS.length - 1, activeIndex + 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      commit(Math.max(0, activeIndex - 1));
    }
  }

  const h = size === 'sm' ? 'h-8' : 'h-10';
  const w = size === 'sm' ? 'w-[108px]' : 'w-[132px]';

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label="Select language"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={`relative ${h} ${w} rounded-full p-1 select-none cursor-grab active:cursor-grabbing touch-none outline-none focus-visible:ring-2 focus-visible:ring-fy-brown/40 ${className}`}
      style={{
        background: 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(12px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(12px) saturate(1.4)',
        boxShadow: 'inset 0 0 0 1px rgba(28,28,22,0.10)',
      }}
    >
      {/* The knob. It has no transition while a finger is down, so it sits
          exactly under the thumb; the transition returns for the snap. */}
      <span
        aria-hidden
        className={`absolute top-1 bottom-1 rounded-full bg-fy-brown shadow-card ${
          dragging ? '' : 'transition-transform duration-base ease-spring'
        }`}
        style={{
          width: `calc((100% - 0.5rem) / ${LANGS.length})`,
          transform: `translateX(calc(${pos} * 100%))`,
          left: '0.25rem',
        }}
      />
      <div className="relative grid h-full" style={{ gridTemplateColumns: `repeat(${LANGS.length}, 1fr)` }}>
        {LANGS.map((l, i) => {
          const on = i === Math.round(pos);
          return (
            <button
              key={l.code}
              type="button"
              role="radio"
              aria-checked={l.code === locale}
              aria-label={l.full}
              tabIndex={-1}
              onClick={() => commit(i)}
              className={`relative z-10 flex items-center justify-center rounded-full font-body text-eyebrow transition-colors ${
                on ? 'text-fy-on-brown font-semibold' : 'text-fy-ink-soft'
              }`}
            >
              {l.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}
