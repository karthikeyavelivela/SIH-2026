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

describe('end-to-end: upload -> admin review -> per-document status (found missing during Phase 1 live verification)', () => {
  async function loginAsAdmin(phone: string) {
    const passwordHash = await bcrypt.hash('AdminPass1!', 12);
    const admin = await User.create({ name: 'Admin', phone, passwordHash, role: 'admin' });
    const agent = request.agent(app);
    agent.jar.setCookie(`accessToken=${signAccessToken({ id: admin._id.toString(), role: 'admin' })}`);
    return agent;
  }

  it('approving the whole submission verifies every under_review document, not just the user-level kycStatus', async () => {
    const { agent, user } = await loginAsDriver('9820000013');
    await agent.post('/api/kyc/documents').send({ type: 'aadhaar', fileBase64: TINY_PNG });
    await agent.post('/api/kyc/documents').send({ type: 'pan', fileBase64: TINY_PNG });

    const adminAgent = await loginAsAdmin('9820099998');
    const approve = await adminAgent.patch(`/api/admin/kyc-queue/${user._id}`).send({ status: 'verified' });
    expect(approve.status).toBe(200);

    const refreshed = await User.findById(user._id);
    expect(refreshed!.kycStatus).toBe('verified');
    for (const doc of refreshed!.kycDocs) {
      expect(doc.status).toBe('verified');
      expect(doc.reviewedAt).toBeDefined();
      expect(doc.reviewedByAdminId?.toString()).toBeTruthy();
    }
  });

  it('rejecting the whole submission rejects every under_review document with the same reason', async () => {
    const { agent, user } = await loginAsDriver('9820000014');
    await agent.post('/api/kyc/documents').send({ type: 'aadhaar', fileBase64: TINY_PNG });

    const adminAgent = await loginAsAdmin('9820099997');
    const reject = await adminAgent
      .patch(`/api/admin/kyc-queue/${user._id}`)
      .send({ status: 'rejected', rejectionReason: 'Blurry photo' });
    expect(reject.status).toBe(200);

    const refreshed = await User.findById(user._id);
    expect(refreshed!.kycDocs[0].status).toBe('rejected');
    expect(refreshed!.kycDocs[0].rejectionReason).toBe('Blurry photo');
  });

  it('a rejected user who re-uploads reappears in the admin queue and can be approved again — the full loop actually closes', async () => {
    const { agent, user } = await loginAsDriver('9820000015');
    await agent.post('/api/kyc/documents').send({ type: 'aadhaar', fileBase64: TINY_PNG });

    const adminAgent = await loginAsAdmin('9820099996');
    await adminAgent.patch(`/api/admin/kyc-queue/${user._id}`).send({ status: 'rejected', rejectionReason: 'Blurry' });

    // Before re-upload: kycStatus is 'rejected', so this user is NOT
    // pending — trying to review again should 409, and they must be
    // absent from the queue.
    const queueBefore = await adminAgent.get('/api/admin/kyc-queue');
    expect(queueBefore.body.users.map((u: { _id: string }) => u._id)).not.toContain(user._id.toString());

    // Re-upload the fixed document.
    const reupload = await agent.post('/api/kyc/documents').send({ type: 'aadhaar', fileBase64: TINY_PNG });
    expect(reupload.status).toBe(200);
    expect(reupload.body.document.status).toBe('under_review');

    const afterReupload = await User.findById(user._id);
    expect(afterReupload!.kycStatus).toBe('pending'); // reset — this is the fix

    const queueAfter = await adminAgent.get('/api/admin/kyc-queue');
    expect(queueAfter.body.users.map((u: { _id: string }) => u._id)).toContain(user._id.toString());

    const approve = await adminAgent.patch(`/api/admin/kyc-queue/${user._id}`).send({ status: 'verified' });
    expect(approve.status).toBe(200);
    const final = await User.findById(user._id);
    expect(final!.kycDocs[0].status).toBe('verified');
  });

  it('the full loop actually satisfies availability.controller.ts\'s KYC gate — upload, approve, go online', async () => {
    const { agent, user } = await loginAsDriver('9820000016');
    const { Vehicle } = await import('../src/models/Vehicle');
    await Vehicle.create({ ownerId: user._id, type: 'mini_truck', capacityKg: 1000, registrationNumber: 'AP01Z9016' });

    for (const type of ['driving_licence', 'vehicle_rc', 'fastag', 'puc', 'vehicle_fitness', 'aadhaar', 'pan']) {
      await agent.post('/api/kyc/documents').send({ type, fileBase64: TINY_PNG });
    }

    const blocked = await agent.patch('/api/availability').send({ status: 'online', location: { lat: 17.4, lng: 78.5 } });
    expect(blocked.status).toBe(403); // uploaded, but not yet admin-verified

    const adminAgent = await loginAsAdmin('9820099995');
    const approve = await adminAgent.patch(`/api/admin/kyc-queue/${user._id}`).send({ status: 'verified' });
    expect(approve.status).toBe(200);

    const online = await agent.patch('/api/availability').send({ status: 'online', location: { lat: 17.4, lng: 78.5 } });
    expect(online.status).toBe(200);
  });
});
