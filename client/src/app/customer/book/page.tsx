'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// /customer/book used to be one shared form for all three dispatch modes.
// It's now three real, separate pages per the actual Stitch screens
// (household/labour/transport). This is a compatibility redirect for any
// existing bookmark/link — ?category= (household's own param) and the old
// ?type= are both forwarded so nothing that pointed here breaks silently.
export default function LegacyBookRedirect() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const type = params.get('type');
    const category = params.get('category');
    const qs = category ? `?category=${encodeURIComponent(category)}` : '';
    if (type === 'truck') router.replace('/customer/book/transport');
    else if (category === 'general_labour' || type === 'hamali' && !category) router.replace(`/customer/book/labour`);
    else router.replace(`/customer/book/household${qs}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
