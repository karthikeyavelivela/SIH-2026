import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { InsurancePlan } from '../models/InsurancePlan';
import { User } from '../models/User';

// SIH26089 — before this script, production had exactly ONE InsurancePlan
// document, and it was `active: false` (a leftover Phase 0.2 live-proof
// plan, deliberately deactivated after use, scoped to hamali_solo only).
// That means every role — including driver, mutha_member/leader, and
// customer — had ZERO real insurance option to enrol in, even though
// insurance.controller.ts / InsuranceDashboard.tsx are both already fully
// role-agnostic (GET /api/insurance/plans filters by req.user.role
// server-side; nothing role-specific needed building, just this data).
//
// Premiums/coverage amounts below are illustrative platform defaults, not
// actuarially-priced products — same "real mechanism, honestly-labelled
// placeholder numbers" discipline as this codebase's GST-rate and
// registration-number seed data elsewhere. An admin can edit any of these
// via PATCH /api/admin/insurance/plans/:id once real underwriting numbers
// exist.
const PLANS = [
  {
    name: 'Worker Earnings Protection',
    type: 'parametric' as const,
    category: 'work_compensation' as const,
    coverageAmount: 25000,
    description:
      'Automatic payout if your earnings drop below a set threshold over a rolling period — no claim form needed, it pays out on its own when the condition is met.',
    forRoles: ['driver', 'hamali_solo', 'mutha_member', 'mutha_leader'] as const,
    premium: 49,
    defaultTrigger: {
      condition: 'earnings_below_threshold' as const,
      thresholdValue: 1000,
      periodDays: 30,
      payoutAmount: 1500,
    },
  },
  {
    name: 'Vehicle & Commercial Auto Cover',
    type: 'standard' as const,
    category: 'commercial_auto' as const,
    coverageAmount: 200000,
    description: 'Covers your registered vehicle against accident damage and third-party liability while on a FYRO job.',
    forRoles: ['driver', 'fleet_owner'] as const,
    premium: 199,
  },
  {
    name: 'Customer Goods Protection',
    type: 'standard' as const,
    category: 'cargo_transit' as const,
    coverageAmount: 50000,
    description:
      "Covers your goods against loss or damage while in transit on a FYRO booking — file a claim with photos if something arrives damaged or doesn't arrive.",
    forRoles: ['customer'] as const,
    premium: 29,
  },
  {
    name: 'Warehouse Goods-in-Custody Cover',
    type: 'standard' as const,
    category: 'cargo_transit' as const,
    coverageAmount: 150000,
    description: "Covers goods held in your facility's custody against loss or damage while awaiting pickup or dispatch.",
    forRoles: ['warehouse_hub'] as const,
    premium: 149,
  },
];

async function seedInsurancePlans() {
  await connectDb();
  try {
    const admin = await User.findOne({ role: 'admin' }).select('_id');
    if (!admin) {
      // eslint-disable-next-line no-console
      console.error('No admin user found — run seed:admin first.');
      process.exit(1);
    }

    for (const p of PLANS) {
      const existing = await InsurancePlan.findOne({ name: p.name, active: true });
      if (existing) {
        // eslint-disable-next-line no-console
        console.log(`Skipping "${p.name}" — an active plan with this name already exists.`);
        continue;
      }
      await InsurancePlan.create(p);
      // eslint-disable-next-line no-console
      console.log(`Seeded insurance plan: ${p.name} (${p.forRoles.join(', ')})`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

seedInsurancePlans().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seedInsurancePlans failed:', err);
  process.exit(1);
});
