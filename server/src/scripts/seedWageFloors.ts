import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { ensureWageFloors } from '../services/wageFloor.service';

/**
 * The Andhra Pradesh statutory minimum wage, as the platform enforces it.
 *
 * Notification No. G/3186486/2026, dated 23 March 2026, Office of the
 * Commissioner of Labour, Andhra Pradesh, Vijayawada, under the Minimum
 * Wages Act 1948; published in the AP Gazette Extraordinary on 25 March
 * 2026 and effective from 1 April 2026. The Variable Dearness Allowance is
 * revised twice yearly against the Consumer Price Index, so this set runs
 * to 30 September 2026 and a fresh notification replaces it.
 *
 * ON THE FIGURES, WHICH MATTERS
 *
 * The gazette PDF itself could not be retrieved: the AP Labour Department's
 * minimum-wages page returns no document, and the compliance libraries that
 * host the PDF put it behind a login. The rupee figures below are therefore
 * transcribed from a published secondary compilation of this notification,
 * and every row is stamped sourceType 'secondary_compilation' so that the
 * platform never claims more authority for them than it has.
 *
 * They are not one source's word. The anchors cross-check against three
 * independent compilations of the same notification: the ₹8,947 VDA, the
 * Zone II unskilled total of ₹12,317 (basic ₹3,370 + VDA), and the Zone I
 * unskilled total of ₹12,647 all agree across them. The internal structure
 * is consistent too — ₹380 between adjacent bands, ₹330 between zones at
 * every band.
 *
 * Replace them the moment the gazette is in hand: one POST per row through
 * /api/admin/wage-floors, which supersedes rather than overwrites and
 * records who changed it.
 *
 * The figures themselves live in wageFloor.service.ts, because the server
 * also seeds them at boot — a seed script only helps if somebody remembers
 * to run it, and the training curriculum sat unseeded in production for
 * weeks because nobody did. This script stays as the manual path.
 *
 * WHICH SCHEDULE
 *
 * The Shops and Commercial Establishments schedule. Of the state's
 * scheduled employments it is the one whose designations actually resemble
 * what is booked here — household and premises work carried out for a
 * business or a household, rather than factory, mining or plantation work.
 * A trade with its own schedule (construction, security) would want its own
 * rows; they are not seeded because guessing at them is exactly what this
 * file refuses to do.
 */

async function seedWageFloors() {
  await connectDb();
  try {
    const created = await ensureWageFloors();
    // eslint-disable-next-line no-console
    console.log(
      created > 0
        ? `Seeded ${created} statutory wage floor row(s).`
        : 'Nothing to do — every state/zone/band already has an active floor.'
    );
  } finally {
    await mongoose.disconnect();
  }
}

seedWageFloors().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
