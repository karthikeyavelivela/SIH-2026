import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { Checkpoint } from '../models/Checkpoint';

// SIH26089 Phase D.1 — real, named Andhra Pradesh highway toll plazas along
// NH16 (Chennai-Kolkata via Vijayawada/Visakhapatnam) and NH65
// (Vijayawada-Hyderabad, AP-side plaza only). Names sourced via web search
// against tollguru.com / ihmcl.co.in / nhai.gov.in / thehansindia.com — not
// invented. IMPORTANT CAVEAT, stated plainly rather than left implicit
// (same discipline as TrainingModule.ts's ncctProgrammeCode disclaimer):
// none of those sources published a precise surveyed lat/lng for these
// plazas, so the coordinates below are this seed's own APPROXIMATE
// corridor placement (nearest town/mandal centre along the known highway
// alignment), not a GPS-verified location. Good enough for the route-
// suggestion detour-cost math and for demo purposes; NOT a claim of
// survey-grade accuracy. `cctvAvailable`/`securityRating` are this seed's
// own illustrative defaults (toll plazas are realistically CCTV-covered by
// NHAI policy; the per-plaza rating is a placeholder, not an audited
// score) — an admin can correct either via PATCH once real facility data
// is available.
interface SeedCheckpoint {
  name: string;
  lat: number;
  lng: number;
  type: 'toll_plaza' | 'police_checkpost' | 'verified_dhaba' | 'fuel_station' | 'designated_halt';
  cctvAvailable: boolean;
  securityRating: number;
  corridor: string;
}

const NH16 = 'NH16 Chennai-Kolkata via Vijayawada/Visakhapatnam';
const NH65 = 'NH65 Vijayawada-Hyderabad (AP section)';

const CHECKPOINTS: SeedCheckpoint[] = [
  { name: 'Sullurpet Toll Plaza', lat: 13.9989, lng: 80.1298, type: 'toll_plaza', cctvAvailable: true, securityRating: 4, corridor: NH16 },
  { name: 'Tangutur Toll Plaza', lat: 15.4667, lng: 80.1167, type: 'toll_plaza', cctvAvailable: true, securityRating: 3, corridor: NH16 },
  { name: 'Sunambatti (Musunur) Toll Plaza', lat: 16.85, lng: 80.99, type: 'toll_plaza', cctvAvailable: true, securityRating: 4, corridor: NH16 },
  { name: 'Krishnavaram Toll Plaza', lat: 17.0, lng: 82.0, type: 'toll_plaza', cctvAvailable: true, securityRating: 3, corridor: NH16 },
  { name: 'Vempadu Toll Plaza', lat: 17.0, lng: 81.7, type: 'toll_plaza', cctvAvailable: true, securityRating: 3, corridor: NH16 },
  { name: 'Aganampudi Toll Plaza', lat: 17.75, lng: 83.15, type: 'toll_plaza', cctvAvailable: true, securityRating: 4, corridor: NH16 },
  { name: 'Nathavalasa Toll Plaza', lat: 18.0, lng: 83.3, type: 'toll_plaza', cctvAvailable: true, securityRating: 3, corridor: NH16 },
  { name: 'Chilakapalem Toll Plaza', lat: 18.5, lng: 84.0, type: 'toll_plaza', cctvAvailable: true, securityRating: 3, corridor: NH16 },
  { name: 'Madapam Toll Plaza', lat: 18.3, lng: 83.9, type: 'toll_plaza', cctvAvailable: true, securityRating: 3, corridor: NH16 },
  { name: 'Palasa Toll Plaza', lat: 18.77, lng: 84.42, type: 'toll_plaza', cctvAvailable: true, securityRating: 3, corridor: NH16 },
  { name: 'Bellupada Toll Plaza', lat: 18.8, lng: 84.5, type: 'toll_plaza', cctvAvailable: true, securityRating: 3, corridor: NH16 },
  { name: 'Chillakallu Toll Plaza', lat: 16.7, lng: 80.4, type: 'toll_plaza', cctvAvailable: true, securityRating: 4, corridor: NH65 },
];

async function seedCheckpoints() {
  await connectDb();
  try {
    for (const c of CHECKPOINTS) {
      const existing = await Checkpoint.findOne({ name: c.name });
      if (existing) {
        // eslint-disable-next-line no-console
        console.log(`Skipping ${c.name} — already seeded.`);
        continue;
      }
      await Checkpoint.create({
        name: c.name,
        location: { type: 'Point', coordinates: [c.lng, c.lat] },
        type: c.type,
        cctvAvailable: c.cctvAvailable,
        securityRating: c.securityRating,
        operatingHours: '24 hours',
        verifiedBy: 'FYRO Operations (seed)',
        amenities: ['toilets', 'food_stall'],
        corridor: c.corridor,
      });
      // eslint-disable-next-line no-console
      console.log(`Seeded checkpoint: ${c.name}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

seedCheckpoints().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seedCheckpoints failed:', err);
  process.exit(1);
});
