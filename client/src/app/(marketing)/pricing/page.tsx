const rateCard = [
  { category: 'Small vehicle (up to 1T)', base: '₹150', perKm: '₹18/km', min: '₹250' },
  { category: 'Medium vehicle (1T–5T)', base: '₹400', perKm: '₹28/km', min: '₹600' },
  { category: 'Large vehicle (5T+)', base: '₹900', perKm: '₹45/km', min: '₹1200' },
  { category: 'Hamali (per worker)', base: '₹100', perKm: '—', min: '₹300' },
];

export default function PricingPage() {
  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="absolute -top-32 -left-32 w-[24rem] h-[24rem] rounded-full bg-primary/10 blur-[110px] -z-10" />

      <div className="max-w-4xl mx-auto px-6 pt-24 pb-24">
        <div className="max-w-xl mb-12">
          <span aria-hidden className="inline-block w-12 h-1.5 rounded-full bg-secondary-600 mb-6" />
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-text-primary mb-4">Pricing</h1>
          <p className="text-text-muted text-lg leading-relaxed">
            Illustrative Andhra Pradesh rate card. Final fare is calculated per booking based on
            distance, cargo, and live demand, and shown in full before you confirm.
          </p>
        </div>

        <div className="rounded-lg overflow-hidden shadow-md bg-surface-raised border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface text-left border-b border-border">
                <th scope="col" className="px-6 py-4 font-heading text-xs font-bold uppercase tracking-wider text-text-muted">
                  Category
                </th>
                <th scope="col" className="px-6 py-4 font-heading text-xs font-bold uppercase tracking-wider text-text-muted">
                  Base fare
                </th>
                <th scope="col" className="px-6 py-4 font-heading text-xs font-bold uppercase tracking-wider text-text-muted">
                  Per km
                </th>
                <th scope="col" className="px-6 py-4 font-heading text-xs font-bold uppercase tracking-wider text-text-muted">
                  Minimum
                </th>
              </tr>
            </thead>
            <tbody>
              {rateCard.map((r) => (
                <tr
                  key={r.category}
                  className="border-t border-border hover:bg-surface/60 transition-colors duration-base"
                >
                  <td className="px-6 py-4 font-semibold text-text-primary">{r.category}</td>
                  <td className="px-6 py-4 text-text-muted">{r.base}</td>
                  <td className="px-6 py-4 text-text-muted">{r.perKm}</td>
                  <td className="px-6 py-4 text-secondary-600 font-semibold">{r.min}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
