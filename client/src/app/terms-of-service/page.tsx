import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/Card';
import { ChevronLeftIcon, ShieldIcon } from '@/components/ui/icons';

// Static legal content page (design/stitch/.../terms_of_service). Real
// FYRO-appropriate copy — not lorem ipsum — describing rights/responsibilities
// consistent with the actual product (independent driver/Hamali marketplace,
// upfront fixed fares, no in-app payment gateway, India/Andhra Pradesh
// jurisdiction). This is informational copy for the app, not a substitute
// for reviewed legal counsel.
const SECTION_KEYS = ['userResponsibilities', 'liability', 'dataPrivacy', 'governingLaw'] as const;

export default async function TermsOfServicePage() {
  const t = await getTranslations('shared.terms');

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link
            href="/"
            aria-label={t('back')}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface transition-colors duration-fast flex-shrink-0"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </Link>
          <span className="text-xs font-bold uppercase tracking-[0.15em] text-text-muted">{t('eyebrow')}</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface border border-border px-3 py-1 text-xs font-medium text-text-muted mb-6">
          {t('lastUpdated')}
        </span>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-text-primary mb-4">{t('title')}</h1>
        <p className="text-text-muted leading-relaxed mb-10">{t('subtitle')}</p>

        <div className="space-y-10">
          {SECTION_KEYS.map((key) => (
            <section key={key}>
              <h2 className="font-heading text-lg font-bold text-primary-600 mb-3">{t(`sections.${key}.heading`)}</h2>
              <p className="text-text-muted leading-relaxed mb-3">{t(`sections.${key}.body1`)}</p>
              <p className="text-text-muted leading-relaxed">{t(`sections.${key}.body2`)}</p>
              {key === 'dataPrivacy' && (
                <Card
                  elevation="flat"
                  className="mt-4 border-l-4 border-primary-600 rounded-md italic text-sm text-text-muted"
                >
                  {t('sections.dataPrivacy.note')}
                </Card>
              )}
            </section>
          ))}
        </div>

        <div className="mt-14 pt-8 border-t border-border text-center">
          <ShieldIcon className="w-6 h-6 text-primary-600 mx-auto mb-4" />
          <p className="text-sm text-text-muted max-w-sm mx-auto">{t('acknowledgment')}</p>
        </div>
      </div>
    </div>
  );
}
