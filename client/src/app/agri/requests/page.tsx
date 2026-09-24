'use client';

import { RequestsQueue } from '@/components/worker/RequestsQueue';

export default function AgriRequestsPage() {
  return <RequestsQueue base="/agri" accent="secondary" />;
}
