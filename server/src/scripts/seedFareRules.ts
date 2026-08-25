import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { FareRule } from '../models/FareRule';
import { User } from '../models/User';

// SIH26089 pan-India rewrite — every district federation seeded by
// seedFederations.ts needs an actual active FareRule per category, or a
// booking placed there fails with the (correct, honest) "No active fare
// rule for {region}/{category}" error the moment the customer picks a
// pickup address in it. Rather than fabricate region-specific price
// variance this codebase has no honest basis for, every region below gets
// the IDENTICAL rate the platform already charges in Visakhapatnam — a
// real, deliberate simplification, not a guess dressed up as regional
// pricing. An admin can differentiate rates later via /admin/fares once
// there's real cost data to justify it.
const REGIONS = [
  // Andhra Pradesh
  'Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool', 'Kakinada',
  'Rajahmundry', 'Tirupati', 'Anantapur', 'Kadapa', 'Eluru', 'Ongole', 'Srikakulam',
  // Telangana
  'Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam', 'Nalgonda',
  // Karnataka
  'Bengaluru Urban', 'Mysuru', 'Dakshina Kannada', 'Belagavi', 'Dharwad', 'Kalaburagi',
  // Tamil Nadu
  'Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli',
  // Maharashtra
  'Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Kolhapur', 'Aurangabad',
  // Kerala
  'Thiruvananthapuram', 'Ernakulam', 'Kozhikode', 'Thrissur', 'Kollam', 'Kannur',
];

// The platform's own real, already-live Visakhapatnam rates (checked
// directly against production before writing this file) — reused as-is
// everywhere else rather than invented per region.
const RATES: { category: 'vehicle_small' | 'vehicle_medium' | 'vehicle_large' | 'hamali'; baseFare: number; perKmRate: number; minimumFare: number }[] = [
  { category: 'vehicle_small', baseFare: 150, perKmRate: 18, minimumFare: 250 },
  { category: 'vehicle_medium', baseFare: 250, perKmRate: 25, minimumFare: 400 },
  { category: 'vehicle_large', baseFare: 400, perKmRate: 35, minimumFare: 600 },
  { category: 'hamali', baseFare: 100, perKmRate: 0, minimumFare: 300 },
];

async function seedFareRules() {
  await connectDb();
  try {
    const admin = await User.findOne({ role: 'admin' }).select('_id');
    if (!admin) {
      // eslint-disable-next-line no-console
      console.error('No admin user found — run seed:admin first.');
      process.exit(1);
    }

    for (const region of REGIONS) {
      for (const rate of RATES) {
        const existing = await FareRule.findOne({ region, category: rate.category, active: true });
        if (existing) {
          // eslint-disable-next-line no-console
          console.log(`Skipping ${region}/${rate.category} — active rule already exists.`);
          continue;
        }
        await FareRule.create({
          region,
          category: rate.category,
          baseFare: rate.baseFare,
          perKmRate: rate.perKmRate,
          minimumFare: rate.minimumFare,
          surgeMultiplier: 1.0,
          setByAdminId: admin._id,
          active: true,
        });
        // eslint-disable-next-line no-console
        console.log(`Seeded fare rule: ${region}/${rate.category}`);
      }
    }
  } finally {
    await mongoose.disconnect();
  }
}

seedFareRules().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seedFareRules failed:', err);
  process.exit(1);
});
