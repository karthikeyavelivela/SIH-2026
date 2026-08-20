'use client';

import { TrainingAcademy } from '@/components/worker/TrainingAcademy';

export default function FleetOwnerTrainingPage() {
  return (
    <div className="max-w-2xl mx-auto animate-[fadeUp_400ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">Partner hub</p>
      <h1 className="font-heading text-ip-display-md font-extrabold mb-1">Training Academy</h1>
      <p className="text-sm text-ip-on-surface-variant mb-8">
        Complete your mandatory training modules to unlock active fleet-partner status.
      </p>
      <TrainingAcademy accent="primary" />
    </div>
  );
}
