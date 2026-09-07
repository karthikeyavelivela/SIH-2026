'use client';

import { WorkerDashboard } from '@/components/worker/WorkerDashboard';
import { DRIVER_WILLING_RADIUS_KM } from '@/lib/matchingConstants';

export default function DriverDashboardPage() {
  return <WorkerDashboard base="/driver" accent="primary" radiusKm={DRIVER_WILLING_RADIUS_KM} />;
}
