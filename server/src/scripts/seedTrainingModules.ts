import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { TrainingModule } from '../models/TrainingModule';
import type { Role } from '@fyro/shared';

// Idempotent training-curriculum seeder — one shared curriculum for
// driver/hamali_solo/fleet_owner, matching the partner_training_academy
// mock (3 modules: safety basics -> loading protocols -> earnings/payouts).
// Safe to re-run: upserts by `order`, never duplicates.

interface SeedModule {
  order: number;
  title: string;
  description: string;
  durationMinutes: number;
  forRoles: Role[];
  content: string;
}

const WORKER_ROLES: Role[] = ['driver', 'hamali_solo', 'fleet_owner'];

const MODULES: SeedModule[] = [
  {
    order: 1,
    title: 'Platform Safety Basics',
    description: 'Essential safety guidelines for navigating the FYRO app, warehouse environments, and vehicle operation.',
    durationMinutes: 15,
    forRoles: WORKER_ROLES,
    content:
      '## Platform Safety Basics\n\n- Always confirm pickup/drop details before starting a trip.\n' +
      '- Wear high-visibility gear on any warehouse or dock floor.\n' +
      '- Report any unsafe loading condition immediately via the Emergency tab.\n' +
      '- Never operate a vehicle or handle cargo while fatigued.',
  },
  {
    order: 2,
    title: 'Loading Protocols & Standards',
    description: 'Standard operating procedures for securing cargo, managing Hamali teams, and ensuring weight distribution compliance.',
    durationMinutes: 25,
    forRoles: WORKER_ROLES,
    content:
      '## Loading Protocols & Standards\n\n- Verify declared cargo weight against the manifest before loading.\n' +
      '- Distribute load evenly front-to-back and side-to-side.\n' +
      '- Secure all cargo with rated straps/nets before departure.\n' +
      '- Photograph the loaded cargo as proof before leaving the pickup site.',
  },
  {
    order: 3,
    title: 'Earnings & Payouts',
    description: 'Understanding the FYRO payment cycle, calculating trip earnings, and setting up your digital wallet.',
    durationMinutes: 10,
    forRoles: WORKER_ROLES,
    content:
      '## Earnings & Payouts\n\n- Trip earnings are itemized and available immediately after a job completes.\n' +
      '- Weekly payout cycles close every Monday.\n' +
      '- Incentives and referral bonuses appear as separate line items.\n' +
      '- Disputed fares can be raised from the trip summary screen.',
  },
];

async function seedTrainingModules() {
  await connectDb();

  for (const m of MODULES) {
    const existing = await TrainingModule.findOne({ order: m.order });
    if (existing) {
      // eslint-disable-next-line no-console
      console.log(`Skipping module order ${m.order} — already seeded ("${existing.title}").`);
      continue;
    }
    await TrainingModule.create(m);
    // eslint-disable-next-line no-console
    console.log(`Seeded training module: ${m.title}`);
  }

  await mongoose.disconnect();
}

seedTrainingModules().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seedTrainingModules failed:', err);
  process.exit(1);
});
