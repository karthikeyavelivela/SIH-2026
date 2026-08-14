const rateCard = [
  { category: 'Small vehicle (up to 1T)', base: '₹150', perKm: '₹18/km', min: '₹250' },
  { category: 'Medium vehicle (1T–5T)', base: '₹400', perKm: '₹28/km', min: '₹600' },
  { category: 'Large vehicle (5T+)', base: '₹900', perKm: '₹45/km', min: '₹1200' },
  { category: 'Hamali (per worker)', base: '₹100', perKm: '—', min: '₹300' },
];

export default function PricingPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-20">
      <h1 className="font-heading text-4xl font-bold mb-4">Pricing</h1>
      <p className="text-text-muted mb-10">
        Illustrative Andhra Pradesh rate card. Final fare is calculated per booking based on
        distance, cargo, and live demand, and shown in full before you confirm.
      </p>
      <div className="overflow-hidden rounded-2xl border border-black/5">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left">
            <tr>
              <th scope="col" className="px-5 py-3">Category</th>
              <th scope="col" className="px-5 py-3">Base fare</th>
              <th scope="col" className="px-5 py-3">Per km</th>
              <th scope="col" className="px-5 py-3">Minimum</th>
            </tr>
          </thead>
          <tbody>
            {rateCard.map((r) => (
              <tr key={r.category} className="border-t border-black/5">
                <td className="px-5 py-3">{r.category}</td>
                <td className="px-5 py-3">{r.base}</td>
                <td className="px-5 py-3">{r.perKm}</td>
                <td className="px-5 py-3">{r.min}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
