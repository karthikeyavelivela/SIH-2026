import { Card } from '@/components/ui/Card';

export default function AboutPage() {
  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="absolute -top-20 -right-32 w-[24rem] h-[24rem] rounded-full bg-primary/10 blur-[110px] -z-10" />

      <div className="max-w-5xl mx-auto px-6 pt-24 pb-24 grid md:grid-cols-[1fr_1.4fr] gap-10 md:gap-14 items-start">
        <div>
          <span aria-hidden className="inline-block w-12 h-1.5 rounded-full bg-primary-600 mb-6" />
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-text-primary">About FYRO</h1>
        </div>
        <Card className="p-8 md:p-10 hover:shadow-lg transition-shadow duration-base ease-out-expo">
          <p className="text-text-muted leading-relaxed text-lg">
            FYRO — Find Your Right One — is an on-demand logistics marketplace launching in Andhra
            Pradesh. We connect customers who need cargo moved or loaded with verified truck drivers
            and Hamali labor, matched in real time, tracked live, at a fixed fare shown upfront.
          </p>
        </Card>
      </div>
    </div>
  );
}
