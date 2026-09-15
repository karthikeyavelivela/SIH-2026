'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel } from '@/components/fy/Surfaces';
import { EyebrowLabel, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { TopBar } from '@/components/fy/Navigation';

/**
 * The worker's quotation queue.
 *
 * Ordered by what needs doing rather than by date: a request nobody has
 * answered and a visit nobody has written up are the two states where the
 * customer is waiting on this worker, so they sort first.
 */

const NEEDS_ACTION = ['requested', 'visit_done', 'negotiating'];

export default function WorkerQuotationsScreen() {
  const t = useTranslations('pricing.quotation');
  const router = useRouter();
  const pathname = usePathname();
  // /hamali/quotations -> /hamali
  const base = pathname.replace(/\/quotations.*$/, '');

  const [rows, setRows] = useState<
    { _id: string; status: string; jobDescription: string; total: number; updatedAt: string; customerId?: { name?: string } }[]
  >([]);

  useEffect(() => {
    api
      .get<{ quotations: typeof rows }>('/api/quotations?as=worker')
      .then((res) =>
        setRows(
          [...res.quotations].sort((a, b) => {
            const aNeeds = NEEDS_ACTION.includes(a.status) ? 0 : 1;
            const bNeeds = NEEDS_ACTION.includes(b.status) ? 0 : 1;
            return aNeeds - bNeeds || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          })
        )
      )
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-fy-bone fy-pad-nav">
      <TopBar title={t('title')} showBack onBack={() => router.push(`${base}/dashboard`)} />
      <main className="pt-16 px-gutter max-w-2xl mx-auto flex flex-col gap-3">
        {rows.length === 0 ? (
          <LightCard>
            <Body size="label">{t('noneWorker')}</Body>
          </LightCard>
        ) : (
          rows.map((q) => (
            <Link key={q._id} href={`${base}/quotations/${q._id}`}>
              <Panel
                className={`flex items-start justify-between gap-3 hover:bg-fy-well transition-colors ${
                  NEEDS_ACTION.includes(q.status) ? 'border-l-[3px] border-l-fy-brown' : ''
                }`}
              >
                <span className="min-w-0">
                  <EyebrowLabel tone="brown">{t(`status.${q.status}` as never)}</EyebrowLabel>
                  <Body size="label" className="truncate">
                    {q.jobDescription}
                  </Body>
                  <span className="font-mono text-[10px] text-fy-muted">
                    {q.customerId?.name ?? ''} · {new Date(q.updatedAt).toLocaleDateString()}
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {q.total > 0 && <StatusPill tone="neutral">₹{q.total}</StatusPill>}
                  <Icon name="chevron_right" size={16} className="text-fy-muted" />
                </span>
              </Panel>
            </Link>
          ))
        )}
      </main>
    </div>
  );
}
