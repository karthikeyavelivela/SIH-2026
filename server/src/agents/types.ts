// Shared shape every agent returns (Phase 4 mandatory guardrails —
// AUDIT_REPORT.md's remediation build prompt: "Every agent output carries
// a confidence score and its source data" / "visibly labelled as AI... with
// evidence shown alongside the conclusion, never a bare verdict"). No agent
// interface anywhere returns just a string — evidence and confidence are
// structural, not optional add-ons a caller might forget to render.

export type AgentConfidence = 'low' | 'moderate' | 'high';

export interface AgentEvidenceItem {
  label: string;
  value: string;
}

export interface AgentResult {
  agentName: string;
  /** The recommendation/conclusion — a human still has to act on it, this agent never does. */
  summary: string;
  confidence: AgentConfidence;
  /** What the conclusion is actually based on — always non-empty; an agent with nothing to point at says so in `summary` and returns confidence:'low' with an empty array, never fabricates a citation. */
  evidence: AgentEvidenceItem[];
  /** True when this ran without a real model call (no provider key configured, or AI_PROVIDER=mock) — surfaced to the UI so a mock response is never mistaken for a real analysis. */
  mock: boolean;
  /** Which provider answered ('gemini' | 'groq' | 'anthropic'), absent on a mock result. Job 2 made the vendor swappable, so "which model said this" stopped being a constant and became something the response has to state. */
  provider?: string;
  /** The exact model id that answered, for the same reason. */
  model?: string;
  generatedAt: string;
}
