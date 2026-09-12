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
      return { text, provider: provider.name, model: provider.modelFor(input) };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failures.push(reason);
      // eslint-disable-next-line no-console
      console.error(`agent provider ${provider.name} failed — ${reason}`);
    }
  }
  throw new Error(failures.join(' | '));
}

export type { ProviderCallInput, ProviderName } from './types';
