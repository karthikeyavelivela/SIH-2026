import { Types, type HydratedDocument } from 'mongoose';
import { env } from '../config/env';
import { Booking } from '../models/Booking';
import { Contract, IContract, ContractStatus } from '../models/Contract';
import { Mutha } from '../models/Mutha';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { writeAuditLog, SYSTEM_ACTOR_ID } from './audit.service';
import { createNotification } from './notification.service';
import { getFeeSplit, withServiceFee, splitServiceFee, workerRateOf } from './serviceFee.service';
import { compareToFloor, skillBandForCategory, stateForRegion, zoneForRegion } from './wageFloor.service';

/**
 * P1.6 — institutions and bulk contracts. See models/Contract.ts.
 *
 * Money follows the same rules as every other job: each visit's price is
 * the workers' rate (checked against the statutory floor as an hourly
 * equivalent — rate ÷ visit hours) with the service fee on top, and the
 * fee is split and posted when the visit completes, exactly as P1.1 does.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
export const VISIT_LOOKAHEAD_DAYS = 7;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The India calendar date of a moment, 'YYYY-MM-DD'. */
export function istDate(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The moment a visit starts: an India calendar date at the contract's India time. */
export function visitStart(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+05:30`);
}

export interface ContractTerms {
  categorySlug: string;
  region: string;
  ratePerWorkerPerVisit: number;
  schedule: { durationHours: number };
}

/**
 * A rate below the statutory minimum is refused, not clamped — the same
 * rule a worker's own published rate follows. The per-visit rate is judged
 * as an hourly equivalent over the visit's hours. A state with no floor
 * entered has none (and is not given another state's).
 */
export async function floorProblem(terms: ContractTerms): Promise<string | null> {
  const state = await stateForRegion(terms.region);
  if (!state) return null;
  const hourly = round2(terms.ratePerWorkerPerVisit / terms.schedule.durationHours);
  const comparison = await compareToFloor(
    state,
    skillBandForCategory(terms.categorySlug),
    hourly,
    'per_hour',
    zoneForRegion(terms.region)
  );
  if (!comparison || comparison.meetsFloor) return null;
  const f = comparison.floor;
  return `₹${terms.ratePerWorkerPerVisit} per worker for a ${terms.schedule.durationHours}-hour visit works out at ₹${hourly} an hour, below the ₹${f.hourlyRate} an hour statutory minimum for ${f.skillBand.replace('_', '-')} work in ${f.state} (Notification ${f.notificationNumber}).`;
}

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t < Date.parse(`${to}T00:00:00Z`); t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Visit dates of a contract in [from, to), India calendar dates. */
export function occurrencesBetween(c: Pick<IContract, 'kind' | 'schedule'>, from: string, to: string): string[] {
  const start = istDate(c.schedule.startDate);
  const end = c.schedule.endDate ? istDate(c.schedule.endDate) : null;
  const lo = from > start ? from : start;
  const hiExclusive = end && end < to ? istDate(new Date(Date.parse(`${end}T00:00:00Z`) + DAY_MS)) : to;
  if (c.kind === 'one_off') return start >= from && start < to ? [start] : [];
  return datesBetween(lo, hiExclusive).filter((d) => {
    const day = new Date(`${d}T00:00:00Z`);
    if (c.schedule.frequency === 'weekly') return (c.schedule.daysOfWeek ?? []).includes(day.getUTCDay());
    if (c.schedule.frequency === 'monthly') return day.getUTCDate() === c.schedule.dayOfMonth;
    return false;
  });
}

async function notify(userId: Types.ObjectId | string, contract: IContract, org: string) {
  await createNotification(String(userId), 'contract_update', { org, category: contract.categorySlug, status: contract.status });
}

async function orgNameOf(institutionId: Types.ObjectId | string): Promise<string> {
  const u = await User.findById(institutionId).select('name institutionProfile').lean();
  return u?.institutionProfile?.orgName ?? u?.name ?? 'Institution';
}

function pushHistory(c: HydratedDocument<IContract>, status: ContractStatus, byUserId?: string, note?: string) {
  c.status = status;
  c.history.push({ status, at: new Date(), byUserId: byUserId ? new Types.ObjectId(byUserId) : undefined, note });
}

async function audit(actorId: string, role: string, action: string, c: IContract, details: Record<string, unknown> = {}) {
  await writeAuditLog({ actorId, actorRole: role as never, action, targetType: 'Contract', targetId: c._id.toString(), details });
}

export interface ProposalInput {
  muthaId: string;
  categorySlug: string;
  scope: string;
  kind: 'one_off' | 'recurring';
  schedule: IContract['schedule'];
  workersPerVisit: number;
  ratePerWorkerPerVisit: number;
  region: string;
  location: { coordinates: [number, number]; address: string };
}

function validateSchedule(input: ProposalInput) {
  const s = input.schedule;
  if (input.kind === 'recurring') {
    if (s.frequency === 'weekly' && !(s.daysOfWeek && s.daysOfWeek.length > 0)) {
      throw new ApiError(400, 'A weekly contract needs at least one day of the week');
    }
    if (s.frequency === 'monthly' && !s.dayOfMonth) throw new ApiError(400, 'A monthly contract needs a day of the month');
    if (!s.frequency) throw new ApiError(400, 'A recurring contract needs a frequency');
  }
  if (s.endDate && new Date(s.endDate) < new Date(s.startDate)) throw new ApiError(400, 'The end date is before the start date');
}

/** An institution proposes a contract to a society. */
export async function proposeContract(institutionId: string, input: ProposalInput) {
  const me = await User.findById(institutionId).select('accountType institutionProfile').lean();
  if (me?.accountType !== 'institution' || !me.institutionProfile?.orgName) {
    throw new ApiError(403, 'Only an institution account can propose a contract — set up your institution profile first');
  }
  const mutha = await Mutha.findById(input.muthaId).select('leaderId name').lean();
  if (!mutha) throw new ApiError(404, 'Society not found');
  validateSchedule(input);
  const problem = await floorProblem(input);
  if (problem) throw new ApiError(422, problem);

  const contract = await Contract.create({
    institutionId,
    muthaId: mutha._id,
    categorySlug: input.categorySlug,
    scope: input.scope,
    kind: input.kind,
    schedule: input.schedule,
    workersPerVisit: input.workersPerVisit,
    ratePerWorkerPerVisit: input.ratePerWorkerPerVisit,
    region: input.region,
    location: { type: 'Point', coordinates: input.location.coordinates, address: input.location.address },
    status: 'proposed',
    history: [{ status: 'proposed', at: new Date(), byUserId: new Types.ObjectId(institutionId) }],
  });
  await notify(mutha.leaderId, contract, me.institutionProfile.orgName);
  await audit(institutionId, 'customer', 'contract_proposed', contract, { muthaId: input.muthaId });
  return contract;
}

async function forLeader(leaderId: string, contractId: string) {
  const mutha = await Mutha.findOne({ leaderId }).select('_id').lean();
  const contract = mutha ? await Contract.findOne({ _id: contractId, muthaId: mutha._id }) : null;
  if (!contract) throw new ApiError(404, 'Contract not found');
  return contract;
}

async function forInstitution(institutionId: string, contractId: string) {
  const contract = await Contract.findOne({ _id: contractId, institutionId });
  if (!contract) throw new ApiError(404, 'Contract not found');
  return contract;
}

/** The society leader answers a proposal: accept, counter or reject. */
export async function leaderDecides(
  leaderId: string,
  contractId: string,
  action: 'accept' | 'counter' | 'reject' | 'cancel',
  counter?: { ratePerWorkerPerVisit?: number; workersPerVisit?: number; note?: string }
) {
  const contract = await forLeader(leaderId, contractId);
  if (action === 'cancel') {
    if (!['active', 'paused'].includes(contract.status)) throw new ApiError(400, 'Only an active or paused contract can be cancelled');
    pushHistory(contract, 'cancelled', leaderId, counter?.note);
  } else {
    if (contract.status !== 'proposed') throw new ApiError(400, `This contract is ${contract.status}, not waiting for your answer`);
    if (action === 'accept') pushHistory(contract, 'active', leaderId);
    if (action === 'reject') pushHistory(contract, 'rejected', leaderId, counter?.note);
    if (action === 'counter') {
      const rate = counter?.ratePerWorkerPerVisit ?? contract.ratePerWorkerPerVisit;
      const problem = await floorProblem({ ...contract.toObject(), ratePerWorkerPerVisit: rate });
      if (problem) throw new ApiError(422, problem);
      contract.counter = {
        ratePerWorkerPerVisit: counter?.ratePerWorkerPerVisit,
        workersPerVisit: counter?.workersPerVisit,
        note: counter?.note,
        at: new Date(),
      };
      pushHistory(contract, 'countered', leaderId, counter?.note);
    }
  }
  await contract.save();
  await notify(contract.institutionId, contract, await orgNameOf(contract.institutionId));
  await audit(leaderId, 'mutha_leader', `contract_${action}`, contract, { counter });
  if (contract.status === 'active') await generateVisits(new Date(), contract._id.toString());
  return contract;
}

/** The institution answers a counter, or pauses / resumes / cancels. */
export async function institutionDecides(
  institutionId: string,
  contractId: string,
  action: 'accept_counter' | 'reject_counter' | 'pause' | 'resume' | 'cancel',
  note?: string
) {
  const contract = await forInstitution(institutionId, contractId);
  if (action === 'accept_counter' || action === 'reject_counter') {
    if (contract.status !== 'countered') throw new ApiError(400, 'There is no counter-offer waiting');
    if (action === 'accept_counter') {
      if (contract.counter?.ratePerWorkerPerVisit) contract.ratePerWorkerPerVisit = contract.counter.ratePerWorkerPerVisit;
      if (contract.counter?.workersPerVisit) contract.workersPerVisit = contract.counter.workersPerVisit;
      pushHistory(contract, 'active', institutionId, note);
    } else {
      pushHistory(contract, 'rejected', institutionId, note);
    }
  } else if (action === 'pause') {
    if (contract.status !== 'active') throw new ApiError(400, 'Only an active contract can be paused');
    pushHistory(contract, 'paused', institutionId, note);
  } else if (action === 'resume') {
    if (contract.status !== 'paused') throw new ApiError(400, 'Only a paused contract can be resumed');
    pushHistory(contract, 'active', institutionId, note);
  } else {
    if (['cancelled', 'completed', 'rejected'].includes(contract.status)) throw new ApiError(400, `This contract is already ${contract.status}`);
    pushHistory(contract, 'cancelled', institutionId, note);
  }
  await contract.save();
  const mutha = await Mutha.findById(contract.muthaId).select('leaderId').lean();
  if (mutha) await notify(mutha.leaderId, contract, await orgNameOf(contract.institutionId));
  await audit(institutionId, 'customer', `contract_${action}`, contract, { note });
  if (contract.status === 'active') await generateVisits(new Date(), contract._id.toString());
  return contract;
}

/**
 * Turns the next VISIT_LOOKAHEAD_DAYS of every active contract into
 * bookings: assigned to the society (status accepted, no crew yet — the
 * leader assigns members with the ordinary crew screen), never dispatched
 * to anyone else. Each date is claimed atomically before its booking is
 * created, so two runs never make the same visit twice.
 */
export async function generateVisits(now: Date = new Date(), onlyContractId?: string): Promise<number> {
  const from = istDate(now);
  const to = istDate(new Date(now.getTime() + VISIT_LOOKAHEAD_DAYS * DAY_MS));
  const contracts = await Contract.find({ status: 'active', ...(onlyContractId ? { _id: onlyContractId } : {}) });
  const split = await getFeeSplit();
  let made = 0;

  for (const c of contracts) {
    for (const date of occurrencesBetween(c, from, to)) {
      const claimed = await Contract.updateOne({ _id: c._id, status: 'active', generatedDates: { $ne: date } }, { $addToSet: { generatedDates: date } });
      if (claimed.modifiedCount === 0) continue;
      const workerTotal = round2(c.ratePerWorkerPerVisit * c.workersPerVisit);
      const at = visitStart(date, c.schedule.time);
      const booking = await Booking.create({
        customerId: c.institutionId,
        type: 'hamali',
        region: c.region,
        serviceCategorySlug: c.categorySlug,
        cargoDetails: { weightKg: 0, description: c.scope.slice(0, 500) },
        pickupLocation: { type: 'Point', coordinates: c.location.coordinates, address: c.location.address },
        dropLocation: { type: 'Point', coordinates: c.location.coordinates, address: c.location.address },
        requiredHamaliCount: c.workersPerVisit,
        assignedHamaliIds: [],
        assignedMuthaId: c.muthaId,
        status: 'accepted',
        scheduledFor: at,
        fareBreakdown: withServiceFee(
          { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: workerTotal, total: workerTotal },
          split
        ),
        statusHistory: [{ status: 'accepted', timestamp: now }],
        contractId: c._id,
        contractVisitDate: date,
      });
      made += 1;
      const mutha = await Mutha.findById(c.muthaId).select('leaderId').lean();
      if (mutha) {
        await createNotification(mutha.leaderId.toString(), 'contract_update', {
          org: await orgNameOf(c.institutionId),
          category: c.categorySlug,
          status: `visit on ${date} — assign ${c.workersPerVisit} member(s)`,
        });
      }
      await writeAuditLog({
        actorId: SYSTEM_ACTOR_ID,
        actorRole: 'system' as never,
        action: 'contract_visit_generated',
        targetType: 'Booking',
        targetId: booking._id.toString(),
        details: { contractId: c._id.toString(), date },
      });
    }
    // A contract whose last date has passed is complete.
    if (c.schedule.endDate && istDate(c.schedule.endDate) < from && c.status === 'active') {
      await Contract.updateOne({ _id: c._id }, { status: 'completed', $push: { history: { status: 'completed', at: now } } });
    }
    if (c.kind === 'one_off' && istDate(c.schedule.startDate) < from && c.status === 'active') {
      await Contract.updateOne({ _id: c._id }, { status: 'completed', $push: { history: { status: 'completed', at: now } } });
    }
  }
  return made;
}

export interface StatementLine {
  bookingId: string;
  date: string;
  status: string;
  workers: number;
  workerRate: number;
  serviceFee: number;
  total: number;
  feeParts: { society: number; welfarePool: number; guaranteeReserve: number; platform: number };
}

/** One month of a contract's completed visits, with the fee split per visit. */
export async function monthlyStatement(contract: IContract, month: string) {
  const visits = await Booking.find({ contractId: contract._id, contractVisitDate: { $regex: `^${month}` } })
    .sort({ contractVisitDate: 1 })
    .lean();
  const lines: StatementLine[] = visits
    .filter((b) => b.status === 'completed')
    .map((b) => {
      const fb = b.fareBreakdown;
      const fee = fb.serviceFee ?? 0;
      const split = fb.feeSplit ?? { societyPct: 5, welfarePoolPct: 3, guaranteeReservePct: 1, platformPct: 1 };
      return {
        bookingId: b._id.toString(),
        date: b.contractVisitDate ?? '',
        status: b.status,
        workers: b.assignedHamaliIds.length || b.requiredHamaliCount,
        workerRate: workerRateOf(fb),
        serviceFee: fee,
        total: fb.total,
        feeParts: splitServiceFee(fee, { feeTotalPct: fb.serviceFeePct ?? 10, ...split }),
      };
    });
  const sum = (k: 'workerRate' | 'serviceFee' | 'total') => round2(lines.reduce((s, l) => s + l[k], 0));
  return {
    month,
    lines,
    pendingVisits: visits.filter((b) => b.status !== 'completed' && b.status !== 'cancelled').length,
    totals: { workerRate: sum('workerRate'), serviceFee: sum('serviceFee'), total: sum('total'), visits: lines.length },
  };
}

/** Hourly: keep the next week of visits generated. */
export function startContractRunner(): NodeJS.Timeout | null {
  if (env.NODE_ENV === 'test') return null;
  const tick = () => {
    generateVisits().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('contract visit generation failed:', err);
    });
  };
  setTimeout(tick, 90_000).unref();
  const handle = setInterval(tick, 60 * 60 * 1000);
  handle.unref();
  return handle;
}
