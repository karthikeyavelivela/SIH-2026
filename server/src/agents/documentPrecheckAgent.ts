import { User } from '../models/User';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { callAgent } from './client';
import { AgentResult } from './types';
import type { KycDocumentType } from '@fyro/shared';

const DOC_TYPE_LABEL: Record<KycDocumentType, string> = {
  driving_licence: 'Driving Licence',
  vehicle_rc: 'Vehicle RC',
  fastag: 'FASTag',
  goods_carriage_permit: 'Goods Carriage Permit',
  puc: 'PUC Certificate',
  vehicle_fitness: 'Vehicle Fitness Certificate',
  aadhaar: 'Aadhaar',
  pan: 'PAN',
  gstin: 'GSTIN',
};

async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: string } | null> {
  // Mock-mode uploads never produced a real fetchable URL
  // (mock.cloudinary.local doesn't resolve) — pre-check degrades to
  // metadata-only in that case rather than erroring on a fetch that was
  // never going to succeed. A real deploy with real Cloudinary credentials
  // has a genuinely fetchable URL here.
  if (url.includes('mock.cloudinary.local')) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) return null; // PDFs (resource_type 'raw') aren't vision-analyzable this way
    const buffer = Buffer.from(await res.arrayBuffer());
    return { data: buffer.toString('base64'), mediaType: contentType };
  } catch {
    return null;
  }
}

/**
 * Agent D — Document Pre-check. Pre-screens ONE just-uploaded KYC document
 * for obvious problems (wrong type, expired, unreadable/cut off) before a
 * human reviewer looks at it — kyc.controller.ts's admin approve/reject
 * flow (Phase 1) is completely unchanged; this only adds a hint the
 * reviewer sees alongside the document, never a status of its own. Uses
 * real Claude vision on the actual uploaded image when a real,
 * fetchable Cloudinary URL exists (production with real credentials);
 * degrades to metadata-only checks (type match, expiry date already
 * past) otherwise — never fabricates "the photo looks fine" without
 * actually having looked at it.
 */
export async function runDocumentPrecheckAgent(userId: string, documentType: KycDocumentType): Promise<AgentResult> {
  const user = await User.findById(userId).select('kycDocs role name').lean();
  if (!user) throw new ApiError(404, 'User not found');
  const doc = user.kycDocs.find((d) => d.type === documentType);
  if (!doc) throw new ApiError(404, 'No document of this type on file — upload it first');

  const now = new Date();
  const expiryPassed = doc.expiryDate ? new Date(doc.expiryDate) < now : null;

  const context = {
    documentType,
    documentLabel: DOC_TYPE_LABEL[documentType],
    ownerName: user.name,
    expiryDate: doc.expiryDate ?? null,
    expiryAlreadyPassed: expiryPassed,
    hasFetchableImage: false, // overwritten below once we know
  };

  if (env.MOCK_EXTERNAL_SERVICES || !env.ANTHROPIC_API_KEY) {
    return callAgent({ agentName: 'document_precheck', systemPrompt: '', userPrompt: '', context }, (ctx) =>
      mockPrecheck(ctx as typeof context)
    );
  }

  const image = await fetchImageAsBase64(doc.url);
  context.hasFetchableImage = !!image;

  const systemPrompt = `You are FYRO's KYC document pre-check agent for an Indian logistics marketplace. You PRE-SCREEN a document image before a human reviewer decides — you NEVER approve or reject, only flag obvious problems: wrong document type visible, image unreadable/blurry, document clearly cut off or cropped, or a visible name that doesn't match the account holder.
This is expected to be a ${context.documentLabel} belonging to ${context.ownerName}.
If you cannot see the image (no image provided), say so honestly and give confidence "low" — do not guess what the document might show.
Respond ONLY with JSON: {"summary": "<what you found, plain language, tell the worker what to fix if anything>", "confidence": "low"|"moderate"|"high", "evidence": [{"label": "<check>", "value": "<result>"}]}.`;

  const userPrompt = image
    ? `Pre-check this ${context.documentLabel} for ${context.ownerName}. Expiry on file: ${context.expiryDate ?? 'not set'}.`
    : `No image could be fetched for this ${context.documentLabel}. Expiry on file: ${context.expiryDate ?? 'not set'}, already passed: ${context.expiryAlreadyPassed}.`;

  if (!image) {
    // No real vision input available — still a real (non-mock) response,
    // just metadata-only, and the model is told exactly that so it
    // doesn't invent visual findings.
    return callAgent({ agentName: 'document_precheck', systemPrompt, userPrompt, context }, (ctx) =>
      mockPrecheck(ctx as typeof context)
    );
  }

  // Real vision call — bypasses callAgent's text-only path since this one
  // needs an image content block; still goes through the same Anthropic
  // client construction and JSON-parsing discipline.
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.mediaType as 'image/jpeg', data: image.data } },
          { type: 'text', text: userPrompt },
        ],
      },
    ],
  });
  const textBlock = message.content.find((b) => b.type === 'text');
  const rawText = textBlock && 'text' in textBlock ? textBlock.text : '';
  let parsed: { summary: string; confidence: 'low' | 'moderate' | 'high'; evidence: { label: string; value: string }[] } | null = null;
  try {
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const candidate = JSON.parse(cleaned);
    if (typeof candidate.summary === 'string' && ['low', 'moderate', 'high'].includes(candidate.confidence)) {
      parsed = candidate;
    }
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return { agentName: 'document_precheck', summary: 'Could not complete the visual pre-check this time.', confidence: 'low', evidence: [], mock: false, generatedAt: new Date().toISOString() };
  }
  return { agentName: 'document_precheck', mock: false, generatedAt: new Date().toISOString(), ...parsed };
}

function mockPrecheck(ctx: {
  documentLabel: string;
  expiryAlreadyPassed: boolean | null;
  hasFetchableImage: boolean;
}): { summary: string; confidence: 'low' | 'moderate' | 'high'; evidence: { label: string; value: string }[] } {
  if (ctx.expiryAlreadyPassed) {
    return {
      summary: `This ${ctx.documentLabel}'s expiry date is already in the past — it needs to be renewed and re-uploaded before it can be verified.`,
      confidence: 'high',
      evidence: [{ label: 'Expiry check', value: 'Already expired' }],
    };
  }
  return {
    summary: `No image could be checked for this ${ctx.documentLabel} — a human reviewer will need to look at it directly. This is a metadata-only pre-check, not a visual one.`,
    confidence: 'low',
    evidence: [{ label: 'Visual check performed', value: ctx.hasFetchableImage ? 'yes' : 'no' }],
  };
}
