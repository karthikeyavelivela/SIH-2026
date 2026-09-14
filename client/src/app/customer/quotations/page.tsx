'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel } from '@/components/fy/Surfaces';
import { EyebrowLabel, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { TopBar } from '@/components/fy/Navigation';

/** The customer's quotations, newest first. */
export default function CustomerQuotationsPage() {
  const t = useTranslations('pricing.quotation');
  const router = useRouter();
  const [rows, setRows] = useState<
    { _id: string; status: string; jobDescription: string; total: number; updatedAt: string; workerId?: { name?: string } }[]
  >([]);

  useEffect(() => {
    api
      .get<{ quotations: typeof rows }>('/api/quotations')
      .then((res) => setRows(res.quotations))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-fy-bone pb-24">
      <TopBar title={t('title')} showBack onBack={() => router.back()} />
      <main className="pt-16 px-gutter max-w-2xl mx-auto flex flex-col gap-3">
        {rows.length === 0 ? (
          <LightCard>
            <Body size="label">{t('noneCustomer')}</Body>
          </LightCard>
        ) : (
          rows.map((q) => (
            <Link key={q._id} href={`/customer/quotations/${q._id}`}>
              <Panel className="flex items-start justify-between gap-3 hover:bg-fy-well transition-colors">
                <span className="min-w-0">
                  <EyebrowLabel tone="brown">{t(`status.${q.status}` as never)}</EyebrowLabel>
                  <Body size="label" className="truncate">
                    {q.jobDescription}
                  </Body>
                  <span className="font-mono text-[10px] text-fy-muted">
                    {q.workerId?.name ?? ''} · {new Date(q.updatedAt).toLocaleDateString()}
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
