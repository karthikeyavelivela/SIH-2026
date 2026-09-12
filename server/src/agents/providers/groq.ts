import { env } from '../../config/env';
import { AiProvider, ProviderCallInput, ProviderError, PROVIDER_TIMEOUT_MS } from './types';

/**
 * Groq — the fallback.
 *
 * OpenAI-compatible chat-completions endpoint, so the body shape below is
 * the familiar one. It earns the fallback slot on latency (its inference is
 * genuinely fast) and on having a free tier that needs no card, and it can
 * serve the vision agent too via a separate multimodal model id.
 *
 * `response_format: json_object` is Groq's equivalent of Gemini's JSON mime
 * type. It is NOT sent on vision calls — Groq rejects the combination on the
 * multimodal models, and a hard 400 on the one agent that most needs an
 * answer is worse than parsing a fenced block, which client.ts already
 * handles.
 */
const TEXT_MODEL = 'llama-3.3-70b-versatile';
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

export const groq: AiProvider = {
  name: 'groq',
  supportsVision: true,
  configured: () => !!env.GROQ_API_KEY,
  modelFor: (input) => (input.image ? VISION_MODEL : TEXT_MODEL),

  async generate(input: ProviderCallInput): Promise<string> {
    const content: Record<string, unknown>[] = [];
    if (input.image) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:${input.image.mediaType};base64,${input.image.data}` },
      });
    }
    content.push({ type: 'text', text: input.userPrompt });

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.GROQ_API_KEY as string}`,
      },
      body: JSON.stringify({
        model: input.image ? VISION_MODEL : TEXT_MODEL,
        max_tokens: input.maxOutputTokens,
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: input.image ? content : input.userPrompt },
        ],
        ...(input.json && !input.image ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new ProviderError('groq', `HTTP ${res.status} ${detail.slice(0, 200)}`, res.status);
    }

    const body = (await res.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    const text = body.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) {
      throw new ProviderError('groq', `empty response (finish: ${body.choices?.[0]?.finish_reason ?? 'unknown'})`);
    }
    return text;
  },
};
