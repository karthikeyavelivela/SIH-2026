import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

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
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
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
  // Phase 4 AI agents. Same mock/real split as every other external
  // integration in this codebase — absent key means agents run in mock
  // mode (deterministic, clearly-labeled placeholder analysis) rather
  // than either failing outright or silently pretending to call a model
  // that was never configured.
  ANTHROPIC_API_KEY: z.string().optional(),
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

export const env = parsed.data;
