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
  ncctProgrammeCode?: string;
  cPecAligned?: boolean;
  tradeArea?: string;
}

const WORKER_ROLES: Role[] = ['driver', 'hamali_solo', 'fleet_owner'];
// SIH26089 Phase B.3 — the cooperative-society roles a household/community
// service worker actually holds in this codebase's current data model
// (there is no per-trade Role — "electrician" vs "plumber" is a skill/
// service-category distinction, not a Role one; see Phase C for the
// ServiceCategory model this eventually attaches to properly). Until then,
// these trade modules target the same worker roles the original curriculum
// already did.
const SOCIETY_WORKER_ROLES: Role[] = ['hamali_solo', 'mutha_leader', 'mutha_member'];

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
  // ---- SIH26089 Phase B.3: NCCT-aligned household/community-service
  // trade modules. ncctProgrammeCode values below are ILLUSTRATIVE
  // reference-format placeholders (this codebase has no access to a real
  // NCCT programme catalog) — never present them to a user as an actual
  // official code; training.controller.ts/the client UI label them
  // "NCCT-aligned programme reference (illustrative)" wherever shown.
  {
    order: 4,
    title: 'Household Electrical Safety Basics',
    description: 'Core safety practices for any job involving household wiring, switchgear, or appliance repair.',
    durationMinutes: 30,
    forRoles: SOCIETY_WORKER_ROLES,
    tradeArea: 'electrical',
    ncctProgrammeCode: 'NCCT-ELEC-B-01',
    cPecAligned: true,
    content:
      '## Household Electrical Safety Basics\n\n- Always isolate the circuit at the main board before any repair work.\n' +
      '- Use insulated tools rated for the voltage present.\n' +
      '- Test with a non-contact voltage tester before touching any conductor.\n' +
      '- Never work on wet surfaces or with wet hands.\n' +
      '- Explain the completed work and any residual risk to the household clearly before leaving.',
  },
  {
    order: 5,
    title: 'Plumbing Fundamentals & Water Safety',
    description: 'Standard practices for pipe repair, fixture installation, and safe handling of water/sanitation lines.',
    durationMinutes: 30,
    forRoles: SOCIETY_WORKER_ROLES,
    tradeArea: 'plumbing',
    ncctProgrammeCode: 'NCCT-PLUMB-B-01',
    cPecAligned: true,
    content:
      '## Plumbing Fundamentals & Water Safety\n\n- Shut off the main supply before opening any fixture or pipe joint.\n' +
      '- Never mix potable and drainage lines during a repair.\n' +
      '- Use PTFE tape/approved sealant on every threaded joint.\n' +
      '- Test for leaks under full pressure before considering a job complete.\n' +
      '- Photograph before/after for any job involving a wall or floor opening.',
  },
  {
    order: 6,
    title: 'Domestic Help & Caregiving Conduct',
    description: 'Professional conduct, privacy, and safety standards for anyone working inside a client\'s home.',
    durationMinutes: 25,
    forRoles: SOCIETY_WORKER_ROLES,
    tradeArea: 'domestic_help',
    ncctProgrammeCode: 'NCCT-DOM-B-01',
    cPecAligned: true,
    content:
      '## Domestic Help & Caregiving Conduct\n\n- Carry your society ID and verified badge on every household visit.\n' +
      '- Respect the household\'s privacy — never photograph or share anything from inside a client\'s home.\n' +
      '- For caregiving specifically: know the client\'s known medical conditions and emergency contact before starting.\n' +
      '- Report any safety concern (yours or the client\'s) to your society leader immediately, not after the visit.\n' +
      '- Punctuality and advance notice of any delay are part of the cooperative\'s own service standard, not optional courtesy.',
  },
  {
    order: 7,
    title: 'Carpentry & General Repair Basics',
    description: 'Core techniques and tool safety for carpentry, painting, and general household repair work.',
    durationMinutes: 25,
    forRoles: SOCIETY_WORKER_ROLES,
    tradeArea: 'carpentry',
    ncctProgrammeCode: 'NCCT-CARP-B-01',
    cPecAligned: true,
    content:
      '## Carpentry & General Repair Basics\n\n- Inspect every power tool for a damaged cord/guard before use.\n' +
      '- Wear eye protection for any cutting, sanding, or drilling work.\n' +
      '- Confirm the client\'s expected finish/measurements before starting, not after.\n' +
      '- Clear and clean the work area completely before ending the visit.',
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
