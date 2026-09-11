import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Media } from '@/components/ui/Media';
import { EditorialPage, PageHead, Chapter, Plate } from '@/components/marketing/Editorial';

/* The federation's own account of itself. The live figures are deliberately
   not repeated here — the landing page carries them from
   /api/public/stats, and restating them from a static file would let the
   two drift apart. */

export default async function AboutPage() {
  const t = await getTranslations('marketing.about');
  const th = await getTranslations('marketing.home');
  const tl = await getTranslations('marketing.layout');

  return (
    <EditorialPage>
      <PageHead eyebrow={th('manifestoLabel')} title={t('title')} accent={th('manifestoAccent')} lede={t('body')} />

      <Chapter num="01" label={th('manifestoRight')} right={th('manifestoQuoteSeal')}>
        <div className="grid gap-6 lg:grid-cols-12 items-start">
          <div className="lg:col-span-7 flex flex-col gap-5">
            <div className="flex flex-col gap-4 text-fy-ink-soft font-body text-body-lg font-light leading-relaxed border-l-2 border-fy-brown/40 pl-6">
              <p>{th('manifestoP1')}</p>
            </div>
            <Plate className="relative">
              <span aria-hidden className="font-heading text-5xl text-fy-brown/20 absolute -top-2 left-3 select-none">
                &ldquo;
              </span>
              <p className="font-heading italic text-body-lg text-fy-ink pl-6 leading-relaxed">
                {th('manifestoQuote')}
              </p>
              <div className="mt-5 pl-6 pt-4 border-t border-fy-brown/10 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-fy-muted tracking-wider">
                <span className="font-semibold text-fy-brown">{th('manifestoQuoteAttr')}</span>
                <span className="text-fy-green font-bold">{th('manifestoQuoteSeal')}</span>
              </div>
            </Plate>
          </div>

          <div className="lg:col-span-5">
            <div className="p-3 bg-fy-card border border-fy-brown/20 shadow-float rounded-card">
              <div className="relative overflow-hidden aspect-[4/3] rounded-cell bg-fy-dim">
                <Media
                  id="about.team"
                  kind="photo"
                  fill
                  treatment="full-bleed"
                  tint="household"
                  alt=""
                  className="w-full h-full"
                />
              </div>
              <div className="p-3 flex items-center justify-between gap-2 font-mono text-[11px] text-fy-muted">
                <span className="font-medium text-fy-ink truncate">{tl('federationName')}</span>
                <span className="text-fy-brown font-semibold shrink-0">{tl('sealSub')}</span>
              </div>
            </div>
          </div>
        </div>
      </Chapter>

      <Chapter num="02" label={th('charterLabel')} right={th('charterRight')}>
        <div className="grid gap-5 md:grid-cols-3">
          {(['rotation', 'fixedFare', 'surplus'] as const).map((c, i) => (
            <Plate key={c} className="flex flex-col justify-between gap-6 h-full">
              <div className="flex flex-col gap-3">
                <span className="font-mono text-[10px] uppercase tracking-widest text-fy-brown font-bold">
                  0{i + 1} / {th(`charterCards.${c}.title`)}
                </span>
                <p className="font-heading italic text-body-lg text-fy-ink leading-snug">
                  {th(`charterCards.${c}.body`)}
                </p>
              </div>
              <span className="pt-4 border-t border-fy-brown/10 font-mono text-[10px] text-fy-muted uppercase tracking-wider">
                {th(`charterCards.${c}.source`)}
              </span>
            </Plate>
          ))}
        </div>
      </Chapter>

      <Chapter num="03" label={th('closingChip')} right={tl('federatedChip')}>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/signup/customer"
            className="px-7 py-4 bg-fy-brown hover:bg-fy-brown-soft text-fy-bone font-mono text-[11px] font-semibold uppercase tracking-widest rounded-cell shadow-card transition-colors"
          >
            {th('closingPatronCta')}
          </Link>
          <Link
            href="/signup/driver"
            className="px-7 py-4 bg-fy-card hover:bg-fy-panel border border-fy-brown/25 text-fy-ink font-mono text-[11px] font-semibold uppercase tracking-widest rounded-cell transition-colors"
          >
            {th('closingDriveCta')}
          </Link>
        </div>
      </Chapter>
    </EditorialPage>
  );
}
