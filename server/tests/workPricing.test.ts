import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Mutha } from '../src/models/Mutha';
import { WorkerPricingProfile } from '../src/models/WorkerPricingProfile';
import { SocietyRateFloor } from '../src/models/SocietyRateFloor';
import { Quotation } from '../src/models/Quotation';
import { Booking } from '../src/models/Booking';
import { ServiceCategory } from '../src/models/ServiceCategory';
import { HamaliProfile } from '../src/models/HamaliProfile';
import { signAccessToken } from '../src/services/token.service';

async function loginAs(role: string, phone: string, name = 'U') {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const user = await User.create({ name, phone, passwordHash, role, region: 'Visakhapatnam' });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

const CARPENTER_DRAFT = {
  categorySlug: 'carpenter',
  modesOffered: ['per_unit', 'per_task', 'quotation'],
  perUnit: [
    { unitType: 'sq_ft_face', rate: 300, minimumQuantity: 10, description: 'Wardrobe shutters and visible surfaces' },
    { unitType: 'sq_ft_developed', rate: 220, minimumQuantity: 10 },
  ],
  perTask: [{ taskName: 'Door hinge replacement', fixedPrice: 400, estimatedDurationMinutes: 45 }],
  quotation: { accepts: true, siteVisitFee: 200, siteVisitAdjustable: true, typicalTurnaroundHours: 48 },
};

describe('work-based pricing — publishing rates', () => {
  it('a worker publishes rates in their trade\'s own units', async () => {
    const { agent, user } = await loginAs('hamali_solo', '9960000001');

    const res = await agent.put('/api/pricing/mine').send(CARPENTER_DRAFT);

    expect(res.status).toBe(200);
    expect(res.body.profile.modesOffered).toEqual(['per_unit', 'per_task', 'quotation']);
    const saved = await WorkerPricingProfile.findOne({ workerId: user._id });
    expect(saved?.perUnit).toHaveLength(2);
    expect(saved?.perUnit[0].unitType).toBe('sq_ft_face');
  });

  it('refuses a per-unit rate with no declared unit — the ambiguity this feature exists to remove', async () => {
    const { agent } = await loginAs('hamali_solo', '9960000002');

    const res = await agent.put('/api/pricing/mine').send({
      categorySlug: 'carpenter',
      modesOffered: ['per_unit'],
      perUnit: [{ rate: 300, minimumQuantity: 10 }],
    });

    expect(res.status).toBe(400);
    expect(await WorkerPricingProfile.countDocuments({})).toBe(0);
  });

  it('treats face area and developed area as genuinely different rates', async () => {
    const { agent } = await loginAs('hamali_solo', '9960000003');
    await agent.put('/api/pricing/mine').send(CARPENTER_DRAFT);

    const units = await agent.get('/api/pricing/units');

    expect(units.body.units.sq_ft_face.declaration).toContain('not counted separately');
    expect(units.body.units.sq_ft_developed.declaration).toContain('Every internal shelf');
    expect(units.body.units.sq_ft_face.declaration).not.toBe(units.body.units.sq_ft_developed.declaration);
  });

  it('a customer cannot publish rates at all', async () => {
    const { agent } = await loginAs('customer', '9960000004');
    const res = await agent.put('/api/pricing/mine').send(CARPENTER_DRAFT);
    expect(res.status).toBe(403);
  });
});

describe('work-based pricing — the society floor', () => {
  async function societyWithFloor(minimumRate: number, mode = 'per_unit', unitType?: string) {
    const { agent: leaderAgent, user: leader } = await loginAs('mutha_leader', String(9960001000 + minimumRate));
    const { user: member } = await loginAs('mutha_member', String(9960002000 + minimumRate));
    const mutha = await Mutha.create({
      name: 'Vizag Carpenters Society',
      leaderId: leader._id,
      memberIds: [member._id],
      inviteCode: `FLOOR${minimumRate}`,
    });
    const set = await leaderAgent.put('/api/pricing/society/floors').send({
      categorySlug: 'carpenter',
      mode,
      unitType,
      minimumRate,
    });
    expect(set.status).toBe(200);
    return { leaderAgent, leader, member, mutha };
  }

  it('rejects a member who publishes below the floor, and names the floor', async () => {
    const { member } = await societyWithFloor(250, 'per_unit', 'sq_ft_face');
    const memberAgent = request.agent(app);
    memberAgent.jar.setCookie(
      `accessToken=${signAccessToken({ id: member._id.toString(), role: 'mutha_member' as never })}`
    );

    const res = await memberAgent.put('/api/pricing/mine').send({
      categorySlug: 'carpenter',
      modesOffered: ['per_unit'],
      perUnit: [{ unitType: 'sq_ft_face', rate: 180, minimumQuantity: 10 }],
    });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('250');
    expect(res.body.error).toContain('Vizag Carpenters Society');
    // Enforced in the API, not the UI: nothing was written.
    expect(await WorkerPricingProfile.countDocuments({ workerId: member._id })).toBe(0);
  });

  it('accepts a rate at exactly the floor', async () => {
    const { member } = await societyWithFloor(251, 'per_unit', 'sq_ft_face');
    const memberAgent = request.agent(app);
    memberAgent.jar.setCookie(
      `accessToken=${signAccessToken({ id: member._id.toString(), role: 'mutha_member' as never })}`
    );

    const res = await memberAgent.put('/api/pricing/mine').send({
      categorySlug: 'carpenter',
      modesOffered: ['per_unit'],
      perUnit: [{ unitType: 'sq_ft_face', rate: 251, minimumQuantity: 10 }],
    });

    expect(res.status).toBe(200);
  });

  it('a floor on face area does not bind a developed-area rate', async () => {
    const { member } = await societyWithFloor(252, 'per_unit', 'sq_ft_face');
    const memberAgent = request.agent(app);
    memberAgent.jar.setCookie(
      `accessToken=${signAccessToken({ id: member._id.toString(), role: 'mutha_member' as never })}`
    );

    // ₹180 per DEVELOPED sq ft is a different promise about different work,
    // and the face-area floor says nothing about it.
    const res = await memberAgent.put('/api/pricing/mine').send({
      categorySlug: 'carpenter',
      modesOffered: ['per_unit'],
      perUnit: [{ unitType: 'sq_ft_developed', rate: 180, minimumQuantity: 10 }],
    });

    expect(res.status).toBe(200);
  });

  it('flags existing profiles when the floor rises, without rewriting anyone\'s rate', async () => {
    const { leaderAgent, member } = await societyWithFloor(100, 'per_unit', 'sq_ft_face');
    const memberAgent = request.agent(app);
    memberAgent.jar.setCookie(
      `accessToken=${signAccessToken({ id: member._id.toString(), role: 'mutha_member' as never })}`
    );
    await memberAgent.put('/api/pricing/mine').send({
      categorySlug: 'carpenter',
      modesOffered: ['per_unit'],
      perUnit: [{ unitType: 'sq_ft_face', rate: 150, minimumQuantity: 10 }],
    });

    const raised = await leaderAgent.put('/api/pricing/society/floors').send({
      categorySlug: 'carpenter',
      mode: 'per_unit',
      unitType: 'sq_ft_face',
      minimumRate: 300,
    });

    expect(raised.status).toBe(200);
    expect(raised.body.membersNowBelowFloor).toBe(1);

    const profile = await WorkerPricingProfile.findOne({ workerId: member._id });
    // Flagged, not clamped — the rate is still the worker's own number.
    expect(profile?.societyFloorRespected).toBe(false);
    expect(profile?.perUnit[0].rate).toBe(150);
  });

  it('a worker in no society has no floor', async () => {
    const { agent } = await loginAs('hamali_solo', '9960000009');
    const res = await agent.put('/api/pricing/mine').send({
      categorySlug: 'carpenter',
      modesOffered: ['per_unit'],
      perUnit: [{ unitType: 'sq_ft_face', rate: 5, minimumQuantity: 1 }],
    });
    expect(res.status).toBe(200);
  });

  it('only a leader can move their own society\'s floor', async () => {
    const { member } = await societyWithFloor(260, 'hourly');
    const memberAgent = request.agent(app);
    memberAgent.jar.setCookie(
      `accessToken=${signAccessToken({ id: member._id.toString(), role: 'mutha_member' as never })}`
    );

    const res = await memberAgent
      .put('/api/pricing/society/floors')
      .send({ categorySlug: 'carpenter', mode: 'hourly', minimumRate: 1 });

    expect(res.status).toBe(403);
    const floor = await SocietyRateFloor.findOne({ categorySlug: 'carpenter', mode: 'hourly' });
    expect(floor?.minimumRate).toBe(260);
  });
});

describe('work-based pricing — the four modes', () => {
  async function publishedWorker(phone: string) {
    const { user } = await loginAs('hamali_solo', phone);
    const workerAgent = request.agent(app);
    workerAgent.jar.setCookie(
      `accessToken=${signAccessToken({ id: user._id.toString(), role: 'hamali_solo' as never })}`
    );
    await workerAgent.put('/api/pricing/mine').send({
      ...CARPENTER_DRAFT,
      modesOffered: ['hourly', 'per_unit', 'per_task', 'quotation'],
      hourly: { rate: 250, minimumBlockHours: 2, travelIncluded: false },
    });
    return user;
  }

  it('hourly respects the minimum block', async () => {
    const worker = await publishedWorker('9960000020');
    const { agent } = await loginAs('customer', '9960000021');

    const res = await agent.post('/api/pricing/quote').send({
      workerId: worker._id.toString(),
      categorySlug: 'carpenter',
      mode: 'hourly',
      quantity: 1,
    });

    expect(res.status).toBe(200);
    // One hour asked, two-hour minimum block, so two hours billed.
    expect(res.body.fare.billedQuantity).toBe(2);
    expect(res.body.fare.minimumApplied).toBe(true);
    expect(res.body.fare.total).toBe(500);
  });

  it('per-unit multiplies the published rate by the measured quantity and states the method', async () => {
    const worker = await publishedWorker('9960000022');
    const { agent } = await loginAs('customer', '9960000023');

    const res = await agent.post('/api/pricing/quote').send({
      workerId: worker._id.toString(),
      categorySlug: 'carpenter',
      mode: 'per_unit',
      unitType: 'sq_ft_face',
      quantity: 32,
    });

    expect(res.body.fare.total).toBe(9600); // 32 sq ft x ₹300
    expect(res.body.fare.unitDeclaration).toContain('Front face area');
  });

  it('prices the same job differently under the two sq ft definitions', async () => {
    const worker = await publishedWorker('9960000024');
    const { agent } = await loginAs('customer', '9960000025');

    const face = await agent.post('/api/pricing/quote').send({
      workerId: worker._id.toString(),
      categorySlug: 'carpenter',
      mode: 'per_unit',
      unitType: 'sq_ft_face',
      quantity: 32,
    });
    const developed = await agent.post('/api/pricing/quote').send({
      workerId: worker._id.toString(),
      categorySlug: 'carpenter',
      mode: 'per_unit',
      unitType: 'sq_ft_developed',
      quantity: 48,
    });

    expect(face.body.fare.total).toBe(9600);
    expect(developed.body.fare.total).toBe(10560);
    expect(developed.body.fare.unitDeclaration).not.toBe(face.body.fare.unitDeclaration);
  });

  it('per-task is the published fixed price, with no quantity involved', async () => {
    const worker = await publishedWorker('9960000026');
    const { agent } = await loginAs('customer', '9960000027');

    const res = await agent.post('/api/pricing/quote').send({
      workerId: worker._id.toString(),
      categorySlug: 'carpenter',
      mode: 'per_task',
      taskName: 'Door hinge replacement',
      quantity: 99,
    });

    expect(res.body.fare.total).toBe(400);
  });

  it('quotation charges the frozen accepted total and never recomputes it', async () => {
    const worker = await publishedWorker('9960000028');
    const { agent, user: customer } = await loginAs('customer', '9960000029');

    const quotation = await Quotation.create({
      workerId: worker._id,
      customerId: customer._id,
      categorySlug: 'carpenter',
      status: 'accepted',
      jobDescription: 'Full wardrobe',
      // Line items that would price at 20,000 if anyone recomputed them...
      lineItems: [
        { description: 'Wardrobe', unitType: 'sq_ft_face', quantity: 100, rate: 200, amount: 20000, isMaterial: false, materialIsEstimate: false },
      ],
      total: 20000,
      // ...but 18,000 is the number the customer accepted, so that is the
      // number charged.
      frozenTotal: 18000,
      acceptedAt: new Date(),
    });

    const res = await agent.post('/api/pricing/quote').send({
      workerId: worker._id.toString(),
      categorySlug: 'carpenter',
      mode: 'quotation',
      quotationId: quotation._id.toString(),
    });

    expect(res.body.fare.total).toBe(18000);
  });

  it('refuses to price against a quotation nobody has accepted', async () => {
    const worker = await publishedWorker('9960000030');
    const { agent, user: customer } = await loginAs('customer', '9960000031');
    const quotation = await Quotation.create({
      workerId: worker._id,
      customerId: customer._id,
      categorySlug: 'carpenter',
      status: 'submitted',
      jobDescription: 'Not accepted yet',
      total: 5000,
    });

    const res = await agent.post('/api/pricing/quote').send({
      workerId: worker._id.toString(),
      categorySlug: 'carpenter',
      mode: 'quotation',
      quotationId: quotation._id.toString(),
    });

    expect(res.status).toBe(422);
  });

  it('refuses a mode the worker does not offer', async () => {
    const { user: worker } = await loginAs('hamali_solo', '9960000032');
    const workerAgent = request.agent(app);
    workerAgent.jar.setCookie(
      `accessToken=${signAccessToken({ id: worker._id.toString(), role: 'hamali_solo' as never })}`
    );
    await workerAgent.put('/api/pricing/mine').send({
      categorySlug: 'carpenter',
      modesOffered: ['per_task'],
      perTask: [{ taskName: 'Hinge', fixedPrice: 300 }],
    });

    const { agent } = await loginAs('customer', '9960000033');
    const res = await agent.post('/api/pricing/quote').send({
      workerId: worker._id.toString(),
      categorySlug: 'carpenter',
      mode: 'hourly',
      quantity: 3,
    });

    expect(res.status).toBe(422);
  });
});

describe('work-based pricing — what the customer is shown', () => {
  it('itemises every deduction down to the worker\'s take-home', async () => {
    const { user: worker } = await loginAs('mutha_member', '9960000040');
    const { user: leader } = await loginAs('mutha_leader', '9960000041');
    await Mutha.create({
      name: 'Deducting Society',
      leaderId: leader._id,
      memberIds: [worker._id],
      inviteCode: 'DISCLOSE1',
      commissionRatePct: 6,
      welfareDeductionRatePct: 2,
    });
    const workerAgent = request.agent(app);
    workerAgent.jar.setCookie(
      `accessToken=${signAccessToken({ id: worker._id.toString(), role: 'mutha_member' as never })}`
    );
    await workerAgent.put('/api/pricing/mine').send({
      categorySlug: 'carpenter',
      modesOffered: ['per_task'],
      perTask: [{ taskName: 'Shelf fitting', fixedPrice: 1000 }],
    });

    const { agent } = await loginAs('customer', '9960000042');
    const res = await agent.post('/api/pricing/quote').send({
      workerId: worker._id.toString(),
      categorySlug: 'carpenter',
      mode: 'per_task',
      taskName: 'Shelf fitting',
    });

    const d = res.body.disclosure;
    // Both cuts on gross, neither compounding on the other — the same
    // arithmetic the earnings screen and the commission record use.
    expect(d.total).toBe(1000);
    expect(d.platformFee).toBe(100);
    expect(d.societyReserve).toBe(60);
    expect(d.societyWelfare).toBe(20);
    expect(d.workerTakeHome).toBe(820);
    expect(d.societyName).toBe('Deducting Society');
  });

  it('lists workers by the mode a customer filters on', async () => {
    const { user: hourlyWorker } = await loginAs('hamali_solo', '9960000050');
    const hourlyAgent = request.agent(app);
    hourlyAgent.jar.setCookie(
      `accessToken=${signAccessToken({ id: hourlyWorker._id.toString(), role: 'hamali_solo' as never })}`
    );
    await hourlyAgent.put('/api/pricing/mine').send({
      categorySlug: 'cleaner',
      modesOffered: ['hourly'],
      hourly: { rate: 200, minimumBlockHours: 2, travelIncluded: true },
    });

    const { user: taskWorker } = await loginAs('hamali_solo', '9960000051');
    const taskAgent = request.agent(app);
    taskAgent.jar.setCookie(
      `accessToken=${signAccessToken({ id: taskWorker._id.toString(), role: 'hamali_solo' as never })}`
    );
    await taskAgent.put('/api/pricing/mine').send({
      categorySlug: 'cleaner',
      modesOffered: ['per_task'],
      perTask: [{ taskName: 'Tank cleaning', fixedPrice: 900 }],
    });

    const { agent } = await loginAs('customer', '9960000052');
    const all = await agent.get('/api/pricing/workers').query({ categorySlug: 'cleaner' });
    const hourlyOnly = await agent.get('/api/pricing/workers').query({ categorySlug: 'cleaner', mode: 'hourly' });

    expect(all.body.workers).toHaveLength(2);
    expect(hourlyOnly.body.workers).toHaveLength(1);
    expect(hourlyOnly.body.workers[0].workerId).toBe(hourlyWorker._id.toString());
  });

  it('withholds a worker whose rate fell below a raised floor until they re-price', async () => {
    const { user: leader } = await loginAs('mutha_leader', '9960000060');
    const { user: member } = await loginAs('mutha_member', '9960000061');
    await Mutha.create({
      name: 'Strict Society',
      leaderId: leader._id,
      memberIds: [member._id],
      inviteCode: 'STRICT01',
    });
    const memberAgent = request.agent(app);
    memberAgent.jar.setCookie(
      `accessToken=${signAccessToken({ id: member._id.toString(), role: 'mutha_member' as never })}`
    );
    await memberAgent.put('/api/pricing/mine').send({
      categorySlug: 'painter',
      modesOffered: ['per_unit'],
      perUnit: [{ unitType: 'sq_ft_face', rate: 12, minimumQuantity: 50 }],
    });

    const leaderAgent = request.agent(app);
    leaderAgent.jar.setCookie(
      `accessToken=${signAccessToken({ id: leader._id.toString(), role: 'mutha_leader' as never })}`
    );
    await leaderAgent.put('/api/pricing/society/floors').send({
      categorySlug: 'painter',
      mode: 'per_unit',
      unitType: 'sq_ft_face',
      minimumRate: 25,
    });

    const { agent } = await loginAs('customer', '9960000062');
    const res = await agent.get('/api/pricing/workers').query({ categorySlug: 'painter' });

    expect(res.body.workers).toHaveLength(0);
  });
});

describe('work-based pricing — members can vote a floor into place', () => {
  it('a closed rate_floor poll moves the floor and re-checks every member', async () => {
    const { agent: leaderAgent, user: leader } = await loginAs('mutha_leader', '9960000070');
    const { user: member } = await loginAs('mutha_member', '9960000071');
    const mutha = await Mutha.create({
      name: 'Voting Society',
      leaderId: leader._id,
      memberIds: [member._id],
      inviteCode: 'VOTEFL01',
    });

    const memberAgent = request.agent(app);
    memberAgent.jar.setCookie(
      `accessToken=${signAccessToken({ id: member._id.toString(), role: 'mutha_member' as never })}`
    );
    await memberAgent.put('/api/pricing/mine').send({
      categorySlug: 'plumber',
      modesOffered: ['per_task'],
      perTask: [{ taskName: 'Tap repair', fixedPrice: 120 }],
    });

    // The members who are bound by a floor are the ones who move it — the
    // same mechanism a rate-card poll already uses for the society's own cut.
    const poll = await leaderAgent.post('/api/governance/polls').send({
      question: 'Minimum for a plumbing job?',
      type: 'rate_floor',
      options: [
        { label: '₹250', value: JSON.stringify({ categorySlug: 'plumber', mode: 'per_task', minimumRate: 250 }) },
        { label: 'Leave as is', value: JSON.stringify({ categorySlug: 'plumber', mode: 'per_task', minimumRate: 0 }) },
      ],
      closesAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(poll.status).toBe(201);

    await memberAgent.post(`/api/governance/polls/${poll.body.poll._id}/vote`).send({ optionIndex: 0 });
    const closed = await leaderAgent.post(`/api/governance/polls/${poll.body.poll._id}/close`);

    expect(closed.status).toBe(200);
    const floor = await SocietyRateFloor.findOne({ societyId: mutha._id, categorySlug: 'plumber', mode: 'per_task' });
    expect(floor?.minimumRate).toBe(250);
    expect(floor?.setByPollId?.toString()).toBe(poll.body.poll._id);

    // And the member who priced below it is flagged, not rewritten.
    const profile = await WorkerPricingProfile.findOne({ workerId: member._id });
    expect(profile?.societyFloorRespected).toBe(false);
    expect(profile?.perTask[0].fixedPrice).toBe(120);
  });
});

describe('work-based pricing — booking at a published rate', () => {
  async function publishedCarpenter(phone: string) {
    // The booking path derives its dispatch type from the real category row,
    // so the trade has to exist as a category, not only as a slug on a rate.
    await ServiceCategory.findOneAndUpdate(
      { slug: 'carpenter' },
      {
        $setOnInsert: {
          name: 'Carpenter',
          icon: 'HammerIcon',
          accentColor: 'primary',
          pricingUnit: 'per_job',
          dispatchType: 'hamali',
          defaultDurationMinutes: 60,
          active: true,
        },
      },
      { upsert: true }
    );
    const { user } = await loginAs('hamali_solo', phone, 'Ravi Carpenter');
    const workerAgent = request.agent(app);
    workerAgent.jar.setCookie(
      `accessToken=${signAccessToken({ id: user._id.toString(), role: 'hamali_solo' as never })}`
    );
    await workerAgent.put('/api/pricing/mine').send(CARPENTER_DRAFT);
    return user;
  }

  const WHERE = {
    region: 'Visakhapatnam',
    cargoDetails: { weightKg: 0 },
    pickupLocation: { coordinates: [83.2185, 17.6868], address: 'MVP Colony' },
    dropLocation: { coordinates: [83.2185, 17.6868], address: 'MVP Colony' },
    requiredHamaliCount: 1,
  };

  it('creates a booking priced from the worker\'s own rate, not a fare rule', async () => {
    const worker = await publishedCarpenter('9960000080');
    const { agent } = await loginAs('customer', '9960000081');

    const res = await agent.post('/api/bookings').send({
      ...WHERE,
      serviceCategorySlug: 'carpenter',
      workerId: worker._id.toString(),
      pricingMode: 'per_unit',
      unitType: 'sq_ft_face',
      quantity: 32,
      unitDeclaration: 'Front face area (height x width of the visible surface).',
    });

    expect(res.status).toBe(201);
    const booking = await Booking.findById(res.body.booking._id);
    // 32 sq ft x Rs 300. No fare rule was consulted, and none exists for this
    // trade — the price is the worker's own published number.
    expect(booking?.fareBreakdown.total).toBe(9600);
    expect(booking?.pricingMode).toBe('per_unit');
    expect(booking?.unitType).toBe('sq_ft_face');
    expect(booking?.quantity).toBe(32);
    expect(booking?.preferredWorkerId?.toString()).toBe(worker._id.toString());
  });

  it('freezes the measurement declaration in the words the customer read', async () => {
    const worker = await publishedCarpenter('9960000082');
    const { agent } = await loginAs('customer', '9960000083');

    const res = await agent.post('/api/bookings').send({
      ...WHERE,
      serviceCategorySlug: 'carpenter',
      workerId: worker._id.toString(),
      pricingMode: 'per_unit',
      unitType: 'sq_ft_developed',
      quantity: 45,
      // The Telugu customer saw this sentence, so this is what is frozen.
      unitDeclaration: 'మొత్తం విస్తీర్ణం: లోపలి ప్రతి అర కొలిచి లెక్కిస్తారు.',
    });

    const booking = await Booking.findById(res.body.booking._id);
    expect(booking?.frozenUnitDeclaration).toContain('లోపలి ప్రతి అర');
  });

  it('falls back to the canonical declaration when the client sends none', async () => {
    const worker = await publishedCarpenter('9960000084');
    const { agent } = await loginAs('customer', '9960000085');

    const res = await agent.post('/api/bookings').send({
      ...WHERE,
      serviceCategorySlug: 'carpenter',
      workerId: worker._id.toString(),
      pricingMode: 'per_unit',
      unitType: 'sq_ft_face',
      quantity: 10,
    });

    const booking = await Booking.findById(res.body.booking._id);
    expect(booking?.frozenUnitDeclaration).toContain('Front face area');
  });

  it('offers a directly-hired job to that worker and to nobody else', async () => {
    const worker = await publishedCarpenter('9960000086');
    const { agent } = await loginAs('customer', '9960000087');
    await agent.post('/api/bookings').send({
      ...WHERE,
      serviceCategorySlug: 'carpenter',
      workerId: worker._id.toString(),
      pricingMode: 'per_task',
      taskName: 'Door hinge replacement',
    });

    // Another hamali, online and in range, must not see a job that was raised
    // for someone by name.
    const { user: other } = await loginAs('hamali_solo', '9960000088');
    const otherAgent = request.agent(app);
    otherAgent.jar.setCookie(
      `accessToken=${signAccessToken({ id: other._id.toString(), role: 'hamali_solo' as never })}`
    );
    await HamaliProfile.create({
      userId: other._id,
      type: 'solo',
      availabilityStatus: 'online',
      currentLocation: { type: 'Point', coordinates: [83.2185, 17.6868] },
    });

    const open = await otherAgent.get('/api/requests');
    expect(open.status).toBe(200);
    expect(open.body.requests).toHaveLength(0);
  });

  it('refuses to book a worker who has not published that service', async () => {
    const worker = await publishedCarpenter('9960000089');
    const { agent } = await loginAs('customer', '9960000090');

    await ServiceCategory.findOneAndUpdate(
      { slug: 'plumber' },
      {
        $setOnInsert: {
          name: 'Plumber',
          icon: 'PipeIcon',
          accentColor: 'primary',
          pricingUnit: 'per_job',
          dispatchType: 'hamali',
          defaultDurationMinutes: 60,
          active: true,
        },
      },
      { upsert: true }
    );
    const res = await agent.post('/api/bookings').send({
      ...WHERE,
      serviceCategorySlug: 'plumber',
      workerId: worker._id.toString(),
      pricingMode: 'per_task',
      taskName: 'Tap repair',
    });

    expect(res.status).toBe(404);
  });

  it('quotes before anything is created, through the same function', async () => {
    const worker = await publishedCarpenter('9960000091');
    const { agent, user: customer } = await loginAs('customer', '9960000092');

    const quote = await agent.post('/api/bookings/quote').send({
      serviceCategorySlug: 'carpenter',
      workerId: worker._id.toString(),
      pricingMode: 'per_unit',
      unitType: 'sq_ft_face',
      quantity: 20,
      ...WHERE,
    });

    expect(quote.status).toBe(200);
    expect(quote.body.fareBreakdown.total).toBe(6000);
    expect(await Booking.countDocuments({ customerId: customer._id })).toBe(0);
  });
});
