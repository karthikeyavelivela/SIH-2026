import { getTranslations } from 'next-intl/server';

const ROW_KEYS = ['smallVehicle', 'mediumVehicle', 'largeVehicle', 'hamali'] as const;

export default async function PricingPage() {
  const t = await getTranslations('marketing.pricing');
  const rateCard = ROW_KEYS.map((key) => ({
    category: t(`rows.${key}.category`),
    base: t(`rows.${key}.base`),
    perKm: t(`rows.${key}.perKm`),
    min: t(`rows.${key}.min`),
  }));

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="absolute -top-32 -left-32 w-[24rem] h-[24rem] rounded-full bg-fy-brown/10 blur-[110px] -z-10" />

      <div className="max-w-4xl mx-auto px-6 pt-24 pb-24">
        <div className="max-w-xl mb-12">
          <span aria-hidden className="inline-block w-12 h-1.5 rounded-full bg-fy-green mb-6" />
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-fy-ink mb-4">{t('title')}</h1>
          <p className="text-fy-muted text-lg leading-relaxed">{t('subtitle')}</p>
        </div>

        <div className="rounded-card overflow-hidden shadow-md bg-fy-card border border-fy-hairline">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-fy-panel text-left border-b border-fy-hairline">
                <th scope="col" className="px-6 py-4 font-heading text-xs font-bold uppercase tracking-wider text-fy-muted">
                  {t('tableHeaders.category')}
                </th>
                <th scope="col" className="px-6 py-4 font-heading text-xs font-bold uppercase tracking-wider text-fy-muted">
                  {t('tableHeaders.baseFare')}
                </th>
                <th scope="col" className="px-6 py-4 font-heading text-xs font-bold uppercase tracking-wider text-fy-muted">
                  {t('tableHeaders.perKm')}
                </th>
                <th scope="col" className="px-6 py-4 font-heading text-xs font-bold uppercase tracking-wider text-fy-muted">
                  {t('tableHeaders.minimum')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rateCard.map((r) => (
                <tr
                  key={r.category}
                  className="border-t border-fy-hairline hover:bg-fy-panel/60 transition-colors duration-base"
                >
                  <td className="px-6 py-4 font-semibold text-fy-ink">{r.category}</td>
                  <td className="px-6 py-4 text-fy-muted">{r.base}</td>
                  <td className="px-6 py-4 text-fy-muted">{r.perKm}</td>
                  <td className="px-6 py-4 text-fy-green font-semibold">{r.min}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
