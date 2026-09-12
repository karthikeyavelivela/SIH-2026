import { env } from '../../config/env';
import { AiProvider, ProviderCallInput, ProviderError, PROVIDER_TIMEOUT_MS } from './types';

/**
 * Google Gemini — the primary provider.
 *
 * Chosen because its free tier is the only one among the three that covers
 * both the text agents and the vision agent (the KYC document pre-check)
 * without a card on file. Called over plain REST rather than through
 * @google/generative-ai: the request is one POST with a JSON body, the SDK
 * would be the only dependency added for it, and a fetch call is far easier
 * to reason about when it fails at 2am three days before a submission.
 *
 * `responseMimeType: application/json` is a real enforcement mechanism, not
 * a hint — it makes the "respond ONLY with JSON" instruction in every
 * agent's prompt structurally true, which is why client.ts's fence-stripping
 * parser now almost never has to do any work on this provider.
 */
const TEXT_MODEL = 'gemini-2.0-flash';
const VISION_MODEL = 'gemini-2.0-flash';

export const gemini: AiProvider = {
  name: 'gemini',
  supportsVision: true,
  configured: () => !!env.GEMINI_API_KEY,
  modelFor: () => TEXT_MODEL,

  async generate(input: ProviderCallInput): Promise<string> {
    const model = input.image ? VISION_MODEL : TEXT_MODEL;
    const parts: Record<string, unknown>[] = [];
    if (input.image) {
      parts.push({ inline_data: { mime_type: input.image.mediaType, data: input.image.data } });
    }
    parts.push({ text: input.userPrompt });

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Header rather than ?key= so the key never lands in a URL that
          // could be logged by a proxy or by Render's request log.
          'x-goog-api-key': env.GEMINI_API_KEY as string,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: input.systemPrompt }] },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            maxOutputTokens: input.maxOutputTokens,
            ...(input.json ? { responseMimeType: 'application/json' } : {}),
          },
        }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      }
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new ProviderError('gemini', `HTTP ${res.status} ${detail.slice(0, 200)}`, res.status);
    }

    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };

    // A safety block is a real outcome, not a transport error: say so
    // explicitly so the chain falls through to the next provider instead of
    // returning an empty string that would parse as a malformed response.
    if (body.promptFeedback?.blockReason) {
      throw new ProviderError('gemini', `blocked: ${body.promptFeedback.blockReason}`);
    }

    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text.trim()) {
      throw new ProviderError('gemini', `empty response (finish: ${body.candidates?.[0]?.finishReason ?? 'unknown'})`);
    }
    return text;
  },
};
