import { env } from '../../config/env';
import { AiProvider, ProviderCallInput, ProviderName } from './types';
import { gemini } from './gemini';
import { groq } from './groq';
import { anthropic } from './anthropic';

/**
 * The provider chain.
 *
 * Order is fixed and deliberate: Gemini first (free tier covers text AND the
 * vision agent), Groq second (fast, free, no card), Anthropic third (kept
 * because it works and its SDK is already here). A provider with no key is
 * not in the chain at all — it is never "tried and failed", so a missing key
 * costs nothing and logs nothing.
 *
 * AI_PROVIDER=<name> pins the chain to one provider. AI_PROVIDER=mock empties
 * it, which makes every agent take its rule-based path with mock:true — the
 * same path a deployment with no keys takes.
 */
const ALL: AiProvider[] = [gemini, groq, anthropic];

export interface GenerationOutcome {
  text: string;
  provider: ProviderName;
  model: string;
}

export function providerChain(forVision = false): AiProvider[] {
  if (env.AI_PROVIDER === 'mock') return [];
  const ordered = env.AI_PROVIDER === 'auto' ? ALL : ALL.filter((p) => p.name === env.AI_PROVIDER);
  return ordered.filter((p) => p.configured() && (!forVision || p.supportsVision));
}

/** True when at least one provider could actually answer. Agents use this
 *  instead of inspecting any single vendor's key, which is what tied the old
 *  code to Anthropic. */
export function anyProviderConfigured(forVision = false): boolean {
  return providerChain(forVision).length > 0;
}

/**
 * The last failure each provider reported, and when.
 *
 * A key being PRESENT and a key WORKING are different facts, and until now
 * only the first was observable: /api/health reported "gemini -> anthropic"
 * while every call to both was failing and every agent was quietly serving
 * its rule-based fallback. The reason existed — it was logged — but only
 * somebody with the Render dashboard open could read it, and the endpoint
 * whose entire job is to say whether the AI is live was saying the opposite
 * of the truth.
 *
 * Held in memory only. It is a diagnosis of the running process, not a
 * record, and a restart clearing it is correct: the question is always
 * "is it working NOW".
 */
const lastFailure = new Map<ProviderName, { reason: string; at: string }>();

/** Cleared on success, so a provider that recovers stops being reported as broken. */
function noteOutcome(name: ProviderName, reason?: string) {
  if (reason) lastFailure.set(name, { reason: reason.slice(0, 200), at: new Date().toISOString() });
  else lastFailure.delete(name);
}

export function providerHealth(): { name: ProviderName; configured: boolean; supportsVision: boolean; lastFailure?: { reason: string; at: string } }[] {
  return ALL.map((p) => ({
    name: p.name,
    configured: p.configured(),
    supportsVision: p.supportsVision,
    lastFailure: lastFailure.get(p.name),
  }));
}

/** Human-readable chain, for the startup log and the health payload. */
export function describeChain(): string {
  const chain = providerChain();
  if (chain.length === 0) {
    return env.AI_PROVIDER === 'mock' ? 'mock (forced by AI_PROVIDER)' : 'mock (no provider key configured)';
  }
  return chain.map((p) => p.name).join(' -> ');
}

/**
 * Try each configured provider in turn; return the first that answers.
 *
 * Throws only when every provider failed, with all of their reasons joined —
 * the caller (client.ts) turns that into the honest rule-based fallback with
 * a visible note, never a 500. Each failure is logged as it happens so a
 * vendor that is quietly always failing is visible in the Render logs rather
 * than hidden behind a working fallback.
 */
export async function generate(input: ProviderCallInput): Promise<GenerationOutcome> {
  const chain = providerChain(!!input.image);
  if (chain.length === 0) throw new Error('no AI provider configured');

  const failures: string[] = [];
  for (const provider of chain) {
    try {
      const text = await provider.generate(input);
      noteOutcome(provider.name);
      return { text, provider: provider.name, model: provider.modelFor(input) };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      noteOutcome(provider.name, reason);
      failures.push(`${provider.name}: ${reason}`);
      // eslint-disable-next-line no-console
      console.error(`agent provider ${provider.name} failed — ${reason}`);
    }
  }
  throw new Error(failures.join(' | '));
}

export type { ProviderCallInput, ProviderName } from './types';
