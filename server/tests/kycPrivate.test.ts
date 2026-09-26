import './setup';
import request from 'supertest';
import type { Request } from 'express';
import { app } from '../src/app';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { AuditLog } from '../src/models/AuditLog';
import { signAccessToken } from '../src/services/token.service';
import { publicUser } from '../src/utils/publicUser';
import { clientIp } from '../src/middleware/clientIp';
import { generateOtp } from '../src/services/otp.service';
import { parseCloudinaryUrl, migrateKycToPrivate } from '../src/services/kycMigration.service';

jest.mock('../src/services/cloudinary.service', () => {
  const actual = jest.requireActual('../src/services/cloudinary.service');
  return {
    ...actual,
    copyToPrivate: jest.fn(async (_url: string, folder: string, resourceType: 'image' | 'raw') => ({
      publicId: `${folder}/private-copy`,
      format: 'jpg',
      resourceType,
    })),
    destroyAsset: jest.fn(async () => undefined),
    signedDocumentUrl: jest.fn(async (doc: { publicId: string }) => ({
      url: `https://api.cloudinary.com/v1_1/demo/image/download?public_id=${doc.publicId}&signature=abc`,
      expiresAt: new Date(Date.now() + 300_000),
    })),
  };
});
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cloudinary = require('../src/services/cloudinary.service') as {
  copyToPrivate: jest.Mock;
  destroyAsset: jest.Mock;
};

/*
 * P0.4 — identity documents are private: never a URL in a list, a
 * short-lived link only for the owner or a KYC reviewer, every reviewer
 * view audited.
 */

const PUBLIC_URL = 'https://res.cloudinary.com/demo/image/upload/v1712345678/kyc/abc/aadhaar/scan.jpg';

let seq = 0;
async function agentFor(role: string, extra: Record<string, unknown> = {}) {
  seq += 1;
  const user = await User.create({
    name: 'U',
    phone: `98330${String(seq).padStart(5, '0')}`,
    passwordHash: 'x',
    role,
    ...extra,
  });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function workerWithDocs() {
  const { agent, user } = await agentFor('hamali_solo');
  user.kycDocs.push(
    { type: 'aadhaar', url: PUBLIC_URL, status: 'under_review', uploadedAt: new Date() } as never,
    {
      type: 'pan',
      url: 'cloudinary-private://kyc/x/pan/abc',
      publicId: 'kyc/x/pan/abc',
      format: 'jpg',
      resourceType: 'image',
      delivery: 'authenticated',
      status: 'under_review',
      uploadedAt: new Date(),
    } as never
  );
  await user.save();
  return { agent, user, legacyId: user.kycDocs[0]._id.toString(), privateId: user.kycDocs[1]._id.toString() };
}

describe('publicUser strips KYC storage details', () => {
  it('never returns a url or publicId for any KYC document', async () => {
    const { user } = await workerWithDocs();
    const out = publicUser(user) as { kycDocs: Record<string, unknown>[] };
    expect(out.kycDocs).toHaveLength(2);
    for (const d of out.kycDocs) {
      expect(d.url).toBeUndefined();
      expect(d.publicId).toBeUndefined();
      expect(d.type).toBeDefined();
      expect(d.status).toBe('under_review');
    }
  });

  it('the admin KYC queue lists documents without URLs', async () => {
    await workerWithDocs();
    const { agent: admin } = await agentFor('admin');
    const res = await admin.get('/api/admin/kyc-queue');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('res.cloudinary.com');
    expect(JSON.stringify(res.body)).not.toContain('cloudinary-private://');
  });
});

describe('GET /api/kyc/documents/:id/url', () => {
  it('gives the owner a signed link to a private document, without an audit entry', async () => {
    const { agent, privateId } = await workerWithDocs();
    const res = await agent.get(`/api/kyc/documents/${privateId}/url`);
    expect(res.status).toBe(200);
    expect(res.body.legacy).toBe(false);
    expect(res.body.url).toContain('signature=');
    expect(res.body.expiresAt).toBeTruthy();
    expect(await AuditLog.countDocuments({ action: 'kyc_document_viewed' })).toBe(0);
  });

  it('gives an admin the link and records who viewed whose document', async () => {
    const { user, privateId } = await workerWithDocs();
    const { agent: admin, user: adminUser } = await agentFor('admin');
    const res = await admin.get(`/api/kyc/documents/${privateId}/url`);
    expect(res.status).toBe(200);
    const log = await AuditLog.findOne({ action: 'kyc_document_viewed' }).lean();
    expect(log?.actorId.toString()).toBe(adminUser._id.toString());
    expect(log?.targetId?.toString()).toBe(user._id.toString());
  });

  it('a legacy public document is returned flagged legacy', async () => {
    const { agent, legacyId } = await workerWithDocs();
    const res = await agent.get(`/api/kyc/documents/${legacyId}/url`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ legacy: true, url: PUBLIC_URL, expiresAt: null });
  });

  it('a manager with verify_kyc may view; one without it gets 404', async () => {
    const { privateId } = await workerWithDocs();
    const { agent: reviewer } = await agentFor('manager', { permissions: ['verify_kyc'] });
    const { agent: other } = await agentFor('manager', { permissions: [] });
    expect((await reviewer.get(`/api/kyc/documents/${privateId}/url`)).status).toBe(200);
    expect((await other.get(`/api/kyc/documents/${privateId}/url`)).status).toBe(404);
  });

  it('another worker or a customer gets 404, never the link', async () => {
    const { privateId } = await workerWithDocs();
    const { agent: worker } = await agentFor('hamali_solo');
    const { agent: customer } = await agentFor('customer');
    for (const a of [worker, customer]) {
      const res = await a.get(`/api/kyc/documents/${privateId}/url`);
      expect(res.status).toBe(404);
      expect(res.body.url).toBeUndefined();
    }
  });

  it('rejects a malformed id and an unauthenticated caller', async () => {
    const { agent } = await agentFor('admin');
    expect((await agent.get('/api/kyc/documents/not-an-id/url')).status).toBe(400);
    expect((await request(app).get('/api/kyc/documents/507f1f77bcf86cd799439011/url')).status).toBe(401);
  });
});

describe('KYC migration to private storage', () => {
  beforeEach(() => {
    cloudinary.copyToPrivate.mockClear();
    cloudinary.destroyAsset.mockClear();
  });

  it('parses public Cloudinary URLs, with and without transformations', () => {
    expect(parseCloudinaryUrl(PUBLIC_URL)).toEqual({ resourceType: 'image', publicId: 'kyc/abc/aadhaar/scan' });
    expect(parseCloudinaryUrl('https://res.cloudinary.com/demo/raw/upload/w_100/v1/kyc/a/doc.pdf')).toEqual({
      resourceType: 'raw',
      publicId: 'kyc/a/doc.pdf',
    });
    expect(parseCloudinaryUrl('https://mock.cloudinary.local/x.jpg')).toBeNull();
  });

  it('a dry run reports and changes nothing', async () => {
    const { user } = await workerWithDocs();
    const items = await migrateKycToPrivate({ apply: false });
    expect(items).toEqual([expect.objectContaining({ userId: user._id.toString(), type: 'aadhaar', action: 'would_migrate' })]);
    expect(cloudinary.copyToPrivate).not.toHaveBeenCalled();
    const fresh = await User.findById(user._id);
    expect(fresh!.kycDocs[0].url).toBe(PUBLIC_URL);
  });

  it('apply copies, repoints the record, deletes the public original and audits', async () => {
    const { user } = await workerWithDocs();
    const items = await migrateKycToPrivate({ apply: true });
    expect(items.map((i) => i.action)).toEqual(['migrated']);
    expect(cloudinary.destroyAsset).toHaveBeenCalledWith('kyc/abc/aadhaar/scan', 'image', 'upload');
    const fresh = await User.findById(user._id);
    expect(fresh!.kycDocs[0].delivery).toBe('authenticated');
    expect(fresh!.kycDocs[0].url.startsWith('cloudinary-private://')).toBe(true);
    expect(await AuditLog.countDocuments({ action: 'kyc_document_made_private' })).toBe(1);
    // Re-running is a no-op.
    expect(await migrateKycToPrivate({ apply: true })).toEqual([]);
  });

  it('a failed copy leaves the document reachable the old way', async () => {
    const { user } = await workerWithDocs();
    cloudinary.copyToPrivate.mockRejectedValueOnce(new Error('network'));
    const items = await migrateKycToPrivate({ apply: true });
    expect(items[0]).toMatchObject({ action: 'failed', reason: 'network' });
    expect(cloudinary.destroyAsset).not.toHaveBeenCalled();
    const fresh = await User.findById(user._id);
    expect(fresh!.kycDocs[0].url).toBe(PUBLIC_URL);
  });

  it('skips mock uploads it cannot fetch', async () => {
    const { user } = await agentFor('driver');
    user.kycDocs.push({ type: 'driving_licence', url: 'https://mock.cloudinary.local/x.jpg', status: 'under_review', uploadedAt: new Date() } as never);
    await user.save();
    const items = await migrateKycToPrivate({ apply: true });
    expect(items[0].action).toBe('skipped_unfetchable');
  });
});

describe('clientIp', () => {
  const fake = (headers: Record<string, string>, ip = '10.0.0.1') => ({ headers, ip }) as unknown as Request;
  const original = env.TRUST_CLOUDFLARE;
  afterEach(() => {
    (env as { TRUST_CLOUDFLARE: boolean }).TRUST_CLOUDFLARE = original;
  });

  it('ignores CF-Connecting-IP unless TRUST_CLOUDFLARE is on', () => {
    (env as { TRUST_CLOUDFLARE: boolean }).TRUST_CLOUDFLARE = false;
    expect(clientIp(fake({ 'cf-connecting-ip': '203.0.113.9' }))).toBe('10.0.0.1');
  });

  it('uses a valid CF-Connecting-IP when trusted, and refuses a non-IP value', () => {
    (env as { TRUST_CLOUDFLARE: boolean }).TRUST_CLOUDFLARE = true;
    expect(clientIp(fake({ 'cf-connecting-ip': '203.0.113.9' }))).toBe('203.0.113.9');
    expect(clientIp(fake({ 'cf-connecting-ip': '2001:db8::1' }))).toBe('2001:db8::1');
    expect(clientIp(fake({ 'cf-connecting-ip': 'evil; drop' }))).toBe('10.0.0.1');
  });
});

describe('OTP dev code', () => {
  const originalEnv = env.NODE_ENV;
  const originalMock = env.MOCK_OTP;
  afterEach(() => {
    (env as { NODE_ENV: string }).NODE_ENV = originalEnv;
    (env as { MOCK_OTP: boolean }).MOCK_OTP = originalMock;
  });

  it('is returned only in mock mode outside production', async () => {
    (env as { MOCK_OTP: boolean }).MOCK_OTP = true;
    expect((await generateOtp()).devCode).toMatch(/^\d+$/);
    (env as { NODE_ENV: string }).NODE_ENV = 'production';
    expect((await generateOtp()).devCode).toBeUndefined();
    (env as { NODE_ENV: string }).NODE_ENV = originalEnv;
    (env as { MOCK_OTP: boolean }).MOCK_OTP = false;
    expect((await generateOtp()).devCode).toBeUndefined();
  });
});

describe('security headers', () => {
  it('the API sends a locked-down CSP and HSTS', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
