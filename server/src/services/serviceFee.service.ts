import { Types } from 'mongoose';
import { PlatformSetting, PLATFORM_SETTING_ID } from '../models/PlatformSetting';
import { Federation } from '../models/Federation';
import { Mutha } from '../models/Mutha';
import { writeLedgerEntry } from './ledger.service';
import { SYSTEM_ACTOR_ID } from './audit.service';
import { stateForRegion } from './wageFloor.service';
import type { FareBreakdown } from './fare.service';

/**
 * P1.1 — the customer pays the worker's rate plus a published service fee,
 * and the worker keeps 100% of their rate.
 *
 * Before this, the platform's 1% and the society's bye-law cuts came OUT of
 * the worker's rate. Now nothing is deducted from the worker: the fee is
 * added on top and split, in integer paise, into
 *
 *   society share            → the worker's society (a solo worker's goes to
 *                              the district federation, else the state one)
 *   welfare pool             → the district welfare pool
 *   guarantee reserve        → the platform's workmanship-guarantee reserve
 *   platform fee             → FYRO revenue (and any rounding remainder)
 *
 * The split in force when a booking is priced is frozen onto it, so changing
 * the settings never rewrites a booking already quoted.
 *
 * Bookings priced before this existed carry no serviceFee. They keep the old
 * behaviour exactly (total = the worker's gross, old deductions posted), which
 * is why every reader goes through workerRateOf() rather than `total`.
 */

export interface FeeSplit {
  feeTotalPct: number;
  societyPct: number;
  welfarePoolPct: number;
  guaranteeReservePct: number;
  platformPct: number;
}

export const DEFAULT_FEE_SPLIT: FeeSplit = {
  feeTotalPct: 10,
  societyPct: 5,
  welfarePoolPct: 3,
  guaranteeReservePct: 1,
  platformPct: 1,
};

const PARTS = ['societyPct', 'welfarePoolPct', 'guaranteeReservePct', 'platformPct'] as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Problems with a proposed split, or [] when it is valid. */
export function feeSplitProblems(split: FeeSplit): string[] {
  const problems: string[] = [];
  for (const key of ['feeTotalPct', ...PARTS] as const) {
    const v = split[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) problems.push(`${key} must be a number of at least 0`);
  }
  if (split.feeTotalPct > 50) problems.push('feeTotalPct cannot exceed 50');
  const sum = round2(PARTS.reduce((s, k) => s + (split[k] ?? 0), 0));
  if (problems.length === 0 && sum !== round2(split.feeTotalPct)) {
    problems.push(`The four parts add up to ${sum}%, not the ${split.feeTotalPct}% total`);
  }
  return problems;
}

export async function getFeeSplit(): Promise<FeeSplit> {
  const s = await PlatformSetting.findById(PLATFORM_SETTING_ID)
    .select('feeTotalPct societyPct welfarePoolPct guaranteeReservePct platformPct')
    .lean();
  if (!s) return { ...DEFAULT_FEE_SPLIT };
  const split: FeeSplit = {
    feeTotalPct: s.feeTotalPct ?? DEFAULT_FEE_SPLIT.feeTotalPct,
    societyPct: s.societyPct ?? DEFAULT_FEE_SPLIT.societyPct,
    welfarePoolPct: s.welfarePoolPct ?? DEFAULT_FEE_SPLIT.welfarePoolPct,
    guaranteeReservePct: s.guaranteeReservePct ?? DEFAULT_FEE_SPLIT.guaranteeReservePct,
    platformPct: s.platformPct ?? DEFAULT_FEE_SPLIT.platformPct,
  };
  // A stored split that does not add up (written before validation, or by
  // hand) is never charged: the default is used instead.
  return feeSplitProblems(split).length ? { ...DEFAULT_FEE_SPLIT } : split;
}

type FeeSplitParts = { societyPct: number; welfarePoolPct: number; guaranteeReservePct: number; platformPct: number };

/**
 * A plain copy of a fare, field by field. A booking's fareBreakdown is a
 * Mongoose subdocument, and spreading one copies its internals rather than
 * its fields — so nothing in this module ever spreads a fare.
 */
export function plainFare(fb: FareBreakdown): FareBreakdown {
  const out: FareBreakdown = {
    baseFare: fb.baseFare ?? 0,
    distanceFare: fb.distanceFare ?? 0,
    surgeMultiplier: fb.surgeMultiplier ?? 1,
    hamaliFare: fb.hamaliFare ?? 0,
    total: fb.total ?? 0,
  };
  if (typeof fb.workerRate === 'number') out.workerRate = fb.workerRate;
  if (typeof fb.serviceFeePct === 'number') out.serviceFeePct = fb.serviceFeePct;
  if (typeof fb.serviceFee === 'number') out.serviceFee = fb.serviceFee;
  const split = plainSplit(fb.feeSplit);
  if (split) out.feeSplit = split;
  return out;
}

function plainSplit(split: FeeSplitParts | undefined | null): FeeSplitParts | undefined {
  if (!split || typeof split.societyPct !== 'number') return undefined;
  return {
    societyPct: split.societyPct,
    welfarePoolPct: split.welfarePoolPct,
    guaranteeReservePct: split.guaranteeReservePct,
    platformPct: split.platformPct,
  };
}

/** The worker's rate on any booking, old or new. */
export function workerRateOf(fb: Pick<FareBreakdown, 'total' | 'workerRate'>): number {
  return typeof fb.workerRate === 'number' ? fb.workerRate : fb.total;
}

/** True once a booking was priced with the service fee on top. */
export function hasServiceFee(fb: Pick<FareBreakdown, 'serviceFee'>): boolean {
  return typeof fb.serviceFee === 'number';
}

/**
 * Adds the service fee to a worker-rate fare. `base.total` is the worker's
 * rate. The one function every pricing path (quote and create, dispatch,
 * work-priced, quotation, bid, variation) uses, so they cannot disagree.
 */
export function withServiceFee(base: FareBreakdown, split: FeeSplit): FareBreakdown {
  const workerRate = round2(base.total);
  const serviceFee = round2((workerRate * split.feeTotalPct) / 100);
  return {
    baseFare: base.baseFare,
    distanceFare: base.distanceFare,
    surgeMultiplier: base.surgeMultiplier,
    hamaliFare: base.hamaliFare,
    workerRate,
    serviceFeePct: split.feeTotalPct,
    serviceFee,
    total: round2(workerRate + serviceFee),
    feeSplit: {
      societyPct: split.societyPct,
      welfarePoolPct: split.welfarePoolPct,
      guaranteeReservePct: split.guaranteeReservePct,
      platformPct: split.platformPct,
    },
  };
}

/**
 * Re-prices an existing booking's fare at a new worker rate, keeping its
 * frozen split. `overrides` replaces display components (a bid rescales them).
 */
export function repriceWorkerRate(
  fb: FareBreakdown,
  newWorkerRate: number,
  overrides: Partial<Pick<FareBreakdown, 'baseFare' | 'distanceFare' | 'hamaliFare'>> = {}
): FareBreakdown {
  const base = { ...plainFare(fb), ...overrides };
  const split = plainSplit(base.feeSplit);
  if (!hasServiceFee(base) || !split || typeof base.serviceFeePct !== 'number') {
    // Priced before the service fee: the total is still the worker's rate.
    return { ...base, total: round2(newWorkerRate) };
  }
  return withServiceFee({ ...base, total: newWorkerRate }, { feeTotalPct: base.serviceFeePct, ...split });
}

export interface FeeParts {
  society: number;
  welfarePool: number;
  guaranteeReserve: number;
  platform: number;
}

/** Splits a fee in integer paise; the rounding remainder goes to the platform fee. */
export function splitServiceFee(serviceFee: number, split: Omit<FeeSplit, 'feeTotalPct'> & { feeTotalPct: number }): FeeParts {
  const feePaise = Math.round(serviceFee * 100);
  if (feePaise <= 0 || split.feeTotalPct <= 0) return { society: 0, welfarePool: 0, guaranteeReserve: 0, platform: 0 };
  const part = (pct: number) => Math.floor((feePaise * pct) / split.feeTotalPct);
  const society = part(split.societyPct);
  const welfarePool = part(split.welfarePoolPct);
  const guaranteeReserve = part(split.guaranteeReservePct);
  const platform = feePaise - society - welfarePool - guaranteeReserve;
  return { society: society / 100, welfarePool: welfarePool / 100, guaranteeReserve: guaranteeReserve / 100, platform: platform / 100 };
}

interface Account {
  entityType: 'Mutha' | 'Federation' | 'Platform';
  entityId: string;
  label: string;
}

const PLATFORM_ACCOUNT: Account = { entityType: 'Platform', entityId: SYSTEM_ACTOR_ID, label: 'platform' };

async function districtOrStateFederation(region: string | undefined): Promise<Account | null> {
  if (!region) return null;
  const district = await Federation.findOne({ type: 'district', region }).select('_id name').lean();
  if (district) return { entityType: 'Federation', entityId: district._id.toString(), label: `district federation ${district.name}` };
  const state = await stateForRegion(region);
  if (state) {
    const fed = await Federation.findOne({ type: 'state', region: state }).select('_id name').lean();
    if (fed) return { entityType: 'Federation', entityId: fed._id.toString(), label: `state federation ${fed.name}` };
  }
  return null;
}

interface SettleableBooking {
  _id: Types.ObjectId | string;
  status: string;
  region?: string;
  assignedMuthaId?: Types.ObjectId | null;
  fareBreakdown: FareBreakdown;
}

/**
 * Where each part of a booking's fee goes. The society share goes to the
 * society that did the work; a solo worker's goes to the district federation
 * (else the state one). The welfare contribution goes to the pool of the
 * district the work belongs to: the society's own district when it is
 * affiliated, otherwise the booking's region. Anything with no account to go
 * to is held by the platform and labelled as such.
 */
export async function feeAccountsFor(booking: SettleableBooking): Promise<{ society: Account; welfarePool: Account }> {
  const regional = await districtOrStateFederation(booking.region);
  let society: Account | null = null;
  let welfarePool: Account | null = regional;

  if (booking.assignedMuthaId) {
    const mutha = await Mutha.findById(booking.assignedMuthaId).select('_id name districtFederationId affiliationStatus').lean();
    if (mutha) {
      society = { entityType: 'Mutha', entityId: mutha._id.toString(), label: `society ${mutha.name}` };
      if (mutha.districtFederationId && mutha.affiliationStatus === 'affiliated') {
        welfarePool = { entityType: 'Federation', entityId: mutha.districtFederationId.toString(), label: 'district welfare pool' };
      }
    }
  }
  return {
    society: society ?? regional ?? { ...PLATFORM_ACCOUNT, label: 'platform (no federation for this region)' },
    welfarePool: welfarePool ?? { ...PLATFORM_ACCOUNT, label: 'platform (no welfare pool for this region)' },
  };
}

/**
 * Posts the four parts of a completed booking's service fee to the ledger.
 * Idempotent: each part is unique per booking, so a retried settlement posts
 * nothing twice. Returns false for a booking priced before the service fee
 * (the caller then runs the old deductions instead).
 */
export async function settleServiceFee(booking: SettleableBooking): Promise<boolean> {
  const fb = plainFare(booking.fareBreakdown);
  if (!hasServiceFee(fb)) return false;
  if (booking.status !== 'completed') return true;

  const split = fb.feeSplit ?? DEFAULT_FEE_SPLIT;
  const feeTotalPct = typeof fb.serviceFeePct === 'number' ? fb.serviceFeePct : DEFAULT_FEE_SPLIT.feeTotalPct;
  const parts = splitServiceFee(fb.serviceFee ?? 0, { feeTotalPct, ...split });
  const accounts = await feeAccountsFor(booking);
  const bookingId = booking._id.toString();
  const ref = bookingId.slice(-6).toUpperCase();

  const postings: { type: 'society_share' | 'welfare_pool_contribution' | 'guarantee_reserve' | 'platform_fee'; amount: number; account: Account; what: string }[] = [
    { type: 'society_share', amount: parts.society, account: accounts.society, what: `Society share (${split.societyPct}%)` },
    { type: 'welfare_pool_contribution', amount: parts.welfarePool, account: accounts.welfarePool, what: `Welfare pool contribution (${split.welfarePoolPct}%)` },
    { type: 'guarantee_reserve', amount: parts.guaranteeReserve, account: PLATFORM_ACCOUNT, what: `Guarantee reserve (${split.guaranteeReservePct}%)` },
    { type: 'platform_fee', amount: parts.platform, account: PLATFORM_ACCOUNT, what: `Platform fee (${split.platformPct}%)` },
  ];

  for (const p of postings) {
    if (p.amount <= 0) continue;
    try {
      await writeLedgerEntry({
        type: p.type,
        entityType: p.account.entityType,
        entityId: p.account.entityId,
        amount: p.amount,
        description: `${p.what} of the service fee on booking ${ref}, to ${p.account.label}`,
        region: booking.region,
        bookingId,
      });
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }
  return true;
}
