import { getTranslations } from 'next-intl/server';
import { EditorialPage, PageHead, Chapter, Plate } from '@/components/marketing/Editorial';

/* Six protections, each one a feature that is actually running — the
   cancel guard, the photo-proof gate, the mandatory two-way rating, the
   live location stream, in-app chat without number sharing, and the
   per-booking complaint route. Nothing here is a roadmap promise, which is
   why the page says so in its own lede. */

const MEASURE_KEYS = [
  'cancelWithoutPenalty',
  'photoProof',
  'twoWayRatings',
  'liveLocation',
  'inAppChat',
  'reportIssue',
] as const;

const GLYPH: Record<(typeof MEASURE_KEYS)[number], string> = {
  cancelWithoutPenalty: 'free_cancellation',
  photoProof: 'photo_camera',
  twoWayRatings: 'star_half',
  liveLocation: 'share_location',
  inAppChat: 'forum',
  reportIssue: 'report',
};

export default async function SafetyPage() {
  const t = await getTranslations('marketing.safety');
  const th = await getTranslations('marketing.home');

  return (
    <EditorialPage>
      <PageHead
        eyebrow={th('charterLabel')}
        title={t('title')}
        accent={th('charterAccent')}
        lede={t('subtitle')}
      />

      <Chapter num="01" label={th('charterRight')} right={th('manifestoQuoteSeal')}>
        <div className="grid gap-5 md:grid-cols-2">
          {MEASURE_KEYS.map((key, i) => (
            <Plate key={key} className="flex flex-col gap-3 h-full">
              <div className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-2.5 min-w-0">
                  <span
                    aria-hidden
                    className="w-9 h-9 rounded-cell bg-fy-lime-tint-1 border border-fy-lime/50 flex items-center justify-center shrink-0"
                  >
                    <span className="material-symbols-outlined text-[18px] text-fy-green leading-none">
                      {GLYPH[key]}
                    </span>
                  </span>
                  <h2 className="font-heading text-title text-fy-ink leading-snug">
                    {t(`measures.${key}.title`)}
                  </h2>
                </span>
                <span className="font-mono text-[10px] text-fy-brown font-bold shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <p className="font-body text-body text-fy-ink-soft leading-relaxed">{t(`measures.${key}.body`)}</p>
            </Plate>
          ))}
        </div>
      </Chapter>

      <Chapter num="02" label={th('registerGuaranteeTitle')} right={th('publishedRateChip')}>
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
