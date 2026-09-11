'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/fy/Controls';
import { type LanguageCode } from '@/components/ui/LanguagePill';
import { setLocaleAction } from '@/i18n/setLocale';
import { OnboardingShell, OptionRow } from '@/components/auth/OnboardingShell';

// Standalone first-run language picker (design/stitch/.../language_selection).
// Reuses the exact NEXT_LOCALE cookie → router.refresh() loop already wired
// on the marketing homepage (see (marketing)/page.tsx + i18n/README.md).
//
// This is the one screen where the language *is* the decision, so it uses
// full-width rows rather than the compact header dial — and each row is set
// in its own script, because someone who cannot read the English word
// "Telugu" can still recognise తెలుగు.
const LANGUAGES: { code: LanguageCode; native: string; english: string; lead: string }[] = [
  { code: 'en', native: 'English', english: 'English', lead: 'A' },
  { code: 'te', native: 'తెలుగు', english: 'Telugu', lead: 'తె' },
  { code: 'hi', native: 'हिंदी', english: 'Hindi', lead: 'हि' },
];

export default function LanguageSelectionPage() {
  const t = useTranslations('shared.languageSelection');
  const tf = useTranslations('shared.onboarding');
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
    <OnboardingShell
      step="01 / 03"
      eyebrow={tf('flowEyebrow')}
      title={t('title')}
      lede={t('subtitle')}
      action={
        <Button className="w-full" trailingGlyph="arrow_forward" onClick={handleContinue} disabled={isPending}>
          {t('continue')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {LANGUAGES.map((l) => (
          <OptionRow
            key={l.code}
            selected={selected === l.code}
            lead={l.lead}
            title={l.native}
            body={l.native === l.english ? undefined : l.english}
            onClick={() => setSelected(l.code)}
          />
        ))}
      </div>
    </OnboardingShell>
  );
}
