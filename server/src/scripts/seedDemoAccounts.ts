import bcrypt from 'bcrypt';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { User } from '../models/User';
import { Vehicle } from '../models/Vehicle';
import { HamaliProfile } from '../models/HamaliProfile';
import { Mutha } from '../models/Mutha';
import { Fleet } from '../models/Fleet';
import { WarehouseHub } from '../models/WarehouseHub';

// Idempotent demo-account seeder — one account per role, fixed known
// password, safe to re-run (skips a role if its demo phone already exists).
// NOT for production use: these are throwaway, publicly-documented
// credentials meant only for local dev / manual QA of the login flow.

const DEMO_PASSWORD = 'Demo1234!';
const BCRYPT_COST = 12;

interface DemoAccount {
  role: string;
  phone: string;
  name: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: 'customer', phone: '9000000010', name: 'Demo Customer' },
  { role: 'driver', phone: '9000000011', name: 'Demo Driver' },
  { role: 'hamali_solo', phone: '9000000012', name: 'Demo Hamali (Solo)' },
  { role: 'mutha_leader', phone: '9000000013', name: 'Demo Mutha Leader' },
  { role: 'mutha_member', phone: '9000000014', name: 'Demo Mutha Member' },
  // Added per AUDIT_REPORT.md Phase 1.6 — fleet_owner and warehouse_hub had
  // real signup pages, dashboards, and routes but no seeded demo account,
  // so neither role had ever been live-verified.
  { role: 'fleet_owner', phone: '9000000015', name: 'Demo Fleet Owner' },
  { role: 'warehouse_hub', phone: '9000000016', name: 'Demo Warehouse Hub' },
];

async function seedDemoAccounts() {
  await connectDb();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST);

  for (const acc of DEMO_ACCOUNTS) {
    const existing = await User.findOne({ phone: acc.phone });
    if (existing) {
      // eslint-disable-next-line no-console
      console.log(`Skipping ${acc.role} — ${acc.phone} already exists.`);
      continue;
    }

    const user = await User.create({
      name: acc.name,
      phone: acc.phone,
      passwordHash,
      role: acc.role,
      accountStatus: 'active',
    });

    if (acc.role === 'driver') {
      await Vehicle.create({
        ownerId: user._id,
        type: 'mini_truck',
        capacityKg: 1000,
        registrationNumber: 'AP01DEMO01',
        verified: true,
        availabilityStatus: 'offline',
      });
    }

    if (acc.role === 'hamali_solo') {
      await HamaliProfile.create({ userId: user._id, type: 'solo' });
    }

    if (acc.role === 'mutha_leader') {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      await Mutha.create({
        name: 'Demo Mutha Group',
        leaderId: user._id,
        memberIds: [],
        inviteCode: code,
      });
      // eslint-disable-next-line no-console
      console.log(`  Demo Mutha invite code: ${code}`);
    }

    if (acc.role === 'mutha_member') {
      // Attach to the demo leader's Mutha if it exists yet (run order:
      // leader is seeded before member in DEMO_ACCOUNTS, so this is safe).
      const leader = await User.findOne({ phone: '9000000013' });
      const mutha = leader ? await Mutha.findOne({ leaderId: leader._id }) : null;
      if (mutha) {
        await HamaliProfile.create({ userId: user._id, type: 'mutha_member', muthaId: mutha._id });
        mutha.memberIds.push(user._id);
        await mutha.save();
      }
    }

    if (acc.role === 'fleet_owner') {
      await Fleet.create({ ownerId: user._id, name: 'Demo Fleet', vehicleIds: [], driverIds: [] });
    }

    if (acc.role === 'warehouse_hub') {
      await WarehouseHub.create({
        ownerId: user._id,
        name: 'Demo Warehouse Hub',
        address: 'Visakhapatnam, Andhra Pradesh',
        // Real Vizag coordinates, not the schema's [0,0] default — a demo
        // account that's actually usable for anything location-based,
        // rather than reproducing the stale-default problem this session
        // already hit once with Vehicle.currentLocation.
        location: { type: 'Point', coordinates: [83.2185, 17.6868] },
        totalDockSlots: 6,
      });
    }

    // eslint-disable-next-line no-console
    console.log(`Seeded ${acc.role}: ${acc.phone} / ${DEMO_PASSWORD}`);
  }

  // eslint-disable-next-line no-console
  console.log('\nAll demo accounts use password:', DEMO_PASSWORD);
  // eslint-disable-next-line no-console
  console.log('(Admin account is separate — created by `npm run seed:admin`, uses ADMIN_PHONE/ADMIN_PASSWORD from .env)');

  await mongoose.disconnect();
}

seedDemoAccounts().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Demo seed failed:', err);
  process.exit(1);
});
