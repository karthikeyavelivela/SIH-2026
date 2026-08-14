const sections = [
  {
    title: 'For customers',
    body: 'Post a booking with pickup/drop points and cargo details, or request Hamali labor for loading and unloading — or bundle both. Nearby drivers and Hamali workers are offered your job one at a time, so you always get a real acceptance, not a fake instant match. Track your assigned driver or team live on the map, chat in-app, and pay securely when the job is done.',
  },
  {
    title: 'For drivers',
    body: 'Go online and receive job requests matched to your vehicle capacity and location. Accept or reject within a visible countdown. Follow a clear status stepper from pickup to delivery, and track your earnings and incentives in one place.',
  },
  {
    title: 'For Hamali workers',
    body: 'Work solo, or as part of a Mutha (labor group). Solo workers accept jobs directly. Mutha leaders receive requests on behalf of their group and assign members — even splitting one group across multiple job sites at once.',
  },
];

export default function HowItWorksPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-20">
      <h1 className="font-heading text-4xl font-bold mb-12">How it works</h1>
      <div className="space-y-10">
        {sections.map((s) => (
          <div key={s.title}>
            <h2 className="font-heading text-xl font-semibold mb-2">{s.title}</h2>
            <p className="text-text-muted leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
