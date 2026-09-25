import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const optionalFlag = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v === '' ? undefined : v === 'true'));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().url(),
  MONGODB_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ADMIN_PHONE: z.string().min(10),
  ADMIN_PASSWORD: z.string().min(8),
  MOCK_EXTERNAL_SERVICES: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  // Per-integration mock switches. Each one falls back to
  // MOCK_EXTERNAL_SERVICES when unset, so an existing deployment behaves
  // exactly as before until someone sets them. They exist because one flag
  // could not describe the real production state: real uploads (needs the
  // flag off) and test-mode payments (needed it on) at the same time.
  MOCK_PAYMENTS: optionalFlag,
  MOCK_UPLOADS: optionalFlag,
  MOCK_OTP: optionalFlag,
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  // Address lookup. Optional: without it the chain falls through to Photon's
  // keyless public instance, which works but has tighter fair-use limits.
  // See geocode.service.ts for the full provider chain.
  LOCATIONIQ_API_KEY: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  // Platform-wide kill switch for automatic parametric-insurance payouts
  // (AUDIT_REPORT.md Phase 1.4). Same MOCK_EXTERNAL_SERVICES-style boolean
  // convention as the rest of this file. Setting this to 'false' does NOT
  // stop trigger evaluation (a worker still sees an honest 'triggered: true'
  // on their dashboard) — it only stops the automatic disbursement step;
  // the Payout is still created, just 'pending' in the ordinary admin
  // queue instead of already 'paid'. See parametricInsurance.service.ts.
  PARAMETRIC_PAYOUTS_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  // Phase 4 AI agents. Absent key means agents run in mock mode
  // (deterministic, clearly-labeled placeholder analysis) rather than
  // either failing outright or silently pretending to call a model that
  // was never configured. Deliberately NOT gated by MOCK_EXTERNAL_SERVICES
  // like the rest of this file's integrations — see agents/client.ts's
  // callAgent doc comment for why agents need their own switch.
  ANTHROPIC_API_KEY: z.string().optional(),
  // Job 2 — the agent layer is no longer tied to one vendor. Keys are all
  // optional and independent: whichever are present form the provider chain,
  // in the order AI_PROVIDER selects. With none present every agent falls
  // back to its rule-based mock, labelled as such, exactly as before.
  GEMINI_API_KEY: z.string().optional(),
  /**
   * Overrides the Gemini model name. Set it when Google retires the current
   * one — the failure mode is a 404 on every call and every agent silently
   * falling back to its rule-based answer, which is worth being able to fix
   * without a deploy.
   */
  GEMINI_MODEL: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  // 'auto' (the default) tries Gemini, then Groq, then Anthropic, skipping
  // any without a key. Naming one provider pins the chain to it alone —
  // useful for proving which vendor answered, and for cutting a provider out
  // fast if it starts misbehaving. 'mock' forces the rule-based path even
  // when keys exist, so a demo can be made deterministic on purpose.
  AI_PROVIDER: z.enum(['auto', 'gemini', 'groq', 'anthropic', 'mock']).default('auto'),
  // Phase 6.4 — Indian tax documents. Optional on purpose: never fabricate
  // a real-looking GSTIN for a legal document. When absent,
  // taxInvoice.service.ts prints "Not yet registered" instead of inventing
  // one — same "never fabricate" discipline as every mock/real split
  // elsewhere in this file.
  PLATFORM_GSTIN: z.string().optional(),
  PLATFORM_LEGAL_NAME: z.string().default('FYRO Logistics Platform'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

const raw = parsed.data;

export const env = {
  ...raw,
  MOCK_PAYMENTS: raw.MOCK_PAYMENTS ?? raw.MOCK_EXTERNAL_SERVICES,
  MOCK_UPLOADS: raw.MOCK_UPLOADS ?? raw.MOCK_EXTERNAL_SERVICES,
  MOCK_OTP: raw.MOCK_OTP ?? raw.MOCK_EXTERNAL_SERVICES,
};

export type Env = typeof env;

/**
 * Refuses to boot a production server whose payments are real but whose
 * Razorpay configuration is incomplete.
 *
 * Without the webhook secret, a real deployment would accept any request
 * claiming "payment.captured" — anyone who guessed an order id could mark it
 * paid and post revenue to the ledger. Without the key pair, orders silently
 * fall back to fake ones. Both are worse than not starting, so neither is
 * left to be discovered at the first real payment.
 */
export function paymentConfigProblems(e: Pick<Env, 'NODE_ENV' | 'MOCK_PAYMENTS' | 'RAZORPAY_KEY_ID' | 'RAZORPAY_KEY_SECRET' | 'RAZORPAY_WEBHOOK_SECRET'>): string[] {
  if (e.NODE_ENV !== 'production' || e.MOCK_PAYMENTS) return [];
  const missing = (['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'] as const).filter((k) => !e[k]);
  return missing.length
    ? [`MOCK_PAYMENTS is false in production but ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set. Set them (Razorpay dashboard -> Settings -> API keys / Webhooks), or set MOCK_PAYMENTS=true.`]
    : [];
}

const bootProblems = paymentConfigProblems(env);
if (bootProblems.length) {
  // eslint-disable-next-line no-console
  console.error(bootProblems.join(' '));
  throw new Error(bootProblems[0]);
}
