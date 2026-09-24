'use client';

import { WorkerDashboard } from '@/components/worker/WorkerDashboard';
import { WorkerKindIntro } from '@/components/worker/WorkerKindIntro';
import { HAMALI_WILLING_RADIUS_KM } from '@/lib/matchingConstants';

export default function AgriDashboardPage() {
  return (
    <WorkerDashboard
      base="/agri"
      accent="secondary"
      radiusKm={HAMALI_WILLING_RADIUS_KM}
      intro={<WorkerKindIntro kind="agri" profileHref="/agri/profile" />}
    />
  );
}
