import crypto from 'crypto';
import { env } from '../config/env';
import { DigiLockerSession } from '../models/DigiLockerSession';
import { ApiError } from '../utils/ApiError';
import { writeAuditLog } from './audit.service';
import type { Role } from '@fyro/shared';

/**
 * "Fetch from DigiLocker": the person signs in to DigiLocker, agrees to share
 * one document, and FYRO pulls that document instead of making them photograph
 * it. Follows DigiLocker's Requester API (OAuth 2.0 authorization code flow
 * with PKCE).
 *
 * Only a PAN card and a driving licence are requested, because those are the
 * document types the API documents and that FYRO needs. An Aadhaar is
 * deliberately NOT fetched: it would bring in a number FYRO only accepts
 * masked.
 *
 * Off unless DIGILOCKER_ENABLED=true with a client id, secret and the exact
 * redirect URI registered with DigiLocker; otherwise the screen says so and
 * points to the ordinary upload. The access token lives only for this one
 * request and is never stored or logged. A fetched document still goes to
 * human review like any other, and the file's integrity is checked against the
 * HMAC DigiLocker sends with it.
 */
export const DOCTYPE_CODES = { pan: 'PANCR', driving_licence: 'DRVLC' } as const;
export type DigiLockerDocType = keyof typeof DOCTYPE_CODES;
export const DIGILOCKER_TIMEOUT_MS = 20_000;
const DEFAULT_BASE = 'https://api.digitallocker.gov.in';
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const FILE_MIMES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];

const base = () => (env.DIGILOCKER_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');

export function digilockerReady(): boolean {
  return env.DIGILOCKER_ENABLED === true && Boolean(env.DIGILOCKER_CLIENT_ID && env.DIGILOCKER_CLIENT_SECRET && env.DIGILOCKER_REDIRECT_URI);
}

export function digilockerStatus() {
  return { enabled: env.DIGILOCKER_ENABLED === true, ready: digilockerReady(), docTypes: Object.keys(DOCTYPE_CODES) as DigiLockerDocType[] };
}

const b64url = (b: Buffer) => b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

export function pkcePair() {
  // 64 random bytes as base64url is 86 characters: within the 43 to 128 the spec allows.
  const verifier = b64url(crypto.randomBytes(64));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export async function startFlow(userId: string, docType: DigiLockerDocType): Promise<{ authorizeUrl: string }> {
  if (!digilockerReady()) throw new ApiError(503, 'Fetching from DigiLocker is not switched on yet. Please upload the document instead.');
  const { verifier, challenge } = pkcePair();
  const state = b64url(crypto.randomBytes(24));
  await DigiLockerSession.create({ userId, state, codeVerifier: verifier, docType });
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: env.DIGILOCKER_CLIENT_ID as string,
    redirect_uri: env.DIGILOCKER_REDIRECT_URI as string,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    req_doctype: DOCTYPE_CODES[docType],
    purpose: 'kyc',
  });
  return { authorizeUrl: `${base()}/public/oauth2/1/authorize?${q.toString()}` };
}

async function call(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(DIGILOCKER_TIMEOUT_MS) });
  } catch {
    throw new ApiError(502, 'DigiLocker did not answer. Please try again in a moment, or upload the document instead.');
  }
}

export interface FetchedDocument {
  docType: DigiLockerDocType;
  mime: string;
  buffer: Buffer;
}

/**
 * Finishes the flow: checks the redirect's state belongs to this person, swaps
 * the code for a token, finds the document, downloads it and verifies its HMAC.
 * Returns the file; the caller stores it.
 */
export async function completeFlow(userId: string, role: Role, input: { code?: string; state: string; error?: string }): Promise<FetchedDocument> {
  if (!digilockerReady()) throw new ApiError(503, 'Fetching from DigiLocker is not switched on yet. Please upload the document instead.');
  // One use only: the session is removed as it is read, so a replayed redirect finds nothing.
  const session = await DigiLockerSession.findOneAndDelete({ state: input.state, userId });
  if (!session) throw new ApiError(400, 'This DigiLocker sign-in has expired or was not started here. Please start again.');
  if (input.error || !input.code) throw new ApiError(400, 'DigiLocker was not authorised, so nothing was fetched.');

  const tokenRes = await call(`${base()}/public/oauth2/1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: input.code,
      grant_type: 'authorization_code',
      client_id: env.DIGILOCKER_CLIENT_ID as string,
      client_secret: env.DIGILOCKER_CLIENT_SECRET as string,
      redirect_uri: env.DIGILOCKER_REDIRECT_URI as string,
      code_verifier: session.codeVerifier,
    }).toString(),
  });
  if (!tokenRes.ok) throw new ApiError(502, 'DigiLocker would not accept that sign-in. Please start again.');
  const token = ((await tokenRes.json()) as { access_token?: string }).access_token;
  if (!token) throw new ApiError(502, 'DigiLocker did not return access. Please start again.');
  const auth = { Authorization: `Bearer ${token}` };

  const code = DOCTYPE_CODES[session.docType];
  const listRes = await call(`${base()}/public/oauth2/2/files/issued`, { headers: auth });
  if (!listRes.ok) throw new ApiError(502, 'Could not read your DigiLocker documents. Please try again.');
  const items = ((await listRes.json()) as { items?: { uri?: string; doctype?: string }[] }).items ?? [];
  const found = items.find((i) => i.doctype === code && i.uri);
  if (!found?.uri) throw new ApiError(404, 'That document was not found in your DigiLocker. Please upload it instead.');

  const fileRes = await call(`${base()}/public/oauth2/1/file/${encodeURIComponent(found.uri)}`, { headers: auth });
  if (!fileRes.ok) throw new ApiError(502, 'Could not download the document from DigiLocker. Please try again.');
  const mime = (fileRes.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!FILE_MIMES.includes(mime)) throw new ApiError(422, 'DigiLocker sent a file in a format FYRO cannot use. Please upload the document instead.');
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_FILE_BYTES) throw new ApiError(422, 'The document from DigiLocker is not a usable size.');

  // DigiLocker signs the file with the client secret. A file whose HMAC is
  // missing or wrong is not trusted.
  const sent = fileRes.headers.get('hmac');
  const expected = crypto.createHmac('sha256', env.DIGILOCKER_CLIENT_SECRET as string).update(buffer).digest('base64');
  const ok = !!sent && sent.length === expected.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!ok) throw new ApiError(422, 'The document from DigiLocker could not be verified, so it was not used.');

  // The document's URI carries the holder's own number, so it is not logged or audited.
  await writeAuditLog({ actorId: userId, actorRole: role, action: 'digilocker_document_fetched', targetType: 'User', targetId: userId, details: { docType: session.docType } });
  return { docType: session.docType, mime, buffer };
}
