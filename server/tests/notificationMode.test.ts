import './setup';
import request from 'supertest';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { Notification } from '../src/models/Notification';
import { signAccessToken } from '../src/services/token.service';
import { modeForBooking, bookingIdFromLink } from '../src/services/notificationMode';

/**
 * Notifications, scoped to the mode the customer is in.
 *
 * The rule that decides a booking's mode is the one that was wrong on the
 * history screen: every household trade dispatches as `type: 'hamali'`, so
 * a rule keyed on the dispatch type files a plumber under the loading crew
 * and leaves the Household filter permanently empty.
 */

async function customer(phone: string) {
  const user = await User.create({ name: 'C', phone, passwordHash: 'x', role: 'customer' });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: 'customer' as never })}`);
  return { agent, user };
}

async function bookingFor(userId: string, over: Record<string, unknown>) {
  return Booking.create({
    customerId: userId,
    type: 'hamali',
    cargoDetails: { weightKg: 0 },
    pickupLocation: { type: 'Point', coordinates: [83.2, 17.7], address: 'A' },
    dropLocation: { type: 'Point', coordinates: [83.3, 17.8], address: 'B' },
    requiredHamaliCount: 1,
    status: 'searching',
    fareBreakdown: { baseFare: 100, distanceFare: 0, hamaliFare: 300, surgeMultiplier: 1, total: 400 },
    statusHistory: [{ status: 'searching', timestamp: new Date() }],
    ...over,
  });
}

describe('which mode a booking belongs to', () => {
  it('does not file a household trade under the loading crew', () => {
    // A plumber booking IS type:'hamali'. Keying on that alone was the bug.
    expect(modeForBooking({ type: 'hamali', serviceCategorySlug: 'plumber' })).toBe('household');
    expect(modeForBooking({ type: 'hamali', serviceCategorySlug: 'general_labour' })).toBe('labour');
    expect(modeForBooking({ type: 'truck', serviceCategorySlug: 'general_logistics' })).toBe('transport');
    expect(modeForBooking({ type: 'combo' })).toBe('transport');
  });

  it('treats a crew booking with no category as the crew, for rows that predate the field', () => {
    expect(modeForBooking({ type: 'hamali' })).toBe('labour');
  });

  it('finds the booking id in a tracking link', () => {
    expect(bookingIdFromLink('/customer/track/6a81a2424d1c4c2b58c7a68b')).toBe('6a81a2424d1c4c2b58c7a68b');
    expect(bookingIdFromLink('/customer/profile')).toBeNull();
    expect(bookingIdFromLink(undefined)).toBeNull();
  });
});

describe('GET /api/notifications?mode=', () => {
  it('shows a household alert in Household and not in Transit', async () => {
    const { agent, user } = await customer('9895000001');
    const booking = await bookingFor(user._id.toString(), { serviceCategorySlug: 'plumber' });
    await Notification.create({
      userId: user._id,
      type: 'booking_status',
      title: 'Plumber on the way',
      body: 'x',
      link: `/customer/track/${booking._id}`,
    });

    const household = await agent.get('/api/notifications?mode=household');
    expect(household.body.notifications).toHaveLength(1);
    expect(household.body.otherModesCount).toBe(0);

    const transit = await agent.get('/api/notifications?mode=transport');
    expect(transit.body.notifications).toHaveLength(0);
    // Named, not hidden — the screen tells the person where it went.
    expect(transit.body.otherModesCount).toBe(1);
  });

  it('shows an alert with no booking behind it in every mode', async () => {
    const { agent, user } = await customer('9895000002');
    await Notification.create({
      userId: user._id,
      type: 'kyc_decision',
      title: 'Document approved',
      body: 'x',
    });
    // "Your document was approved" is not about household work or transit.
    // Hiding it behind a mode switch would lose it.
    for (const mode of ['household', 'labour', 'transport']) {
      const res = await agent.get(`/api/notifications?mode=${mode}`);
      expect(res.body.notifications).toHaveLength(1);
    }
  });

  it('counts unread the same way the list filters, so badge and list agree', async () => {
    const { agent, user } = await customer('9895000003');
    const truck = await bookingFor(user._id.toString(), { type: 'truck', serviceCategorySlug: 'general_logistics' });
    await Notification.create({
      userId: user._id,
      type: 'booking_status',
      title: 'Driver assigned',
      body: 'x',
      link: `/customer/track/${truck._id}`,
      read: false,
    });

    expect((await agent.get('/api/notifications/unread-count?mode=transport')).body.unreadCount).toBe(1);
    expect((await agent.get('/api/notifications/unread-count?mode=household')).body.unreadCount).toBe(0);
    // Unscoped is unchanged, which is what every other role asks for.
    expect((await agent.get('/api/notifications/unread-count')).body.unreadCount).toBe(1);
  });
});
