import { Types, type HydratedDocument } from 'mongoose';
import { env } from '../config/env';
import { Dispute, IDispute, DisputeLevel } from '../models/Dispute';
import { Federation } from '../models/Federation';
import { Mutha } from '../models/Mutha';
import { User } from '../models/User';
import type { IBooking } from '../models/Booking';
import { writeAuditLog, SYSTEM_ACTOR_ID } from './audit.service';
import { createNotification } from './notification.service';
import { stateForRegion } from './wageFloor.service';

/**
 * P1.5 — disputes are resolved by the level closest to the work.
 *
 *   society  → the leader of the society that did the job
 *   district → the district federation (where a solo worker's dispute starts)
 *   state    → the state federation
 *   admin    → FYRO
 *
 * Each level has DISPUTE_SLA_HOURS (48) to resolve or escalate; a missed
 * deadline escalates by itself. A level with no one to act — a society not
 * affiliated to any district, a region with no federation — is skipped
 * rather than left to time out. Admins can act at any level. Every routing
 * step is audited and the new resolvers are notified.
 */

const ORDER: DisputeLevel[] = ['society', 'district', 'state', 'admin'];

function slaFrom(now: Date): Date {
  return new Date(now.getTime() + env.DISPUTE_SLA_HOURS * 60 * 60 * 1000);
}

interface Scopes {
  muthaId?: Types.ObjectId;
  districtFederationId?: Types.ObjectId;
  stateFederationId?: Types.ObjectId;
}

async function scopesFor(booking: Pick<IBooking, 'assignedMuthaId' | 'region'>): Promise<Scopes> {
  const scopes: Scopes = {};
  if (booking.assignedMuthaId) {
    const mutha = await Mutha.findById(booking.assignedMuthaId).select('_id districtFederationId affiliationStatus').lean();
    if (mutha) {
      scopes.muthaId = mutha._id;
      if (mutha.districtFederationId && mutha.affiliationStatus === 'affiliated') {
        scopes.districtFederationId = mutha.districtFederationId;
      }
    }
  }
  if (!scopes.districtFederationId && booking.region) {
    const district = await Federation.findOne({ type: 'district', region: booking.region }).select('_id').lean();
    if (district) scopes.districtFederationId = district._id;
  }
  if (scopes.districtFederationId) {
    const district = await Federation.findById(scopes.districtFederationId).select('parentFederationId').lean();
    if (district?.parentFederationId) scopes.stateFederationId = district.parentFederationId;
  }
  if (!scopes.stateFederationId && booking.region) {
    const state = await stateForRegion(booking.region);
    if (state) {
      const fed = await Federation.findOne({ type: 'state', region: state }).select('_id').lean();
      if (fed) scopes.stateFederationId = fed._id;
    }
  }
  return scopes;
}

function hasResolver(level: DisputeLevel, scopes: Scopes): boolean {
  if (level === 'society') return !!scopes.muthaId;
  if (level === 'district') return !!scopes.districtFederationId;
  if (level === 'state') return !!scopes.stateFederationId;
  return true;
}

function firstLevelFrom(start: number, scopes: Scopes): DisputeLevel {
  for (let i = start; i < ORDER.length; i++) if (hasResolver(ORDER[i], scopes)) return ORDER[i];
  return 'admin';
}

/** Fields to spread into Dispute.create: where a new dispute starts, and its deadline. */
export async function initialRouting(booking: Pick<IBooking, 'assignedMuthaId' | 'region'>, now: Date = new Date()) {
  const scopes = await scopesFor(booking);
  const level = firstLevelFrom(0, scopes);
  return {
    ...scopes,
    level,
    slaDueAt: level === 'admin' ? undefined : slaFrom(now),
    levelHistory: [{ level, at: now, reason: 'initial' as const }],
  };
}

async function resolverIdsFor(dispute: Pick<IDispute, 'level' | 'muthaId' | 'districtFederationId' | 'stateFederationId'>): Promise<string[]> {
  if (dispute.level === 'society' && dispute.muthaId) {
    const mutha = await Mutha.findById(dispute.muthaId).select('leaderId').lean();
    return mutha ? [mutha.leaderId.toString()] : [];
  }
  const fedId = dispute.level === 'district' ? dispute.districtFederationId : dispute.level === 'state' ? dispute.stateFederationId : undefined;
  const role = dispute.level === 'district' ? 'federation_district_admin' : dispute.level === 'state' ? 'federation_state_admin' : 'admin';
  const users = await User.find(fedId ? { role, federationId: fedId } : { role }).select('_id').limit(20).lean();
  return users.map((u) => u._id.toString());
}

async function notifyResolvers(dispute: HydratedDocument<IDispute>, reason: string) {
  const ids = await resolverIdsFor(dispute);
  const ref = dispute.bookingId.toString().slice(-6).toUpperCase();
  const due = dispute.slaDueAt ? dispute.slaDueAt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—';
  for (const id of ids) await createNotification(id, 'dispute_assigned', { ref, reason, due });
}

/** Announces a freshly created dispute to whoever resolves it first. */
export async function announceNewDispute(dispute: HydratedDocument<IDispute>): Promise<void> {
  await notifyResolvers(dispute, 'new dispute');
}

/**
 * Moves an unresolved dispute up one level (skipping levels with no one to
 * act). At admin it stays at admin. Audited; the new resolvers are told.
 */
export async function escalateDispute(
  dispute: HydratedDocument<IDispute>,
  actor: { id: string; role: string },
  reason: 'escalated' | 'sla_missed',
  now: Date = new Date()
): Promise<HydratedDocument<IDispute>> {
  if (dispute.status === 'resolved') return dispute;
  const from = dispute.level ?? 'admin';
  const to = firstLevelFrom(ORDER.indexOf(from) + 1, dispute);
  dispute.level = to;
  dispute.status = 'escalated';
  dispute.slaDueAt = to === 'admin' ? undefined : slaFrom(now);
  dispute.levelHistory.push({
    level: to,
    at: now,
    reason,
    byUserId: actor.id === SYSTEM_ACTOR_ID ? undefined : new Types.ObjectId(actor.id),
  });
  await dispute.save();
  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: reason === 'sla_missed' ? 'dispute_auto_escalated' : 'dispute_escalated',
    targetType: 'Dispute',
    targetId: dispute._id.toString(),
    details: { from, to },
  });
  await notifyResolvers(dispute, reason === 'sla_missed' ? 'the previous level ran out of time' : 'escalated');
  return dispute;
}

/** Whether this user may act on this dispute at its current level. Admins act at any level. */
export async function canActOn(
  user: { id: string; role: string },
  dispute: Pick<IDispute, 'level' | 'muthaId' | 'districtFederationId' | 'stateFederationId'>
): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (user.role === 'mutha_leader') {
    if (dispute.level !== 'society' || !dispute.muthaId) return false;
    return !!(await Mutha.exists({ _id: dispute.muthaId, leaderId: user.id }));
  }
  if (user.role === 'federation_district_admin' || user.role === 'federation_state_admin') {
    const me = await User.findById(user.id).select('federationId').lean();
    if (!me?.federationId) return false;
    if (user.role === 'federation_district_admin') {
      return dispute.level === 'district' && String(dispute.districtFederationId) === String(me.federationId);
    }
    return dispute.level === 'state' && String(dispute.stateFederationId) === String(me.federationId);
  }
  return false;
}

/** The queue filter for a resolver: disputes at their level and in their scope. */
export async function queueFilterFor(user: { id: string; role: string }): Promise<Record<string, unknown> | null> {
  if (user.role === 'admin') return {};
  if (user.role === 'mutha_leader') {
    const mutha = await Mutha.findOne({ leaderId: user.id }).select('_id').lean();
    return mutha ? { level: 'society', muthaId: mutha._id } : null;
  }
  const me = await User.findById(user.id).select('federationId').lean();
  if (!me?.federationId) return null;
  if (user.role === 'federation_district_admin') return { level: 'district', districtFederationId: me.federationId };
  if (user.role === 'federation_state_admin') return { level: 'state', stateFederationId: me.federationId };
  return null;
}

/** Escalates every unresolved dispute whose deadline has passed. Idempotent per deadline. */
export async function runSlaEscalations(now: Date = new Date()): Promise<number> {
  const overdue = await Dispute.find({
    status: { $ne: 'resolved' },
    level: { $ne: 'admin' },
    slaDueAt: { $lt: now },
  });
  for (const d of overdue) await escalateDispute(d, { id: SYSTEM_ACTOR_ID, role: 'system' }, 'sla_missed', now);
  return overdue.length;
}

export function startDisputeSlaRunner(): NodeJS.Timeout | null {
  if (env.NODE_ENV === 'test') return null;
  const handle = setInterval(() => {
    runSlaEscalations().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('dispute SLA run failed:', err);
    });
  }, 15 * 60 * 1000);
  handle.unref();
  return handle;
}
