/**
 * One model call, provider-agnostic.
 *
 * Every agent in this directory produces the same `AgentResult` shape, and
 * that shape is a guardrail, not a convenience: confidence and evidence are
 * structural. Swapping model vendors must not touch any of it — so the
 * boundary here is deliberately narrow. A provider takes a system prompt, a
 * user prompt and optionally one image, and returns raw text. Parsing,
 * validation, the mock fallback, the locale instruction and the "never
 * invents data" discipline all stay in client.ts, exactly once, as before.
 */
export interface ProviderCallInput {
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens: number;
  /** Present only for the KYC document pre-check, the one vision agent. */
  image?: { mediaType: string; data: string };
  /**
   * Ask the provider for machine-readable JSON where it supports a native
   * mode for it. Every agent prompt already demands JSON; this makes the
   * providers that can enforce it do so, and is a no-op on those that can't.
   */
  json?: boolean;
}

export type ProviderName = 'gemini' | 'groq' | 'anthropic';

export interface AiProvider {
  name: ProviderName;
  /** A key is present for this provider. Never inspect keys anywhere else. */
  configured(): boolean;
  /** False keeps a text-only provider out of the chain for a vision call. */
  supportsVision: boolean;
  /** The model this provider would use, for logs and for honest labelling. */
  modelFor(input: ProviderCallInput): string;
  /** Raw model text. Throws on any non-OK response so the chain can move on. */
  generate(input: ProviderCallInput): Promise<string>;
}

/** Shared timeout. An agent call is never on a user's critical path — the
 *  cache and the rule-based fallback both exist — so this is generous
 *  enough for a slow free-tier response but bounded. */
export const PROVIDER_TIMEOUT_MS = 25_000;

export class ProviderError extends Error {
  constructor(
    readonly provider: ProviderName,
    message: string,
    readonly status?: number
  ) {
    super(`${provider}: ${message}`);
  }
}
