import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/Card';

const SECTION_KEYS = ['customers', 'drivers', 'hamaliWorkers'] as const;

export default async function HowItWorksPage() {
  const t = await getTranslations('marketing.howItWorks');
  const sections = SECTION_KEYS.map((key) => ({
    title: t(`${key}.title`),
    body: t(`${key}.body`),
  }));

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="absolute -top-32 -right-32 w-[24rem] h-[24rem] rounded-full bg-secondary/10 blur-[110px] -z-10" />

      <div className="max-w-4xl mx-auto px-6 pt-24 pb-24">
        <div className="max-w-xl mb-16">
          <span aria-hidden className="inline-block w-12 h-1.5 rounded-full bg-primary-600 mb-6" />
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-text-primary">{t('title')}</h1>
        </div>

        <div className="space-y-8">
          {sections.map((s, i) => (
            <div key={s.title} className={i % 2 === 1 ? 'md:ml-16' : ''}>
              <Card className="relative overflow-hidden md:flex md:gap-8 md:items-start hover:shadow-lg transition-shadow duration-base ease-out-expo">
                <span
                  aria-hidden
                  className="select-none font-heading text-6xl md:text-7xl font-extrabold text-secondary/10 leading-none shrink-0 block mb-4 md:mb-0"
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h2 className="font-heading text-xl font-bold mb-3 text-text-primary">{s.title}</h2>
                  <p className="text-text-muted leading-relaxed">{s.body}</p>
                </div>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
