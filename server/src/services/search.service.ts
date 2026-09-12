import { Booking } from '../models/Booking';
import { Complaint } from '../models/Complaint';
import { ServiceCategory } from '../models/ServiceCategory';
import { SavedAddress } from '../models/SavedAddress';
import { Vehicle } from '../models/Vehicle';
import { Mutha } from '../models/Mutha';
import { User } from '../models/User';
import type { Role } from '@fyro/shared';

/**
 * Global search.
 *
 * The rule this file exists to enforce: WHAT you can search is decided by
 * your role, and WHICH ROWS you get back is decided by your id — both
 * server-side, both here. The client sends a string and nothing else. It
 * cannot ask for a collection, cannot ask for someone else's rows, and
 * cannot widen its own scope by sending a different parameter, because
 * there is no other parameter.
 *
 * Every group below is built by a function that takes the caller's own id.
 * A search that would return another person's booking is not filtered out
 * downstream — the query that would have found it is never run.
 *
 * Text indexes back the collections where a match is prose (addresses,
 * complaint text, names); see each model. Short queries fall back to a
 * prefix regex, because MongoDB's text index is word-based and a person
 * typing "Gaju" expects Gajuwaka before they have finished the word.
 */

export interface SearchHit {
  id: string;
  title: string;
  subtitle?: string;
  /** Where the app goes when this hit is chosen. */
  path: string;
}

export interface SearchGroup {
  /** i18n key under `search.groups`, never a human string — the UI is trilingual. */
  key: string;
  hits: SearchHit[];
}

const PER_GROUP = 5;
/** Below this length a text index is useless — "Gaju" is not a word yet. */
const PREFIX_MODE_MAX = 4;

function escapeRegex(q: string) {
  return q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One matcher for both modes. `$text` for real words (it is indexed, ranked
 * and diacritic-aware), a case-insensitive regex for a short prefix.
 */
function matcher(q: string, fields: string[]) {
  if (q.length > PREFIX_MODE_MAX) return { $text: { $search: q } };
  const rx = new RegExp(escapeRegex(q), 'i');
  return { $or: fields.map((f) => ({ [f]: rx })) };
}

function bookingHit(b: {
  _id: unknown;
  type?: string;
  status?: string;
  pickupLocation?: { address?: string };
  dropLocation?: { address?: string };
}, basePath: string): SearchHit {
  const id = String(b._id);
  return {
    id,
    title: `${b.pickupLocation?.address ?? '—'} → ${b.dropLocation?.address ?? '—'}`,
    subtitle: `${b.type ?? ''} · ${b.status ?? ''}`.trim(),
    path: `${basePath}/${id}`,
  };
}

/** The caller's own bookings, in whatever capacity they hold them. */
async function myBookings(userId: string, q: string, basePath: string): Promise<SearchHit[]> {
  const rows = await Booking.find({
    $and: [
      { $or: [{ customerId: userId }, { assignedDriverIds: userId }, { assignedHamaliIds: userId }] },
      matcher(q, ['pickupLocation.address', 'dropLocation.address']),
    ],
  })
    .sort({ createdAt: -1 })
    .limit(PER_GROUP)
    .lean();
  return rows.map((b) => bookingHit(b, basePath));
}

async function myComplaints(userId: string, q: string): Promise<SearchHit[]> {
  const rows = await Complaint.find({
    $and: [{ raisedByUserId: userId }, matcher(q, ['description'])],
  })
    .sort({ createdAt: -1 })
    .limit(PER_GROUP)
    .lean();
  return rows.map((c) => ({
    id: String(c._id),
    title: c.description.slice(0, 70),
    subtitle: `${c.category} · ${c.status}`,
    path: '/customer/support',
  }));
}

/** Public catalogue — the one group that is not scoped to a person, because
 *  the service list is the same for everyone and is already a public route. */
async function serviceCategories(q: string): Promise<SearchHit[]> {
  const rows = await ServiceCategory.find({
    $and: [{ active: true }, matcher(q, ['name', 'slug'])],
  })
    .limit(PER_GROUP)
    .lean();
  return rows.map((c) => ({
    id: String(c._id),
    title: c.name,
    path:
      c.slug === 'general_logistics'
        ? '/customer/book/transport'
        : c.slug === 'general_labour'
          ? '/customer/book/labour'
          : `/customer/service/${c.slug}`,
  }));
}

async function mySavedAddresses(userId: string, q: string): Promise<SearchHit[]> {
  const rx = new RegExp(escapeRegex(q), 'i');
  const rows = await SavedAddress.find({ userId, $or: [{ label: rx }, { address: rx }] })
    .limit(PER_GROUP)
    .lean();
  return rows.map((a) => ({
    id: String(a._id),
    title: a.label,
    subtitle: a.address,
    path: '/customer/addresses',
  }));
}

async function myVehicles(userId: string, q: string): Promise<SearchHit[]> {
  const rx = new RegExp(escapeRegex(q), 'i');
  const rows = await Vehicle.find({ ownerId: userId, $or: [{ registrationNumber: rx }, { type: rx }] })
    .limit(PER_GROUP)
    .lean();
  return rows.map((v) => ({
    id: String(v._id),
    title: v.registrationNumber ?? String(v._id),
    subtitle: `${v.type} · ${v.capacityKg} kg`,
    path: '/driver/profile',
  }));
}

/**
 * A society leader's own members.
 *
 * Found via the society whose leaderId is the caller — so a leader can only
 * ever reach the roster they already administer, and a member id supplied by
 * a client would do nothing here because none is accepted.
 */
async function myMembers(userId: string, q: string): Promise<SearchHit[]> {
  const mutha = await Mutha.findOne({ leaderId: userId }).select('memberIds').lean();
  if (!mutha?.memberIds?.length) return [];
  const rx = new RegExp(escapeRegex(q), 'i');
  const rows = await User.find({ _id: { $in: mutha.memberIds }, $or: [{ name: rx }, { phone: rx }] })
    .select('name phone')
    .limit(PER_GROUP)
    .lean();
  return rows.map((u) => ({
    id: String(u._id),
    title: u.name,
    subtitle: u.phone,
    path: '/mutha/members',
  }));
}

/** Admin/manager people search — the one group that spans users, and only
 *  for the two roles that already have a user-administration screen. */
async function allUsers(q: string): Promise<SearchHit[]> {
  const rx = new RegExp(escapeRegex(q), 'i');
  const rows = await User.find({ $or: [{ name: rx }, { phone: rx }] })
    .select('name phone role')
    .limit(PER_GROUP)
    .lean();
  return rows.map((u) => ({
    id: String(u._id),
    title: u.name,
    subtitle: `${u.phone} · ${u.role}`,
    path: '/admin/users',
  }));
}

async function allBookings(q: string): Promise<SearchHit[]> {
  const rows = await Booking.find(matcher(q, ['pickupLocation.address', 'dropLocation.address']))
    .sort({ createdAt: -1 })
    .limit(PER_GROUP)
    .lean();
  return rows.map((b) => bookingHit(b, '/admin/bookings'));
}

/** Where each role's own bookings live, so a hit opens the right screen. */
const BOOKING_BASE: Record<string, string> = {
  customer: '/customer/track',
  driver: '/driver/active-job',
  hamali_solo: '/hamali/active-job',
  mutha_member: '/mutha-member/job',
};

export async function searchForRole(userId: string, role: Role, q: string): Promise<SearchGroup[]> {
  const groups: SearchGroup[] = [];
  const add = (key: string, hits: SearchHit[]) => {
    if (hits.length) groups.push({ key, hits });
  };

  if (role === 'customer') {
    const [bookings, complaints, categories, addresses] = await Promise.all([
      myBookings(userId, q, BOOKING_BASE.customer),
      myComplaints(userId, q),
      serviceCategories(q),
      mySavedAddresses(userId, q),
    ]);
    add('services', categories);
    add('bookings', bookings);
    add('addresses', addresses);
    add('complaints', complaints);
    return groups;
  }

  if (role === 'driver' || role === 'hamali_solo' || role === 'mutha_member') {
    const [jobs, complaints, vehicles] = await Promise.all([
      myBookings(userId, q, BOOKING_BASE[role] ?? '/customer/track'),
      myComplaints(userId, q),
      role === 'driver' ? myVehicles(userId, q) : Promise.resolve([]),
    ]);
    add('jobs', jobs);
    add('vehicles', vehicles);
    add('complaints', complaints);
    return groups;
  }

  if (role === 'mutha_leader') {
    const [jobs, members] = await Promise.all([myBookings(userId, q, '/mutha/active-jobs'), myMembers(userId, q)]);
    add('members', members);
    add('jobs', jobs);
    return groups;
  }

  if (role === 'fleet_owner') {
    add('vehicles', await myVehicles(userId, q));
    return groups;
  }

  if (role === 'admin' || role === 'manager') {
    // The only role pair whose search is not self-scoped — because their
    // existing screens already administer every user and booking. Search
    // must not be a way to reach data a role cannot otherwise reach; here
    // it reaches exactly what /admin/users and /admin/bookings already do.
    const [users, bookings] = await Promise.all([allUsers(q), allBookings(q)]);
    add('people', users);
    add('bookings', bookings);
    return groups;
  }

  // Every other role (warehouse hub, federation tiers) gets its own
  // bookings only, until it has a screen that justifies more. An empty
  // result is the honest answer, not an excuse to widen scope.
  add('bookings', await myBookings(userId, q, '/customer/track'));
  return groups;
}
