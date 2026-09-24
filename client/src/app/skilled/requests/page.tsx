'use client';

import { RequestsQueue } from '@/components/worker/RequestsQueue';

export default function SkilledRequestsPage() {
  return <RequestsQueue base="/skilled" accent="secondary" />;
}
