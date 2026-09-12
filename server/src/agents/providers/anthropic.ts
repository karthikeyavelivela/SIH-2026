import { env } from '../../config/env';
import { AiProvider, ProviderCallInput, ProviderError, PROVIDER_TIMEOUT_MS } from './types';

/**
 * Anthropic — kept, third in the chain.
 *
 * This was the only provider before Job 2, and the SDK is already a
 * dependency, so it stays: the point of the swap was to stop *requiring* a
 * paid key, not to throw away a working one. Whoever runs this app can also
 * pin the chain to this provider alone with AI_PROVIDER=anthropic.
 *
 * It is the only provider here that uses a vendor SDK, and the import is
 * dynamic so a deployment with no Anthropic key never loads it.
 */
const MODEL = 'claude-sonnet-5';

export const anthropic: AiProvider = {
  name: 'anthropic',
  supportsVision: true,
  configured: () => !!env.ANTHROPIC_API_KEY,
  modelFor: () => MODEL,

  async generate(input: ProviderCallInput): Promise<string> {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: PROVIDER_TIMEOUT_MS });

    const content = input.image
      ? [
          {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: input.image.mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
              data: input.image.data,
            },
          },
          { type: 'text' as const, text: input.userPrompt },
        ]
      : input.userPrompt;

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: input.maxOutputTokens,
      system: input.systemPrompt,
      messages: [{ role: 'user', content }],
    });

    const block = message.content.find((b) => b.type === 'text');
    const text = block && 'text' in block ? block.text : '';
    if (!text.trim()) throw new ProviderError('anthropic', `empty response (stop: ${message.stop_reason})`);
    return text;
  },
};
