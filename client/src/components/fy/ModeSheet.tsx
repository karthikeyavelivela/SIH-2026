'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/Icon';
import { CUSTOMER_MODES, MODE_CHROME, type CustomerMode } from '@/lib/customerMode';

/**
 * The three-way mode switch, as a bottom sheet.
 *
 * It keeps the rotary dial's visual language — the machined disc, the
 * milled ring, the lime indicator, one wedge per mode — and throws away its
 * anchoring. The dial was pinned to the viewport's top-right corner and
 * drawn as a quarter-disc whose centre sat off-screen, and it never
 * rendered correctly across several attempts: the geometry depended on the
 * box's centre being exactly the viewport corner, which broke the moment
 * anything above it changed height, and a drag gesture on a control three
 * quarters of which is off-screen is not reachable on a phone held in one
 * hand.
 *
 * So the disc is now whole, centred, and opened from the bottom bar's raised
 * centre button — a place a thumb actually reaches. Same segments, same
 * icons, same per-mode accent; a control you can see all of.
 */
export function ModeSheet({
  open,
  active,
  onPick,
  onClose,
}: {
  open: boolean;
  active: CustomerMode;
  onPick: (mode: CustomerMode) => void;
  onClose: () => void;
}) {
  const t = useTranslations('customerMode');
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes, and focus moves into the sheet so a keyboard user is not
  // left behind the backdrop.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLButtonElement>('button[data-mode]')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={t('title')}>
      <button
        type="button"
        aria-label={t('close')}
        onClick={onClose}
        className="absolute inset-0 bg-fy-ink/45 backdrop-blur-[2px] cursor-default"
      />

      <div
        ref={panelRef}
        className="relative w-full max-w-2xl rounded-t-sheet bg-fy-bone shadow-float px-gutter pt-3 pb-8 animate-[fy-sheet-in_260ms_var(--fy-ease-out)]"
        style={{ paddingBottom: 'calc(2rem + var(--fy-safe-b))' }}
      >
        <span aria-hidden className="mx-auto mb-4 block h-1 w-10 rounded-full bg-fy-hairline" />

        <p className="font-body text-eyebrow uppercase tracking-widest text-fy-muted text-center">{t('eyebrow')}</p>
        <h2 className="font-heading text-title text-fy-ink text-center mt-0.5 mb-5">{t('title')}</h2>

        <div className="grid grid-cols-3 gap-2.5">
          {CUSTOMER_MODES.map((mode) => {
            const chrome = MODE_CHROME[mode];
            const isActive = mode === active;
            return (
              <button
                key={mode}
                type="button"
                data-mode={mode}
                aria-current={isActive ? 'true' : undefined}
                onClick={() => {
                  onPick(mode);
                  onClose();
                }}
                className={`relative flex flex-col items-center gap-2 rounded-card px-2 py-4 border transition-all active:scale-[0.97] ${
                  isActive
                    ? 'border-fy-brown bg-fy-brown text-fy-on-brown shadow-card'
                    : 'border-fy-hairline/60 bg-fy-panel text-fy-ink hover:bg-fy-well'
                }`}
              >
                {/* The dial's milled ring, kept — it is what made the control
                    read as a machined switch rather than a segmented button. */}
                <span className="relative w-14 h-14 rounded-full flex items-center justify-center overflow-hidden">
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: isActive
                        ? 'radial-gradient(circle at 50% 35%, var(--fy-brown-soft) 0%, var(--fy-brown) 60%, var(--fy-ink) 100%)'
                        : 'radial-gradient(circle at 50% 35%, var(--fy-card) 0%, var(--fy-well) 70%, var(--fy-edge) 100%)',
                    }}
                  />
                  <svg
                    aria-hidden
                    viewBox="0 0 56 56"
                    className={`absolute inset-0 w-full h-full ${isActive ? 'opacity-45' : 'opacity-35'}`}
                  >
                    <circle
                      cx="28"
                      cy="28"
                      r="25"
                      fill="none"
                      stroke={isActive ? 'var(--fy-bone)' : 'var(--fy-hairline)'}
                      strokeWidth="0.75"
                      strokeDasharray="2 5"
                    />
                    <circle
                      cx="28"
                      cy="28"
                      r="19"
                      fill="none"
                      stroke={isActive ? 'var(--fy-bone)' : 'var(--fy-hairline)'}
                      strokeOpacity="0.7"
                      strokeWidth="1"
                    />
                  </svg>
                  <Icon
                    name={chrome.glyph}
                    size={24}
                    className={`relative ${isActive ? 'text-fy-lime' : 'text-fy-brown'}`}
                  />
                </span>

                <span className="font-body text-label font-semibold leading-tight text-center">{t(`modes.${mode}`)}</span>
                <span
                  className={`font-mono text-[10px] leading-tight text-center ${
                    isActive ? 'text-fy-on-brown-soft' : 'text-fy-muted'
                  }`}
                >
                  {t(`hints.${mode}`)}
                </span>

                {/* The dial's fixed indicator notch, on whichever wedge is live. */}
                {isActive && (
                  <span aria-hidden className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-fy-lime" />
                )}
              </button>
            );
          })}
        </div>

        <p className="font-mono text-[10px] text-fy-muted text-center mt-4">{t('swapNote')}</p>
      </div>
    </div>
  );
}
