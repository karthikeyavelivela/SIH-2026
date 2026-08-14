'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// No booking id given — nothing to track. Send to history to pick one.
export default function CustomerTrackIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/customer/history');
  }, [router]);
  return null;
}
