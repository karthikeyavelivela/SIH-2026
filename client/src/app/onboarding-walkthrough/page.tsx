'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Media } from '@/components/ui/Media';
import { Button } from '@/components/fy/Controls';
import { OnboardingShell } from '@/components/auth/OnboardingShell';

// Short skippable walkthrough (design/stitch/.../onboarding_walkthrough).
// Three slides instead of the mockup's single-slide-per-visit carousel —
// StatusStepper (built for in-progress-booking steps, with fixed
// accepted/arriving/loading/etc labels) doesn't fit a free-text onboarding
// story, so this uses simple client-side step state with a dot progress
// indicator instead. Ends with a CTA into role selection, per SCOPE.
//
// Each slide now carries the real photograph of the thing it describes
// rather than an icon in a tinted circle — this is the first impression of
// a platform whose whole argument is that the work is real.
const SLIDE_KEYS = ['book', 'track', 'trust'] as const;

const SLIDE_MEDIA: Record<(typeof SLIDE_KEYS)[number], { id: string; tint: 'household' | 'labour' | 'transport' }> = {
  book: { id: 'landing.guild.household', tint: 'household' },
  track: { id: 'landing.guild.transport', tint: 'transport' },
  trust: { id: 'landing.guild.hamali', tint: 'labour' },
};

export default function OnboardingWalkthroughPage() {
  const t = useTranslations('shared.onboarding');
  const router = useRouter();
  const [step, setStep] = useState(0);
  const isLast = step === SLIDE_KEYS.length - 1;
  const slideKey = SLIDE_KEYS[step];
  const media = SLIDE_MEDIA[slideKey];

  function handleNext() {
    if (isLast) {
      router.push('/role-selection');
    } else {
      setStep((s) => s + 1);
    }
  }

  return (
    <OnboardingShell
      step={`${String(step + 1).padStart(2, '0')} / ${String(SLIDE_KEYS.length).padStart(2, '0')}`}
      eyebrow={t(`slides.${slideKey}.eyebrow`)}
      title={t(`slides.${slideKey}.title`)}
      lede={t(`slides.${slideKey}.body`)}
      action={
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-center gap-2" aria-hidden>
            {SLIDE_KEYS.map((k, i) => (
              <span
                key={k}
                className={`h-1.5 rounded-full transition-all duration-base ease-out ${
                  i === step ? 'w-6 bg-fy-brown' : 'w-1.5 bg-fy-dim'
                }`}
              />
            ))}
          </div>
          <Button className="w-full" trailingGlyph="arrow_forward" onClick={handleNext}>
            {isLast ? t('getStarted') : t('next')}
          </Button>
          <Link
            href="/role-selection"
            className="text-center font-mono text-[11px] uppercase tracking-widest text-fy-muted hover:text-fy-ink transition-colors"
          >
            {t('skip')}
          </Link>
        </div>
      }
    >
      <div key={slideKey} className="relative rounded-card overflow-hidden shadow-card h-56 bg-fy-dim animate-[fadeUp_400ms_ease-out]">
        <Media id={media.id} kind="photo" fill treatment="full-bleed" tint={media.tint} alt="" className="w-full h-full" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-fy-ink/55 via-transparent to-transparent" />
      </div>
    </OnboardingShell>
  );
}
