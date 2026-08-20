'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { LanguagePill, type LanguageCode } from '@/components/ui/LanguagePill';
import { setLocaleAction } from '@/i18n/setLocale';
import { ChevronRightIcon } from '@/components/ui/icons';

// Standalone first-run language picker (design/stitch/.../language_selection).
// Reuses the exact NEXT_LOCALE cookie → router.refresh() loop already wired
// on the marketing homepage (see (marketing)/page.tsx + i18n/README.md),
// just as a dedicated full-screen step rather than a floating pill over a
// hero. Continues into role selection, matching the DESIGN_INVENTORY route
// (`/language` → this screen → "Who are you?").
export default function LanguageSelectionPage() {
  const t = useTranslations('shared.languageSelection');
  const locale = useLocale() as LanguageCode;
  const router = useRouter();
  const [selected, setSelected] = useState<LanguageCode>(locale);
  const [isPending, startTransition] = useTransition();

  function handleContinue() {
    startTransition(async () => {
      if (selected !== locale) {
        await setLocaleAction(selected);
      }
      router.push('/role-selection');
      router.refresh();
    });
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 bg-background relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-24 w-80 h-80 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-24 w-80 h-80 rounded-full bg-secondary/10 blur-3xl"
      />

      <div className="w-full max-w-sm relative z-10 text-center animate-[fadeUp_500ms_ease-out]">
        <span className="font-heading text-xl font-extrabold text-primary-600 tracking-tight">FYRO</span>

        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-text-primary mt-10 mb-3">
          {t('title')}
        </h1>
        <p className="text-text-muted mb-10">{t('subtitle')}</p>

        <div className="flex justify-center">
          <LanguagePill
            value={selected}
            onChange={setSelected}
            className="flex-col items-stretch w-full [&>button]:w-full [&>button]:py-3.5 [&>button]:text-base [&>button]:justify-start [&>button]:rounded-md"
          />
        </div>

        <Button
          onClick={handleContinue}
          disabled={isPending}
          size="lg"
          className="w-full mt-10"
        >
          {t('continue')}
          <ChevronRightIcon className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
