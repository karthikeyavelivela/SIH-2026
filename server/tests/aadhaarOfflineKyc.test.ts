import './setup';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { SignedXml } from 'xml-crypto';
import { BlobReader, BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import { app } from '../src/app';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { AuditLog } from '../src/models/AuditLog';
import { signAccessToken } from '../src/services/token.service';
import { loadTrustedKeys, parseReferenceTimestamp } from '../src/services/aadhaarOfflineKyc.service';

/*
 * Everything here is SYNTHETIC. The XML is built and signed in the test with a
 * throwaway key, the "Aadhaar number" is 1234, the name is SAMPLE CARD HOLDER,
 * and the test key is only ever trusted because NODE_ENV is 'test'.
 */

const mutableEnv = env as unknown as Record<string, unknown>;
const SHARE = 'abcd';
let testDir: string;
let keyPair: crypto.KeyPairKeyObjectResult;
let seq = 0;

beforeAll(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uidai-test-'));
  keyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  fs.writeFileSync(path.join(testDir, 'test-key.pem'), keyPair.publicKey.export({ type: 'spki', format: 'pem' }));
});

afterAll(() => fs.rmSync(testDir, { recursive: true, force: true }));

beforeEach(() => {
  mutableEnv.AADHAAR_OFFLINE_EKYC_ENABLED = true;
  mutableEnv.UIDAI_TEST_CERT_DIR = testDir;
  mutableEnv.AADHAAR_XML_MAX_AGE_DAYS = 7;
});

afterEach(() => {
  mutableEnv.AADHAAR_OFFLINE_EKYC_ENABLED = undefined;
  mutableEnv.UIDAI_TEST_CERT_DIR = undefined;
  jest.restoreAllMocks();
});

/** YYYYMMDDHHMMSSmmm in IST for a given instant, as UIDAI writes it. */
function istStamp(at: Date): string {
  const ist = new Date(at.getTime() + 5.5 * 3600_000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${ist.getUTCFullYear()}${p(ist.getUTCMonth() + 1)}${p(ist.getUTCDate())}${p(ist.getUTCHours())}${p(ist.getUTCMinutes())}${p(ist.getUTCSeconds())}${p(ist.getUTCMilliseconds(), 3)}`;
}

function rawXml(opts: { name?: string; last4?: string; at?: Date; ref?: string } = {}): string {
  const ref = opts.ref ?? `${opts.last4 ?? '1234'}${istStamp(opts.at ?? new Date())}`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<OfflinePaperlessKyc referenceId="${ref}"><UidData uid="SAMPLE">` +
    `<Poi dob="01-01-1990" e="SAMPLEHASH" gender="M" m="SAMPLEHASH" name="${opts.name ?? 'SAMPLE CARD HOLDER'}"/>` +
    `<Poa careof="S/O SAMPLE" country="India" dist="Sample" house="1" pc="500001" state="Sample"/>` +
    `<Pht>SAMPLEPHOTOBASE64==</Pht></UidData></OfflinePaperlessKyc>`
  );
}

function sign(xml: string, key: crypto.KeyObject = keyPair.privateKey): string {
  const sig = new SignedXml({
    privateKey: key.export({ type: 'pkcs8', format: 'pem' }).toString(),
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
  });
  sig.addReference({
    xpath: '/*',
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/2001/10/xml-exc-c14n#'],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
  });
  sig.computeSignature(xml);
  return sig.getSignedXml();
}

async function zipOf(xml: string, password = SHARE, filename = 'offlineaadhaar.xml'): Promise<string> {
  const writer = new ZipWriter(new BlobWriter('application/zip'), { password, encryptionStrength: 3 });
  await writer.add(filename, new TextReader(xml));
  const blob = await writer.close();
  return `data:application/zip;base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
}

async function person(name = 'Sample Card Holder') {
  seq += 1;
  const user = await User.create({ name, phone: `96660${String(seq).padStart(5, '0')}`, passwordHash: await bcrypt.hash('x', 4), role: 'hamali_solo' });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: 'hamali_solo' })}`);
  return { agent, user };
}

const submit = (agent: request.Agent, fileBase64: string, shareCode = SHARE) => agent.post('/api/kyc/documents/aadhaar-offline').send({ fileBase64, shareCode });

describe('verifying a signed offline file', () => {
  it('accepts a correctly signed file, and stores only the outcome', async () => {
    const { agent, user } = await person();
    const res = await submit(agent, await zipOf(sign(rawXml())));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ verified: true, last4: '1234', nameMatch: 'match' });

    const stored = (await User.findById(user._id).lean())!;
    expect(stored.aadhaarOfflineKyc).toMatchObject({ last4: '1234', nameMatch: 'match' });
    expect(stored.aadhaarOfflineKyc!.referenceId).toMatch(/^1234\d{17}$/);
    expect(stored.aadhaarOfflineKyc!.certificateFingerprint).toBeTruthy();

    // Nothing from inside the file is on the account, or in what came back.
    const everything = JSON.stringify(stored) + JSON.stringify(res.body);
    for (const leaked of ['SAMPLEPHOTOBASE64', 'SAMPLEHASH', '01-01-1990', 'S/O SAMPLE', '500001', SHARE + SHARE]) {
      expect(everything).not.toContain(leaked);
    }
    expect(JSON.stringify(stored)).not.toContain('"abcd"');
  });

  it('never writes the share phrase or the file to the audit log or the console', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { agent, user } = await person();
    await submit(agent, await zipOf(sign(rawXml()), 'sEcr3t'), 'sEcr3t');
    const audit = await AuditLog.find({ targetId: user._id.toString(), action: 'aadhaar_offline_ekyc_verified' }).lean();
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain('sEcr3t');
    expect(JSON.stringify([log.mock.calls, err.mock.calls])).not.toContain('sEcr3t');
    expect(audit[0].details).toEqual({ last4: '1234', nameMatch: 'match' });
  });

  it('reports how well the name matches, without refusing on it', async () => {
    const partial = await person('Sample Someoneelse');
    expect((await submit(partial.agent, await zipOf(sign(rawXml({ last4: '1111' }))))).body.nameMatch).toBe('partial');
    const other = await person('Totally Different');
    expect((await submit(other.agent, await zipOf(sign(rawXml({ last4: '2222' }))))).body.nameMatch).toBe('mismatch');
    const tel = await person('రవి కుమార్');
    expect((await submit(tel.agent, await zipOf(sign(rawXml({ last4: '3333' }))))).body.nameMatch).toBe('not_compared');
  });
});

describe('refusing files that should not be trusted', () => {
  it('a wrong share phrase', async () => {
    const { agent } = await person();
    const res = await submit(agent, await zipOf(sign(rawXml()), 'right'), 'wrong');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/share code/i);
  });

  it('a file altered after it was signed', async () => {
    const { agent } = await person();
    const tampered = sign(rawXml()).replace('SAMPLE CARD HOLDER', 'SOMEONE ELSE');
    const res = await submit(agent, await zipOf(tampered));
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/signature/i);
  });

  it('a file signed by a key we do not trust', async () => {
    const { agent } = await person();
    const stranger = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const res = await submit(agent, await zipOf(sign(rawXml(), stranger.privateKey)));
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/signature/i);
  });

  it('an unsigned file', async () => {
    const { agent } = await person();
    const res = await submit(agent, await zipOf(rawXml()));
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/not signed/i);
  });

  it('a file with a DOCTYPE, which the real one never has', async () => {
    const { agent } = await person();
    const evil = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]>` + rawXml().replace(/^<\?xml[^>]*\?>/, '');
    const res = await submit(agent, await zipOf(evil));
    expect(res.status).toBe(422);
  });

  it('something that is not a zip, or has no XML in it', async () => {
    const { agent } = await person();
    expect((await submit(agent, `data:application/zip;base64,${Buffer.from('not a zip at all').toString('base64')}`)).status).toBe(422);
    expect((await submit(agent, await zipOf(sign(rawXml()), SHARE, 'notes.txt'))).status).toBe(422);
  });

  it('the wrong kind of XML', async () => {
    const { agent } = await person();
    const res = await submit(agent, await zipOf(sign('<Other referenceId="x"><a/></Other>')));
    expect(res.status).toBe(422);
  });

  it('a file that is too old, or dated in the future', async () => {
    const { agent } = await person();
    const old = await submit(agent, await zipOf(sign(rawXml({ at: new Date(Date.now() - 30 * 86_400_000) }))));
    expect(old.status).toBe(422);
    expect(old.body.error).toMatch(/too old/i);
    const future = await submit(agent, await zipOf(sign(rawXml({ at: new Date(Date.now() + 10 * 86_400_000) }))));
    expect(future.status).toBe(422);
    expect(future.body.error).toMatch(/future/i);
  });

  it('a reference id that is not the right shape', async () => {
    const { agent } = await person();
    const res = await submit(agent, await zipOf(sign(rawXml({ ref: 'NOTANUMBER' }))));
    expect(res.status).toBe(422);
  });

  it('an oversized upload', async () => {
    const { agent } = await person();
    const res = await submit(agent, `data:application/zip;base64,${Buffer.alloc(1_100_000, 1).toString('base64')}`);
    expect([400, 422]).toContain(res.status);
  });
});

describe('one file, one account', () => {
  it('the same file cannot verify a second account', async () => {
    const file = await zipOf(sign(rawXml()));
    const first = await person();
    const second = await person();
    expect((await submit(first.agent, file)).status).toBe(200);
    const again = await submit(second.agent, file);
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/already been used/i);
  });

  it('an account that has done it cannot do it again', async () => {
    const { agent } = await person();
    expect((await submit(agent, await zipOf(sign(rawXml({ last4: '4444' }))))).status).toBe(200);
    expect((await submit(agent, await zipOf(sign(rawXml({ last4: '5555' }))))).status).toBe(409);
  });
});

describe('switched off, or not set up', () => {
  it('says so clearly when the flag is off, and does nothing', async () => {
    mutableEnv.AADHAAR_OFFLINE_EKYC_ENABLED = undefined;
    const { agent, user } = await person();
    const res = await submit(agent, await zipOf(sign(rawXml())));
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not switched on/i);
    expect((await User.findById(user._id).lean())!.aadhaarOfflineKyc).toBeUndefined();
    const status = await agent.get('/api/kyc/documents/aadhaar-offline');
    expect(status.body).toMatchObject({ enabled: false, ready: false, verified: false });
  });

  it('refuses, rather than trusting anything, when no certificate is installed', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'uidai-empty-'));
    mutableEnv.UIDAI_TEST_CERT_DIR = empty;
    const { agent } = await person();
    const res = await submit(agent, await zipOf(sign(rawXml())));
    expect(res.status).toBe(503);
    expect((await agent.get('/api/kyc/documents/aadhaar-offline')).body).toMatchObject({ enabled: true, ready: false });
    fs.rmSync(empty, { recursive: true, force: true });
  });

  it('requires sign-in', async () => {
    expect((await request(app).post('/api/kyc/documents/aadhaar-offline').send({ fileBase64: 'x', shareCode: 'y' })).status).toBe(401);
  });

  it('the status shows a finished verification, never the content of the file', async () => {
    const { agent } = await person();
    await submit(agent, await zipOf(sign(rawXml({ last4: '6666' }))));
    const body = (await agent.get('/api/kyc/documents/aadhaar-offline')).body;
    expect(body).toMatchObject({ enabled: true, ready: true, verified: true, last4: '6666', nameMatch: 'match' });
    expect(Object.keys(body).sort()).toEqual(['enabled', 'last4', 'nameMatch', 'ready', 'verified', 'verifiedAt']);
  });
});

describe('the certificate shipped in server/certs', () => {
  it('loads, and is the file UIDAI publishes (fingerprint recorded in its README)', () => {
    mutableEnv.UIDAI_TEST_CERT_DIR = undefined;
    const keys = loadTrustedKeys(path.join(__dirname, '..', 'certs'));
    expect(keys).toHaveLength(1);
    expect(keys[0].source).toBe('uidai-okyc-publickey.cer');
    expect(keys[0].fingerprint).toBe('E7:23:06:42:ED:F3:05:F6:16:D5:DD:F4:87:70:EC:F1:32:B8:4F:6B:32:D9:D1:D6:9F:2D:FD:50:41:7E:A5:78');
  });

  it('the test-key override is ignored outside the test environment', () => {
    // certDir() reads NODE_ENV: prove the guard by reading the source of truth.
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'aadhaarOfflineKyc.service.ts'), 'utf8');
    expect(src).toContain("env.NODE_ENV === 'test' && env.UIDAI_TEST_CERT_DIR");
  });
});

describe('reference timestamp', () => {
  it('is read as Indian Standard Time', () => {
    expect(parseReferenceTimestamp('20260930120000000').toISOString()).toBe('2026-09-30T06:30:00.000Z');
    expect(() => parseReferenceTimestamp('nope')).toThrow();
  });
});

void BlobReader;
