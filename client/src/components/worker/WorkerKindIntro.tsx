'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { TRADE_GLYPH, TRADE_SKILLS, type WorkerKind } from '@/lib/workerArea';

/**
 * The top of a skilled or farm worker's dashboard: what this area is for,
 * and — for a skilled worker — exactly which trades jobs will arrive for.
 *
 * The trades are the whole matching rule (a plumbing job reaches only
 * workers who list plumbing), so they are on the home screen with a way to
 * change them, not buried in profile settings. A skilled worker with none
 * is told plainly that no job can reach them yet.
 */
export function WorkerKindIntro({ kind, profileHref }: { kind: Exclude<WorkerKind, 'hamali'>; profileHref: string }) {
  const t = useTranslations('workerKinds');
  const [skills, setSkills] = useState<string[] | null>(null);

  useEffect(() => {
    api
      .get<{ skills: string[] }>('/api/hamali-profile/me')
      .then((r) => setSkills(r.skills))
      .catch(() => setSkills([]));
  }, []);

  if (kind === 'agri') {
    return (
      <div className="rounded-card bg-fy-lime-tint-1 border border-fy-green/15 p-4 flex items-start gap-3">
        <span className="w-10 h-10 rounded-full bg-fy-green text-fy-bone flex items-center justify-center shrink-0">
          <Icon name="agriculture" size={20} />
        </span>
        <div className="min-w-0">
          <p className="font-body text-body font-semibold text-fy-ink">{t('agri.title')}</p>
          <p className="font-body text-label text-fy-ink-soft mt-0.5">{t('agri.body')}</p>
        </div>
      </div>
    );
  }

  const trades = (skills ?? []).filter((s): s is (typeof TRADE_SKILLS)[number] => TRADE_SKILLS.includes(s as never));

  return (
    <div className="rounded-card bg-fy-card border border-fy-hairline/60 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-body text-body font-semibold text-fy-ink">{t('skilled.yourTrades')}</p>
        <Link href={profileHref} className="font-body text-label font-semibold text-fy-brown hover:underline">
          {t('skilled.edit')}
        </Link>
      </div>
      {skills === null ? (
        <div className="h-8 rounded-full bg-fy-field animate-pulse w-2/3" />
      ) : trades.length === 0 ? (
        <p role="alert" className="font-body text-label text-fy-on-error-bg bg-fy-error-bg rounded-control px-3 py-2">
          {t('skilled.none')}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {trades.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-fy-brown/8 text-fy-ink font-body text-label"
            >
              <Icon name={TRADE_GLYPH[s]} size={15} className="text-fy-brown" />
              {t(`trades.${s}`)}
            </span>
          ))}
        </div>
      )}
      <p className="font-body text-label text-fy-ink-soft">{t('skilled.note')}</p>
    </div>
  );
}
