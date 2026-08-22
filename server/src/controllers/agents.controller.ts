import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Dispute } from '../models/Dispute';
import { writeAuditLog } from '../services/audit.service';
import { cached } from '../agents/cache';
import { runSupportAgent } from '../agents/supportAgent';
import { runDisputeTriageAgent } from '../agents/disputeTriageAgent';
import { runDemandForecastAgent } from '../agents/demandForecastAgent';
import { User } from '../models/User';
import type { AgentLocale } from '../agents/locale';
import { runDocumentPrecheckAgent } from '../agents/documentPrecheckAgent';
import { runPricingQuoteAgent, type FareCategory } from '../agents/pricingQuoteAgent';
import { runMarketInsightsAgent } from '../agents/marketInsightsAgent';
import type { Role, KycDocumentType } from '@fyro/shared';

/**
 * Every handler in this file follows the same shape:
 * 1. Derive scope (userId, disputeId, etc.) from req.user!.id / a param the
 *    route already validates ownership of — NEVER from a client-supplied
 *    "which user" field in the body. This is the IDOR guardrail from the
 *    Phase 4 spec, tested explicitly in tests/agentsRbac.test.ts (a
 *    cross-role attempt to use an agent to read another user's data).
 * 2. Call the agent (which itself only ever touches data already scoped
 *    to that same id).
 * 3. Write the recommendation to the audit log — "every agent
 *    recommendation... writes to the audit log", separate from whatever
 *    human decision follows via the existing, unchanged action endpoints
 *    (resolveDispute, updateKycStatus, etc.).
 * Nothing here can approve, suspend, refund, override a fare, or delete an
 * account — every handler only ever returns an AgentResult for a human to
 * read and act on elsewhere.
 */

export const askSupportAgent = asyncHandler(async (req: Request, res: Response) => {
  const { question } = req.body as { question: string };
  const userId = req.user!.id;
  const role = req.user!.role as Role;

  const result = await cached(`support:${userId}:${question}`, () => runSupportAgent(userId, role, question));

  await writeAuditLog({
    actorId: userId,
    actorRole: role,
    action: 'agent_support_queried',
    targetType: 'User',
    targetId: userId,
    details: { question, confidence: result.confidence, mock: result.mock },
  });

  res.status(200).json({ result });
});

export const triageDispute = asyncHandler(async (req: Request, res: Response) => {
  const disputeId = req.params.id;
  // Existence check here (not just inside the agent) so a bad id 404s
  // before anything is cached under it.
  const exists = await Dispute.exists({ _id: disputeId });
  if (!exists) throw new ApiError(404, 'Dispute not found');

  // Phase 1 (agent localization) — the admin reading this triage result
  // gets it in THEIR OWN preferredLocale, not the disputing party's.
  // Locale is in the cache key precisely because it isn't in the
  // disputeId: two admins with different locales viewing the same dispute
  // inside the 5-minute cache window must not see each other's language.
  const admin = await User.findById(req.user!.id).select('preferredLocale').lean();
  const adminLocale = admin?.preferredLocale as AgentLocale | undefined;
  const result = await cached(`dispute_triage:${disputeId}:${adminLocale ?? 'en'}`, () =>
    runDisputeTriageAgent(disputeId, adminLocale)
  );

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'agent_dispute_triage_run',
    targetType: 'Dispute',
    targetId: disputeId,
    details: { confidence: result.confidence, mock: result.mock },
  });

  res.status(200).json({ result });
});

const AUDIENCE_BY_ROLE: Record<string, 'worker' | 'admin' | 'mutha_leader'> = {
  driver: 'worker',
  hamali_solo: 'worker',
  mutha_member: 'worker',
  mutha_leader: 'mutha_leader',
  admin: 'admin',
  manager: 'admin',
};

export const forecastDemand = asyncHandler(async (req: Request, res: Response) => {
  const { region } = req.body as { region: string };
  const role = req.user!.role;
  // Audience is derived from the caller's OWN role, never taken from the
  // request body — a driver cannot ask for the "admin" framing of the
  // same data by just sending a different audience string.
  const audience = AUDIENCE_BY_ROLE[role];
  if (!audience) throw new ApiError(403, 'This role has no demand-forecast view');

  // Same reasoning as triageDispute above — region+audience alone isn't a
  // unique-enough cache key once locale affects the response text.
  const caller = await User.findById(req.user!.id).select('preferredLocale').lean();
  const callerLocale = caller?.preferredLocale as AgentLocale | undefined;
  const result = await cached(`demand_forecast:${region}:${audience}:${callerLocale ?? 'en'}`, () =>
    runDemandForecastAgent(region, audience, callerLocale)
  );

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: role,
    action: 'agent_demand_forecast_run',
    targetType: 'Region',
    // Region is a free-text string, not an ObjectId anywhere in this
    // codebase (see models/Region.ts's own comment) — same synthetic-id
    // pattern as payout.controller.ts's batch-run audit entries.
    targetId: req.user!.id,
    details: { region, audience, confidence: result.confidence, mock: result.mock },
  });

  res.status(200).json({ result });
});

export const precheckDocument = asyncHandler(async (req: Request, res: Response) => {
  const { documentType } = req.body as { documentType: KycDocumentType };
  const userId = req.user!.id;

  const result = await cached(`doc_precheck:${userId}:${documentType}`, () =>
    runDocumentPrecheckAgent(userId, documentType)
  );

  await writeAuditLog({
    actorId: userId,
    actorRole: req.user!.role,
    action: 'agent_document_precheck_run',
    targetType: 'User',
    targetId: userId,
    details: { documentType, confidence: result.confidence, mock: result.mock },
  });

  res.status(200).json({ result });
});

// Agent E — Pricing & Quote. Any authenticated role may sanity-check a
// quote for a region+category+distance they're about to book or price —
// there's nothing user-scoped in the underlying data (fare rules and
// completed-booking aggregates are already public-ish platform facts, same
// exposure level as the existing GET /api/fare-rules endpoint), so no
// ownership check is needed beyond being logged in.
export const getPricingQuote = asyncHandler(async (req: Request, res: Response) => {
  const { region, category, distanceKm, hamaliCount } = req.body as {
    region: string;
    category: FareCategory;
    distanceKm: number;
    hamaliCount?: number;
  };
  const userId = req.user!.id;

  const caller = await User.findById(userId).select('preferredLocale').lean();
  const callerLocale = caller?.preferredLocale as AgentLocale | undefined;

  const result = await cached(
    `pricing_quote:${region}:${category}:${distanceKm}:${hamaliCount ?? 0}:${callerLocale ?? 'en'}`,
    () => runPricingQuoteAgent(region, category, distanceKm, hamaliCount ?? 0, callerLocale)
  );

  await writeAuditLog({
    actorId: userId,
    actorRole: req.user!.role,
    action: 'agent_pricing_quote_run',
    targetType: 'Region',
    targetId: userId,
    details: { region, category, distanceKm, confidence: result.confidence, mock: result.mock },
  });

  res.status(200).json({ result });
});

// Agent F — Market Insights. Admin/manager only, same posture as
// analytics.routes.ts — this is a narrative layer over the same category
// of aggregate data the analytics dashboard already exposes to that role,
// never a new data-access surface.
export const getMarketInsights = asyncHandler(async (req: Request, res: Response) => {
  const { region } = req.body as { region?: string };
  const userId = req.user!.id;

  const caller = await User.findById(userId).select('preferredLocale').lean();
  const callerLocale = caller?.preferredLocale as AgentLocale | undefined;

  const result = await cached(
    `market_insights:${region ?? 'all'}:${callerLocale ?? 'en'}`,
    () => runMarketInsightsAgent(region, callerLocale)
  );

  await writeAuditLog({
    actorId: userId,
    actorRole: req.user!.role,
    action: 'agent_market_insights_run',
    targetType: 'Region',
    targetId: userId,
    details: { region: region ?? 'all', confidence: result.confidence, mock: result.mock },
  });

  res.status(200).json({ result });
});
