import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { EditorialPage, PageHead, Chapter, Plate } from '@/components/marketing/Editorial';

/* The three audiences the platform actually serves, set in the landing
   page's own register. Each block's copy describes behaviour that exists:
   the sequential offer engine, the visible countdown, the status stepper,
   and the society route for Hamali members. */

const SECTION_KEYS = ['customers', 'drivers', 'hamaliWorkers'] as const;

const GLYPH: Record<(typeof SECTION_KEYS)[number], string> = {
  customers: 'shopping_bag',
  drivers: 'local_shipping',
  hamaliWorkers: 'engineering',
};

const SIGNUP_HREF: Record<(typeof SECTION_KEYS)[number], string> = {
  customers: '/signup/customer',
  drivers: '/signup/driver',
  hamaliWorkers: '/signup/hamali',
};

export default async function HowItWorksPage() {
  const t = await getTranslations('marketing.howItWorks');
  const th = await getTranslations('marketing.home');

  return (
    <EditorialPage>
      <PageHead eyebrow={th('manifestoLabel')} title={t('title')} accent={th('divisionsSub')} />

      {SECTION_KEYS.map((key, i) => (
        <Chapter key={key} num={`0${i + 1}`} label={t(`${key}.title`)} right={th('publishedRateChip')}>
          <div className="grid gap-5 lg:grid-cols-12 items-start">
            <div className="lg:col-span-8">
              <Plate className="flex flex-col gap-4">
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="w-11 h-11 rounded-cell bg-fy-lime-tint-1 border border-fy-lime/50 flex items-center justify-center shrink-0"
                  >
                    <span className="material-symbols-outlined text-[22px] text-fy-green leading-none">
                      {GLYPH[key]}
                    </span>
                  </span>
                  <h2 className="font-heading text-title sm:text-heading text-fy-ink leading-tight">
                    {t(`${key}.title`)}
                  </h2>
                </span>
                <p className="font-body text-body-lg text-fy-ink-soft font-light leading-relaxed">
                  {t(`${key}.body`)}
                </p>
              </Plate>
            </div>
            <div className="lg:col-span-4">
              <Link
                href={SIGNUP_HREF[key]}
                className="group flex items-center justify-between gap-3 bg-fy-brown hover:bg-fy-brown-soft text-fy-bone rounded-card px-5 py-4 shadow-card transition-colors"
              >
                <span className="font-mono text-[11px] uppercase tracking-widest font-semibold">
                  {th('ctaEngage')}
                </span>
                <span
                  aria-hidden
                  className="material-symbols-outlined text-sm text-fy-lime group-hover:translate-x-1 transition-transform"
                >
                  arrow_forward
                </span>
              </Link>
            </div>
          </div>
        </Chapter>
      ))}

      <Chapter num="04" label={th('charterLabel')} right={th('charterRight')}>
        <Plate className="flex flex-col gap-3">
          <p className="font-heading italic text-body-lg text-fy-ink leading-relaxed">{th('manifestoQuote')}</p>
          <span className="font-mono text-[10px] uppercase tracking-widest text-fy-brown font-semibold">
            {th('manifestoQuoteAttr')}
          </span>
        </Plate>
      </Chapter>
    </EditorialPage>
  );
}
