import bcrypt from 'bcrypt';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { env } from '../config/env';
import { User } from '../models/User';
import { HamaliProfile } from '../models/HamaliProfile';
import { Mutha } from '../models/Mutha';
import { Federation } from '../models/Federation';

/**
 * C0 — an isolated set of accounts for verifying production, marked
 * isVerification so that nothing they create reaches analytics, forecasting,
 * welfare indices, incentives or public stats.
 *
 *   VERIFICATION_ENABLED=true npx ts-node src/scripts/seedVerification.ts
 *
 * Passwords are generated here and printed ONCE to this console. They are
 * never committed or stored anywhere else; an account that already exists
 * keeps its password and is not reprinted. Re-running is safe.
 *
 * The workers get placeholder KYC rows (publicId "verification-fixture",
 * status verified) so the KYC gate lets them work. They point at no real
 * file and exist only on isVerification accounts.
 */
const REGION = 'VERIFY';
const STATE_REGION = 'VERIFY-STATE';
const BCRYPT_COST = 12;

interface Spec {
  key: string;
  phone: string;
  name: string;
  role: string;
  extra?: Record<string, unknown>;
  worker?: boolean;
  federationId?: unknown;
}

const SPECS: Spec[] = [
  { key: 'customer_household', phone: '9100000001', name: 'Verify Household Customer', role: 'customer' },
  {
    key: 'customer_institution',
    phone: '9100000002',
    name: 'Verify Institution Customer',
    role: 'customer',
    extra: { accountType: 'institution', institutionProfile: { institutionType: 'school', orgName: 'Verify Public School' } },
  },
  { key: 'solo_worker', phone: '9100000003', name: 'Verify Solo Worker', role: 'hamali_solo', worker: true },
  { key: 'society_leader', phone: '9100000004', name: 'Verify Society Leader', role: 'mutha_leader', worker: true },
  { key: 'society_member', phone: '9100000005', name: 'Verify Society Member', role: 'mutha_member', worker: true },
];

const verifiedDocs = () =>
  ['aadhaar', 'pan'].map((type) => ({
    type,
    url: 'cloudinary-private://verification-fixture',
    publicId: 'verification-fixture',
    delivery: 'authenticated' as const,
    status: 'verified' as const,
    uploadedAt: new Date(),
    reviewedAt: new Date(),
  }));

async function main() {
  if (env.VERIFICATION_ENABLED !== true) {
    // eslint-disable-next-line no-console
    console.error('Refusing to run: set VERIFICATION_ENABLED=true to create verification accounts.');
    process.exit(1);
  }
  await connectDb();
  const out: { key: string; phone: string; password?: string; note?: string }[] = [];

  const create = async (spec: Spec) => {
    const existing = await User.findOne({ phone: spec.phone });
    if (existing) {
      out.push({ key: spec.key, phone: spec.phone, note: 'already exists — password not reprinted' });
      return existing;
    }
    const password = crypto.randomBytes(9).toString('base64url');
    const user = await User.create({
      name: spec.name,
      phone: spec.phone,
      passwordHash: await bcrypt.hash(password, BCRYPT_COST),
      role: spec.role,
      region: REGION,
      accountStatus: 'active',
      isVerification: true,
      ...(spec.worker ? { kycStatus: 'verified', kycDocs: verifiedDocs() } : {}),
      ...(spec.extra ?? {}),
      ...(spec.federationId ? { federationId: spec.federationId } : {}),
    });
    out.push({ key: spec.key, phone: spec.phone, password });
    return user;
  };

  // Federations for the VERIFY district, so the admins have something to see.
  let state = await Federation.findOne({ type: 'state', region: STATE_REGION });
  if (!state) {
    state = await Federation.create({
      name: 'Verification State Federation (test data)',
      type: 'state',
      region: STATE_REGION,
      registrationNumber: 'VERIFY/STATE/000',
      registeredUnderAct: 'Test data — not a real federation',
      contactDetails: {},
    });
  }
  let district = await Federation.findOne({ type: 'district', region: REGION });
  if (!district) {
    district = await Federation.create({
      name: 'Verification District Federation (test data)',
      type: 'district',
      parentFederationId: state._id,
      region: REGION,
      registrationNumber: 'VERIFY/DIST/000',
      registeredUnderAct: 'Test data — not a real federation',
      contactDetails: {},
      maxCommissionRatePct: 10,
      maxWelfareDeductionRatePct: 5,
    });
  }

  const byKey: Record<string, Awaited<ReturnType<typeof create>>> = {};
  for (const s of SPECS) byKey[s.key] = await create(s);

  await HamaliProfile.updateOne(
    { userId: byKey.solo_worker._id },
    { $setOnInsert: { userId: byKey.solo_worker._id, type: 'solo' } },
    { upsert: true }
  );

  let mutha = await Mutha.findOne({ leaderId: byKey.society_leader._id });
  if (!mutha) {
    mutha = await Mutha.create({
      name: 'Verification Society (test data)',
      leaderId: byKey.society_leader._id,
      memberIds: [],
      inviteCode: crypto.randomBytes(4).toString('hex').toUpperCase(),
      region: REGION,
    });
  }
  await HamaliProfile.updateOne(
    { userId: byKey.society_member._id },
    { $setOnInsert: { userId: byKey.society_member._id, type: 'mutha_member', muthaId: mutha._id } },
    { upsert: true }
  );
  await Mutha.updateOne({ _id: mutha._id }, { $addToSet: { memberIds: byKey.society_member._id } });

  // The second member has no phone: the leader runs them (P1.7).
  const hasProxy = await User.exists({ managedByMuthaId: mutha._id, leaderManaged: true });
  if (!hasProxy) {
    const proxyId = new mongoose.Types.ObjectId();
    await User.create({
      _id: proxyId,
      name: 'Verify Proxy Member',
      phone: `proxy-${proxyId.toString()}`,
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), BCRYPT_COST),
      role: 'mutha_member',
      region: REGION,
      accountStatus: 'active',
      isVerification: true,
      leaderManaged: true,
      managedByMuthaId: mutha._id,
      kycStatus: 'verified',
      kycDocs: verifiedDocs(),
    });
    await HamaliProfile.create({ userId: proxyId, type: 'mutha_member', muthaId: mutha._id, skills: [] });
    await Mutha.updateOne({ _id: mutha._id }, { $addToSet: { memberIds: proxyId } });
    out.push({ key: 'proxy_member', phone: '(no phone)', note: 'managed by the society leader' });
  }

  await create({ key: 'federation_district_admin', phone: '9100000006', name: 'Verify District Admin', role: 'federation_district_admin', federationId: district._id });
  await create({ key: 'federation_state_admin', phone: '9100000007', name: 'Verify State Admin', role: 'federation_state_admin', federationId: state._id });

  // eslint-disable-next-line no-console
  console.log('\nVerification accounts (region VERIFY). Passwords are shown ONCE — copy them now.\n');
  for (const row of out) {
    // eslint-disable-next-line no-console
    console.log(`${row.key.padEnd(26)} ${row.phone.padEnd(14)} ${row.password ?? row.note ?? ''}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seedVerification failed:', err);
  process.exit(1);
});
