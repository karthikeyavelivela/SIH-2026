import { env } from '../config/env';
import { AgentResult, AgentConfidence } from './types';
import { localeInstruction, type AgentLocale } from './locale';

// AUDIT_REPORT.md Phase 4: "zero LLM SDK exists anywhere in the repo" was
// the audit's headline finding for the whole AI-agents section. This is
// the one place that calls one — every agent module in this directory
// goes through here, never imports @anthropic-ai/sdk directly, so the
// mock/real split and the "never invents data" guardrail are enforced in
// exactly one place instead of once per agent.
const AGENT_MODEL = 'claude-sonnet-5';
const MAX_OUTPUT_TOKENS = 1024;

export interface AgentCallInput {
  agentName: string;
  systemPrompt: string;
  userPrompt: string;
  /** Real, already-fetched data being handed to the model — also what a mock response is generated from, so mock mode still reflects real numbers instead of made-up ones. */
  context: Record<string, unknown>;
  /** Caller's preferredLocale (User.preferredLocale) — 'en' or omitted needs no special handling. See locale.ts's localeInstruction. */
  locale?: AgentLocale;
}

interface ParsedModelOutput {
  summary: string;
  confidence: AgentConfidence;
  evidence: { label: string; value: string }[];
}

/**
 * Every agent asks the model to respond with exactly this JSON shape (see
 * each agent's systemPrompt) — parsed here, not trusted blindly: a
 * malformed or missing field falls back to a low-confidence "could not
 * complete analysis" result rather than crashing the request or, worse,
 * passing through whatever free-text the model produced as if it were
 * structured evidence.
 */
function parseModelJson(text: string): ParsedModelOutput | null {
  try {
    // Models occasionally wrap JSON in a code fence despite instructions
    // not to — strip one if present rather than failing on it.
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);
    if (
      typeof parsed.summary === 'string' &&
      ['low', 'moderate', 'high'].includes(parsed.confidence) &&
      Array.isArray(parsed.evidence)
    ) {
      return parsed as ParsedModelOutput;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Runs one agent call. Mock mode (no ANTHROPIC_API_KEY) never calls the
 * real API — it returns a result built from the same `context` a real call
 * would have used, with `mock:true` set so no caller can mistake it for a
 * real analysis.
 *
 * Deliberately gated on ANTHROPIC_API_KEY alone, NOT on the shared
 * MOCK_EXTERNAL_SERVICES flag that payment.service.ts/cloudinary.service.ts
 * still use: that flag also controls otp.service.ts's sendOtpSms, which
 * *throws* in real mode with no SMS provider configured (none is, by
 * design). Reusing it here would mean flipping it to unlock live agents
 * also breaks the phone-change flow in production. Same
 * one-flag-per-concern precedent as PARAMETRIC_PAYOUTS_ENABLED in env.ts —
 * agents go live purely on whether a real key is present.
 */
export async function callAgent(
  input: AgentCallInput,
  mockResult: (context: Record<string, unknown>) => Pick<AgentResult, 'summary' | 'confidence' | 'evidence'>
): Promise<AgentResult> {
  const generatedAt = new Date().toISOString();

  if (!env.ANTHROPIC_API_KEY) {
    const mock = mockResult(input.context);
    return { agentName: input.agentName, mock: true, generatedAt, ...mock };
  }

  // A real API failure here (billing/credits, rate limit, transient
  // outage) used to propagate straight up through asyncHandler into a
  // bare 500 — every agent request-handler in agents.controller.ts calls
  // this with no try/catch of its own, on the (correct, for an actual bug)
  // assumption that an unexpected throw should surface loudly. But "the
  // model API is temporarily unreachable" is an anticipatable failure
  // mode, not a bug, and the whole point of mockResult already existing is
  // "give a real, honest, data-grounded answer even without a live model
  // call" — so that's exactly what a live-call failure degrades to here,
  // instead of a 500. The caller can always tell the two mock paths apart:
  // this one's evidence carries an explicit note, an env-not-configured
  // mock doesn't.
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    const systemPrompt = input.locale ? input.systemPrompt + localeInstruction(input.locale) : input.systemPrompt;
    const message = await client.messages.create({
      model: AGENT_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: input.userPrompt }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    const parsed = textBlock && 'text' in textBlock ? parseModelJson(textBlock.text) : null;

    if (!parsed) {
      return {
        agentName: input.agentName,
        summary: 'The analysis could not be completed in a usable format this time — try again.',
        confidence: 'low',
        evidence: [],
        mock: false,
        generatedAt,
      };
    }

    return { agentName: input.agentName, mock: false, generatedAt, ...parsed };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`callAgent(${input.agentName}): real API call failed, falling back to mock —`, err);
    const mock = mockResult(input.context);
    return {
      agentName: input.agentName,
      mock: true,
      generatedAt,
      ...mock,
      evidence: [...mock.evidence, { label: 'Note', value: 'Live AI analysis was unavailable this time — showing a rule-based estimate from the same real data instead.' }],
    };
  }
}
