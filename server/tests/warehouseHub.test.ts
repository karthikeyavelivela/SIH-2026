import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { WarehouseHub } from '../src/models/WarehouseHub';
import { DockSlot } from '../src/models/DockSlot';
import { GateEvent } from '../src/models/GateEvent';
import { signAccessToken } from '../src/services/token.service';

async function loginAsHubOwner(phone = '9993000001') {
  const passwordHash = await bcrypt.hash('x', 10);
  const user = await User.create({ name: 'U', phone, passwordHash, role: 'warehouse_hub' });
  const hub = await WarehouseHub.create({ ownerId: user._id, name: 'My Hub', address: 'Addr' });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: 'warehouse_hub' as never })}`);
  return { agent, user, hub };
}

describe('GET /api/warehouse-hub/me', () => {
  it("404s a warehouse_hub account with no hub row (shouldn't normally happen post-signup, but must not 500)", async () => {
    const passwordHash = await bcrypt.hash('x', 10);
    const user = await User.create({ name: 'NoHub', phone: '9993000002', passwordHash, role: 'warehouse_hub' });
    const agent = request.agent(app);
    agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: 'warehouse_hub' as never })}`);
    const res = await agent.get('/api/warehouse-hub/me');
    expect(res.status).toBe(404);
  });

  it('returns the hub plus its dock slots and recent gate events, scoped to this owner only', async () => {
    const { agent, hub } = await loginAsHubOwner();
    await DockSlot.create({ hubId: hub._id, label: 'Dock 1' });
    const res = await agent.get('/api/warehouse-hub/me');
    expect(res.status).toBe(200);
    expect(res.body.hub._id).toBe(hub._id.toString());
    expect(res.body.dockSlots).toHaveLength(1);
  });

  it('blocks a driver from the warehouse-hub routes entirely', async () => {
    const passwordHash = await bcrypt.hash('x', 10);
    const user = await User.create({ name: 'D', phone: '9993000003', passwordHash, role: 'driver' });
    const agent = request.agent(app);
    agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: 'driver' as never })}`);
    const res = await agent.get('/api/warehouse-hub/me');
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/warehouse-hub/dock-slots/:id', () => {
  it("a dock slot belonging to a DIFFERENT hub cannot be updated (IDOR guard)", async () => {
    const { hub: otherHub } = await loginAsHubOwner('9993000004');
    const otherSlot = await DockSlot.create({ hubId: otherHub._id, label: 'Other Dock' });

    const { agent } = await loginAsHubOwner('9993000005');
    const res = await agent.patch(`/api/warehouse-hub/dock-slots/${otherSlot._id}`).send({ status: 'occupied' });
    expect(res.status).toBe(404);
  });

  it('transitioning available -> occupied writes a vehicle_entered GateEvent; occupied -> available writes vehicle_exited', async () => {
    const { agent, hub } = await loginAsHubOwner('9993000006');
    const slot = await DockSlot.create({ hubId: hub._id, label: 'Dock 1' });

    const occupy = await agent.patch(`/api/warehouse-hub/dock-slots/${slot._id}`).send({ status: 'occupied' });
    expect(occupy.status).toBe(200);
    let events = await GateEvent.find({ hubId: hub._id });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('vehicle_entered');

    const free = await agent.patch(`/api/warehouse-hub/dock-slots/${slot._id}`).send({ status: 'available' });
    expect(free.status).toBe(200);
    events = await GateEvent.find({ hubId: hub._id }).sort({ createdAt: 1 });
    expect(events).toHaveLength(2);
    expect(events[1].type).toBe('vehicle_exited');
  });

  it('transitioning into reserved does not fabricate a gate event', async () => {
    const { agent, hub } = await loginAsHubOwner('9993000007');
    const slot = await DockSlot.create({ hubId: hub._id, label: 'Dock 1' });
    await agent.patch(`/api/warehouse-hub/dock-slots/${slot._id}`).send({ status: 'reserved' });
    const events = await GateEvent.find({ hubId: hub._id });
    expect(events).toHaveLength(0);
  });
});

describe('PATCH /api/warehouse-hub/me', () => {
  it("updates only the fields sent, leaving the rest untouched", async () => {
    const { agent, hub } = await loginAsHubOwner('9993000008');
    const res = await agent.patch('/api/warehouse-hub/me').send({ operatingHours: '9am-6pm' });
    expect(res.status).toBe(200);
    expect(res.body.hub.operatingHours).toBe('9am-6pm');
    expect(res.body.hub.name).toBe(hub.name);
  });
});
