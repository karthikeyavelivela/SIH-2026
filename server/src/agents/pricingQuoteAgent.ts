import { FareRule } from '../models/FareRule';
import { Booking } from '../models/Booking';
import { callAgent } from './client';
import { AgentResult } from './types';
import type { AgentLocale } from './locale';

export type FareCategory = 'vehicle_small' | 'vehicle_medium' | 'vehicle_large' | 'hamali';

const LOOKBACK_DAYS = 30;
const MS_PER_DAY = 86_400_000;
// Below this many comparable completed bookings, a historical-average
// comparison is mostly noise — same statistical-floor discipline as
// demandForecastAgent's MIN_BOOKINGS_FOR_FORECAST, just a lower bar since
// this only needs an average, not an hour-by-hour shape.
const MIN_COMPARABLE_BOOKINGS = 5;

interface HistoricalSample {
  count: number;
  avgTotal: number;
  avgPerKm: number | null;
}

async function historicalComparables(region: string, category: FareCategory): Promise<HistoricalSample> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * MS_PER_DAY);
  const matchType = category === 'hamali' ? 'hamali' : { $in: ['truck', 'combo'] };
  const bookings = await Booking.find({
    region,
    status: 'completed',
    type: matchType,
    createdAt: { $gte: since },
  })
    .select('fareBreakdown distanceKm')
    .lean();

  if (bookings.length === 0) return { count: 0, avgTotal: 0, avgPerKm: null };

  const totalSum = bookings.reduce((sum, b) => sum + (b.fareBreakdown?.total ?? 0), 0);
  const withDistance = bookings.filter((b) => (b.distanceKm ?? 0) > 0);
  const avgPerKm = withDistance.length
    ? withDistance.reduce((sum, b) => sum + b.fareBreakdown.total / b.distanceKm, 0) / withDistance.length
    : null;

  return { count: bookings.length, avgTotal: totalSum / bookings.length, avgPerKm };
}

/**
 * Agent E — Pricing & Quote. Answers "is this fare fair?" before a
 * customer books, or before a fleet_owner/warehouse_hub/admin sets a
 * rate — grounded in two REAL sources, never invented: (1) the currently
 * active FareRule for this region+category (the rule-based estimate the
 * platform would actually charge), and (2) what completed bookings in
 * this exact region+category ACTUALLY settled for in the last
 * ${LOOKBACK_DAYS} days. When the two diverge (rule says X, real recent
 * bookings averaged something else — e.g. surge was active for most of
 * them, or the rule was only just changed), that divergence itself is
 * useful signal and is surfaced explicitly rather than silently averaged
 * away.
 */
export async function runPricingQuoteAgent(
  region: string,
  category: FareCategory,
  distanceKm: number,
  hamaliCount: number,
  locale?: AgentLocale
): Promise<AgentResult> {
  const rule = await FareRule.findOne({ region, category, active: true }).lean();
  const historical = await historicalComparables(region, category);

  if (!rule) {
    const noRuleSummary: Record<AgentLocale, string> = {
      en: `There's no active fare rule for ${category.replace('_', ' ')} in ${region} yet — an admin hasn't set a rate for this region+category combination, so no honest quote can be given.`,
      te: `${region}లో ${category.replace('_', ' ')} కోసం ఇంకా చురుకైన ఛార్జీ నియమం లేదు — ఈ ప్రాంతం+వర్గం కలయిక కోసం అడ్మిన్ రేటు సెట్ చేయలేదు, కాబట్టి నిజాయితీగా ధర ఇవ్వలేము.`,
      hi: `${region} में ${category.replace('_', ' ')} के लिए अभी कोई सक्रिय किराया नियम नहीं है — किसी एडमिन ने इस क्षेत्र+श्रेणी के लिए दर तय नहीं की है, इसलिए ईमानदार कोट नहीं दिया जा सकता।`,
    };
    return {
      agentName: 'pricing_quote',
      summary: noRuleSummary[locale ?? 'en'],
      confidence: 'low',
      evidence: [{ label: 'Active fare rule', value: 'None found' }],
      mock: true,
      generatedAt: new Date().toISOString(),
    };
  }

  const perUnit = Math.max(rule.minimumFare, rule.baseFare + rule.perKmRate * distanceKm);
  const ruleEstimate = category === 'hamali' ? perUnit * Math.max(1, hamaliCount) : perUnit;
  const ruleEstimateSurged = ruleEstimate * rule.surgeMultiplier;

  const context = {
    region,
    category,
    distanceKm,
    hamaliCount,
    rule: {
      baseFare: rule.baseFare,
      perKmRate: rule.perKmRate,
      minimumFare: rule.minimumFare,
      surgeMultiplier: rule.surgeMultiplier,
    },
    ruleEstimateSurged: Math.round(ruleEstimateSurged * 100) / 100,
    historical,
  };

  if (historical.count < MIN_COMPARABLE_BOOKINGS) {
    // Enough to quote off the rule (that's always authoritative and real),
    // not enough completed history to say anything about how it compares
    // to what people actually paid recently — say so plainly rather than
    // asserting a comparison from too few points.
    return callAgent(
      { agentName: 'pricing_quote', systemPrompt: buildSystemPrompt(false), userPrompt: buildUserPrompt(context), context, locale },
      (ctx) => {
        const c = ctx as typeof context;
        return {
          summary: `Rule-based estimate for this trip: ₹${c.ruleEstimateSurged.toFixed(2)} (base ₹${c.rule.baseFare} + ₹${c.rule.perKmRate}/km × ${c.distanceKm}km, surge ×${c.rule.surgeMultiplier}). Too few completed bookings in ${c.region} recently (${c.historical.count}, need ${MIN_COMPARABLE_BOOKINGS}+) to say how this compares to what people actually paid.`,
          confidence: 'moderate',
          evidence: [
            { label: 'Rule-based estimate', value: `₹${c.ruleEstimateSurged.toFixed(2)}` },
            { label: 'Active surge multiplier', value: `×${c.rule.surgeMultiplier}` },
            { label: 'Comparable recent bookings', value: `${c.historical.count} (need ${MIN_COMPARABLE_BOOKINGS}+)` },
          ],
        };
      }
    );
  }

  return callAgent(
    { agentName: 'pricing_quote', systemPrompt: buildSystemPrompt(true), userPrompt: buildUserPrompt(context), context, locale },
    (ctx) => {
      const c = ctx as typeof context;
      const diffPct = c.historical.avgTotal > 0 ? ((c.ruleEstimateSurged - c.historical.avgTotal) / c.historical.avgTotal) * 100 : 0;
      const diffDesc = Math.abs(diffPct) < 10 ? 'in line with' : diffPct > 0 ? 'above' : 'below';
      return {
        summary: `Rule-based estimate: ₹${c.ruleEstimateSurged.toFixed(2)}, which is ${diffDesc} the ₹${c.historical.avgTotal.toFixed(2)} average of ${c.historical.count} completed ${c.category.replace('_', ' ')} bookings in ${c.region} over the last ${LOOKBACK_DAYS} days.`,
        confidence: 'high',
        evidence: [
          { label: 'Rule-based estimate', value: `₹${c.ruleEstimateSurged.toFixed(2)}` },
          { label: `Avg of last ${c.historical.count} completed bookings`, value: `₹${c.historical.avgTotal.toFixed(2)}` },
          { label: 'Active surge multiplier', value: `×${c.rule.surgeMultiplier}` },
        ],
      };
    }
  );
}

function buildSystemPrompt(hasHistorical: boolean): string {
  return `You are FYRO's pricing & quote agent for a cooperative-owned household and logistics service marketplace in India.
You are given REAL data: the platform's currently active fare rule (base fare, per-km rate, minimum fare, surge multiplier) for a region+category, the resulting rule-based estimate for a specific trip${hasHistorical ? ', and the real average of recently completed comparable bookings in the same region+category' : ''} — never invent a number not present in this data.
Explain in plain language whether the quoted price looks fair/expected${hasHistorical ? ', comparing it to what similar trips actually settled for recently' : ''}. You are giving information for a human to decide with, never creating or overriding a fare yourself.
Respond ONLY with JSON: {"summary": "<plain-language explanation citing the actual numbers>", "confidence": "low"|"moderate"|"high", "evidence": [{"label": "<metric>", "value": "<real figure>"}]}.`;
}

function buildUserPrompt(context: Record<string, unknown>): string {
  return `Pricing context (all real, from the database):\n${JSON.stringify(context, null, 2)}`;
}
