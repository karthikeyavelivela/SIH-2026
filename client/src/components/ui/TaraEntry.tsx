'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/Icon';

/**
 * The one way into TARA.
 *
 * Before this there were five separate "ask the AI" widgets — one per
 * dashboard, each with its own copy, its own open/closed state and its own
 * inline answer box. They were the same feature, so a person who learned it
 * in one place had no way to know it existed anywhere else, and none of them
 * kept any history.
 *
 * This is deliberately a link, not another inline chat: the conversation
 * lives at /assistant, keeps its transcript, and is the same screen from
 * every role's dashboard. One place to learn, one place to look.
 */
export function TaraEntry({ accent = 'primary' }: { accent?: 'primary' | 'secondary' }) {
  const t = useTranslations('tara');

  return (
    <Link
      href="/assistant"
      className="flex items-center gap-3 p-4 rounded-card bg-fy-field hover:bg-fy-well transition-colors duration-base w-full text-left mb-3"
    >
      <span
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
          accent === 'primary' ? 'bg-fy-brown/10 text-fy-brown' : 'bg-fy-green/10 text-fy-green'
        }`}
      >
        <Icon name="auto_awesome" size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-body text-body font-semibold text-fy-ink">{t('entryTitle')}</span>
        <span className="block font-body text-label text-fy-muted">{t('entryHint')}</span>
      </span>
      <Icon name="chevron_right" size={18} className="text-fy-muted shrink-0" />
    </Link>
  );
}
