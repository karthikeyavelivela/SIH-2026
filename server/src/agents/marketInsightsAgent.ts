import { Booking } from '../models/Booking';
import { Vehicle } from '../models/Vehicle';
import { callAgent } from './client';
import { AgentResult } from './types';
import type { AgentLocale } from './locale';

const MS_PER_DAY = 86_400_000;
const WINDOW_DAYS = 7;
const MIN_BOOKINGS_FOR_INSIGHTS = 10;

interface WindowStats {
  completedCount: number;
  revenue: number;
  activeCount: number;
}

async function windowStats(region: string | undefined, from: Date, to: Date): Promise<WindowStats> {
  const regionFilter = region ? { region } : {};
  const [completedAgg, activeCount] = await Promise.all([
    Booking.aggregate([
      { $match: { ...regionFilter, status: 'completed', createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$fareBreakdown.total' } } },
    ]),
    Booking.countDocuments({
      ...regionFilter,
      status: { $in: ['requested', 'searching', 'matched', 'accepted', 'in_progress'] },
      createdAt: { $gte: from, $lt: to },
    }),
  ]);
  return {
    completedCount: (completedAgg[0]?.count as number) ?? 0,
    revenue: (completedAgg[0]?.revenue as number) ?? 0,
    activeCount,
  };
}

/**
 * Agent F — Market Insights. Real week-over-week comparison (this
 * WINDOW_DAYS window vs the WINDOW_DAYS before it) of completed-booking
 * volume, revenue, and vehicle-supply utilization, scoped to one region or
 * platform-wide — never invented, same aggregation style as
 * analytics.controller.ts's getAnalyticsOverview (this agent narrates the
 * same category of real numbers rather than duplicating a second data
 * source). For an admin/manager: a trend narrative to act on, not a raw
 * dashboard replacement — the admin console's existing charts stay the
 * source of truth for the numbers themselves.
 */
export async function runMarketInsightsAgent(
  region: string | undefined,
  locale?: AgentLocale
): Promise<AgentResult> {
  const now = new Date();
  const currentStart = new Date(now.getTime() - WINDOW_DAYS * MS_PER_DAY);
  const previousStart = new Date(now.getTime() - 2 * WINDOW_DAYS * MS_PER_DAY);

  const [current, previous, vehicleCounts] = await Promise.all([
    windowStats(region, currentStart, now),
    windowStats(region, previousStart, currentStart),
    // Vehicle has no `region` field (same as analytics.controller.ts's
    // getAnalyticsOverview) — fleet utilization is always platform-wide,
    // never actually scoped by `region` even when the booking stats above
    // are. Labelled honestly in the prompt/evidence rather than silently
    // pretending it's region-scoped.
    Vehicle.aggregate([{ $group: { _id: '$availabilityStatus', count: { $sum: 1 } } }]),
  ]);

  const vehicleTotals = { online: 0, offline: 0, on_job: 0 };
  for (const row of vehicleCounts as { _id: keyof typeof vehicleTotals; count: number }[]) {
    if (row._id in vehicleTotals) vehicleTotals[row._id] = row.count;
  }
  const totalVehicles = vehicleTotals.online + vehicleTotals.offline + vehicleTotals.on_job;
  const utilizationPct = totalVehicles > 0 ? Math.round((vehicleTotals.on_job / totalVehicles) * 100) : 0;

  const scopeLabel = region ?? 'the whole platform';

  if (current.completedCount < MIN_BOOKINGS_FOR_INSIGHTS) {
    const lowDataSummary: Record<AgentLocale, string> = {
      en: `Not enough completed bookings in ${scopeLabel} over the last ${WINDOW_DAYS} days (${current.completedCount}, need at least ${MIN_BOOKINGS_FOR_INSIGHTS}) to draw an honest trend. Check back once more jobs have completed.`,
      te: `గత ${WINDOW_DAYS} రోజుల్లో ${scopeLabel}లో తగినంత పూర్తయిన బుకింగ్‌లు లేవు (${current.completedCount}, కనీసం ${MIN_BOOKINGS_FOR_INSIGHTS} కావాలి) — నిజాయితీగా ధోరణిని చెప్పలేము. మరిన్ని పనులు పూర్తయిన తర్వాత మళ్లీ చూడండి.`,
      hi: `पिछले ${WINDOW_DAYS} दिनों में ${scopeLabel} में पर्याप्त पूर्ण बुकिंग नहीं हैं (${current.completedCount}, कम से कम ${MIN_BOOKINGS_FOR_INSIGHTS} चाहिए) — ईमानदार रुझान नहीं बताया जा सकता। और काम पूरे होने के बाद फिर देखें।`,
    };
    return {
      agentName: 'market_insights',
      summary: lowDataSummary[locale ?? 'en'],
      confidence: 'low',
      evidence: [{ label: `Completed bookings (last ${WINDOW_DAYS}d)`, value: `${current.completedCount} / ${MIN_BOOKINGS_FOR_INSIGHTS} minimum` }],
      mock: true,
      generatedAt: new Date().toISOString(),
    };
  }

  const context = {
    scope: scopeLabel,
    windowDays: WINDOW_DAYS,
    current: { completed: current.completedCount, revenue: Math.round(current.revenue * 100) / 100, active: current.activeCount },
    previous: { completed: previous.completedCount, revenue: Math.round(previous.revenue * 100) / 100 },
    fleetUtilizationPct: utilizationPct,
    vehiclesOnline: vehicleTotals.online,
    vehiclesOnJob: vehicleTotals.on_job,
    vehiclesOffline: vehicleTotals.offline,
  };

  const systemPrompt = `You are FYRO's market insights agent for a cooperative-owned household and logistics service marketplace in India.
You are given REAL week-over-week aggregates for ${scopeLabel}: completed-booking count and revenue this ${WINDOW_DAYS}-day window vs the ${WINDOW_DAYS}-day window before it, currently-active bookings, and current PLATFORM-WIDE vehicle supply split (online/on-job/offline — this one figure is never region-scoped, note that plainly if scope is a specific region) — never invent a number not in this data.
The reader is an admin or manager deciding where to focus attention (e.g. whether supply is keeping up with demand, whether revenue is trending up or down). Give a plain-language trend narrative with concrete percentages/counts. You are not creating a surge zone, fare rule, or any other change yourself — only informing the human's decision.
Respond ONLY with JSON: {"summary": "<trend narrative citing real numbers>", "confidence": "low"|"moderate"|"high", "evidence": [{"label": "<metric>", "value": "<real figure>"}]}.
confidence "high" only with a clear consistent direction; "moderate" if the window is short or the signal is mixed.`;

  const userPrompt = `Market data for ${scopeLabel} (all real, from the database):\n${JSON.stringify(context, null, 2)}`;

  return callAgent({ agentName: 'market_insights', systemPrompt, userPrompt, context, locale }, (ctx) => {
    const c = ctx as typeof context;
    const revChangePct = c.previous.revenue > 0 ? ((c.current.revenue - c.previous.revenue) / c.previous.revenue) * 100 : 0;
    const bookingChangePct = c.previous.completed > 0 ? ((c.current.completed - c.previous.completed) / c.previous.completed) * 100 : 0;
    const direction = revChangePct >= 0 ? 'up' : 'down';
    return {
      summary: `Revenue in ${c.scope} is ${direction} ${Math.abs(revChangePct).toFixed(1)}% week-over-week (₹${c.current.revenue.toFixed(2)} vs ₹${c.previous.revenue.toFixed(2)}), completed bookings ${bookingChangePct >= 0 ? 'up' : 'down'} ${Math.abs(bookingChangePct).toFixed(1)}%. Fleet utilization is at ${c.fleetUtilizationPct}% (${c.vehiclesOnJob} of ${c.vehiclesOnline + c.vehiclesOnJob + c.vehiclesOffline} vehicles on a job).`,
      confidence: 'moderate',
      evidence: [
        { label: `Revenue (last ${c.windowDays}d)`, value: `₹${c.current.revenue.toFixed(2)}` },
        { label: `Revenue (prior ${c.windowDays}d)`, value: `₹${c.previous.revenue.toFixed(2)}` },
        { label: 'Fleet utilization', value: `${c.fleetUtilizationPct}%` },
        { label: 'Currently active bookings', value: String(c.current.active) },
      ],
    };
  });
}
