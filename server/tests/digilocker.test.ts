import './setup';
import crypto from 'crypto';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { DigiLockerSession } from '../src/models/DigiLockerSession';
import { AuditLog } from '../src/models/AuditLog';
import { signAccessToken } from '../src/services/token.service';

/*
 * DigiLocker is stood in for by a fetch that follows its Requester API
 * specification v1.12: the authorize address, a form-encoded token call with a
 * PKCE code_verifier, the issued-documents list ({ items: [...] }), and the file
 * download with an `hmac` header (base64 HMAC-SHA256 of the body, keyed with the
 * client secret). Nothing here has been run against DigiLocker itself.
 */
const mutableEnv = env as unknown as Record<string, unknown>;
const realFetch = global.fetch;
const SECRET = 'client-secret-for-tests';
const BASE = 'https://api.digitallocker.gov.in';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

function on() {
  mutableEnv.DIGILOCKER_ENABLED = true;
  mutableEnv.DIGILOCKER_CLIENT_ID = 'client-123';
  mutableEnv.DIGILOCKER_CLIENT_SECRET = SECRET;
  mutableEnv.DIGILOCKER_REDIRECT_URI = 'https://app.test/digilocker/callback';
}

afterEach(() => {
  global.fetch = realFetch;
  for (const k of ['DIGILOCKER_ENABLED', 'DIGILOCKER_CLIENT_ID', 'DIGILOCKER_CLIENT_SECRET', 'DIGILOCKER_REDIRECT_URI', 'DIGILOCKER_BASE_URL']) mutableEnv[k] = undefined;
  jest.restoreAllMocks();
});

interface Stand {
  calls: { url: string; method: string; headers: Record<string, string>; form?: URLSearchParams }[];
}
function standIn(opts: { items?: unknown[]; tokenStatus?: number; hmac?: 'good' | 'bad' | 'missing'; mime?: string; body?: Buffer; fileStatus?: number } = {}): Stand {
  const s: Stand = { calls: [] };
  const body = opts.body ?? PNG;
  global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call: Stand['calls'][number] = { url: u, method: init?.method ?? 'GET', headers };
    if (u.endsWith('/public/oauth2/1/token')) call.form = new URLSearchParams(String(init?.body));
    s.calls.push(call);
    if (u.endsWith('/public/oauth2/1/token')) {
      return opts.tokenStatus && opts.tokenStatus !== 200
        ? new Response('{"error":"invalid_grant"}', { status: opts.tokenStatus })
        : new Response(JSON.stringify({ access_token: 'tok-abc', expires_in: 3600, token_type: 'Bearer', name: 'Someone' }), { status: 200 });
    }
    if (u.endsWith('/public/oauth2/2/files/issued')) {
      return new Response(
        JSON.stringify({
          items: opts.items ?? [
            { name: 'PAN Card', uri: 'in.gov.pan-PANCR-ABCDE1234F', doctype: 'PANCR', issuerid: 'in.gov.pan' },
            { name: 'Driving Licence', uri: 'in.gov.transport-DRVLC-DL0120230100001', doctype: 'DRVLC', issuerid: 'in.gov.transport' },
            { name: 'Marksheet', uri: 'in.gov.cbse-HSCER-2014', doctype: 'HSCER', issuerid: 'in.gov.cbse' },
          ],
        }),
        { status: 200 }
      );
    }
    if (u.includes('/public/oauth2/1/file/')) {
      if (opts.fileStatus) return new Response('{}', { status: opts.fileStatus });
      const good = crypto.createHmac('sha256', SECRET).update(body).digest('base64');
      const hmac = opts.hmac === 'bad' ? crypto.createHmac('sha256', 'wrong').update(body).digest('base64') : good;
      return new Response(new Uint8Array(body), {
        status: 200,
        headers: { 'Content-Type': opts.mime ?? 'image/png', ...(opts.hmac === 'missing' ? {} : { hmac }) },
      });
    }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
  return s;
}

let n = 0;
async function person(role = 'hamali_solo') {
  n += 1;
  const user = await User.create({ name: `P${n}`, phone: `9${String(400000000 + n).padStart(9, '0')}`, passwordHash: await bcrypt.hash('x', 4), role });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function begin(agent: request.Agent, docType = 'pan') {
  const r = await agent.post('/api/digilocker/start').send({ docType });
  const url = new URL(r.body.authorizeUrl);
  return { r, url, state: url.searchParams.get('state')! };
}

describe('starting', () => {
  it('when switched off, says so and creates nothing', async () => {
    const { agent } = await person();
    expect((await agent.get('/api/digilocker/status')).body).toMatchObject({ enabled: false, ready: false });
    const r = await agent.post('/api/digilocker/start').send({ docType: 'pan' });
    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/upload the document instead/i);
    expect(await DigiLockerSession.countDocuments()).toBe(0);
  });

  it('is not ready with only the flag, or with a missing redirect address', async () => {
    mutableEnv.DIGILOCKER_ENABLED = true;
    const { agent } = await person();
    expect((await agent.get('/api/digilocker/status')).body.ready).toBe(false);
    mutableEnv.DIGILOCKER_CLIENT_ID = 'x';
    mutableEnv.DIGILOCKER_CLIENT_SECRET = 'y';
    expect((await agent.get('/api/digilocker/status')).body.ready).toBe(false);
  });

  it('builds the DigiLocker address the spec asks for, with a PKCE challenge that matches the stored verifier', async () => {
    on();
    const { agent, user } = await person();
    const { r, url } = await begin(agent, 'pan');
    expect(r.status).toBe(200);
    expect(`${url.origin}${url.pathname}`).toBe(`${BASE}/public/oauth2/1/authorize`);
    const q = url.searchParams;
    expect(q.get('response_type')).toBe('code');
    expect(q.get('client_id')).toBe('client-123');
    expect(q.get('redirect_uri')).toBe('https://app.test/digilocker/callback');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('req_doctype')).toBe('PANCR');
    expect(q.get('purpose')).toBe('kyc');
    const session = (await DigiLockerSession.findOne({ userId: user._id }).lean())!;
    expect(session.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(session.codeVerifier.length).toBeLessThanOrEqual(128);
    expect(session.codeVerifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    const expected = crypto.createHash('sha256').update(session.codeVerifier).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    expect(q.get('code_challenge')).toBe(expected);
    expect(q.get('state')).toBe(session.state);
    // the response carries no secret and no verifier
    expect(JSON.stringify(r.body)).not.toContain(session.codeVerifier);
    expect(JSON.stringify(r.body)).not.toContain(SECRET);
  });

  it('asks only for PAN or driving licence; an Aadhaar is not offered', async () => {
    on();
    const { agent } = await person();
    expect((await agent.post('/api/digilocker/start').send({ docType: 'aadhaar' })).status).toBe(400);
    expect((await begin(agent, 'driving_licence')).url.searchParams.get('req_doctype')).toBe('DRVLC');
  });
});

describe('finishing', () => {
  it('fetches the document, sends the verifier and secret to the token call, and stores it for review as from DigiLocker', async () => {
    on();
    const stand = standIn();
    const { agent, user } = await person();
    const { state } = await begin(agent, 'pan');
    const session = (await DigiLockerSession.findOne({ state }).lean())!;

    const r = await agent.post('/api/digilocker/complete').send({ code: 'auth-code-1', state });
    expect(r.status).toBe(200);
    expect(r.body.document).toMatchObject({ type: 'pan', status: 'under_review', source: 'digilocker' });

    const token = stand.calls.find((c) => c.url.endsWith('/token'))!;
    expect(token.method).toBe('POST');
    expect(token.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(Object.fromEntries(token.form!.entries())).toEqual({
      code: 'auth-code-1',
      grant_type: 'authorization_code',
      client_id: 'client-123',
      client_secret: SECRET,
      redirect_uri: 'https://app.test/digilocker/callback',
      code_verifier: session.codeVerifier,
    });
    const list = stand.calls.find((c) => c.url.endsWith('/files/issued'))!;
    expect(list.headers.Authorization).toBe('Bearer tok-abc');
    const file = stand.calls.find((c) => c.url.includes('/oauth2/1/file/'))!;
    expect(decodeURIComponent(file.url)).toContain('in.gov.pan-PANCR-ABCDE1234F');
    expect(file.headers.Authorization).toBe('Bearer tok-abc');

    const stored = (await User.findById(user._id).lean())!;
    expect(stored.kycDocs).toHaveLength(1);
    expect(stored.kycDocs[0].source).toBe('digilocker');
    expect(stored.kycStatus).toBe('pending');
    // neither the token, the secret nor the holder's number is kept or returned
    const everything = JSON.stringify(stored) + JSON.stringify(r.body) + JSON.stringify(await AuditLog.find().lean());
    for (const secret of ['tok-abc', SECRET, 'ABCDE1234F', session.codeVerifier]) expect(everything).not.toContain(secret);
    expect(await AuditLog.countDocuments({ action: 'digilocker_document_fetched' })).toBe(1);
  });

  it('a driving licence is found by its own document type', async () => {
    on();
    const stand = standIn();
    const { agent } = await person('driver');
    const { state } = await begin(agent, 'driving_licence');
    const r = await agent.post('/api/digilocker/complete').send({ code: 'c', state });
    expect(r.body.document.type).toBe('driving_licence');
    expect(decodeURIComponent(stand.calls.find((c) => c.url.includes('/oauth2/1/file/'))!.url)).toContain('DRVLC');
  });

  it('a redirect can be used once: replaying it finds nothing', async () => {
    on();
    standIn();
    const { agent } = await person();
    const { state } = await begin(agent);
    expect((await agent.post('/api/digilocker/complete').send({ code: 'c', state })).status).toBe(200);
    const again = await agent.post('/api/digilocker/complete').send({ code: 'c', state });
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/expired or was not started here/i);
  });

  it('a state started by someone else is refused, and is not used up by the attempt', async () => {
    on();
    standIn();
    const a = await person();
    const b = await person();
    const { state } = await begin(a.agent);
    expect((await b.agent.post('/api/digilocker/complete').send({ code: 'c', state })).status).toBe(400);
    expect(await DigiLockerSession.countDocuments({ state })).toBe(1);
    expect((await a.agent.post('/api/digilocker/complete').send({ code: 'c', state })).status).toBe(200);
  });

  it('refuses a file whose HMAC is wrong or missing, and stores nothing', async () => {
    on();
    const { agent, user } = await person();
    for (const hmac of ['bad', 'missing'] as const) {
      standIn({ hmac });
      const { state } = await begin(agent);
      const r = await agent.post('/api/digilocker/complete').send({ code: 'c', state });
      expect(r.status).toBe(422);
      expect(r.body.error).toMatch(/could not be verified/i);
    }
    expect((await User.findById(user._id).lean())!.kycDocs).toHaveLength(0);
  });

  it('says so when the document is not in their DigiLocker, and when DigiLocker refuses', async () => {
    on();
    const { agent } = await person();
    standIn({ items: [{ uri: 'in.gov.cbse-HSCER-1', doctype: 'HSCER' }] });
    const none = await agent.post('/api/digilocker/complete').send({ code: 'c', state: (await begin(agent)).state });
    expect(none.status).toBe(404);
    expect(none.body.error).toMatch(/not found in your DigiLocker/i);
    standIn({ tokenStatus: 400 });
    expect((await agent.post('/api/digilocker/complete').send({ code: 'bad', state: (await begin(agent)).state })).status).toBe(502);
    standIn({ fileStatus: 500 });
    expect((await agent.post('/api/digilocker/complete').send({ code: 'c', state: (await begin(agent)).state })).status).toBe(502);
  });

  it('refuses a file type FYRO cannot use', async () => {
    on();
    standIn({ mime: 'application/zip' });
    const { agent } = await person();
    const r = await agent.post('/api/digilocker/complete').send({ code: 'c', state: (await begin(agent)).state });
    expect(r.status).toBe(422);
  });

  it('the person declining on DigiLocker stops the flow without fetching anything', async () => {
    on();
    const stand = standIn();
    const { agent } = await person();
    const { state } = await begin(agent);
    const r = await agent.post('/api/digilocker/complete').send({ state, error: 'access_denied' });
    expect(r.status).toBe(400);
    expect(stand.calls).toHaveLength(0);
  });

  it('when DigiLocker is unreachable, says so kindly', async () => {
    on();
    global.fetch = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const { agent } = await person();
    const r = await agent.post('/api/digilocker/complete').send({ code: 'c', state: (await begin(agent)).state });
    expect(r.status).toBe(502);
    expect(r.body.error).toMatch(/did not answer/i);
  });

  it('requires sign-in and validates input', async () => {
    on();
    expect((await request(app).post('/api/digilocker/start').send({ docType: 'pan' })).status).toBe(401);
    const { agent } = await person();
    expect((await agent.post('/api/digilocker/complete').send({ state: 'short' })).status).toBe(400);
  });
});
