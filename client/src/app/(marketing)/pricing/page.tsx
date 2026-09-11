import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { EditorialPage, PageHead, Chapter, Plate } from '@/components/marketing/Editorial';

/* The published rate schedule, set as the open register the landing page's
   section 04 points at. Same four rows, same source: marketing.pricing,
   which mirrors the seeded fare rules. No figure here is computed client-
   side — a real booking is always quoted by the server against the active
   rule for its region and category. */

const ROW_KEYS = ['smallVehicle', 'mediumVehicle', 'largeVehicle', 'hamali'] as const;

export default async function PricingPage() {
  const t = await getTranslations('marketing.pricing');
  const th = await getTranslations('marketing.home');

  const rateCard = ROW_KEYS.map((key) => ({
    key,
    category: t(`rows.${key}.category`),
    base: t(`rows.${key}.base`),
    perKm: t(`rows.${key}.perKm`),
    min: t(`rows.${key}.min`),
  }));

  return (
    <EditorialPage>
      <PageHead
        eyebrow={th('registerLabel')}
        title={t('title')}
        accent={th('registerSub')}
        lede={t('subtitle')}
      />

      <Chapter num="01" label={th('registerTableTitle')} right={th('registerTableRight')}>
        <div className="border border-fy-brown/15 bg-fy-card shadow-float rounded-card overflow-hidden">
          <div className="p-4 sm:px-6 bg-fy-panel border-b border-fy-brown/15 flex flex-wrap items-center justify-between gap-4 font-mono text-[11px]">
            <span className="flex items-center gap-3">
              <span aria-hidden className="w-2 h-2 rounded-full bg-fy-green" />
              <span className="text-fy-ink font-semibold tracking-wider">{th('registerTableTitle')}</span>
            </span>
            <span className="text-fy-muted">{th('registerTableRight')}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead>
                <tr className="border-b border-fy-brown/15">
                  {(['category', 'baseFare', 'perKm', 'minimum'] as const).map((h) => (
                    <th key={h} scope="col" className="text-left px-6 py-3">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-fy-muted">
                        {t(`tableHeaders.${h}`)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-fy-brown/10">
                {rateCard.map((r) => (
                  <tr key={r.key} className="hover:bg-fy-panel/70 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-body text-body font-medium text-fy-ink block">{r.category}</span>
                      <span className="font-mono text-[10px] text-fy-muted uppercase">{th('activeRule')}</span>
                    </td>
                    <td className="px-6 py-4 font-heading text-title text-fy-brown font-semibold">{r.base}</td>
                    <td className="px-6 py-4 font-body text-body text-fy-ink-soft">{r.perKm}</td>
                    <td className="px-6 py-4 font-body text-body text-fy-ink-soft">{r.min}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4 sm:px-6 bg-fy-panel/60 border-t border-fy-brown/15 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[11px] text-fy-muted">
            <span className="flex items-center gap-2">
              <span aria-hidden className="material-symbols-outlined text-sm text-fy-brown">lock</span>
              <span>{th('registerFootnote')}</span>
            </span>
            <Link href="/signup/customer" className="text-fy-brown hover:underline font-semibold">
              {th('ctaEngage')}
            </Link>
          </div>
        </div>
      </Chapter>

      <Chapter num="02" label={th('statCommissionLabel')} right={th('manifestoQuoteSeal')}>
        <div className="grid gap-5 md:grid-cols-2">
          <Plate className="flex flex-col gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-fy-muted">
              {th('statCommissionLabel')}
            </span>
            <span className="font-heading text-heading text-fy-green font-normal">10%</span>
            <p className="font-body text-body text-fy-ink-soft leading-relaxed">{th('statCommissionSub')}</p>
          </Plate>
          <Plate className="flex flex-col gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-fy-muted">
              {th('registerGuaranteeTitle')}
            </span>
            <p className="font-body text-body text-fy-ink-soft leading-relaxed">{th('registerGuaranteeBody')}</p>
          </Plate>
        </div>
      </Chapter>
    </EditorialPage>
  );
}
