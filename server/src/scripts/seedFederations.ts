import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { Federation } from '../models/Federation';
import { User } from '../models/User';

// SIH26089 Phase B.1 — seeds the real Andhra Pradesh cooperative federation
// hierarchy: one state federation + the same 13 districts the marketing
// homepage already lists as launched (client/src/i18n/messages/en.json's
// marketing.home.districts), so the federation tree lines up with the
// regions the platform actually operates in rather than an arbitrary list.
//
// Registration numbers below are ILLUSTRATIVE PLACEHOLDERS in a plausible
// format (AP/COOP/...), not real Ministry of Cooperation-issued numbers —
// this codebase has no access to real registration records. Never present
// them as verified/official in any UI copy.
const DISTRICTS = [
  'Visakhapatnam',
  'Vijayawada',
  'Guntur',
  'Nellore',
  'Kurnool',
  'Kakinada',
  'Rajahmundry',
  'Tirupati',
  'Anantapur',
  'Kadapa',
  'Eluru',
  'Ongole',
  'Srikakulam',
];

const DEMO_PASSWORD = 'Demo1234!';

async function seedFederations() {
  await connectDb();

  try {
    let state = await Federation.findOne({ type: 'state', region: 'Andhra Pradesh' });
    if (!state) {
      state = await Federation.create({
        name: 'Andhra Pradesh State Cooperative Labour Federation',
        type: 'state',
        region: 'Andhra Pradesh',
        registrationNumber: 'AP/COOP/STATE/2026/001',
        registeredUnderAct: 'AP Cooperative Societies Act 1964',
        contactDetails: { email: 'state.federation@fyro.example' },
      });
      // eslint-disable-next-line no-console
      console.log(`Created state federation: ${state.name}`);
    } else {
      // eslint-disable-next-line no-console
      console.log('State federation already exists, skipping.');
    }

    for (const [i, district] of DISTRICTS.entries()) {
      const name = `${district} District Cooperative Labour Federation`;
      const existing = await Federation.findOne({ type: 'district', region: district });
      if (existing) {
        // eslint-disable-next-line no-console
        console.log(`Skipping ${district} — district federation already exists.`);
        continue;
      }
      await Federation.create({
        name,
        type: 'district',
        parentFederationId: state._id,
        region: district,
        registrationNumber: `AP/COOP/DIST/${String(i + 1).padStart(3, '0')}/2026`,
        registeredUnderAct: 'AP Cooperative Societies Act 1964',
        contactDetails: {},
        // A real bye-law ceiling — no society under this district may set
        // a commission above 10% or a welfare deduction above 5% without
        // the district federation itself raising this cap first.
        maxCommissionRatePct: 10,
        maxWelfareDeductionRatePct: 5,
      });
      // eslint-disable-next-line no-console
      console.log(`Created district federation: ${name}`);
    }

    // Demo accounts — same publicly-documented fixed-password convention as
    // seedDemoAccounts.ts, so both new federation-admin roles are live-
    // verifiable the same way every other demo role already is.
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    const existingStateAdmin = await User.findOne({ phone: '9000000020' });
    if (!existingStateAdmin) {
      await User.create({
        name: 'Demo State Federation Admin',
        phone: '9000000020',
        passwordHash,
        role: 'federation_state_admin',
        federationId: state._id,
        accountStatus: 'active',
      });
      // eslint-disable-next-line no-console
      console.log('Created demo federation_state_admin (9000000020).');
    }

    const vizagDistrict = await Federation.findOne({ type: 'district', region: 'Visakhapatnam' });
    const existingDistrictAdmin = await User.findOne({ phone: '9000000021' });
    if (!existingDistrictAdmin && vizagDistrict) {
      await User.create({
        name: 'Demo Visakhapatnam District Federation Admin',
        phone: '9000000021',
        passwordHash,
        role: 'federation_district_admin',
        federationId: vizagDistrict._id,
        accountStatus: 'active',
      });
      // eslint-disable-next-line no-console
      console.log('Created demo federation_district_admin (9000000021).');
    }
  } finally {
    await mongoose.disconnect();
  }
}

seedFederations().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seedFederations failed:', err);
  process.exit(1);
});
