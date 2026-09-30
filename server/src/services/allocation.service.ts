import { Types } from 'mongoose';
import { Mutha } from '../models/Mutha';
import { Booking } from '../models/Booking';
import { HamaliProfile } from '../models/HamaliProfile';
import { User } from '../models/User';
import { AllocationLog } from '../models/AllocationLog';
import { ApiError } from '../utils/ApiError';
import { mlAllocate, mlConfigured } from './mlClient';
import { TRADE_SKILLS } from './workerEligibility';

const FAIRNESS_WINDOW_DAYS = 28;
const DAY_MS = 86_400_000;
const NEAR_KM = 10;

export interface RecommendedMember {
  memberId: string;
  name: string;
  reasons: string[];
  distanceKm: number | null;
}

export interface CrewRecommendation {
  logId: string;
  source: 'ml' | 'rules';
  fallbackReason?: string;
  needed: number;
  unmet: number;
  assigned: RecommendedMember[];
  alternates: RecommendedMember[];
}

interface Candidate {
  id: string;
  name: string;
  skills: string[];
  location?: { lat: number; lng: number };
  recentDays: number;
}

function haversineKm(a?: { lat: number; lng: number }, b?: { lat: number; lng: number }): number | null {
  if (!a || !b) return null;
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Distinct days each member was on a job in the last four weeks: the "how much have they worked" fairness input. */
export async function recentWorkDays(memberIds: Types.ObjectId[], now = new Date()): Promise<Map<string, number>> {
  const since = new Date(now.getTime() - FAIRNESS_WINDOW_DAYS * DAY_MS);
  const jobs = await Booking.find({
    assignedHamaliIds: { $in: memberIds },
    status: { $in: ['accepted', 'in_progress', 'awaiting_confirmation', 'completed'] },
    createdAt: { $gte: since },
  })
    .select('assignedHamaliIds scheduledFor createdAt')
    .lean();
  const days = new Map<string, Set<string>>();
  for (const j of jobs) {
    const day = new Date(j.scheduledFor ?? j.createdAt).toISOString().slice(0, 10);
    for (const id of j.assignedHamaliIds) {
      const k = id.toString();
      if (!days.has(k)) days.set(k, new Set());
      days.get(k)!.add(day);
    }
  }
  return new Map([...days].map(([k, v]) => [k, v.size]));
}

/** Greedy stand-in for the solver: qualified and free, nearest first, then fewest recent days. Used only when ML is off or fails. */
function rulesRecommend(cands: Candidate[], slotLoc: { lat: number; lng: number } | undefined, needed: number, requiredSkill: string | null) {
  const ranked = cands
    .filter((c) => !requiredSkill || c.skills.includes(requiredSkill))
    .map((c) => ({ c, km: haversineKm(c.location, slotLoc) }))
    // Two kilometres is "the same distance" for crewing a job; within that, the person who has worked fewer days goes first (the solver's cost has the same shape).
    .sort((a, b) => Math.round((a.km ?? 1e9) / 2) - Math.round((b.km ?? 1e9) / 2) || a.c.recentDays - b.c.recentDays || (a.km ?? 1e9) - (b.km ?? 1e9));
  return { chosen: ranked.slice(0, needed), rest: ranked.slice(needed, needed + 3) };
}

export async function recommendCrew(leaderId: string, bookingId: string): Promise<CrewRecommendation> {
  const mutha = await Mutha.findOne({ leaderId }).lean();
  if (!mutha) throw new ApiError(404, 'No Mutha found for this leader');
  const booking = await Booking.findById(bookingId).lean();
  if (!booking) throw new ApiError(404, 'Booking not found');
  const ours = booking.assignedMuthaId?.toString() === mutha._id.toString();
  if (!ours && !['requested', 'searching', 'matched'].includes(booking.status)) {
    throw new ApiError(403, 'This job is not one your society can crew');
  }

  const needed = Math.max(0, booking.requiredHamaliCount - booking.assignedHamaliIds.length);
  if (needed === 0) throw new ApiError(400, 'This job already has its full crew');

  // Not people already on this job, nor anyone working another live job
  // (assignJobMembers would refuse them).
  const onThisJob = new Set(booking.assignedHamaliIds.map(String));
  const busyElsewhere = new Set(
    (
      await Booking.find({ _id: { $ne: booking._id }, status: { $in: ['accepted', 'in_progress'] }, assignedHamaliIds: { $in: mutha.memberIds } })
        .select('assignedHamaliIds')
        .lean()
    ).flatMap((b) => b.assignedHamaliIds.map(String))
  );
  const profiles = (await HamaliProfile.find({ userId: { $in: mutha.memberIds }, availabilityStatus: 'online' }).lean()).filter(
    (p) => !onThisJob.has(p.userId.toString()) && !busyElsewhere.has(p.userId.toString())
  );
  const users = await User.find({ _id: { $in: profiles.map((p) => p.userId) } }).select('name').lean();
  const names = new Map(users.map((u) => [u._id.toString(), u.name]));
  const recent = await recentWorkDays(profiles.map((p) => p.userId));

  const cands: Candidate[] = profiles.map((p) => {
    const [lng, lat] = p.currentLocation?.coordinates ?? [0, 0];
    return {
      id: p.userId.toString(),
      name: names.get(p.userId.toString()) ?? '',
      skills: p.skills ?? [],
      location: lat || lng ? { lat, lng } : undefined,
      recentDays: recent.get(p.userId.toString()) ?? 0,
    };
  });

  const [pLng, pLat] = booking.pickupLocation?.coordinates ?? [0, 0];
  const slotLoc = pLat || pLng ? { lat: pLat, lng: pLng } : undefined;
  const slug = booking.serviceCategorySlug;
  const requiredSkill = slug && (TRADE_SKILLS as readonly string[]).includes(slug) ? slug : null;
  const date = new Date(booking.scheduledFor ?? Date.now()).toISOString().slice(0, 10);

  let source: 'ml' | 'rules' = 'rules';
  let fallbackReason: string | undefined = mlConfigured() ? undefined : 'not_configured';
  let assigned: RecommendedMember[] = [];
  let alternates: RecommendedMember[] = [];

  const nameOf = (id: string) => names.get(id) ?? '';
  if (mlConfigured() && cands.length > 0) {
    const res = await mlAllocate({
      slots: [{ id: bookingId, date, needed, skills: requiredSkill ? [requiredSkill] : [], location: slotLoc }],
      members: cands.map((c) => ({ id: c.id, skills: c.skills, location: c.location, recent_days: c.recentDays })),
    });
    if (res.ok && res.data.slots[0]) {
      const s = res.data.slots[0];
      source = 'ml';
      assigned = s.assigned.map((a) => ({ memberId: a.member_id, name: nameOf(a.member_id), reasons: a.reasons, distanceKm: a.distance_km }));
      alternates = s.alternates.map((a) => ({ memberId: a.member_id, name: nameOf(a.member_id), reasons: a.reasons, distanceKm: null }));
    } else {
      fallbackReason = res.ok ? 'empty_result' : res.reason;
    }
  }

  if (source === 'rules') {
    const sorted = [...cands].map((c) => c.recentDays).sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    const { chosen, rest } = rulesRecommend(cands, slotLoc, needed, requiredSkill);
    const toRec = ({ c, km }: { c: Candidate; km: number | null }): RecommendedMember => ({
      memberId: c.id,
      name: c.name,
      distanceKm: km == null ? null : Math.round(km * 10) / 10,
      reasons: [
        ...(requiredSkill ? ['skill_match'] : []),
        'available',
        ...(km != null && km <= NEAR_KM ? ['near'] : []),
        ...(c.recentDays < median ? ['fewer_recent_days'] : []),
      ],
    });
    assigned = chosen.map(toRec);
    alternates = rest.map(toRec);
  }

  const log = await AllocationLog.create({
    bookingId: booking._id,
    muthaId: mutha._id,
    leaderId: new Types.ObjectId(leaderId),
    source,
    fallbackReason,
    recommendedMemberIds: assigned.map((a) => new Types.ObjectId(a.memberId)),
    alreadyAssignedMemberIds: booking.assignedHamaliIds,
    alternateMemberIds: alternates.map((a) => new Types.ObjectId(a.memberId)),
  });

  return { logId: log._id.toString(), source, fallbackReason, needed, unmet: Math.max(0, needed - assigned.length), assigned, alternates };
}

/**
 * Called when a leader assigns a crew. If a recommendation was made for the
 * job, records what they actually chose against it. Best effort: never
 * blocks or fails the assignment.
 */
export async function recordAllocationOutcome(bookingId: string, muthaId: string, finalMemberIds: string[]): Promise<void> {
  try {
    const log = await AllocationLog.findOne({ bookingId, muthaId, finalMemberIds: { $exists: false } }).sort({ createdAt: -1 });
    if (!log) return;
    const rec = new Set(log.recommendedMemberIds.map(String));
    const before = new Set((log.alreadyAssignedMemberIds ?? []).map(String));
    const fin = new Set(finalMemberIds.filter((id) => !before.has(id)));
    log.finalMemberIds = finalMemberIds.map((id) => new Types.ObjectId(id));
    log.removedCount = [...rec].filter((id) => !fin.has(id)).length;
    log.addedCount = [...fin].filter((id) => !rec.has(id)).length;
    log.followed = log.removedCount === 0 && log.addedCount === 0;
    log.decidedAt = new Date();
    await log.save();
  } catch {
    /* logging must never fail an assignment */
  }
}

/**
 * How evenly work is spread inside each society, over the last four weeks:
 * distinct job-days per member. `spread` is busiest minus least-busy member.
 */
export async function societyFairness(societyIds: string[], now = new Date()) {
  const societies = await Mutha.find({ _id: { $in: societyIds } }).select('name region memberIds').lean();
  const allMembers = societies.flatMap((s) => s.memberIds);
  const recent = await recentWorkDays(allMembers, now);
  return societies.map((s) => {
    const counts = s.memberIds.map((m) => recent.get(m.toString()) ?? 0).sort((a, b) => a - b);
    const n = counts.length;
    const median = n ? counts[Math.floor(n / 2)] : 0;
    return {
      societyId: s._id.toString(),
      name: s.name,
      region: s.region ?? null,
      members: n,
      min: n ? counts[0] : 0,
      median,
      max: n ? counts[n - 1] : 0,
      spread: n ? counts[n - 1] - counts[0] : 0,
      membersWithNoWork: counts.filter((c) => c === 0).length,
      distribution: counts,
    };
  });
}

/** How often leaders take the recommendation, for the federation panel. */
export async function recommendationUptake(societyIds: string[]) {
  const logs = await AllocationLog.find({ muthaId: { $in: societyIds }, finalMemberIds: { $exists: true } })
    .select('source followed')
    .lean();
  return {
    decided: logs.length,
    followed: logs.filter((l) => l.followed).length,
    fromMl: logs.filter((l) => l.source === 'ml').length,
  };
}
