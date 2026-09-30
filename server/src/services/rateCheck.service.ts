import { Types } from 'mongoose';
import { WorkerPricingProfile } from '../models/WorkerPricingProfile';
import { mlPriceAnomaly, mlConfigured } from './mlClient';

export interface RateCheck {
  source: 'ml' | 'rules';
  /** Whether the check could say anything at all; false when there are too few comparable rates. */
  available: boolean;
  flagged: boolean;
  reason?: string;
  medianOthers?: number;
  comparableRates?: number;
  modelVersion?: string | null;
}

/** Fewest other published rates before the rule-based check says anything. */
const MIN_COMPARABLE = 5;
/** A rate this many times the median (or this fraction of it) is flagged by the rule. */
const RULE_FACTOR = 3;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Advisory only: a worker's own hourly rate against what other workers in the
 * same trade have published. It never blocks a rate, the wage floors do that;
 * it tells the worker (and the audit trail) when a number looks off, e.g. an
 * extra zero. Uses the ML service when it is reachable, else a median rule,
 * and says which it was.
 */
export async function checkHourlyRate(workerId: string, categorySlug: string, rate: number): Promise<RateCheck> {
  const others = await WorkerPricingProfile.find({
    categorySlug,
    active: true,
    workerId: { $ne: new Types.ObjectId(workerId) },
    'hourly.rate': { $gt: 0 },
  })
    .select('hourly.rate')
    .limit(2000)
    .lean();
  const rates = others.map((o) => o.hourly!.rate);

  let mlReason: string | undefined = mlConfigured() ? undefined : 'not_configured';
  if (mlConfigured()) {
    const res = await mlPriceAnomaly({ category: categorySlug, rate, history: rates });
    if (res.ok && res.data.available) {
      return {
        source: 'ml',
        available: true,
        flagged: res.data.flagged,
        comparableRates: rates.length,
        modelVersion: res.data.model_version,
        ...(rates.length ? { medianOthers: median(rates) } : {}),
      };
    }
    mlReason = res.ok ? res.data.available === false ? res.data.reason : undefined : res.reason;
  }

  if (rates.length < MIN_COMPARABLE) {
    return { source: 'rules', available: false, flagged: false, reason: 'not_enough_comparable_rates', comparableRates: rates.length };
  }
  const med = median(rates);
  return {
    source: 'rules',
    available: true,
    flagged: rate > med * RULE_FACTOR || rate < med / RULE_FACTOR,
    medianOthers: med,
    comparableRates: rates.length,
    ...(mlReason ? { reason: `ml_${mlReason}` } : {}),
  };
}
