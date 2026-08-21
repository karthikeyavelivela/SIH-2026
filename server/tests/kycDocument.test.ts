import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { signAccessToken } from '../src/services/token.service';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const TINY_PDF = 'data:application/pdf;base64,JVBERi0xLjQKJcOkw7zDtsO4Cg==';

async function loginAsDriver(phone = '9820000001') {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const user = await User.create({ name: 'Drv', phone, passwordHash, role: 'driver' });
  const agent = request.agent(app);
  const accessToken = signAccessToken({ id: user._id.toString(), role: 'driver' });
  agent.jar.setCookie(`accessToken=${accessToken}`);
  return { agent, user };
}

describe('POST /api/kyc/documents', () => {
  it('uploads a document and reflects it in GET /api/kyc/documents', async () => {
    const { agent } = await loginAsDriver();

    const upload = await agent.post('/api/kyc/documents').send({ type: 'aadhaar', fileBase64: TINY_PNG });
    expect(upload.status).toBe(200);
    expect(upload.body.document.type).toBe('aadhaar');
    expect(upload.body.document.status).toBe('under_review');
    expect(typeof upload.body.document.url).toBe('string');

    const list = await agent.get('/api/kyc/documents');
    expect(list.status).toBe(200);
    expect(list.body.documents).toHaveLength(1);
    expect(list.body.documents[0].type).toBe('aadhaar');
  });

  it('accepts a PDF document (routed to Cloudinary as resource_type raw)', async () => {
    const { agent } = await loginAsDriver('9820000002');
    const upload = await agent.post('/api/kyc/documents').send({ type: 'pan', fileBase64: TINY_PDF });
    expect(upload.status).toBe(200);
    expect(upload.body.document.type).toBe('pan');
  });

  it('rejects an unsupported document type (400, express-validator)', async () => {
    const { agent } = await loginAsDriver('9820000003');
    const upload = await agent.post('/api/kyc/documents').send({ type: 'passport', fileBase64: TINY_PNG });
    expect(upload.status).toBe(400);
  });

  it('rejects a malformed fileBase64 that is not a real data URL (400)', async () => {
    const { agent } = await loginAsDriver('9820000004');
    const upload = await agent.post('/api/kyc/documents').send({ type: 'aadhaar', fileBase64: 'not-a-data-url' });
    expect(upload.status).toBe(400);
  });

  it('re-uploading the same type replaces the existing entry in place, not appends', async () => {
    const { agent } = await loginAsDriver('9820000005');
    await agent.post('/api/kyc/documents').send({ type: 'pan', fileBase64: TINY_PNG });
    const second = await agent.post('/api/kyc/documents').send({ type: 'pan', fileBase64: TINY_PNG });
    expect(second.status).toBe(200);

    const list = await agent.get('/api/kyc/documents');
    expect(list.body.documents).toHaveLength(1);
  });

  it('resets status to under_review and clears the rejection reason on re-upload after a rejection', async () => {
    const { agent, user } = await loginAsDriver('9820000006');
    await agent.post('/api/kyc/documents').send({ type: 'aadhaar', fileBase64: TINY_PNG });

    // Simulate an admin rejection directly against the model (the admin
    // per-document review endpoint is not built in this phase — see the
    // Phase 1 report — only the whole-submission approve/reject is).
    const doc = await User.findById(user._id);
    const entry = doc!.kycDocs.find((d) => d.type === 'aadhaar')!;
    entry.status = 'rejected';
    entry.rejectionReason = 'Blurry photo';
    await doc!.save();

    const reupload = await agent.post('/api/kyc/documents').send({ type: 'aadhaar', fileBase64: TINY_PNG });
    expect(reupload.status).toBe(200);
    expect(reupload.body.document.status).toBe('under_review');
    expect(reupload.body.document.rejectionReason).toBeFalsy();
  });

  it('blocks re-uploading a document that is already verified (400)', async () => {
    const { agent, user } = await loginAsDriver('9820000007');
    await agent.post('/api/kyc/documents').send({ type: 'aadhaar', fileBase64: TINY_PNG });

    const doc = await User.findById(user._id);
    doc!.kycDocs.find((d) => d.type === 'aadhaar')!.status = 'verified';
    await doc!.save();

    const reupload = await agent.post('/api/kyc/documents').send({ type: 'aadhaar', fileBase64: TINY_PNG });
    expect(reupload.status).toBe(400);
  });

  it('rejects an unauthenticated request (401)', async () => {
    const res = await request(app).post('/api/kyc/documents').send({ type: 'aadhaar', fileBase64: TINY_PNG });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/kyc/documents/:type', () => {
  it('deletes an under_review document', async () => {
    const { agent } = await loginAsDriver('9820000008');
    await agent.post('/api/kyc/documents').send({ type: 'aadhaar', fileBase64: TINY_PNG });

    const del = await agent.delete('/api/kyc/documents/aadhaar');
    expect(del.status).toBe(200);
    expect(del.body.documents).toHaveLength(0);
  });

  it('blocks deleting a verified document (400)', async () => {
    const { agent, user } = await loginAsDriver('9820000009');
    await agent.post('/api/kyc/documents').send({ type: 'aadhaar', fileBase64: TINY_PNG });
    const doc = await User.findById(user._id);
    doc!.kycDocs.find((d) => d.type === 'aadhaar')!.status = 'verified';
    await doc!.save();

    const del = await agent.delete('/api/kyc/documents/aadhaar');
    expect(del.status).toBe(400);
  });

  it('404s deleting a document type never uploaded', async () => {
    const { agent } = await loginAsDriver('9820000010');
    const del = await agent.delete('/api/kyc/documents/pan');
    expect(del.status).toBe(404);
  });
});

describe('GET /api/admin/kyc-queue only lists users with an actual uploaded document', () => {
  it('excludes a pending user with zero documents, includes one with at least one', async () => {
    const passwordHash = await bcrypt.hash('AdminPass1!', 12);
    const admin = await User.create({ name: 'Admin', phone: '9820099999', passwordHash, role: 'admin' });
    const adminAgent = request.agent(app);
    adminAgent.jar.setCookie(`accessToken=${signAccessToken({ id: admin._id.toString(), role: 'admin' })}`);

    const { agent: noDocsAgent } = await loginAsDriver('9820000011'); // never uploads anything
    void noDocsAgent;
    const { agent: withDocAgent, user: withDocUser } = await loginAsDriver('9820000012');
    await withDocAgent.post('/api/kyc/documents').send({ type: 'aadhaar', fileBase64: TINY_PNG });

    const queue = await adminAgent.get('/api/admin/kyc-queue');
    expect(queue.status).toBe(200);
    const ids = queue.body.users.map((u: { _id: string }) => u._id);
    expect(ids).toContain(withDocUser._id.toString());
  });
});
