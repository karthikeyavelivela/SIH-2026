'use client';

import { WorkerDashboard } from '@/components/worker/WorkerDashboard';
import { WorkerKindIntro } from '@/components/worker/WorkerKindIntro';
import { HAMALI_WILLING_RADIUS_KM } from '@/lib/matchingConstants';

export default function SkilledDashboardPage() {
  return (
    <WorkerDashboard
      base="/skilled"
      accent="primary"
      radiusKm={HAMALI_WILLING_RADIUS_KM}
      intro={<WorkerKindIntro kind="skilled" profileHref="/skilled/profile" />}
    />
  );
}
