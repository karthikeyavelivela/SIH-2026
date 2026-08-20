'use client';

import { TrainingAcademy } from '@/components/worker/TrainingAcademy';

export default function DriverTrainingPage() {
  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-xl font-bold mb-1">Training Academy</h1>
      <p className="text-sm text-text-muted mb-6">Complete your curriculum to unlock full certified status.</p>
      <TrainingAcademy accent="primary" />
    </div>
  );
}
