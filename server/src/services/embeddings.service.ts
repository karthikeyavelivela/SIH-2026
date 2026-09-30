import { env } from '../config/env';

/**
 * Text embeddings for the knowledge base, from Gemini. Returns null (never
 * throws) when no key is configured or the call fails, and the caller falls
 * back to lexical retrieval. The key goes in a header, never a URL.
 */
export const EMBEDDING_TIMEOUT_MS = 8000;
const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';

export function embeddingModel(): string {
  return env.GEMINI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
}

export function embeddingsConfigured(): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

export async function embedText(text: string, kind: 'document' | 'query'): Promise<number[] | null> {
  if (!embeddingsConfigured()) return null;
  const model = embeddingModel();
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY as string },
      body: JSON.stringify({
        model: `models/${model}`,
        content: { parts: [{ text: text.slice(0, 8000) }] },
        taskType: kind === 'document' ? 'RETRIEVAL_DOCUMENT' : 'RETRIEVAL_QUERY',
      }),
      signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { embedding?: { values?: number[] } };
    const values = body.embedding?.values;
    return Array.isArray(values) && values.length > 0 ? values : null;
  } catch {
    return null;
  }
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}
