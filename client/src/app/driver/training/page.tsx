'use client';

import { useTranslations } from 'next-intl';
import { TrainingAcademy } from '@/components/worker/TrainingAcademy';

export default function DriverTrainingPage() {
  const t = useTranslations('training');
  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-xl font-bold mb-1">{t('academyTitle')}</h1>
      <p className="text-sm text-text-muted mb-6">{t('academySubtitle')}</p>
      <TrainingAcademy accent="primary" />
    </div>
  );
}
