import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/Card';
import { XIcon, CameraIcon, StarIcon, MapPinIcon, MessageIcon, AlertIcon } from '@/components/ui/icons';

// Every item here is a real, shipped mechanic — cross-referenced against
// the actual feature set (PhotoProofCapture, the mandatory-rating gate,
// useLiveLocationBroadcast, in-app chat over sockets, cancelMyBooking, and
// the Complaint model/report flow) rather than generic trust-page copy.
// Deliberately excludes a "KYC verification" claim: kycStatus exists on
// the User model but nothing in the backend gates a worker going online on
// it, so claiming it protects you here would be false.
const MEASURE_KEYS = [
  { key: 'cancelWithoutPenalty', icon: XIcon },
  { key: 'photoProof', icon: CameraIcon },
  { key: 'twoWayRatings', icon: StarIcon },
  { key: 'liveLocation', icon: MapPinIcon },
  { key: 'inAppChat', icon: MessageIcon },
  { key: 'reportIssue', icon: AlertIcon },
] as const;

export default async function SafetyPage() {
  const t = await getTranslations('marketing.safety');
  const measures = MEASURE_KEYS.map(({ key, icon }) => ({
    icon,
    title: t(`measures.${key}.title`),
    body: t(`measures.${key}.body`),
  }));

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="absolute -top-32 -right-32 w-[24rem] h-[24rem] rounded-full bg-primary/10 blur-[110px] -z-10" />

      <div className="max-w-5xl mx-auto px-6 pt-24 pb-24">
        <div className="max-w-xl mb-16">
          <span aria-hidden className="inline-block w-12 h-1.5 rounded-full bg-primary-600 mb-6" />
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-text-primary mb-4">{t('title')}</h1>
          <p className="text-text-muted text-lg leading-relaxed">{t('subtitle')}</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {measures.map((m) => (
            <Card key={m.title} className="hover:-translate-y-1 hover:shadow-lg transition-all duration-base ease-out-expo">
              <m.icon className="w-6 h-6 text-primary-600 mb-3" />
              <h2 className="font-heading text-base font-bold mb-2 text-text-primary">{m.title}</h2>
              <p className="text-sm text-text-muted leading-relaxed">{m.body}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
