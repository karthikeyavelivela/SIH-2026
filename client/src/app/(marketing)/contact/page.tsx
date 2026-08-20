import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/Card';

export default async function ContactPage() {
  const t = await getTranslations('marketing.contact');
  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="absolute -top-20 -left-32 w-[24rem] h-[24rem] rounded-full bg-secondary/10 blur-[110px] -z-10" />

      <div className="max-w-4xl mx-auto px-6 pt-24 pb-24">
        <div className="mb-12">
          <span aria-hidden className="inline-block w-12 h-1.5 rounded-full bg-secondary-600 mb-6" />
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-text-primary">{t('title')}</h1>
        </div>
        <div className="grid sm:grid-cols-2 gap-6 max-w-2xl">
          <Card className="hover:-translate-y-1 hover:shadow-lg transition-all duration-base ease-out-expo">
            <div className="text-xs font-bold uppercase tracking-wider text-secondary-600 mb-3">{t('supportLabel')}</div>
            <p className="text-text-primary font-medium">{t('supportEmail')}</p>
          </Card>
          <Card className="hover:-translate-y-1 hover:shadow-lg transition-all duration-base ease-out-expo">
            <div className="text-xs font-bold uppercase tracking-wider text-primary-600 mb-3">{t('partnershipsLabel')}</div>
            <p className="text-text-primary font-medium">{t('partnershipsEmail')}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
