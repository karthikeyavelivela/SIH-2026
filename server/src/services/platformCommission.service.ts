import { PlatformSetting, PLATFORM_SETTING_ID } from '../models/PlatformSetting';
import { LedgerEntry } from '../models/LedgerEntry';
import { writeLedgerEntry } from './ledger.service';

/**
 * The platform's own commission — ₹10 retained for every ₹100 a role earns.
 *
 * This is deliberately the ONLY place the rate is defined or read. Every
 * earnings surface, the ledger writer and the client all derive from here,
 * so the number a worker is shown and the number actually deducted can
 * never drift apart.
 *
 * It applies to every EARNING role — driver, hamali_solo, mutha_member,
 * mutha_leader, fleet_owner, warehouse_hub. A customer pays a fare and
 * earns nothing, so nothing is deducted from them.
 *
 * Ordering, which matters and is easy to get wrong: the platform rate and a
 * society's own bye-law rates are both taken on the GROSS job share, not
 * compounded on each other. A society that sets 6% commission + 2% welfare
 * therefore sees its members keep 100 − 10 − 6 − 2 = 82% of gross, and each
 * deduction is disclosed on its own line rather than folded into one
 * unexplained smaller number.
 */
export const DEFAULT_PLATFORM_COMMISSION_PCT = 10;

/** Every role the commission is taken from. A customer earns nothing. */
export const EARNING_ROLES = [
  'driver',
  'hamali_solo',
  'mutha_member',
  'mutha_leader',
  'fleet_owner',
  'warehouse_hub',
] as const;

export type EarningRole = (typeof EARNING_ROLES)[number];

export function isEarningRole(role: string): role is EarningRole {
  return (EARNING_ROLES as readonly string[]).includes(role);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The live rate. Admin-configurable through PlatformSetting so it can be
 * changed without a deploy; falls back to the default when the settings
 * document has never been written.
 */
export async function getPlatformCommissionPct(): Promise<number> {
  const setting = await PlatformSetting.findById(PLATFORM_SETTING_ID).select('platformCommissionPct').lean();
  const pct = setting?.platformCommissionPct;
  if (typeof pct !== 'number' || Number.isNaN(pct)) return DEFAULT_PLATFORM_COMMISSION_PCT;
  // Clamped rather than trusted: a bad write must never make a worker's
  // net negative or hand them more than they earned.
  return Math.min(100, Math.max(0, pct));
}

export interface PlatformCut {
  grossAmount: number;
  platformRatePct: number;
  platformAmount: number;
  netAmount: number;
}

/** Applies the platform cut to one gross amount. */
export function applyPlatformCommission(grossAmount: number, platformRatePct: number): PlatformCut {
  const platformAmount = round2((grossAmount * platformRatePct) / 100);
  return {
    grossAmount: round2(grossAmount),
    platformRatePct,
    platformAmount,
    netAmount: round2(grossAmount - platformAmount),
  };
}

/**
 * Posts the platform's cut for a completed booking to the append-only
 * ledger, once, at the moment the job completes.
 *
 * Written here rather than computed at read time for the same reason the
 * society deduction is: the ledger has to record what was actually taken,
 * not what a later recomputation would say it should have been. Idempotent
 * on the booking — a retried completion finds the existing entry and does
 * nothing rather than double-posting.
 */
export async function recordPlatformCommissionForBooking(booking: {
  _id: unknown;
  fareBreakdown: { total: number };
  region?: string;
  status: string;
}): Promise<void> {
  if (booking.status !== 'completed') return;

  const pct = await getPlatformCommissionPct();
  if (pct <= 0) return;

  const { platformAmount } = applyPlatformCommission(booking.fareBreakdown.total, pct);
  if (platformAmount <= 0) return;

  const entityId = String(booking._id);
  const existing = await LedgerEntry.findOne({ type: 'fee', entityType: 'Booking', entityId }).lean();
  if (existing) return;

  await writeLedgerEntry({
    type: 'fee',
    entityType: 'Booking',
    entityId,
    amount: platformAmount,
    description: `Platform commission (${pct}%) on booking ${entityId.slice(-6).toUpperCase()}`,
    region: booking.region,
  });
}
