import { Booking } from '../models/Booking';
import { callAgent } from './client';
import { AgentResult } from './types';
import { mlForecast, mlConfigured, type MlForecastRow } from '../services/mlClient';
import type { AgentLocale } from './locale';

const MS_PER_DAY = 86_400_000;
const LOOKBACK_DAYS = 14;
// Below this many historical bookings in the region+window, there simply
// isn't enough signal to say anything honest about a pattern — the
// mandatory "refuse to predict on thin data" guardrail from the spec.
// This is a real statistical floor, not a UI copy choice: fewer points
// than this and any hour/day breakdown is mostly noise.
const MIN_BOOKINGS_FOR_FORECAST = 20;

interface HourlyDensity {
  hour: number;
  count: number;
}

async function bookingDensityByHour(region: string): Promise<{ total: number; byHour: HourlyDensity[] }> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * MS_PER_DAY);
  const bookings = await Booking.find({ region, createdAt: { $gte: since } }).select('createdAt').lean();

  const counts = new Array(24).fill(0);
  for (const b of bookings) counts[new Date(b.createdAt).getHours()]++;

  return { total: bookings.length, byHour: counts.map((count, hour) => ({ hour, count })) };
}

const ML_HISTORY_DAYS = 90;
const ML_TOP_CATEGORIES = 3;

/**
 * Daily booking counts for the region by service category, verification data
 * excluded, for the ML forecast. The service does its own modelling; this
 * only gathers what it is asked to score.
 */
async function dailyHistoryByCategory(region: string): Promise<Map<string, { date: string; count: number }[]>> {
  const since = new Date(Date.now() - ML_HISTORY_DAYS * MS_PER_DAY);
  const rows = await Booking.aggregate<{ _id: { day: string; category: string }; count: number }>([
    {
      $match: {
        region,
        createdAt: { $gte: since },
        isVerification: { $ne: true },
        serviceCategorySlug: { $type: 'string' },
        status: { $nin: ['cancelled'] },
      },
    },
    {
      $group: {
        _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, category: '$serviceCategorySlug' },
        count: { $sum: 1 },
      },
    },
  ]);
  const byCat = new Map<string, { date: string; count: number }[]>();
  for (const r of rows) byCat.set(r._id.category, [...(byCat.get(r._id.category) ?? []), { date: r._id.day, count: r.count }]);
  return byCat;
}

interface MlOutcome {
  source: 'ml' | 'rules';
  reason?: string;
  rows: MlForecastRow[];
}

async function mlDemandForecast(region: string): Promise<MlOutcome> {
  if (!mlConfigured()) return { source: 'rules', reason: 'not_configured', rows: [] };
  const byCat = await dailyHistoryByCategory(region);
  const top = [...byCat.entries()]
    .sort((a, b) => b[1].reduce((n, r) => n + r.count, 0) - a[1].reduce((n, r) => n + r.count, 0))
    .slice(0, ML_TOP_CATEGORIES);
  const start = new Date(Date.now() + MS_PER_DAY).toISOString().slice(0, 10);
  const rows: MlForecastRow[] = [];
  for (const [category, history] of top) {
    const res = await mlForecast({ category, history, start, horizonDays: 7 });
    if (!res.ok) return { source: 'rules', reason: res.reason, rows: [] };
    rows.push(...res.data.forecast);
  }
  return rows.length > 0 ? { source: 'ml', rows } : { source: 'rules', reason: 'no_category_history', rows: [] };
}

/**
 * Agent C — Demand Forecasting. Real historical booking density (last 14
 * days, actual Booking records — same "no fabricated numbers" discipline
 * as analytics.controller.ts), never a prediction manufactured from
 * nothing. Below MIN_BOOKINGS_FOR_FORECAST, returns confidence:'low' and
 * an explicit "not enough history" summary — the mandatory honest
 * low-data state, not a guess dressed up as one.
 *
 * For a worker, this is an earnings-opportunity hint. For an admin, the
 * same density data backs a surge-multiplier RECOMMENDATION only — it
 * never creates a SurgeZone itself; an admin still has to call the
 * existing POST /api/admin/surge-zones to act on it (surgeZone.routes.ts,
 * unchanged). For a mutha_leader, it becomes a workforce-allocation
 * suggestion (Smart India Hackathon spec explicitly names this) — which
 * hours/zone to keep more members online for.
 */
export async function runDemandForecastAgent(
  region: string,
  audience: 'worker' | 'admin' | 'mutha_leader',
  locale?: AgentLocale
): Promise<AgentResult> {
  const { total, byHour } = await bookingDensityByHour(region);

  if (total < MIN_BOOKINGS_FOR_FORECAST) {
    // This guardrail response never calls the model (there's nothing to
    // forecast), so callAgent's locale instruction never runs for it —
    // translated directly here instead, the same three languages as
    // everywhere else in this app, so a Telugu/Hindi-locale user doesn't
    // hit an English wall on the one guaranteed-honest response this
    // agent can give with too little data.
    const lowDataSummary: Record<AgentLocale, string> = {
      en: `Not enough booking history in ${region} yet (${total} bookings in the last ${LOOKBACK_DAYS} days, need at least ${MIN_BOOKINGS_FOR_FORECAST}) to forecast demand honestly. Check back once more jobs have run through this region.`,
      te: `${region}లో ఇంకా తగినంత బుకింగ్ చరిత్ర లేదు (గత ${LOOKBACK_DAYS} రోజుల్లో ${total} బుకింగ్‌లు, కనీసం ${MIN_BOOKINGS_FOR_FORECAST} కావాలి) — నిజాయితీగా అంచనా వేయడానికి సరిపోదు. ఈ ప్రాంతంలో మరిన్ని పనులు జరిగాక మళ్లీ చూడండి.`,
      hi: `${region} में अभी पर्याप्त बुकिंग इतिहास नहीं है (पिछले ${LOOKBACK_DAYS} दिनों में ${total} बुकिंग, कम से कम ${MIN_BOOKINGS_FOR_FORECAST} चाहिए) — ईमानदारी से अनुमान लगाने के लिए काफी नहीं। इस क्षेत्र में और काम होने के बाद फिर देखें।`,
    };
    return {
      agentName: 'demand_forecast',
      summary: lowDataSummary[locale ?? 'en'],
      confidence: 'low',
      evidence: [{ label: 'Bookings in window', value: `${total} / ${MIN_BOOKINGS_FOR_FORECAST} minimum` }],
      mock: true,
      generatedAt: new Date().toISOString(),
    };
  }

  const ml = await mlDemandForecast(region);
  const context = {
    region,
    lookbackDays: LOOKBACK_DAYS,
    totalBookings: total,
    byHour,
    audience,
    ...(ml.source === 'ml' ? { mlForecast: ml.rows } : {}),
  };

  const audienceInstruction =
    audience === 'admin'
      ? 'The reader is an admin deciding whether to approve a surge-pricing zone. Recommend a specific hour range and whether surge looks warranted — they still have to create it manually, you are not creating anything.'
      : audience === 'mutha_leader'
        ? 'The reader is a Mutha (labor crew) leader deciding how many of their members to keep online and when. Recommend which hours are worth having more people online for.'
        : 'The reader is a driver or Hamali worker deciding when to go online. Give them a plain-language earnings-opportunity hint: which hours tend to have more jobs.';

  const systemPrompt = `You are FYRO's demand forecasting agent for a cooperative-owned household and logistics service marketplace region in India.
You are given REAL historical booking counts by hour-of-day for the last ${LOOKBACK_DAYS} days in one region — never invent a number not in this data.
${audienceInstruction}
Respond ONLY with JSON: {"summary": "<the recommendation, plain language, cites specific hours>", "confidence": "low"|"moderate"|"high", "evidence": [{"label": "<hour or metric>", "value": "<count or figure from the data>"}]}.
confidence "high" only with a clear, consistent peak across the data; "moderate" for a visible but noisy pattern.`;

  const userPrompt = `Region: ${region}\nHourly booking counts (last ${LOOKBACK_DAYS} days, ${total} total):\n${JSON.stringify(byHour)}${
    ml.source === 'ml'
      ? `\nNext-7-day forecast from the forecasting model. The numbers are the model's: do not change or add any. When cold_start is true, say it is a baseline, not a trained prediction:\n${JSON.stringify(ml.rows)}`
      : ''
  }`;

  const result = await callAgent({ agentName: 'demand_forecast', systemPrompt, userPrompt, context, locale }, (ctx) => {
    const c = ctx as typeof context;
    const peak = [...c.byHour].sort((a, b) => b.count - a.count)[0];
    return {
      summary: `Bookings in ${c.region} peak around ${peak.hour}:00 (${peak.count} of ${c.totalBookings} in the last ${LOOKBACK_DAYS} days).`,
      confidence: 'moderate',
      evidence: [
        { label: 'Peak hour', value: `${peak.hour}:00` },
        { label: 'Bookings at peak', value: String(peak.count) },
        { label: 'Total in window', value: String(c.totalBookings) },
      ],
    };
  });

  if (ml.source === 'rules') {
    return { ...result, source: 'rules', ...(ml.reason ? { mlFallbackReason: ml.reason } : {}) };
  }
  // The ML numbers go into the evidence as they came back, whatever the
  // model wrote in its summary, so a reader can check the words against them.
  const forecastEvidence = ml.rows
    .slice(0, 6)
    .map((r) => ({ label: `${r.category} ${r.date}`, value: `${r.prediction} (${r.lower}–${r.upper})${r.cold_start ? ' baseline' : ''}` }));
  return {
    ...result,
    source: 'ml',
    mlModelVersion: ml.rows.find((r) => r.model_version)?.model_version ?? null,
    coldStart: ml.rows.every((r) => r.cold_start),
    evidence: [...result.evidence, ...forecastEvidence],
  };
}
