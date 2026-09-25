import './setup';
import request from 'supertest';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Vehicle } from '../src/models/Vehicle';
import { Booking } from '../src/models/Booking';
import { LedgerEntry } from '../src/models/LedgerEntry';
import { AuditLog } from '../src/models/AuditLog';
import { Dispute } from '../src/models/Dispute';
import { signAccessToken } from '../src/services/token.service';
import { runAutoConfirm, revealCompletionCode, MAX_CODE_ATTEMPTS } from '../src/services/completion.service';
import { findUnratedCompletedBooking } from '../src/services/ratingGate.service';
import { SYSTEM_ACTOR_ID } from '../src/services/audit.service';

/*
 * P0.2 — the customer, not the worker, decides a job is done.
 */

const PICKUP: [number, number] = [78.4867, 17.385];
const DROP: [number, number] = [78.5, 17.4];
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let seq = 0;
async function agentFor(role: string) {
  seq += 1;
  const user = await User.create({ name: 'U', phone: `98220${String(seq).padStart(5, '0')}`, passwordHash: 'x', role });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

/** A truck job accepted by an online driver and started. */
async function startedJob(total = 400) {
  const { agent: customer, user: cust } = await agentFor('customer');
  const { agent: driver, user: drv } = await agentFor('driver');
  await Vehicle.create({
    ownerId: drv._id,
    type: 'mini_truck',
    capacityKg: 1000,
    registrationNumber: `AP09CC${String(seq).padStart(4, '0')}`,
    availabilityStatus: 'on_job',
    currentLocation: { type: 'Point', coordinates: PICKUP },
  });
  const booking = await Booking.create({
    customerId: cust._id,
    type: 'truck',
    cargoDetails: { weightKg: 500 },
    pickupLocation: { type: 'Point', coordinates: PICKUP, address: 'Pickup' },
    dropLocation: { type: 'Point', coordinates: DROP, address: 'Drop' },
    requiredVehicles: [{ capacityKg: 500, count: 1 }],
    assignedDriverIds: [drv._id],
    status: 'accepted',
    fareBreakdown: { baseFare: total, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 0, total },
    statusHistory: [{ status: 'accepted', timestamp: new Date() }],
  });
  const start = await driver.post(`/api/requests/${booking._id}/start`);
  expect(start.status).toBe(200);
  return { customer, cust, driver, drv, bookingId: booking._id.toString(), start };
}

const feeCount = (bookingId: string) => LedgerEntry.countDocuments({ type: 'fee', entityType: 'Booking', entityId: bookingId });

describe('the completion code', () => {
  it('is shown only to the customer, and never in the worker response', async () => {
    const { customer, bookingId, start } = await startedJob();
    const code = await revealCompletionCode(bookingId);
    expect(code).toMatch(/^\d{4}$/);

    const workerView = JSON.stringify(start.body);
    expect(workerView).not.toContain('completionCodeHash');
    expect(workerView).not.toContain('completionCodeCipher');
    expect(start.body.completionCode).toBeUndefined();
    const mine = await customer.get(`/api/bookings/${bookingId}`);
    expect(mine.body.completionCode).toBe(code);
    expect(JSON.stringify(mine.body.booking)).not.toContain('completionCodeHash');

    const { agent: stranger } = await agentFor('customer');
    expect((await stranger.get(`/api/bookings/${bookingId}`)).status).toBe(404);
  });

  it('with a delivery photo, completes the job on the spot and settles', async () => {
    const { driver, bookingId } = await startedJob();
    await driver.post(`/api/requests/${bookingId}/proof-photo`).send({ stage: 'delivery', imageBase64: PHOTO });
    const code = (await revealCompletionCode(bookingId))!;

    const res = await driver.post(`/api/requests/${bookingId}/complete`).send({ code });
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('completed');
    expect(res.body.booking.completedVia).toBe('code');
    expect(await feeCount(bookingId)).toBe(1);
    // Spent: no code shown after completion.
    expect(await revealCompletionCode(bookingId)).toBeNull();
  });

  it('needs a photo of the finished work before the code is accepted', async () => {
    const { driver, bookingId } = await startedJob();
    const code = (await revealCompletionCode(bookingId))!;
    const res = await driver.post(`/api/requests/${bookingId}/complete`).send({ code });
    expect(res.status).toBe(400);
    expect((await Booking.findById(bookingId))!.status).toBe('in_progress');
  });

  it('rejects a wrong code, and locks after repeated wrong codes', async () => {
    const { driver, bookingId } = await startedJob();
    await driver.post(`/api/requests/${bookingId}/proof-photo`).send({ stage: 'delivery', imageBase64: PHOTO });
    const real = (await revealCompletionCode(bookingId))!;
    const wrong = real === '0000' ? '1111' : '0000';

    for (let i = 0; i < MAX_CODE_ATTEMPTS - 1; i += 1) {
      const r = await driver.post(`/api/requests/${bookingId}/complete`).send({ code: wrong });
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/not right/);
    }
    const last = await driver.post(`/api/requests/${bookingId}/complete`).send({ code: wrong });
    expect(last.body.error).toMatch(/Too many wrong codes/);
    // Even the right code no longer works: guessing is not a path to settlement.
    const right = await driver.post(`/api/requests/${bookingId}/complete`).send({ code: real });
    expect(right.status).toBe(400);
    expect(await feeCount(bookingId)).toBe(0);
  });
});

describe('without the code', () => {
  it('waits for the customer, frees the worker, and settles nothing', async () => {
    const { customer, cust, driver, drv, bookingId } = await startedJob();
    const res = await driver.post(`/api/requests/${bookingId}/complete`);
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('awaiting_confirmation');
    expect((await Vehicle.findOne({ ownerId: drv._id }))!.availabilityStatus).toBe('online');

    expect(await feeCount(bookingId)).toBe(0);
    expect(await findUnratedCompletedBooking(cust._id.toString())).toBeNull();
    expect((await customer.post(`/api/payments/order/${bookingId}`)).status).toBe(400);
    expect((await customer.get(`/api/bookings/${bookingId}/guarantee`)).body.eligible ?? false).toBe(false);
  });

  it('completes and settles once when the customer confirms', async () => {
    const { customer, driver, bookingId } = await startedJob();
    await driver.post(`/api/requests/${bookingId}/complete`);

    const ok = await customer.post(`/api/bookings/${bookingId}/confirm-completion`);
    expect(ok.status).toBe(200);
    expect(ok.body.booking.status).toBe('completed');
    expect(ok.body.booking.completedVia).toBe('customer');
    expect(await feeCount(bookingId)).toBe(1);

    expect((await customer.post(`/api/bookings/${bookingId}/confirm-completion`)).status).toBe(400);
    expect(await feeCount(bookingId)).toBe(1);
  });

  it('cannot be confirmed by the worker or by another customer', async () => {
    const { driver, bookingId } = await startedJob();
    await driver.post(`/api/requests/${bookingId}/complete`);
    expect((await driver.post(`/api/bookings/${bookingId}/confirm-completion`)).status).toBe(403);
    const { agent: stranger } = await agentFor('customer');
    expect((await stranger.post(`/api/bookings/${bookingId}/confirm-completion`)).status).toBe(404);
  });

  it('cannot be cancelled once the work is done', async () => {
    const { customer, driver, bookingId } = await startedJob();
    await driver.post(`/api/requests/${bookingId}/complete`);
    expect((await customer.patch(`/api/bookings/${bookingId}/cancel`)).status).toBe(400);
  });
});

describe('reporting a problem', () => {
  it('opens a dispute and holds settlement until it is resolved', async () => {
    const { customer, driver, bookingId } = await startedJob();
    await driver.post(`/api/requests/${bookingId}/complete`);

    const rep = await customer
      .post(`/api/bookings/${bookingId}/report-problem`)
      .send({ description: 'The tap still leaks after the repair.' });
    expect(rep.status).toBe(201);
    expect(rep.body.booking.settlementHeld).toBe(true);
    expect(await Dispute.countDocuments({ bookingId })).toBe(1);

    // Held: neither the customer's confirm nor the auto-confirm settles.
    expect((await customer.post(`/api/bookings/${bookingId}/confirm-completion`)).status).toBe(409);
    await Booking.updateOne({ _id: bookingId }, { workDoneAt: new Date(Date.now() - 48 * 3600_000) });
    await runAutoConfirm();
    expect((await Booking.findById(bookingId))!.status).toBe('awaiting_confirmation');
    expect(await feeCount(bookingId)).toBe(0);

    const { agent: admin } = await agentFor('admin');
    const dispute = await Dispute.findOne({ bookingId });
    const resolve = await admin
      .patch(`/api/admin/disputes/${dispute!._id}/resolve`)
      .send({ action: 'reject', note: 'Photo shows the joint sealed; customer agreed on call.' });
    expect(resolve.status).toBe(200);
    expect((await Booking.findById(bookingId))!.settlementHeld).toBe(false);

    expect(await runAutoConfirm()).toBe(1);
    expect((await Booking.findById(bookingId))!.status).toBe('completed');
    expect(await feeCount(bookingId)).toBe(1);
  });

  it('validates the description', async () => {
    const { customer, driver, bookingId } = await startedJob();
    await driver.post(`/api/requests/${bookingId}/complete`);
    expect((await customer.post(`/api/bookings/${bookingId}/report-problem`).send({ description: 'bad' })).status).toBe(400);
  });
});

describe('auto-confirm', () => {
  it('confirms a job left waiting past the window, and audits it as the system', async () => {
    const { driver, bookingId } = await startedJob();
    await driver.post(`/api/requests/${bookingId}/complete`);

    expect(await runAutoConfirm()).toBe(0); // not due yet
    await Booking.updateOne({ _id: bookingId }, { workDoneAt: new Date(Date.now() - 25 * 3600_000) });
    expect(await runAutoConfirm()).toBe(1);

    const b = await Booking.findById(bookingId);
    expect(b!.status).toBe('completed');
    expect(b!.completedVia).toBe('auto');
    const audit = await AuditLog.findOne({ action: 'booking_completed_auto', targetId: bookingId });
    expect(audit!.actorId.toString()).toBe(SYSTEM_ACTOR_ID);
  });

  it('settles once when the customer confirms as the auto-confirm fires', async () => {
    const { customer, driver, bookingId } = await startedJob();
    await driver.post(`/api/requests/${bookingId}/complete`);
    await Booking.updateOne({ _id: bookingId }, { workDoneAt: new Date(Date.now() - 25 * 3600_000) });

    await Promise.all([runAutoConfirm(), customer.post(`/api/bookings/${bookingId}/confirm-completion`)]);
    expect((await Booking.findById(bookingId))!.status).toBe('completed');
    expect(await feeCount(bookingId)).toBe(1);
  });
});
