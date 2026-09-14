'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { StatusPill } from '@/components/fy/Status';

/**
 * The way into quotations, for either side.
 *
 * It carries a count of what is actually waiting on this person, because a
 * quotation request nobody answers is a customer standing still. A worker
 * sees the requests owed; a customer sees the quotes they can act on.
 */

const WORKER_NEEDS_ACTION = ['requested', 'visit_done', 'negotiating'];
const CUSTOMER_NEEDS_ACTION = ['submitted'];

export function QuotationLink({ href, as }: { href: string; as: 'worker' | 'customer' }) {
  const t = useTranslations('pricing.quotation');
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    const states = as === 'worker' ? WORKER_NEEDS_ACTION : CUSTOMER_NEEDS_ACTION;
    api
      .get<{ quotations: { status: string }[] }>(`/api/quotations${as === 'worker' ? '?as=worker' : ''}`)
      .then((res) => setWaiting(res.quotations.filter((q) => states.includes(q.status)).length))
      .catch(() => {});
  }, [as]);

  return (
    <Link href={href} className="block">
      <div className="fy-surface-card flex items-center gap-3 hover:bg-fy-well transition-colors">
        <span className="w-10 h-10 rounded-full bg-fy-brown/10 text-fy-brown flex items-center justify-center shrink-0">
          <Icon name="request_quote" size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-body text-body font-semibold text-fy-ink">
            {as === 'worker' ? t('workerEntry') : t('customerEntry')}
          </span>
          <span className="block font-body text-label text-fy-muted">
            {as === 'worker' ? t('workerEntryHint') : t('customerEntryHint')}
          </span>
        </span>
        {waiting > 0 && <StatusPill tone="lime">{waiting}</StatusPill>}
        <Icon name="chevron_right" size={18} className="text-fy-muted shrink-0" />
      </div>
    </Link>
  );
}
