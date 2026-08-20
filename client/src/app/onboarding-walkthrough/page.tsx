'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { TruckIcon, MapPinIcon, ShieldIcon, ChevronRightIcon } from '@/components/ui/icons';

// Short skippable walkthrough (design/stitch/.../onboarding_walkthrough).
// Three cards instead of the mockup's single-slide-per-visit carousel —
// StatusStepper (built for in-progress-booking steps, with fixed
// accepted/arriving/loading/etc labels) doesn't fit a free-text onboarding
// story, so this uses simple client-side step state with a dot progress
// indicator instead. Ends with a CTA into role selection, per SCOPE.
const SLIDE_KEYS = ['book', 'track', 'trust'] as const;
const SLIDE_ICONS = [TruckIcon, MapPinIcon, ShieldIcon];

export default function OnboardingWalkthroughPage() {
  const t = useTranslations('shared.onboarding');
  const router = useRouter();
  const [step, setStep] = useState(0);
  const isLast = step === SLIDE_KEYS.length - 1;
  const Icon = SLIDE_ICONS[step];
  const slideKey = SLIDE_KEYS[step];

  function handleNext() {
    if (isLast) {
      router.push('/role-selection');
    } else {
      setStep((s) => s + 1);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background px-6 py-8">
      <div className="max-w-sm mx-auto w-full flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-10">
          <span className="font-heading text-lg font-extrabold text-primary-600 tracking-tight">FYRO</span>
          <Link
            href="/role-selection"
            className="text-xs font-bold uppercase tracking-[0.15em] text-text-muted hover:text-text-primary transition-colors duration-fast"
          >
            {t('skip')}
          </Link>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div key={slideKey} className="animate-[fadeUp_400ms_ease-out]">
            <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
              <Icon className="w-10 h-10 text-primary-600" />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-600 mb-3">
              {t(`slides.${slideKey}.eyebrow`)}
            </p>
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-text-primary mb-3">
              {t(`slides.${slideKey}.title`)}
            </h1>
            <p className="text-text-muted leading-relaxed">{t(`slides.${slideKey}.body`)}</p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 mb-8" aria-hidden>
          {SLIDE_KEYS.map((k, i) => (
            <span
              key={k}
              className={`h-1.5 rounded-full transition-all duration-base ease-out-expo ${
                i === step ? 'w-6 bg-primary-600' : 'w-1.5 bg-border-strong'
              }`}
            />
          ))}
        </div>

        <Button onClick={handleNext} size="lg" className="w-full">
          {isLast ? t('getStarted') : t('next')}
          <ChevronRightIcon className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
