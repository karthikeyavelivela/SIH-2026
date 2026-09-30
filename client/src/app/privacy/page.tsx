import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PRIVACY_NOTICE_VERSION } from '@fyro/shared';
import { EditorialPage, PageHead, Chapter, Plate } from '@/components/marketing/Editorial';

// P1.8 — the privacy notice. Public (linked from signup). The retention
// periods and the grievance officer are real unknowns, and the page says so
// instead of inventing them: see HUMAN INPUT NEEDED in BUILD_PROGRESS.md.
const SECTIONS = ['collect', 'why', 'location', 'kyc', 'sharing', 'retention', 'rights', 'grievance', 'changes'] as const;

export default async function PrivacyNoticePage() {
  const t = await getTranslations('privacyNotice');

  return (
    <div className="min-h-screen bg-fy-bone">
      <div className="sticky top-0 z-20 bg-fy-bone/88 backdrop-blur-xl border-b border-fy-brown/12">
        <div className="max-w-5xl mx-auto px-gutter lg:px-8 h-16 flex items-center gap-3">
          <Link
            href="/"
            aria-label={t('back')}
            className="w-10 h-10 -ml-2 flex items-center justify-center rounded-full hover:bg-fy-panel transition-colors shrink-0"
          >
            <span aria-hidden className="material-symbols-outlined text-[20px] text-fy-ink">
              arrow_back
            </span>
          </Link>
        </div>
      </div>

      <EditorialPage>
        <PageHead eyebrow={t('version', { version: PRIVACY_NOTICE_VERSION })} title={t('title')} lede={t('intro')} />

        {SECTIONS.map((key, i) => {
          const pending = key === 'retention' || key === 'grievance';
          return (
            <Chapter key={key} num={String(i + 1).padStart(2, '0')} label={t(`${key}Title`)}>
              <div className="flex flex-col gap-4 max-w-3xl">
                {pending ? (
                  <Plate className="border-l-4 border-l-fy-brown">
                    <p className="font-body text-body text-fy-ink-soft leading-relaxed">
                      {t(key === 'retention' ? 'retentionPending' : 'grievancePending')}
                    </p>
                  </Plate>
                ) : (
                  <p className="font-body text-body text-fy-ink-soft leading-relaxed">{t(`${key}Body`)}</p>
                )}
              </div>
            </Chapter>
          );
        })}
      </EditorialPage>
    </div>
  );
}
