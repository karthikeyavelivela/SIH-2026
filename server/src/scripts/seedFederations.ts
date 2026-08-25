import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { Federation } from '../models/Federation';
import { User } from '../models/User';

// SIH26089 Phase B.1, extended for the pan-India rewrite — FYRO is a
// national scheme (Ministry of Cooperation / NCCT), not an Andhra-Pradesh-
// only platform, so the federation hierarchy now spans multiple real
// states instead of just AP. Each state's own Cooperative Societies Act
// name/year is a real, public fact; registration NUMBERS are ILLUSTRATIVE
// PLACEHOLDERS in a plausible format, not real Ministry of Cooperation-
// issued numbers — this codebase has no access to real registration
// records, and that distinction is never blurred in any UI copy. Same
// discipline as the original AP-only seed this replaces.
interface StateSeed {
  state: string;
  registeredUnderAct: string;
  districts: string[];
}

const STATES: StateSeed[] = [
  {
    state: 'Andhra Pradesh',
    registeredUnderAct: 'AP Cooperative Societies Act 1964',
    districts: [
      'Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool', 'Kakinada',
      'Rajahmundry', 'Tirupati', 'Anantapur', 'Kadapa', 'Eluru', 'Ongole', 'Srikakulam',
    ],
  },
  {
    state: 'Telangana',
    registeredUnderAct: 'Telangana Cooperative Societies Act 1964',
    districts: ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam', 'Nalgonda'],
  },
  {
    state: 'Karnataka',
    registeredUnderAct: 'Karnataka Co-operative Societies Act 1959',
    districts: ['Bengaluru Urban', 'Mysuru', 'Dakshina Kannada', 'Belagavi', 'Dharwad', 'Kalaburagi'],
  },
  {
    state: 'Tamil Nadu',
    registeredUnderAct: 'Tamil Nadu Co-operative Societies Act 1983',
    districts: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli'],
  },
  {
    state: 'Maharashtra',
    registeredUnderAct: 'Maharashtra Co-operative Societies Act 1960',
    districts: ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Kolhapur', 'Aurangabad'],
  },
  {
    state: 'Kerala',
    registeredUnderAct: 'Kerala Co-operative Societies Act 1969',
    districts: ['Thiruvananthapuram', 'Ernakulam', 'Kozhikode', 'Thrissur', 'Kollam', 'Kannur'],
  },
];

const DEMO_PASSWORD = 'Demo1234!';

async function seedFederations() {
  await connectDb();

  try {
    for (const [stateIdx, s] of STATES.entries()) {
      let state = await Federation.findOne({ type: 'state', region: s.state });
      if (!state) {
        state = await Federation.create({
          name: `${s.state} State Cooperative Labour Federation`,
          type: 'state',
          region: s.state,
          registrationNumber: `${stateAbbrev(s.state)}/COOP/STATE/2026/001`,
          registeredUnderAct: s.registeredUnderAct,
          contactDetails: { email: `state.federation.${slugify(s.state)}@fyro.example` },
        });
        // eslint-disable-next-line no-console
        console.log(`Created state federation: ${state.name}`);
      } else {
        // eslint-disable-next-line no-console
        console.log(`${s.state} state federation already exists, skipping.`);
      }

      for (const [i, district] of s.districts.entries()) {
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
          registrationNumber: `${stateAbbrev(s.state)}/COOP/DIST/${String(i + 1).padStart(3, '0')}/2026`,
          registeredUnderAct: s.registeredUnderAct,
          contactDetails: {},
          // A real bye-law ceiling — no society under this district may set
          // a commission above 10% or a welfare deduction above 5% without
          // the district federation itself raising this cap first. Same
          // ceiling nationwide — no honest basis to vary it state to state.
          maxCommissionRatePct: 10,
          maxWelfareDeductionRatePct: 5,
        });
        // eslint-disable-next-line no-console
        console.log(`Created district federation: ${name}`);
      }

      // Demo state-admin login — only wired up for the first two states
      // (AP, then Telangana) so there's a real, testable second-state
      // account proving the hierarchy isn't AP-hardcoded, without seeding
      // a demo login per state.
      if (stateIdx <= 1) {
        const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
        const phone = stateIdx === 0 ? '9000000020' : '9000000022';
        const existingStateAdmin = await User.findOne({ phone });
        if (!existingStateAdmin) {
          await User.create({
            name: `Demo ${s.state} State Federation Admin`,
            phone,
            passwordHash,
            role: 'federation_state_admin',
            federationId: state._id,
            accountStatus: 'active',
          });
          // eslint-disable-next-line no-console
          console.log(`Created demo federation_state_admin for ${s.state} (${phone}).`);
        }
      }
    }

    // Demo district-admin — same publicly-documented fixed-password
    // convention as seedDemoAccounts.ts.
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
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

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

// Short state code for the illustrative registration-number format — real
// ISO/Ministry codes for the states actually seeded here (India has no
// single universal 2-letter state-code standard used identically by every
// government body, but these are the codes each state itself commonly uses
// on its own vehicle-registration plates, which is the most widely
// recognized public convention).
function stateAbbrev(state: string): string {
  const map: Record<string, string> = {
    'Andhra Pradesh': 'AP',
    Telangana: 'TS',
    Karnataka: 'KA',
    'Tamil Nadu': 'TN',
    Maharashtra: 'MH',
    Kerala: 'KL',
  };
  return map[state] ?? state.slice(0, 2).toUpperCase();
}

seedFederations().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seedFederations failed:', err);
  process.exit(1);
});
