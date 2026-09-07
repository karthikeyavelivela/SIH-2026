'use client';

import { RequestsQueue } from '@/components/worker/RequestsQueue';

export default function DriverRequestsPage() {
  return <RequestsQueue base="/driver" accent="primary" />;
}
