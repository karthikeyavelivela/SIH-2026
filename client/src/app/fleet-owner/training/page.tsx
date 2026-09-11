'use client';

import { useTranslations } from 'next-intl';
import { TrainingAcademy } from '@/components/worker/TrainingAcademy';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';

/* The fleet owner's copy of the training academy. It sits inside the
   sidebar console layout, so it renders the curriculum list with a plain
   page head rather than the phone shell's TopBar. */

export default function FleetOwnerTrainingPage() {
  const t = useTranslations('fleetTraining');
  return (
    <div className="max-w-2xl mx-auto animate-[fadeUp_400ms_ease-out] flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2.5">
          <span aria-hidden className="w-7 h-[2px] bg-fy-green" />
          <EyebrowLabel tone="brown">{t('eyebrow')}</EyebrowLabel>
        </span>
        <SectionHeading>{t('title')}</SectionHeading>
        <Body>{t('subtitle')}</Body>
      </div>
      <TrainingAcademy accent="primary" />
    </div>
  );
}
