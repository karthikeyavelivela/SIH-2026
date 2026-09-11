import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EditorialPage, PageHead, Chapter, Plate } from '@/components/marketing/Editorial';

// Static legal content page (design/stitch/.../terms_of_service). Real
// FYRO-appropriate copy — not lorem ipsum — describing rights/responsibilities
// consistent with the actual product (independent driver/Hamali marketplace,
// upfront fixed fares, no in-app payment gateway, India/Andhra Pradesh
// jurisdiction). This is informational copy for the app, not a substitute
// for reviewed legal counsel.
//
// It sits outside the (marketing) route group — it is linked from signup and
// from inside the app as well as from the footer — so it carries its own
// back link and renders the editorial furniture directly.
const SECTION_KEYS = ['userResponsibilities', 'liability', 'dataPrivacy', 'governingLaw'] as const;

export default async function TermsOfServicePage() {
  const t = await getTranslations('shared.terms');

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
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-fy-muted">{t('eyebrow')}</span>
        </div>
      </div>

      <EditorialPage>
        <PageHead
          eyebrow={t('lastUpdated')}
          title={t('title')}
          lede={t('subtitle')}
        />

        {SECTION_KEYS.map((key, i) => (
          <Chapter key={key} num={String(i + 1).padStart(2, '0')} label={t(`sections.${key}.heading`)}>
            <div className="flex flex-col gap-4 max-w-3xl">
              <p className="font-body text-body text-fy-ink-soft leading-relaxed">{t(`sections.${key}.body1`)}</p>
              <p className="font-body text-body text-fy-ink-soft leading-relaxed">{t(`sections.${key}.body2`)}</p>
              {key === 'dataPrivacy' && (
                <Plate className="border-l-4 border-l-fy-brown">
                  <p className="font-heading italic text-body text-fy-ink-soft leading-relaxed">
                    {t('sections.dataPrivacy.note')}
                  </p>
                </Plate>
              )}
            </div>
          </Chapter>
        ))}

        <div className="pt-8 border-t border-fy-brown/15 flex flex-col items-center gap-4 text-center">
          <span
            aria-hidden
            className="w-11 h-11 rounded-cell bg-fy-lime-tint-1 border border-fy-lime/50 flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[22px] text-fy-green leading-none">verified_user</span>
          </span>
          <p className="font-body text-label text-fy-ink-soft max-w-sm">{t('acknowledgment')}</p>
        </div>
      </EditorialPage>
    </div>
  );
}
