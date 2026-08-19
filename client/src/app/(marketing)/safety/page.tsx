import { Card } from '@/components/ui/Card';
import { XIcon, CameraIcon, StarIcon, MapPinIcon, MessageIcon, AlertIcon } from '@/components/ui/icons';

// Every item here is a real, shipped mechanic — cross-referenced against
// the actual feature set (PhotoProofCapture, the mandatory-rating gate,
// useLiveLocationBroadcast, in-app chat over sockets, cancelMyBooking, and
// the Complaint model/report flow) rather than generic trust-page copy.
// Deliberately excludes a "KYC verification" claim: kycStatus exists on
// the User model but nothing in the backend gates a worker going online on
// it, so claiming it protects you here would be false.
const measures = [
  {
    icon: XIcon,
    title: 'Cancel without penalty',
    body: "Change your mind any time before a job is marked completed and cancel it — no fee, and you don't owe an explanation.",
  },
  {
    icon: CameraIcon,
    title: 'Photo proof at pickup and delivery',
    body: 'Drivers and Hamali workers attach a photo before they can advance a job past pickup, and again before marking it delivered — a real record attached to the booking, not just a status label.',
  },
  {
    icon: StarIcon,
    title: 'Two-way ratings, every job',
    body: 'Customers rate their driver or Hamali team, and workers rate the customer, right after each job — it\'s mandatory before either side can start their next one, so the rating history you see is genuinely complete, not a self-selected sample.',
  },
  {
    icon: MapPinIcon,
    title: 'Live location while a job is in progress',
    body: 'Once a driver or Hamali worker marks a job "in transit," their location streams to your tracking screen in real time until delivery — you\'re never guessing where your shipment is.',
  },
  {
    icon: MessageIcon,
    title: 'In-app chat, no raw numbers shared',
    body: 'Coordinate pickup details through the booking\'s in-app chat. FYRO doesn\'t hand your phone number to the other side, or theirs to you.',
  },
  {
    icon: AlertIcon,
    title: 'Report an issue on any booking',
    body: 'Every booking has a "Report an issue" action that opens a complaint straight to our team — no-shows, damage, payment disputes, or misconduct, logged against that specific job.',
  },
];

export default function SafetyPage() {
  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="absolute -top-32 -right-32 w-[24rem] h-[24rem] rounded-full bg-primary/10 blur-[110px] -z-10" />

      <div className="max-w-5xl mx-auto px-6 pt-24 pb-24">
        <div className="max-w-xl mb-16">
          <span aria-hidden className="inline-block w-12 h-1.5 rounded-full bg-primary-600 mb-6" />
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-text-primary mb-4">Trust &amp; safety</h1>
          <p className="text-text-muted text-lg leading-relaxed">
            What actually protects you on FYRO — every item below is a feature already running in the
            product, not a promise for later.
          </p>
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
