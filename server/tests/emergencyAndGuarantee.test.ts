import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { Complaint } from '../src/models/Complaint';
import { ServiceCategory } from '../src/models/ServiceCategory';
import { EmergencyAlert } from '../src/models/EmergencyAlert';
import { AuditLog } from '../src/models/AuditLog';
import { signAccessToken } from '../src/services/token.service';

const PICKUP: [number, number] = [83.2185, 17.6868];
const DROP: [number, number] = [83.3, 17.7];

async function loginAs(role: string, phone: string, name = 'U') {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const user = await User.create({ name, phone, passwordHash, role, region: 'Visakhapatnam' });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function completedBooking(customerId: string, slug: string | undefined, completedDaysAgo = 0) {
  const completedAt = new Date(Date.now() - completedDaysAgo * 24 * 60 * 60 * 1000);
  return Booking.create({
    customerId,
    type: 'hamali',
    cargoDetails: { weightKg: 0 },
    serviceCategorySlug: slug,
    pickupLocation: { type: 'Point', coordinates: PICKUP, address: 'Pickup' },
    dropLocation: { type: 'Point', coordinates: DROP, address: 'Drop' },
    requiredHamaliCount: 1,
    status: 'completed',
    fareBreakdown: { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 500, total: 500 },
    statusHistory: [{ status: 'completed', timestamp: completedAt }],
  });
}

describe('SOS / emergency alerts', () => {
  it('lets any authenticated role raise one, with or without a location', async () => {
    const { agent } = await loginAs('hamali_solo', '9930000001');

    const withLocation = await agent.post('/api/emergency').send({ kind: 'unsafe', lat: 17.68, lng: 83.21 });
    expect(withLocation.status).toBe(201);
    expect(withLocation.body.alert.status).toBe('open');

    // A second person, no location at all — denying location permission must
    // never be the reason a call for help does not go out.
    const { agent: customer } = await loginAs('customer', '9930000002');
    const withoutLocation = await customer.post('/api/emergency').send({ kind: 'medical' });
    expect(withoutLocation.status).toBe(201);
    expect(withoutLocation.body.alert.location).toBeUndefined();
  });

  it('does not duplicate an alert when someone presses twice', async () => {
    const { agent, user } = await loginAs('driver', '9930000003');
    await agent.post('/api/emergency').send({ kind: 'accident' });
    const second = await agent.post('/api/emergency').send({ kind: 'accident' });

    expect(second.status).toBe(200);
    expect(second.body.alreadyOpen).toBe(true);
    expect(await EmergencyAlert.countDocuments({ raisedByUserId: user._id })).toBe(1);
  });

  it('audit-logs the raise', async () => {
    const { agent } = await loginAs('driver', '9930000004');
    await agent.post('/api/emergency').send({ kind: 'vehicle' });
    expect(await AuditLog.countDocuments({ action: 'emergency_alert_raised' })).toBeGreaterThan(0);
  });

  it('only admin and manager can see or act on the queue', async () => {
    const { agent: worker } = await loginAs('driver', '9930000005');
    const raised = await worker.post('/api/emergency').send({ kind: 'accident' });

    expect((await worker.get('/api/emergency')).status).toBe(403);
    expect((await worker.patch(`/api/emergency/${raised.body.alert._id}/acknowledge`)).status).toBe(403);

    const { agent: admin } = await loginAs('admin', '9930000006');
    const queue = await admin.get('/api/emergency');
    expect(queue.status).toBe(200);
    expect(queue.body.alerts).toHaveLength(1);

    const ack = await admin.patch(`/api/emergency/${raised.body.alert._id}/acknowledge`);
    expect(ack.status).toBe(200);
    expect(ack.body.alert.status).toBe('acknowledged');

    const resolved = await admin
      .patch(`/api/emergency/${raised.body.alert._id}/resolve`)
      .send({ resolutionNote: 'Spoke to the driver, help dispatched.' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.alert.status).toBe('resolved');
  });

  it('a worker sees only their own alerts', async () => {
    const { agent: a } = await loginAs('driver', '9930000007');
    await a.post('/api/emergency').send({ kind: 'accident', note: 'MY-OWN-ALERT' });
    const { agent: b } = await loginAs('driver', '9930000008');

    const mine = await b.get('/api/emergency/mine');
    expect(mine.status).toBe(200);
    expect(JSON.stringify(mine.body)).not.toContain('MY-OWN-ALERT');
  });
});

describe('workmanship guarantee', () => {
  async function eligibleCategory() {
    return ServiceCategory.create({
      name: 'Carpenter',
      slug: 'carpenter',
      icon: 'HammerIcon',
      accentColor: 'primary',
      pricingUnit: 'per_job',
      dispatchType: 'hamali',
      defaultDurationMinutes: 60,
      guaranteeEligible: true,
      guaranteePeriodDays: 7,
      active: true,
    });
  }

  it('is claimable inside the window, and the claim becomes a real complaint', async () => {
    await eligibleCategory();
    const { agent, user } = await loginAs('customer', '9930000010');
    const booking = await completedBooking(user._id.toString(), 'carpenter', 1);

    const status = await agent.get(`/api/bookings/${booking._id}/guarantee`);
    expect(status.status).toBe(200);
    expect(status.body.guarantee.eligible).toBe(true);
    expect(status.body.guarantee.daysLeft).toBeGreaterThan(0);

    const claim = await agent
      .post(`/api/bookings/${booking._id}/guarantee-claim`)
      .send({ description: 'The wardrobe door came loose within a day.' });
    expect(claim.status).toBe(201);

    const complaint = await Complaint.findById(claim.body.complaintId);
    expect(complaint?.category).toBe('workmanship');
    expect(complaint?.raisedByUserId.toString()).toBe(user._id.toString());
  });

  it('refuses a claim after the window closes', async () => {
    await eligibleCategory();
    const { agent, user } = await loginAs('customer', '9930000011');
    const booking = await completedBooking(user._id.toString(), 'carpenter', 30);

    const status = await agent.get(`/api/bookings/${booking._id}/guarantee`);
    expect(status.body.guarantee.eligible).toBe(false);
    expect(status.body.guarantee.reason).toBe('window_expired');

    const claim = await agent
      .post(`/api/bookings/${booking._id}/guarantee-claim`)
      .send({ description: 'Far too late to claim this one.' });
    expect(claim.status).toBe(400);
    expect(await Complaint.countDocuments({ category: 'workmanship' })).toBe(0);
  });

  it('refuses a second claim on the same job', async () => {
    await eligibleCategory();
    const { agent, user } = await loginAs('customer', '9930000012');
    const booking = await completedBooking(user._id.toString(), 'carpenter', 0);

    await agent.post(`/api/bookings/${booking._id}/guarantee-claim`).send({ description: 'First claim, valid one.' });
    const second = await agent
      .post(`/api/bookings/${booking._id}/guarantee-claim`)
      .send({ description: 'Second claim on the same job.' });

    expect(second.status).toBe(400);
    expect(await Complaint.countDocuments({ category: 'workmanship' })).toBe(1);
  });

  it('says plainly that a category without a guarantee has none', async () => {
    await ServiceCategory.create({
      name: 'Cargo',
      slug: 'general_logistics',
      icon: 'TruckIcon',
      accentColor: 'primary',
      pricingUnit: 'per_km',
      dispatchType: 'truck',
      defaultDurationMinutes: 60,
      guaranteeEligible: false,
      active: true,
    });
    const { agent, user } = await loginAs('customer', '9930000013');
    const booking = await completedBooking(user._id.toString(), 'general_logistics', 0);

    const status = await agent.get(`/api/bookings/${booking._id}/guarantee`);
    expect(status.body.guarantee.eligible).toBe(false);
    expect(status.body.guarantee.reason).toBe('category_not_eligible');
  });

  it('cannot be claimed on someone else\'s booking', async () => {
    await eligibleCategory();
    const { user: owner } = await loginAs('customer', '9930000014');
    const booking = await completedBooking(owner._id.toString(), 'carpenter', 0);
    const { agent: intruder } = await loginAs('customer', '9930000015');

    const res = await intruder
      .post(`/api/bookings/${booking._id}/guarantee-claim`)
      .send({ description: 'Not my booking at all, but let me try.' });

    expect(res.status).toBe(404);
    expect(await Complaint.countDocuments({})).toBe(0);
  });
});
