import { Booking } from '../../models/Booking';
import { Complaint } from '../../models/Complaint';
import { InsurancePolicy } from '../../models/InsurancePolicy';
import { User } from '../../models/User';
import { Vehicle } from '../../models/Vehicle';
import { HamaliProfile } from '../../models/HamaliProfile';
import { Mutha } from '../../models/Mutha';
import { Fleet } from '../../models/Fleet';
import type { Role } from '@fyro/shared';

/**
 * What TARA is allowed to know about the person asking.
 *
 * This is the security boundary of the whole assistant, so it is one file
 * with one rule: every query below is filtered by the caller's own id, or
 * by a group the caller demonstrably owns (a society they lead, a fleet
 * they own). There is no branch that takes an id from the request, and
 * nothing here can widen its own scope — a question like "show me Ravi's
 * earnings" cannot be answered because Ravi's earnings were never fetched,
 * not because a prompt asked the model to decline.
 *
 * That distinction matters: prompt instructions are advice to a model,
 * while an unfetched row is simply absent. TARA is built on the second.
 */

export interface TaraContext {
  role: string;
  name?: string;
  /** Everything below is the caller's own data. See the module comment. */
  recentBookings: {
    id: string;
    type: string;
    status: string;
    fareTotal?: number;
    pickup?: string;
    drop?: string;
    createdAt?: Date;
  }[];
  complaints: { category: string; status: string; createdAt?: Date }[];
  insurancePolicies: { status: string; endDate?: Date }[];
  kycStatus?: string;
  kycDocumentsOutstanding: number;
  /** Role-specific additions — only ever about the caller or what they own. */
  vehicle?: { capacityKg?: number; complianceStatus?: string; availabilityStatus?: string };
  hamaliProfile?: { skills: string[]; availabilityStatus?: string; physicalCapacityKg?: number | null };
  society?: { name: string; memberCount: number; commissionRatePct: number; welfareDeductionRatePct: number };
  fleet?: { vehicleCount: number };
}

const BOOKING_LIMIT = 5;

export async function buildTaraContext(userId: string, role: Role): Promise<TaraContext> {
  const [bookings, complaints, policies, user] = await Promise.all([
    Booking.find({
      // The caller's bookings in every capacity they can hold one: as the
      // customer who raised it, or as the worker assigned to it.
      $or: [{ customerId: userId }, { assignedDriverIds: userId }, { assignedHamaliIds: userId }],
    })
      .sort({ createdAt: -1 })
      .limit(BOOKING_LIMIT)
      .lean(),
    Complaint.find({ raisedByUserId: userId }).sort({ createdAt: -1 }).limit(BOOKING_LIMIT).lean(),
    InsurancePolicy.find({ userId }).lean(),
    User.findById(userId).select('kycStatus kycDocs name role preferredLocale').lean(),
  ]);

  const context: TaraContext = {
    role,
    name: user?.name,
    recentBookings: bookings.map((b) => ({
      id: b._id.toString(),
      type: b.type,
      status: b.status,
      fareTotal: b.fareBreakdown?.total,
      pickup: b.pickupLocation?.address,
      drop: b.dropLocation?.address,
      createdAt: b.createdAt,
    })),
    complaints: complaints.map((c) => ({ category: c.category, status: c.status, createdAt: c.createdAt })),
    insurancePolicies: policies.map((p) => ({ status: p.status, endDate: p.endDate })),
    kycStatus: user?.kycStatus,
    kycDocumentsOutstanding: (user?.kycDocs ?? []).filter((d) => d.status !== 'verified').length,
  };

  if (role === 'driver') {
    const vehicle = await Vehicle.findOne({ ownerId: userId }).lean();
    if (vehicle) {
      context.vehicle = {
        capacityKg: vehicle.capacityKg,
        complianceStatus: vehicle.complianceStatus,
        availabilityStatus: vehicle.availabilityStatus,
      };
    }
  }

  if (role === 'hamali_solo' || role === 'mutha_member') {
    const profile = await HamaliProfile.findOne({ userId }).lean();
    if (profile) {
      context.hamaliProfile = {
        skills: profile.skills ?? [],
        availabilityStatus: profile.availabilityStatus,
        physicalCapacityKg: profile.physicalCapacityKg ?? null,
      };
    }
  }

  if (role === 'mutha_leader') {
    // A society a leader actually leads — found BY leaderId, never by an id
    // supplied in the request. Member names are not included: the leader can
    // see their roster on its own screen, and a transcript is a worse place
    // to keep other people's names than the roster is.
    const mutha = await Mutha.findOne({ leaderId: userId }).lean();
    if (mutha) {
      context.society = {
        name: mutha.name,
        memberCount: mutha.memberIds?.length ?? 0,
        commissionRatePct: mutha.commissionRatePct ?? 0,
        welfareDeductionRatePct: mutha.welfareDeductionRatePct ?? 0,
      };
    }
  }

  if (role === 'fleet_owner') {
    const fleet = await Fleet.findOne({ ownerId: userId }).lean();
    if (fleet) context.fleet = { vehicleCount: fleet.vehicleIds?.length ?? 0 };
  }

  return context;
}
