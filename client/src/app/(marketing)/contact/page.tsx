import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { EditorialPage, PageHead, Chapter, Plate } from '@/components/marketing/Editorial';

/* Two real addresses and the in-product route. A member with a problem on a
   specific job should use that booking's own complaint action rather than
   email, because that one attaches the grievance to the job — so it is
   named here as the first option, not buried. */

const DESKS = [
  { key: 'support', labelKey: 'supportLabel', valueKey: 'supportEmail', glyph: 'support_agent' },
  { key: 'partnerships', labelKey: 'partnershipsLabel', valueKey: 'partnershipsEmail', glyph: 'handshake' },
] as const;

export default async function ContactPage() {
  const t = await getTranslations('marketing.contact');
  const th = await getTranslations('marketing.home');
  const ts = await getTranslations('marketing.safety');

  return (
    <EditorialPage>
      <PageHead eyebrow={th('charterLabel')} title={t('title')} />

      <Chapter num="01" label={ts('measures.reportIssue.title')} right={th('manifestoQuoteSeal')}>
        <Plate className="flex flex-col gap-4">
          <p className="font-body text-body-lg text-fy-ink-soft font-light leading-relaxed">
            {ts('measures.reportIssue.body')}
          </p>
          <Link
            href="/customer/support"
            className="self-start px-6 py-3.5 bg-fy-brown hover:bg-fy-brown-soft text-fy-bone font-mono text-[11px] font-semibold uppercase tracking-widest rounded-cell shadow-card transition-colors inline-flex items-center gap-2.5"
          >
            <span aria-hidden className="material-symbols-outlined text-sm text-fy-lime">
              report
            </span>
            <span>{ts('measures.reportIssue.title')}</span>
          </Link>
        </Plate>
      </Chapter>

      <Chapter num="02" label={t('title')} right={th('registerTableRight')}>
        <div className="grid gap-5 sm:grid-cols-2">
          {DESKS.map((d, i) => (
            <Plate key={d.key} className="flex flex-col gap-3 h-full">
              <div className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-2.5 min-w-0">
                  <span
                    aria-hidden
                    className="w-9 h-9 rounded-cell bg-fy-lime-tint-1 border border-fy-lime/50 flex items-center justify-center shrink-0"
                  >
                    <span className="material-symbols-outlined text-[18px] text-fy-green leading-none">{d.glyph}</span>
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-fy-muted">
                    {t(d.labelKey)}
                  </span>
                </span>
                <span className="font-mono text-[10px] text-fy-brown font-bold shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <a
                href={`mailto:${t(d.valueKey)}`}
                className="font-heading text-title text-fy-ink hover:text-fy-brown transition-colors break-all"
              >
                {t(d.valueKey)}
              </a>
            </Plate>
          ))}
        </div>
      </Chapter>
    </EditorialPage>
  );
}
