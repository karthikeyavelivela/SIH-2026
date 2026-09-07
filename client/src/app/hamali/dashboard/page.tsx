'use client';

import { WorkerDashboard } from '@/components/worker/WorkerDashboard';
import { HAMALI_WILLING_RADIUS_KM } from '@/lib/matchingConstants';

export default function HamaliDashboardPage() {
  return <WorkerDashboard base="/hamali" accent="secondary" radiusKm={HAMALI_WILLING_RADIUS_KM} />;
}
