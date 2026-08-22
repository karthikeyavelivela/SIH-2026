'use client';

import { useTranslations } from 'next-intl';
import { TrainingAcademy } from '@/components/worker/TrainingAcademy';

export default function FleetOwnerTrainingPage() {
  const t = useTranslations('fleetTraining');
  return (
    <div className="max-w-2xl mx-auto animate-[fadeUp_400ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">{t('eyebrow')}</p>
      <h1 className="font-heading text-ip-display-md font-extrabold mb-1">{t('title')}</h1>
      <p className="text-sm text-ip-on-surface-variant mb-8">{t('subtitle')}</p>
      <TrainingAcademy accent="primary" />
    </div>
  );
}
