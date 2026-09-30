import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { Quotation } from '../src/models/Quotation';
import { VariationOrder } from '../src/models/VariationOrder';
import { ServiceCategory } from '../src/models/ServiceCategory';
import { WorkerPricingProfile } from '../src/models/WorkerPricingProfile';
import { signAccessToken } from '../src/services/token.service';

async function loginAs(role: string, phone: string, name = 'U') {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const user = await User.create({ name, phone, passwordHash, role, region: 'Visakhapatnam' });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function carpenterCategory() {
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
}

/** A worker who takes quotation work, and a customer who wants some. */
async function pair(seed: number) {
  await carpenterCategory();
  const { agent: workerAgent, user: worker } = await loginAs('hamali_solo', String(9970000000 + seed), 'Ravi');
  await workerAgent.put('/api/pricing/mine').send({
    categorySlug: 'carpenter',
    modesOffered: ['quotation'],
    quotation: { accepts: true, siteVisitFee: 200, siteVisitAdjustable: true, typicalTurnaroundHours: 48 },
  });
  const { agent: customerAgent, user: customer } = await loginAs('customer', String(9971000000 + seed));
  return { workerAgent, worker, customerAgent, customer };
}

const WHERE = { coordinates: [83.2185, 17.6868], address: 'MVP Colony, Visakhapatnam', region: 'Visakhapatnam' };

interface LineDraft {
  description: string;
  unitType?: string;
  quantity: number;
  rate: number;
  amount?: number;
  isMaterial: boolean;
  materialIsEstimate?: boolean;
}

const WARDROBE_LINES: LineDraft[] = [
  { description: 'Wardrobe shutters', unitType: 'sq_ft_face', quantity: 32, rate: 300, isMaterial: false },
  { description: 'Plywood and hardware', quantity: 1, rate: 8000, isMaterial: true, materialIsEstimate: true },
];

/** Over the ₹25,000 milestone threshold — a whole-flat job rather than one unit. */
const BIG_JOB_LINES: LineDraft[] = [
  { description: 'Full bedroom set', unitType: 'sq_ft_face', quantity: 120, rate: 300, isMaterial: false },
  { description: 'Plywood, laminate and hardware', quantity: 1, rate: 14000, isMaterial: true, materialIsEstimate: true },
];

/** Walks a quotation all the way to "submitted". */
async function upToSubmitted(seed: number, lines: LineDraft[] = WARDROBE_LINES) {
  const p = await pair(seed);
  const created = await p.customerAgent.post('/api/quotations').send({
    workerId: p.worker._id.toString(),
    categorySlug: 'carpenter',
    jobDescription: 'Full wardrobe in the bedroom, floor to ceiling.',
  });
  expect(created.status).toBe(201);
  const id = created.body.quotation._id;

  await p.workerAgent
    .post(`/api/quotations/${id}/schedule-visit`)
    .send({ scheduledAt: new Date(Date.now() + 86_400_000).toISOString() });
  await p.workerAgent.post(`/api/quotations/${id}/visit-done`);
  const submitted = await p.workerAgent.post(`/api/quotations/${id}/submit`).send({ lineItems: lines });
  expect(submitted.status).toBe(200);

  return { ...p, id };
}

describe('quotation — the path from request to agreed price', () => {
  it('walks request, visit, quote, accept — and freezes the total at acceptance', async () => {
    const { customerAgent, id } = await upToSubmitted(1);

    const before = await Quotation.findById(id);
    // 32 x 300 labour, 8000 materials, kept apart on the document.
    expect(before?.labourSubtotal).toBe(9600);
    expect(before?.materialSubtotal).toBe(8000);
    expect(before?.total).toBe(17600);
    expect(before?.frozenTotal).toBeUndefined();
    expect(before?.validUntil).toBeTruthy();

    const accepted = await customerAgent.post(`/api/quotations/${id}/accept`).send(WHERE);
    expect(accepted.status).toBe(200);

    const after = await Quotation.findById(id);
    expect(after?.status).toBe('accepted');
    expect(after?.frozenTotal).toBe(17600);

    // The booking the work happens under charges exactly that.
    const booking = await Booking.findById(accepted.body.bookingId);
    // The agreed quotation is the worker's rate; the customer pays it plus
    // the 10% service fee (P1.1).
    expect(booking?.fareBreakdown.workerRate).toBe(17600);
    expect(booking?.fareBreakdown.total).toBe(19360);
    expect(booking?.pricingMode).toBe('quotation');
    expect(booking?.quotationId?.toString()).toBe(id);
  });

  it('copies the visit fee from the profile at request time', async () => {
    const { id } = await upToSubmitted(2);
    const quotation = await Quotation.findById(id);
    expect(quotation?.siteVisit?.fee).toBe(200);
    expect(quotation?.siteVisit?.feeAdjustable).toBe(true);
  });

  it('refuses to quote before the visit has happened', async () => {
    const { workerAgent, worker, customerAgent } = await pair(3);
    const created = await customerAgent.post('/api/quotations').send({
      workerId: worker._id.toString(),
      categorySlug: 'carpenter',
      jobDescription: 'Something that has not been looked at yet.',
    });

    const res = await workerAgent
      .post(`/api/quotations/${created.body.quotation._id}/submit`)
      .send({ lineItems: WARDROBE_LINES });

    expect(res.status).toBe(409);
  });

  it('refuses a quotation request to a worker who does not take that work', async () => {
    await carpenterCategory();
    const { user: worker } = await loginAs('hamali_solo', '9970009001');
    const { agent: customerAgent } = await loginAs('customer', '9971009001');

    const res = await customerAgent.post('/api/quotations').send({
      workerId: worker._id.toString(),
      categorySlug: 'carpenter',
      jobDescription: 'This worker has published no rates at all.',
    });

    expect(res.status).toBe(422);
  });

  it('recomputes every line amount rather than trusting the one sent', async () => {
    const { id } = await upToSubmitted(4, [
      // A line claiming its own total is 1 rupee. The server does the maths.
      { description: 'Creative arithmetic', quantity: 10, rate: 500, amount: 1, isMaterial: false },
    ]);
    const quotation = await Quotation.findById(id);
    expect(quotation?.lineItems[0].amount).toBe(5000);
    expect(quotation?.total).toBe(5000);
  });
});

describe('quotation — negotiation keeps both versions', () => {
  it('allows one round of changes and retains what it replaced', async () => {
    const { customerAgent, workerAgent, id } = await upToSubmitted(5);

    const asked = await customerAgent
      .post(`/api/quotations/${id}/negotiate`)
      .send({ note: 'Can you drop the material cost?' });
    expect(asked.status).toBe(200);
    expect(asked.body.quotation.status).toBe('negotiating');

    const revised = await workerAgent.post(`/api/quotations/${id}/submit`).send({
      lineItems: [
        { description: 'Wardrobe shutters', unitType: 'sq_ft_face', quantity: 32, rate: 300, isMaterial: false },
        { description: 'Plywood and hardware', quantity: 1, rate: 6000, isMaterial: true, materialIsEstimate: true },
      ],
    });
    expect(revised.status).toBe(200);

    const quotation = await Quotation.findById(id);
    expect(quotation?.total).toBe(15600);
    // Both the original and the customer's ask are still on the record.
    expect(quotation?.revisions.length).toBeGreaterThanOrEqual(2);
    expect(quotation?.revisions[0].total).toBe(17600);
    expect(quotation?.revisions.some((r) => r.note?.includes('material cost'))).toBe(true);
  });

  it('allows only one round', async () => {
    const { customerAgent, workerAgent, id } = await upToSubmitted(6);
    await customerAgent.post(`/api/quotations/${id}/negotiate`).send({ note: 'First ask.' });
    await workerAgent.post(`/api/quotations/${id}/submit`).send({ lineItems: WARDROBE_LINES });

    const second = await customerAgent.post(`/api/quotations/${id}/negotiate`).send({ note: 'Second ask.' });

    expect(second.status).toBe(409);
  });
});

describe('quotation — after acceptance the price cannot move on its own', () => {
  it('refuses a re-submission once accepted', async () => {
    const { customerAgent, workerAgent, id } = await upToSubmitted(7);
    await customerAgent.post(`/api/quotations/${id}/accept`).send(WHERE);

    const res = await workerAgent.post(`/api/quotations/${id}/submit`).send({
      lineItems: [{ description: 'Much more expensive now', quantity: 1, rate: 99999, isMaterial: false }],
    });

    expect(res.status).toBe(409);
    const quotation = await Quotation.findById(id);
    expect(quotation?.frozenTotal).toBe(17600);
    expect(quotation?.total).toBe(17600);
  });

  it('refuses a second acceptance', async () => {
    const { customerAgent, id } = await upToSubmitted(8);
    await customerAgent.post(`/api/quotations/${id}/accept`).send(WHERE);
    const again = await customerAgent.post(`/api/quotations/${id}/accept`).send(WHERE);
    expect(again.status).toBe(409);
  });

  it('a variation does nothing at all until the customer approves it', async () => {
    const { customerAgent, workerAgent, id } = await upToSubmitted(9);
    const accepted = await customerAgent.post(`/api/quotations/${id}/accept`).send(WHERE);
    const bookingId = accepted.body.bookingId;

    const raised = await workerAgent.post(`/api/quotations/${id}/variations`).send({
      description: 'The back wall needed levelling before the unit could be fixed.',
      amount: 2500,
    });
    expect(raised.status).toBe(201);

    // Requested is not approved: the bill has not moved.
    let booking = await Booking.findById(bookingId);
    expect(booking?.fareBreakdown.workerRate).toBe(17600);

    const approved = await customerAgent
      .post(`/api/quotations/variations/${raised.body.variation._id}/decide`)
      .send({ approve: true });
    expect(approved.status).toBe(200);

    booking = await Booking.findById(bookingId);
    // The variation moves the worker's rate; the fee follows at the frozen 10%.
    expect(booking?.fareBreakdown.workerRate).toBe(20100);
    expect(booking?.fareBreakdown.total).toBe(22110);

    // The agreed figure is untouched — the variation is a documented addition
    // to it, not a rewrite of it.
    const quotation = await Quotation.findById(id);
    expect(quotation?.frozenTotal).toBe(17600);
  });

  it('a rejected variation leaves the bill alone', async () => {
    const { customerAgent, workerAgent, id } = await upToSubmitted(10);
    const accepted = await customerAgent.post(`/api/quotations/${id}/accept`).send(WHERE);
    const raised = await workerAgent
      .post(`/api/quotations/${id}/variations`)
      .send({ description: 'Extra work the customer did not want.', amount: 5000 });

    await customerAgent
      .post(`/api/quotations/variations/${raised.body.variation._id}/decide`)
      .send({ approve: false, note: 'Not needed.' });

    const booking = await Booking.findById(accepted.body.bookingId);
    expect(booking?.fareBreakdown.workerRate).toBe(17600);
    expect(booking?.fareBreakdown.total).toBe(19360);
  });

  it('a variation cannot be raised before anything was agreed', async () => {
    const { workerAgent, id } = await upToSubmitted(11);
    const res = await workerAgent
      .post(`/api/quotations/${id}/variations`)
      .send({ description: 'Trying to add work to an unaccepted quote.', amount: 1000 });
    expect(res.status).toBe(409);
  });

  it('only the customer on the quotation can decide its variations', async () => {
    const { customerAgent, workerAgent, id } = await upToSubmitted(12);
    await customerAgent.post(`/api/quotations/${id}/accept`).send(WHERE);
    const raised = await workerAgent
      .post(`/api/quotations/${id}/variations`)
      .send({ description: 'Levelling work.', amount: 1000 });

    const { agent: stranger } = await loginAs('customer', '9971009012');
    const res = await stranger
      .post(`/api/quotations/variations/${raised.body.variation._id}/decide`)
      .send({ approve: true });

    expect(res.status).toBe(403);
    const variation = await VariationOrder.findById(raised.body.variation._id);
    expect(variation?.status).toBe('requested');
  });
});

describe('quotation — validity, milestones and scoping', () => {
  it('refuses to accept an expired quotation and says so', async () => {
    const { customerAgent, id } = await upToSubmitted(13);
    await Quotation.findByIdAndUpdate(id, { validUntil: new Date(Date.now() - 1000) });

    const res = await customerAgent.post(`/api/quotations/${id}/accept`).send(WHERE);

    expect(res.status).toBe(409);
    expect(res.body.details?.reason).toBe('quotation_expired');
    const quotation = await Quotation.findById(id);
    expect(quotation?.status).toBe('expired');
    expect(quotation?.frozenTotal).toBeUndefined();
  });

  it('builds a milestone schedule only above the threshold', async () => {
    // ₹50,000 of work: an advance, a progress payment and a final one.
    const big = await upToSubmitted(14, BIG_JOB_LINES);
    await big.customerAgent.post(`/api/quotations/${big.id}/accept`).send(WHERE);
    const bigQuotation = await Quotation.findById(big.id);
    expect(bigQuotation?.total).toBe(50000);
    expect(bigQuotation?.milestones).toHaveLength(3);
    expect(bigQuotation?.milestones.reduce((s, m) => s + m.amount, 0)).toBeCloseTo(50000, 1);

    const small = await upToSubmitted(15, [
      { description: 'One shelf', quantity: 1, rate: 800, isMaterial: false },
    ]);
    await small.customerAgent.post(`/api/quotations/${small.id}/accept`).send(WHERE);
    const smallQuotation = await Quotation.findById(small.id);
    // Splitting an ₹800 job into three payments would be ceremony.
    expect(smallQuotation?.milestones).toHaveLength(0);
  });

  it('a milestone needs the customer to confirm it', async () => {
    const { customerAgent, id } = await upToSubmitted(16, BIG_JOB_LINES);
    await customerAgent.post(`/api/quotations/${id}/accept`).send(WHERE);

    const res = await customerAgent.post(`/api/quotations/${id}/milestones/0/confirm`);
    expect(res.status).toBe(200);

    const quotation = await Quotation.findById(id);
    expect(quotation?.milestones[0].status).toBe('confirmed');
    expect(quotation?.milestones[1].status).toBe('pending');
  });

  it('neither party can read or act on someone else\'s quotation', async () => {
    const { id } = await upToSubmitted(17);
    const { agent: stranger } = await loginAs('customer', '9971009017');

    expect((await stranger.get(`/api/quotations/${id}`)).status).toBe(404);
    expect((await stranger.post(`/api/quotations/${id}/accept`).send(WHERE)).status).toBe(403);

    const { agent: otherWorker } = await loginAs('hamali_solo', '9970009017');
    expect((await otherWorker.post(`/api/quotations/${id}/visit-done`)).status).toBe(403);
  });

  it('lists each side its own quotations', async () => {
    const { customerAgent, workerAgent, id } = await upToSubmitted(18);

    const mineAsCustomer = await customerAgent.get('/api/quotations');
    const mineAsWorker = await workerAgent.get('/api/quotations').query({ as: 'worker' });

    expect(mineAsCustomer.body.quotations.map((q: { _id: string }) => q._id)).toContain(id);
    expect(mineAsWorker.body.quotations.map((q: { _id: string }) => q._id)).toContain(id);
  });

  it('reports the payable as the frozen total plus approved variations only', async () => {
    const { customerAgent, workerAgent, id } = await upToSubmitted(19);
    await customerAgent.post(`/api/quotations/${id}/accept`).send(WHERE);

    const approvedVariation = await workerAgent
      .post(`/api/quotations/${id}/variations`)
      .send({ description: 'Levelling the wall.', amount: 2500 });
    await customerAgent
      .post(`/api/quotations/variations/${approvedVariation.body.variation._id}/decide`)
      .send({ approve: true });

    // A second one, left undecided — it must not count.
    await workerAgent
      .post(`/api/quotations/${id}/variations`)
      .send({ description: 'Possible extra shelf.', amount: 4000 });

    const res = await customerAgent.get(`/api/quotations/${id}`);

    expect(res.body.payable.frozenTotal).toBe(17600);
    expect(res.body.payable.variationTotal).toBe(2500);
    expect(res.body.payable.payable).toBe(20100);
  });

  it('a worker with no published quotation profile cannot be asked for one', async () => {
    await WorkerPricingProfile.deleteMany({});
    await carpenterCategory();
    const { user: worker } = await loginAs('hamali_solo', '9970009020');
    const { agent } = await loginAs('customer', '9971009020');

    const res = await agent.post('/api/quotations').send({
      workerId: worker._id.toString(),
      categorySlug: 'carpenter',
      jobDescription: 'A job for somebody who never published rates.',
    });

    expect(res.status).toBe(422);
    expect(await Quotation.countDocuments({})).toBe(0);
  });
});
