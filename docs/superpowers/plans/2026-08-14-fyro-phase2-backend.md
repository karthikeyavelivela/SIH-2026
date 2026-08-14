# FYRO Phase 2 Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Server-side booking core — fare engine, distance calc, geo-matching, FareRule CRUD, booking lifecycle, driver/hamali/mutha-leader accept-reject polling, earnings, geocode proxy.

**Architecture:** Extends the Phase 1 Express/Mongoose server with new services (pure-function fare/distance calc, geo-query matching), new controllers/routes mounted alongside the existing auth/admin routers in `app.ts`, and one new field on `Booking`. Race-safe "first to accept wins" claiming via atomic `findOneAndUpdate`.

**Tech Stack:** Same as Phase 1 — Express, TypeScript, Mongoose, Jest + Supertest + mongodb-memory-server.

**Spec:** `docs/superpowers/specs/2026-08-14-fyro-phase2-booking-core-design.md`

---

## File Structure

```
server/src/
  models/Booking.ts                 MODIFY: add rejectedByUserIds field
  services/distance.service.ts      NEW: haversineKm()
  services/fare.service.ts          NEW: computeFareBreakdown(), bucketVehicleCategory()
  services/matching.service.ts      NEW: findCandidateVehicles/HamaliSolos/Muthas()
  controllers/fareRule.controller.ts   NEW: admin CRUD
  routes/fareRule.routes.ts            NEW
  controllers/booking.controller.ts    NEW: create/list/get/cancel
  routes/booking.routes.ts             NEW
  controllers/requests.controller.ts   NEW: list-pending/accept/reject (driver, hamali_solo, mutha_leader) + assign-members
  routes/requests.routes.ts            NEW
  controllers/availability.controller.ts  NEW: online/offline + one-time location
  routes/availability.routes.ts           NEW
  controllers/earnings.controller.ts   NEW: per-role read-only aggregation
  routes/earnings.routes.ts            NEW
  controllers/geocode.controller.ts    NEW: public proxy to geocode.service.ts
  routes/geocode.routes.ts             NEW
  app.ts                             MODIFY: mount all new routers
tests/
  distance.test.ts, fare.test.ts, matching.test.ts,
  fareRule.test.ts, booking.test.ts, requests.test.ts,
  availability.test.ts, earnings.test.ts, geocode.test.ts
```

---

### Task 1: Distance service + Booking model field

**Files:**
- Create: `server/src/services/distance.service.ts`
- Test: `server/tests/distance.test.ts`
- Modify: `server/src/models/Booking.ts`

- [ ] **Step 1: Write failing test**

`server/tests/distance.test.ts`:
```typescript
import { haversineKm } from '../src/services/distance.service';

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm({ lat: 17.385, lng: 78.4867 }, { lat: 17.385, lng: 78.4867 })).toBe(0);
  });

  it('computes a known distance (Hyderabad to Vijayawada, ~275km straight-line)', () => {
    const hyderabad = { lat: 17.385, lng: 78.4867 };
    const vijayawada = { lat: 16.5062, lng: 80.648 };
    const km = haversineKm(hyderabad, vijayawada);
    expect(km).toBeGreaterThan(240);
    expect(km).toBeLessThan(280);
  });

  it('is symmetric', () => {
    const a = { lat: 17.0, lng: 78.0 };
    const b = { lat: 16.0, lng: 80.0 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- distance.test.ts`
Expected: FAIL — `Cannot find module '../src/services/distance.service'`

- [ ] **Step 3: Implement**

`server/src/services/distance.service.ts`:
```typescript
export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Straight-line (great-circle) distance in km. No routing-engine integration is in scope. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace server -- distance.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add `rejectedByUserIds` to Booking model**

In `server/src/models/Booking.ts`, add to the `IBooking` interface (after `assignedMuthaId`):
```typescript
  rejectedByUserIds: Types.ObjectId[];
```
And to the schema (after the `assignedMuthaId` field):
```typescript
    rejectedByUserIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
```

- [ ] **Step 6: Run full model test + full suite to confirm nothing broke**

Run: `npm test --workspace server`
Expected: all existing suites still pass (27 tests), plus the 3 new distance tests (30 total).

- [ ] **Step 7: Commit**

```bash
git add server/src/services/distance.service.ts server/tests/distance.test.ts server/src/models/Booking.ts
git commit -m "feat: add haversine distance service and rejectedByUserIds field on Booking"
```

---

### Task 2: Fare engine service

**Files:**
- Create: `server/src/services/fare.service.ts`
- Test: `server/tests/fare.test.ts`

- [ ] **Step 1: Write failing test**

`server/tests/fare.test.ts`:
```typescript
import { computeFareBreakdown, bucketVehicleCategory } from '../src/services/fare.service';

describe('bucketVehicleCategory', () => {
  it('maps mini_truck to vehicle_small', () => {
    expect(bucketVehicleCategory('mini_truck')).toBe('vehicle_small');
  });
  it('maps medium_truck to vehicle_medium', () => {
    expect(bucketVehicleCategory('medium_truck')).toBe('vehicle_medium');
  });
  it('maps large_truck to vehicle_large', () => {
    expect(bucketVehicleCategory('large_truck')).toBe('vehicle_large');
  });
  it('throws on an unknown vehicle type', () => {
    expect(() => bucketVehicleCategory('spaceship')).toThrow();
  });
});

describe('computeFareBreakdown', () => {
  const truckRule = {
    baseFare: 400,
    perKmRate: 28,
    minimumFare: 600,
    surgeMultiplier: 1.0,
  };
  const hamaliRule = {
    baseFare: 100,
    perKmRate: 0,
    minimumFare: 300,
    surgeMultiplier: 1.0,
  };

  it('computes a truck-only fare above the minimum', () => {
    const result = computeFareBreakdown({ vehicleRule: truckRule, distanceKm: 20 });
    // baseFare 400 + perKm 28*20=560 => 960, above minimumFare 600
    expect(result.baseFare).toBe(400);
    expect(result.distanceFare).toBe(560);
    expect(result.hamaliFare).toBe(0);
    expect(result.surgeMultiplier).toBe(1.0);
    expect(result.total).toBe(960);
  });

  it('clamps to minimumFare when computed fare is below it', () => {
    const result = computeFareBreakdown({ vehicleRule: truckRule, distanceKm: 1 });
    // baseFare 400 + perKm 28 => 428, below minimumFare 600
    expect(result.total).toBe(600);
  });

  it('adds a hamali component for combo bookings', () => {
    const result = computeFareBreakdown({
      vehicleRule: truckRule,
      distanceKm: 20,
      hamaliRule,
      hamaliCount: 2,
    });
    // truck: 960. hamali: max(300, 100+0)=300 per worker * 2 = 600
    expect(result.hamaliFare).toBe(600);
    expect(result.total).toBe(960 + 600);
  });

  it('applies a surge multiplier to the whole total', () => {
    const surged = { ...truckRule, surgeMultiplier: 1.5 };
    const result = computeFareBreakdown({ vehicleRule: surged, distanceKm: 20 });
    expect(result.surgeMultiplier).toBe(1.5);
    expect(result.total).toBe(960 * 1.5);
  });

  it('computes hamali-only fare with no vehicle rule', () => {
    const result = computeFareBreakdown({ hamaliRule, hamaliCount: 3 });
    expect(result.baseFare).toBe(0);
    expect(result.distanceFare).toBe(0);
    expect(result.hamaliFare).toBe(900);
    expect(result.total).toBe(900);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- fare.test.ts`
Expected: FAIL — `Cannot find module '../src/services/fare.service'`

- [ ] **Step 3: Implement**

`server/src/services/fare.service.ts`:
```typescript
export type VehicleCategory = 'vehicle_small' | 'vehicle_medium' | 'vehicle_large';

/** Same three-tier split established by the Phase 1 driver-signup vehicleType field. */
export function bucketVehicleCategory(vehicleType: string): VehicleCategory {
  if (vehicleType === 'mini_truck') return 'vehicle_small';
  if (vehicleType === 'medium_truck') return 'vehicle_medium';
  if (vehicleType === 'large_truck') return 'vehicle_large';
  throw new Error(`Unknown vehicle type: ${vehicleType}`);
}

interface RateComponent {
  baseFare: number;
  perKmRate: number;
  minimumFare: number;
  surgeMultiplier: number;
}

export interface FareBreakdown {
  baseFare: number;
  distanceFare: number;
  surgeMultiplier: number;
  hamaliFare: number;
  total: number;
}

interface ComputeFareInput {
  vehicleRule?: RateComponent;
  distanceKm?: number;
  hamaliRule?: RateComponent;
  hamaliCount?: number;
}

/**
 * total = max(minimumFare, baseFare + perKmRate*distanceKm) per component,
 * summed, then the whole sum is scaled by surgeMultiplier. Phase 2 always
 * has surgeMultiplier=1.0 on every FareRule (Phase 5 computes it live) —
 * this function just reads whatever the rule says, so Phase 5 only has to
 * change what writes that field, not this read path.
 */
export function computeFareBreakdown(input: ComputeFareInput): FareBreakdown {
  const { vehicleRule, distanceKm = 0, hamaliRule, hamaliCount = 0 } = input;

  let baseFare = 0;
  let distanceFare = 0;
  let vehicleTotal = 0;
  let surgeMultiplier = 1.0;

  if (vehicleRule) {
    baseFare = vehicleRule.baseFare;
    distanceFare = vehicleRule.perKmRate * distanceKm;
    vehicleTotal = Math.max(vehicleRule.minimumFare, baseFare + distanceFare);
    surgeMultiplier = vehicleRule.surgeMultiplier;
  }

  let hamaliFare = 0;
  if (hamaliRule && hamaliCount > 0) {
    const perWorker = Math.max(hamaliRule.minimumFare, hamaliRule.baseFare + hamaliRule.perKmRate * 0);
    hamaliFare = perWorker * hamaliCount;
    // If there's no vehicle component, the hamali rule's own surge applies.
    if (!vehicleRule) surgeMultiplier = hamaliRule.surgeMultiplier;
  }

  const preSubtotal = vehicleTotal + hamaliFare;
  const total = preSubtotal * surgeMultiplier;

  return {
    baseFare,
    distanceFare,
    surgeMultiplier,
    hamaliFare: hamaliFare * (vehicleRule ? 1 : surgeMultiplier), // keep hamali-only surge reflected in the component too
    total,
  };
}
```

Note: the last line's parenthetical handles the "hamali-only booking, surge on hamali rule" case so `hamaliFare` alone reflects surge consistently with `total` when there's no vehicle component. Re-derive `hamaliFare` for the combo case to equal the un-surged component if a vehicle rule is present (since combo bookings only surge the grand total per the test above, not each component individually) — verify this against the test's exact expected numbers step 4.

- [ ] **Step 4: Run test, verify it passes; fix arithmetic if any assertion is off**

Run: `npm test --workspace server -- fare.test.ts`
Expected: PASS (10 tests). If the surge/hamali interaction test fails, adjust `computeFareBreakdown` until all 10 pass — the test file is the source of truth for exact expected numbers, not the prose above.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/fare.service.ts server/tests/fare.test.ts
git commit -m "feat: add fare engine service (vehicle bucketing, fare breakdown computation)"
```

---

### Task 3: Matching service (geo-query candidate ranking)

**Files:**
- Create: `server/src/services/matching.service.ts`
- Test: `server/tests/matching.test.ts`

- [ ] **Step 1: Write failing test**

`server/tests/matching.test.ts`:
```typescript
import './setup';
import { Vehicle } from '../src/models/Vehicle';
import { HamaliProfile } from '../src/models/HamaliProfile';
import { User } from '../src/models/User';
import {
  findCandidateVehicles,
  findCandidateHamaliSolos,
} from '../src/services/matching.service';

async function makeDriver(phone: string) {
  return User.create({ name: 'D', phone, passwordHash: 'x', role: 'driver' });
}

describe('findCandidateVehicles', () => {
  it('returns only online vehicles with sufficient capacity, nearest first', async () => {
    const owner1 = await makeDriver('9700000001');
    const owner2 = await makeDriver('9700000002');
    const owner3 = await makeDriver('9700000003');

    // Pickup point: Hyderabad-ish
    const pickup: [number, number] = [78.4867, 17.385];

    await Vehicle.create({
      ownerId: owner1._id,
      type: 'mini_truck',
      capacityKg: 1000,
      registrationNumber: 'AP01A0001',
      availabilityStatus: 'online',
      currentLocation: { type: 'Point', coordinates: [78.49, 17.39] }, // very close
    });
    await Vehicle.create({
      ownerId: owner2._id,
      type: 'mini_truck',
      capacityKg: 1000,
      registrationNumber: 'AP01A0002',
      availabilityStatus: 'offline', // excluded: offline
      currentLocation: { type: 'Point', coordinates: [78.491, 17.391] },
    });
    await Vehicle.create({
      ownerId: owner3._id,
      type: 'mini_truck',
      capacityKg: 500, // excluded: too small for a 800kg request
      availabilityStatus: 'online',
      registrationNumber: 'AP01A0003',
      currentLocation: { type: 'Point', coordinates: [78.492, 17.392] },
    });

    const candidates = await findCandidateVehicles({
      pickup,
      requiredCapacityKg: 800,
      maxDistanceKm: 50,
    });

    expect(candidates.length).toBe(1);
    expect(candidates[0].ownerId.toString()).toBe(owner1._id.toString());
  });

  it('excludes vehicles beyond maxDistanceKm', async () => {
    const owner = await makeDriver('9700000004');
    await Vehicle.create({
      ownerId: owner._id,
      type: 'mini_truck',
      capacityKg: 1000,
      registrationNumber: 'AP01A0004',
      availabilityStatus: 'online',
      currentLocation: { type: 'Point', coordinates: [80.648, 16.5062] }, // Vijayawada, ~275km away
    });

    const candidates = await findCandidateVehicles({
      pickup: [78.4867, 17.385],
      requiredCapacityKg: 500,
      maxDistanceKm: 50,
    });

    expect(candidates.length).toBe(0);
  });
});

describe('findCandidateHamaliSolos', () => {
  it('returns only online solo hamali profiles near the pickup point', async () => {
    const user1 = await User.create({ name: 'H', phone: '9700000005', passwordHash: 'x', role: 'hamali_solo' });
    await HamaliProfile.create({
      userId: user1._id,
      type: 'solo',
      availabilityStatus: 'online',
      currentLocation: { type: 'Point', coordinates: [78.49, 17.39] },
    });

    const candidates = await findCandidateHamaliSolos({
      pickup: [78.4867, 17.385],
      maxDistanceKm: 50,
    });

    expect(candidates.length).toBe(1);
    expect(candidates[0].userId.toString()).toBe(user1._id.toString());
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- matching.test.ts`
Expected: FAIL — `Cannot find module '../src/services/matching.service'`

- [ ] **Step 3: Implement**

`server/src/services/matching.service.ts`:
```typescript
import { Vehicle, IVehicle } from '../models/Vehicle';
import { HamaliProfile, IHamaliProfile } from '../models/HamaliProfile';
import { Mutha, IMutha } from '../models/Mutha';

interface CandidateVehicleQuery {
  pickup: [number, number]; // [lng, lat]
  requiredCapacityKg: number;
  maxDistanceKm: number;
}

export async function findCandidateVehicles(q: CandidateVehicleQuery): Promise<IVehicle[]> {
  return Vehicle.find({
    availabilityStatus: 'online',
    capacityKg: { $gte: q.requiredCapacityKg },
    currentLocation: {
      $near: {
        $geometry: { type: 'Point', coordinates: q.pickup },
        $maxDistance: q.maxDistanceKm * 1000,
      },
    },
  });
}

interface CandidateHamaliQuery {
  pickup: [number, number];
  maxDistanceKm: number;
}

export async function findCandidateHamaliSolos(q: CandidateHamaliQuery): Promise<IHamaliProfile[]> {
  return HamaliProfile.find({
    type: 'solo',
    availabilityStatus: 'online',
    currentLocation: {
      $near: {
        $geometry: { type: 'Point', coordinates: q.pickup },
        $maxDistance: q.maxDistanceKm * 1000,
      },
    },
  });
}

interface CandidateMuthaQuery {
  pickup: [number, number];
  maxDistanceKm: number;
  requiredHamaliCount: number;
}

/**
 * A Mutha is a candidate if it has at least `requiredHamaliCount` members
 * whose own HamaliProfile is online and within range. Ranks Muthas by how
 * many qualifying online members they have near the pickup point (most
 * first), not by a single distance value, since a group's "location" isn't
 * one point.
 */
export async function findCandidateMuthas(q: CandidateMuthaQuery): Promise<IMutha[]> {
  const nearbyMemberProfiles = await HamaliProfile.find({
    type: 'mutha_member',
    availabilityStatus: 'online',
    currentLocation: {
      $near: {
        $geometry: { type: 'Point', coordinates: q.pickup },
        $maxDistance: q.maxDistanceKm * 1000,
      },
    },
  }).select('muthaId');

  const muthaIdCounts = new Map<string, number>();
  for (const profile of nearbyMemberProfiles) {
    if (!profile.muthaId) continue;
    const key = profile.muthaId.toString();
    muthaIdCounts.set(key, (muthaIdCounts.get(key) ?? 0) + 1);
  }

  const qualifyingMuthaIds = [...muthaIdCounts.entries()]
    .filter(([, count]) => count >= q.requiredHamaliCount)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  if (qualifyingMuthaIds.length === 0) return [];

  const muthas = await Mutha.find({ _id: { $in: qualifyingMuthaIds } });
  // Preserve the ranked order from qualifyingMuthaIds.
  const order = new Map(qualifyingMuthaIds.map((id, i) => [id, i]));
  return muthas.sort((a, b) => (order.get(a._id.toString()) ?? 0) - (order.get(b._id.toString()) ?? 0));
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace server -- matching.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/matching.service.ts server/tests/matching.test.ts
git commit -m "feat: add geo-matching service for vehicles, solo hamalis, and muthas"
```

---

### Task 4: FareRule admin CRUD

**Files:**
- Create: `server/src/controllers/fareRule.controller.ts`, `server/src/routes/fareRule.routes.ts`
- Test: `server/tests/fareRule.test.ts`
- Modify: `server/src/app.ts` (mount router)

- [ ] **Step 1: Write failing test**

`server/tests/fareRule.test.ts`:
```typescript
import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { FareRule } from '../src/models/FareRule';

async function loginAsAdmin() {
  const passwordHash = await bcrypt.hash('AdminPass1!', 12);
  const admin = await User.create({ name: 'Admin', phone: '9800000001', passwordHash, role: 'admin' });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ phone: '9800000001', password: 'AdminPass1!' });
  return agent;
}

describe('fare rule admin CRUD', () => {
  it('lets admin create, list, update, and deactivate a fare rule', async () => {
    const agent = await loginAsAdmin();

    const create = await agent.post('/api/admin/fare-rules').send({
      region: 'Visakhapatnam',
      category: 'vehicle_small',
      baseFare: 150,
      perKmRate: 18,
      minimumFare: 250,
    });
    expect(create.status).toBe(201);
    const ruleId = create.body.fareRule._id;

    const list = await agent.get('/api/admin/fare-rules?region=Visakhapatnam');
    expect(list.status).toBe(200);
    expect(list.body.fareRules.length).toBe(1);

    const update = await agent.patch(`/api/admin/fare-rules/${ruleId}`).send({ baseFare: 175 });
    expect(update.status).toBe(200);
    expect(update.body.fareRule.baseFare).toBe(175);

    const deactivate = await agent.patch(`/api/admin/fare-rules/${ruleId}`).send({ active: false });
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.fareRule.active).toBe(false);
  });

  it('rejects a non-admin from creating a fare rule', async () => {
    const passwordHash = await bcrypt.hash('Passw0rd!', 12);
    await User.create({ name: 'C', phone: '9800000002', passwordHash, role: 'customer' });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ phone: '9800000002', password: 'Passw0rd!' });

    const res = await agent.post('/api/admin/fare-rules').send({
      region: 'Test',
      category: 'vehicle_small',
      baseFare: 100,
      perKmRate: 10,
      minimumFare: 200,
    });
    expect(res.status).toBe(403);
  });

  it('validates category against the known enum', async () => {
    const agent = await loginAsAdmin();
    const res = await agent.post('/api/admin/fare-rules').send({
      region: 'Test',
      category: 'not_a_real_category',
      baseFare: 100,
      perKmRate: 10,
      minimumFare: 200,
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- fareRule.test.ts`
Expected: FAIL — route not mounted / controller missing.

- [ ] **Step 3: Implement controller**

`server/src/controllers/fareRule.controller.ts`:
```typescript
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { FareRule } from '../models/FareRule';
import { writeAuditLog } from '../services/audit.service';

export const listFareRules = asyncHandler(async (req: Request, res: Response) => {
  const { region, category } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (region) filter.region = region;
  if (category) filter.category = category;

  const fareRules = await FareRule.find(filter).sort({ region: 1, category: 1 });
  res.status(200).json({ fareRules });
});

export const createFareRule = asyncHandler(async (req: Request, res: Response) => {
  const { region, category, baseFare, perKmRate, minimumFare } = req.body;

  const fareRule = await FareRule.create({
    region,
    category,
    baseFare,
    perKmRate,
    minimumFare,
    surgeMultiplier: 1.0,
    setByAdminId: req.user!.id,
    active: true,
  });

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'fare_rule_created',
    targetType: 'FareRule',
    targetId: fareRule._id.toString(),
    details: { region, category, baseFare, perKmRate, minimumFare },
  });

  res.status(201).json({ fareRule });
});

export const updateFareRule = asyncHandler(async (req: Request, res: Response) => {
  const fareRule = await FareRule.findById(req.params.id);
  if (!fareRule) throw new ApiError(404, 'Fare rule not found');

  const before = fareRule.toObject();
  const { baseFare, perKmRate, minimumFare, active } = req.body;
  if (baseFare !== undefined) fareRule.baseFare = baseFare;
  if (perKmRate !== undefined) fareRule.perKmRate = perKmRate;
  if (minimumFare !== undefined) fareRule.minimumFare = minimumFare;
  if (active !== undefined) fareRule.active = active;
  await fareRule.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'fare_rule_updated',
    targetType: 'FareRule',
    targetId: fareRule._id.toString(),
    details: { before, after: fareRule.toObject() },
  });

  res.status(200).json({ fareRule });
});
```

- [ ] **Step 4: Implement routes**

`server/src/routes/fareRule.routes.ts`:
```typescript
import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as fareRuleController from '../controllers/fareRule.controller';

export const fareRuleRouter = Router();

fareRuleRouter.use(verifyJwt, requireRole('admin'));

const CATEGORIES = ['vehicle_small', 'vehicle_medium', 'vehicle_large', 'hamali'];

fareRuleRouter.get(
  '/',
  [query('region').optional().isString(), query('category').optional().isIn(CATEGORIES)],
  validate,
  fareRuleController.listFareRules
);

fareRuleRouter.post(
  '/',
  [
    body('region').isString().trim().isLength({ min: 1 }),
    body('category').isIn(CATEGORIES),
    body('baseFare').isFloat({ min: 0 }),
    body('perKmRate').isFloat({ min: 0 }),
    body('minimumFare').isFloat({ min: 0 }),
  ],
  validate,
  fareRuleController.createFareRule
);

fareRuleRouter.patch(
  '/:id',
  [
    param('id').isMongoId(),
    body('baseFare').optional().isFloat({ min: 0 }),
    body('perKmRate').optional().isFloat({ min: 0 }),
    body('minimumFare').optional().isFloat({ min: 0 }),
    body('active').optional().isBoolean(),
  ],
  validate,
  fareRuleController.updateFareRule
);
```

- [ ] **Step 5: Mount in app.ts**

In `server/src/app.ts`, add the import and mount line (near the existing `adminRouter` mount):
```typescript
import { fareRuleRouter } from './routes/fareRule.routes';
```
```typescript
app.use('/api/admin/fare-rules', fareRuleRouter);
```

- [ ] **Step 6: Run test, verify it passes**

Run: `npm test --workspace server -- fareRule.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/fareRule.controller.ts server/src/routes/fareRule.routes.ts server/tests/fareRule.test.ts server/src/app.ts
git commit -m "feat: add admin FareRule CRUD routes"
```

---

### Task 5: Geocode proxy route

**Files:**
- Create: `server/src/controllers/geocode.controller.ts`, `server/src/routes/geocode.routes.ts`
- Test: `server/tests/geocode.test.ts`
- Modify: `server/src/app.ts`, `server/src/middleware/rateLimit.ts`

- [ ] **Step 1: Add a dedicated rate limiter**

In `server/src/middleware/rateLimit.ts`, add (keep the existing `authLimiter` untouched):
```typescript
export const geocodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many geocode requests, try again in a minute.' },
  keyGenerator: (req) => `${req.ip}:${req.path}`,
});
```

- [ ] **Step 2: Write failing test (mocks the underlying geocode service — no real network call in tests)**

`server/tests/geocode.test.ts`:
```typescript
import './setup';
import request from 'supertest';
import { app } from '../src/app';
import * as geocodeService from '../src/services/geocode.service';

describe('GET /api/geocode', () => {
  it('proxies to geocodeAddress and returns its results', async () => {
    const spy = jest
      .spyOn(geocodeService, 'geocodeAddress')
      .mockResolvedValue([{ lat: 17.385, lon: 78.4867, displayName: 'Hyderabad, Telangana, India' }]);

    const res = await request(app).get('/api/geocode').query({ q: 'Hyderabad' });

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([{ lat: 17.385, lon: 78.4867, displayName: 'Hyderabad, Telangana, India' }]);
    expect(spy).toHaveBeenCalledWith('Hyderabad');
    spy.mockRestore();
  });

  it('requires a non-empty q param', async () => {
    const res = await request(app).get('/api/geocode').query({ q: '' });
    expect(res.status).toBe(400);
  });

  it('does not require authentication (public endpoint)', async () => {
    jest.spyOn(geocodeService, 'geocodeAddress').mockResolvedValue([]);
    const res = await request(app).get('/api/geocode').query({ q: 'anywhere' });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

Run: `npm test --workspace server -- geocode.test.ts`
Expected: FAIL — route not mounted.

- [ ] **Step 4: Implement controller**

`server/src/controllers/geocode.controller.ts`:
```typescript
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { geocodeAddress } from '../services/geocode.service';

export const geocode = asyncHandler(async (req: Request, res: Response) => {
  const q = (req.query.q as string) ?? '';
  const results = await geocodeAddress(q);
  res.status(200).json({ results });
});
```

- [ ] **Step 5: Implement routes**

`server/src/routes/geocode.routes.ts`:
```typescript
import { Router } from 'express';
import { query } from 'express-validator';
import { geocodeLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import * as geocodeController from '../controllers/geocode.controller';

export const geocodeRouter = Router();

geocodeRouter.get(
  '/',
  geocodeLimiter,
  [query('q').isString().trim().isLength({ min: 1, max: 200 })],
  validate,
  geocodeController.geocode
);
```

- [ ] **Step 6: Mount in app.ts**

```typescript
import { geocodeRouter } from './routes/geocode.routes';
```
```typescript
app.use('/api/geocode', geocodeRouter);
```

- [ ] **Step 7: Run test, verify it passes**

Run: `npm test --workspace server -- geocode.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add server/src/controllers/geocode.controller.ts server/src/routes/geocode.routes.ts server/tests/geocode.test.ts server/src/app.ts server/src/middleware/rateLimit.ts
git commit -m "feat: add public rate-limited geocode proxy route"
```

---

### Task 6: Booking controller + routes (create/list/get/cancel)

**Files:**
- Create: `server/src/controllers/booking.controller.ts`, `server/src/routes/booking.routes.ts`
- Test: `server/tests/booking.test.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Write failing test**

`server/tests/booking.test.ts`:
```typescript
import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { FareRule } from '../src/models/FareRule';

async function loginAsCustomer(phone = '9810000001') {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const customer = await User.create({ name: 'Cust', phone, passwordHash, role: 'customer', region: 'Visakhapatnam' });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ phone, password: 'Passw0rd!' });
  return { agent, customer };
}

async function seedTruckRule() {
  const admin = await User.create({ name: 'A', phone: '9810099999', passwordHash: 'x', role: 'admin' });
  return FareRule.create({
    region: 'Visakhapatnam',
    category: 'vehicle_small',
    baseFare: 150,
    perKmRate: 18,
    minimumFare: 250,
    surgeMultiplier: 1.0,
    setByAdminId: admin._id,
    active: true,
  });
}

describe('booking lifecycle', () => {
  it('creates a truck booking with a server-computed fareBreakdown, lists it in history, fetches it, and cancels it', async () => {
    await seedTruckRule();
    const { agent, customer } = await loginAsCustomer();

    const create = await agent.post('/api/bookings').send({
      type: 'truck',
      region: 'Visakhapatnam',
      cargoDetails: { weightKg: 800, description: 'Furniture' },
      pickupLocation: { coordinates: [83.2185, 17.6868], address: 'Pickup St' },
      dropLocation: { coordinates: [83.3, 17.75], address: 'Drop Ave' },
      requiredVehicles: [{ capacityKg: 1000, count: 1 }],
    });
    expect(create.status).toBe(201);
    expect(create.body.booking.status).toBe('searching');
    expect(create.body.booking.fareBreakdown.total).toBeGreaterThan(0);
    // fare must be server-computed, never trust a client-sent amount
    expect(create.body.booking.customerId).toBe(customer._id.toString());
    const bookingId = create.body.booking._id;

    const history = await agent.get('/api/bookings');
    expect(history.status).toBe(200);
    expect(history.body.bookings.length).toBe(1);

    const detail = await agent.get(`/api/bookings/${bookingId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.booking._id).toBe(bookingId);

    const cancel = await agent.patch(`/api/bookings/${bookingId}/cancel`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.booking.status).toBe('cancelled');
  });

  it('ignores any client-supplied fareBreakdown/status/customerId in the create payload', async () => {
    await seedTruckRule();
    const { agent } = await loginAsCustomer('9810000002');

    const res = await agent.post('/api/bookings').send({
      type: 'truck',
      region: 'Visakhapatnam',
      cargoDetails: { weightKg: 800 },
      pickupLocation: { coordinates: [83.2185, 17.6868], address: 'Pickup' },
      dropLocation: { coordinates: [83.3, 17.75], address: 'Drop' },
      requiredVehicles: [{ capacityKg: 1000, count: 1 }],
      fareBreakdown: { total: 1 }, // attacker-supplied, must be ignored
      status: 'completed', // attacker-supplied, must be ignored
      customerId: '000000000000000000000000', // attacker-supplied, must be ignored
    });
    expect(res.status).toBe(201);
    expect(res.body.booking.status).toBe('searching');
    expect(res.body.booking.fareBreakdown.total).not.toBe(1);
  });

  it('one customer cannot view or cancel another customer\'s booking', async () => {
    await seedTruckRule();
    const { agent: agentA } = await loginAsCustomer('9810000003');
    const createRes = await agentA.post('/api/bookings').send({
      type: 'truck',
      region: 'Visakhapatnam',
      cargoDetails: { weightKg: 500 },
      pickupLocation: { coordinates: [83.2185, 17.6868], address: 'Pickup' },
      dropLocation: { coordinates: [83.3, 17.75], address: 'Drop' },
      requiredVehicles: [{ capacityKg: 1000, count: 1 }],
    });
    const bookingId = createRes.body.booking._id;

    const { agent: agentB } = await loginAsCustomer('9810000004');
    const getRes = await agentB.get(`/api/bookings/${bookingId}`);
    expect(getRes.status).toBe(404);

    const cancelRes = await agentB.patch(`/api/bookings/${bookingId}/cancel`);
    expect(cancelRes.status).toBe(404);
  });

  it('rejects booking creation with no matching active FareRule for the region/category', async () => {
    const { agent } = await loginAsCustomer('9810000005');
    const res = await agent.post('/api/bookings').send({
      type: 'truck',
      region: 'NoSuchRegion',
      cargoDetails: { weightKg: 500 },
      pickupLocation: { coordinates: [83.2185, 17.6868], address: 'Pickup' },
      dropLocation: { coordinates: [83.3, 17.75], address: 'Drop' },
      requiredVehicles: [{ capacityKg: 1000, count: 1 }],
    });
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- booking.test.ts`
Expected: FAIL — route not mounted.

- [ ] **Step 3: Implement controller**

`server/src/controllers/booking.controller.ts`:
```typescript
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Booking } from '../models/Booking';
import { FareRule } from '../models/FareRule';
import { haversineKm } from '../services/distance.service';
import { bucketVehicleCategory, computeFareBreakdown } from '../services/fare.service';

async function findActiveRule(region: string, category: string) {
  return FareRule.findOne({ region, category, active: true }).sort({ effectiveFrom: -1 });
}

export const createBooking = asyncHandler(async (req: Request, res: Response) => {
  // Only these fields are ever read from the body — fareBreakdown, status,
  // customerId, or anything else the client sends is silently ignored.
  const { type, region, cargoDetails, pickupLocation, dropLocation, requiredVehicles, requiredHamaliCount } =
    req.body;

  const distanceKm = haversineKm(
    { lat: pickupLocation.coordinates[1], lng: pickupLocation.coordinates[0] },
    { lat: dropLocation.coordinates[1], lng: dropLocation.coordinates[0] }
  );

  let vehicleRule;
  if (type === 'truck' || type === 'combo') {
    const vehicleSpec = requiredVehicles?.[0];
    if (!vehicleSpec) throw new ApiError(400, 'requiredVehicles is required for truck/combo bookings');
    const category = bucketVehicleCategory(
      vehicleSpec.capacityKg <= 1000 ? 'mini_truck' : vehicleSpec.capacityKg <= 5000 ? 'medium_truck' : 'large_truck'
    );
    const rule = await findActiveRule(region, category);
    if (!rule) throw new ApiError(422, `No active fare rule for ${region}/${category}`);
    vehicleRule = rule;
  }

  let hamaliRule;
  if (type === 'hamali' || type === 'combo') {
    const rule = await findActiveRule(region, 'hamali');
    if (!rule) throw new ApiError(422, `No active fare rule for ${region}/hamali`);
    hamaliRule = rule;
  }

  const fareBreakdown = computeFareBreakdown({
    vehicleRule: vehicleRule
      ? {
          baseFare: vehicleRule.baseFare,
          perKmRate: vehicleRule.perKmRate,
          minimumFare: vehicleRule.minimumFare,
          surgeMultiplier: vehicleRule.surgeMultiplier,
        }
      : undefined,
    distanceKm,
    hamaliRule: hamaliRule
      ? {
          baseFare: hamaliRule.baseFare,
          perKmRate: hamaliRule.perKmRate,
          minimumFare: hamaliRule.minimumFare,
          surgeMultiplier: hamaliRule.surgeMultiplier,
        }
      : undefined,
    hamaliCount: requiredHamaliCount ?? 0,
  });

  const booking = await Booking.create({
    customerId: req.user!.id, // never trust a client-supplied customerId
    type,
    cargoDetails,
    pickupLocation: { type: 'Point', coordinates: pickupLocation.coordinates, address: pickupLocation.address },
    dropLocation: { type: 'Point', coordinates: dropLocation.coordinates, address: dropLocation.address },
    requiredVehicles: requiredVehicles ?? [],
    requiredHamaliCount: requiredHamaliCount ?? 0,
    status: 'searching',
    fareBreakdown,
    distanceKm,
    statusHistory: [{ status: 'searching', timestamp: new Date() }],
  });

  res.status(201).json({ booking });
});

export const listMyBookings = asyncHandler(async (req: Request, res: Response) => {
  const bookings = await Booking.find({ customerId: req.user!.id }).sort({ createdAt: -1 });
  res.status(200).json({ bookings });
});

export const getMyBooking = asyncHandler(async (req: Request, res: Response) => {
  // Scoped by customerId from the JWT, not just the :id param, so one
  // customer can never fetch another's booking by guessing/enumerating ids.
  const booking = await Booking.findOne({ _id: req.params.id, customerId: req.user!.id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  res.status(200).json({ booking });
});

export const cancelMyBooking = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findOne({ _id: req.params.id, customerId: req.user!.id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (['completed', 'cancelled'].includes(booking.status)) {
    throw new ApiError(400, `Cannot cancel a booking that is already ${booking.status}`);
  }

  booking.status = 'cancelled';
  booking.statusHistory.push({ status: 'cancelled', timestamp: new Date() });
  await booking.save();

  res.status(200).json({ booking });
});
```

- [ ] **Step 4: Implement routes**

`server/src/routes/booking.routes.ts`:
```typescript
import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as bookingController from '../controllers/booking.controller';

export const bookingRouter = Router();

bookingRouter.use(verifyJwt, requireRole('customer'));

const pointRule = (field: string) => [
  body(`${field}.coordinates`).isArray({ min: 2, max: 2 }),
  body(`${field}.coordinates.*`).isFloat(),
  body(`${field}.address`).isString().trim().isLength({ min: 1 }),
];

bookingRouter.post(
  '/',
  [
    body('type').isIn(['truck', 'hamali', 'combo']),
    body('region').isString().trim().isLength({ min: 1 }),
    body('cargoDetails.weightKg').isFloat({ min: 0 }),
    ...pointRule('pickupLocation'),
    ...pointRule('dropLocation'),
    body('requiredVehicles').optional().isArray(),
    body('requiredHamaliCount').optional().isInt({ min: 0 }),
  ],
  validate,
  bookingController.createBooking
);

bookingRouter.get('/', bookingController.listMyBookings);
bookingRouter.get('/:id', [param('id').isMongoId()], validate, bookingController.getMyBooking);
bookingRouter.patch(
  '/:id/cancel',
  [param('id').isMongoId()],
  validate,
  bookingController.cancelMyBooking
);
```

- [ ] **Step 5: Mount in app.ts**

```typescript
import { bookingRouter } from './routes/booking.routes';
```
```typescript
app.use('/api/bookings', bookingRouter);
```

- [ ] **Step 6: Run test, verify it passes**

Run: `npm test --workspace server -- booking.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/booking.controller.ts server/src/routes/booking.routes.ts server/tests/booking.test.ts server/src/app.ts
git commit -m "feat: add customer booking create/list/get/cancel routes with server-side fare computation"
```

---

### Task 7: Availability toggle (driver/hamali_solo/mutha_leader online-offline + location)

**Files:**
- Create: `server/src/controllers/availability.controller.ts`, `server/src/routes/availability.routes.ts`
- Test: `server/tests/availability.test.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Write failing test**

`server/tests/availability.test.ts`:
```typescript
import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Vehicle } from '../src/models/Vehicle';
import { HamaliProfile } from '../src/models/HamaliProfile';

async function loginAsDriver(phone = '9820000001') {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const driver = await User.create({ name: 'Drv', phone, passwordHash, role: 'driver' });
  await Vehicle.create({
    ownerId: driver._id,
    type: 'mini_truck',
    capacityKg: 1000,
    registrationNumber: `AP01Z${phone.slice(-4)}`,
  });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ phone, password: 'Passw0rd!' });
  return { agent, driver };
}

describe('availability toggle', () => {
  it('lets a driver go online with a location, then offline', async () => {
    const { agent, driver } = await loginAsDriver();

    const online = await agent
      .patch('/api/availability')
      .send({ status: 'online', location: { lat: 17.385, lng: 78.4867 } });
    expect(online.status).toBe(200);

    const vehicle = await Vehicle.findOne({ ownerId: driver._id });
    expect(vehicle?.availabilityStatus).toBe('online');
    expect(vehicle?.currentLocation.coordinates).toEqual([78.4867, 17.385]);

    const offline = await agent.patch('/api/availability').send({ status: 'offline' });
    expect(offline.status).toBe(200);
    const vehicleAfter = await Vehicle.findOne({ ownerId: driver._id });
    expect(vehicleAfter?.availabilityStatus).toBe('offline');
  });

  it('rejects going online without a location', async () => {
    const { agent } = await loginAsDriver('9820000002');
    const res = await agent.patch('/api/availability').send({ status: 'online' });
    expect(res.status).toBe(400);
  });

  it('works for a hamali_solo user against their HamaliProfile', async () => {
    const passwordHash = await bcrypt.hash('Passw0rd!', 12);
    const hamali = await User.create({ name: 'H', phone: '9820000003', passwordHash, role: 'hamali_solo' });
    await HamaliProfile.create({ userId: hamali._id, type: 'solo' });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ phone: '9820000003', password: 'Passw0rd!' });

    const res = await agent
      .patch('/api/availability')
      .send({ status: 'online', location: { lat: 16.5, lng: 80.6 } });
    expect(res.status).toBe(200);

    const profile = await HamaliProfile.findOne({ userId: hamali._id });
    expect(profile?.availabilityStatus).toBe('online');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- availability.test.ts`
Expected: FAIL — route not mounted.

- [ ] **Step 3: Implement controller**

`server/src/controllers/availability.controller.ts`:
```typescript
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Vehicle } from '../models/Vehicle';
import { HamaliProfile } from '../models/HamaliProfile';

export const setAvailability = asyncHandler(async (req: Request, res: Response) => {
  const { status, location } = req.body;

  if (status === 'online' && !location) {
    throw new ApiError(400, 'A location is required to go online');
  }

  const update: Record<string, unknown> = { availabilityStatus: status };
  if (location) {
    update.currentLocation = { type: 'Point', coordinates: [location.lng, location.lat] };
  }

  if (req.user!.role === 'driver') {
    const vehicle = await Vehicle.findOneAndUpdate({ ownerId: req.user!.id }, update, { new: true });
    if (!vehicle) throw new ApiError(404, 'No vehicle found for this driver');
    res.status(200).json({ availabilityStatus: vehicle.availabilityStatus });
    return;
  }

  if (req.user!.role === 'hamali_solo' || req.user!.role === 'mutha_leader') {
    // Mutha leaders don't have their own HamaliProfile in Phase 1's scope
    // (they're group admins, not laborers) — treat leader availability as
    // "the group is accepting requests" by updating on their own behalf
    // only if a profile exists; otherwise this is a no-op success for
    // leaders until Phase 2's mutha-leader flow needs its own state.
    const profile = await HamaliProfile.findOneAndUpdate({ userId: req.user!.id }, update, { new: true });
    if (!profile && req.user!.role === 'hamali_solo') {
      throw new ApiError(404, 'No hamali profile found for this user');
    }
    res.status(200).json({ availabilityStatus: profile?.availabilityStatus ?? status });
    return;
  }

  throw new ApiError(403, 'This role does not have an availability toggle');
});
```

- [ ] **Step 4: Implement routes**

`server/src/routes/availability.routes.ts`:
```typescript
import { Router } from 'express';
import { body } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as availabilityController from '../controllers/availability.controller';

export const availabilityRouter = Router();

availabilityRouter.patch(
  '/',
  verifyJwt,
  requireRole('driver', 'hamali_solo', 'mutha_leader'),
  [
    body('status').isIn(['online', 'offline']),
    body('location.lat').if(body('status').equals('online')).isFloat({ min: -90, max: 90 }),
    body('location.lng').if(body('status').equals('online')).isFloat({ min: -180, max: 180 }),
  ],
  validate,
  availabilityController.setAvailability
);
```

- [ ] **Step 5: Mount in app.ts**

```typescript
import { availabilityRouter } from './routes/availability.routes';
```
```typescript
app.use('/api/availability', availabilityRouter);
```

- [ ] **Step 6: Run test, verify it passes**

Run: `npm test --workspace server -- availability.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/availability.controller.ts server/src/routes/availability.routes.ts server/tests/availability.test.ts server/src/app.ts
git commit -m "feat: add driver/hamali/mutha-leader online-offline availability toggle"
```

---

### Task 8: Requests controller + routes (driver/hamali_solo: list-pending, accept, reject)

**Files:**
- Create: `server/src/controllers/requests.controller.ts`, `server/src/routes/requests.routes.ts`
- Test: `server/tests/requests.test.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Write failing test**

`server/tests/requests.test.ts`:
```typescript
import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Vehicle } from '../src/models/Vehicle';
import { Booking } from '../src/models/Booking';

async function makeOnlineDriver(phone: string, coords: [number, number]) {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const driver = await User.create({ name: 'D', phone, passwordHash, role: 'driver' });
  await Vehicle.create({
    ownerId: driver._id,
    type: 'mini_truck',
    capacityKg: 1000,
    registrationNumber: `AP02Z${phone.slice(-4)}`,
    availabilityStatus: 'online',
    currentLocation: { type: 'Point', coordinates: coords },
  });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ phone, password: 'Passw0rd!' });
  return agent;
}

async function makeSearchingTruckBooking() {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const customer = await User.create({ name: 'C', phone: '9830099998', passwordHash, role: 'customer' });
  return Booking.create({
    customerId: customer._id,
    type: 'truck',
    cargoDetails: { weightKg: 500 },
    pickupLocation: { type: 'Point', coordinates: [78.4867, 17.385], address: 'Pickup' },
    dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
    requiredVehicles: [{ capacityKg: 500, count: 1 }],
    status: 'searching',
    fareBreakdown: { baseFare: 150, distanceFare: 50, surgeMultiplier: 1, hamaliFare: 0, total: 200 },
    distanceKm: 5,
    statusHistory: [{ status: 'searching', timestamp: new Date() }],
  });
}

describe('driver requests: list/accept/reject', () => {
  it('shows a nearby searching booking to an online driver with sufficient capacity', async () => {
    const agent = await makeOnlineDriver('9830000001', [78.49, 17.39]);
    await makeSearchingTruckBooking();

    const res = await agent.get('/api/requests');
    expect(res.status).toBe(200);
    expect(res.body.bookings.length).toBe(1);
  });

  it('lets the first driver to accept atomically claim it; a second driver then sees nothing and cannot also accept', async () => {
    const agentA = await makeOnlineDriver('9830000002', [78.49, 17.39]);
    const agentB = await makeOnlineDriver('9830000003', [78.491, 17.391]);
    const booking = await makeSearchingTruckBooking();

    const acceptA = await agentA.post(`/api/requests/${booking._id}/accept`);
    expect(acceptA.status).toBe(200);
    expect(acceptA.body.booking.status).toBe('matched');

    const acceptB = await agentB.post(`/api/requests/${booking._id}/accept`);
    expect(acceptB.status).toBe(409);

    const listB = await agentB.get('/api/requests');
    expect(listB.body.bookings.length).toBe(0);
  });

  it('lets a driver reject a booking, after which it no longer appears in their own list but still appears for others', async () => {
    const agentA = await makeOnlineDriver('9830000004', [78.49, 17.39]);
    const agentB = await makeOnlineDriver('9830000005', [78.491, 17.391]);
    const booking = await makeSearchingTruckBooking();

    const reject = await agentA.post(`/api/requests/${booking._id}/reject`);
    expect(reject.status).toBe(200);

    const listA = await agentA.get('/api/requests');
    expect(listA.body.bookings.length).toBe(0);

    const listB = await agentB.get('/api/requests');
    expect(listB.body.bookings.length).toBe(1);
  });

  it('rejects an accept from a customer role (only driver/hamali_solo/mutha_leader may accept)', async () => {
    const passwordHash = await bcrypt.hash('Passw0rd!', 12);
    await User.create({ name: 'C2', phone: '9830000006', passwordHash, role: 'customer' });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ phone: '9830000006', password: 'Passw0rd!' });
    const booking = await makeSearchingTruckBooking();

    const res = await agent.post(`/api/requests/${booking._id}/accept`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- requests.test.ts`
Expected: FAIL — route not mounted.

- [ ] **Step 3: Implement controller**

`server/src/controllers/requests.controller.ts`:
```typescript
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Booking } from '../models/Booking';
import { Vehicle } from '../models/Vehicle';
import { HamaliProfile } from '../models/HamaliProfile';

const MAX_MATCH_DISTANCE_KM = 50;

export const listPendingRequests = asyncHandler(async (req: Request, res: Response) => {
  const role = req.user!.role;

  if (role === 'driver') {
    const vehicle = await Vehicle.findOne({ ownerId: req.user!.id });
    if (!vehicle || vehicle.availabilityStatus !== 'online') {
      res.status(200).json({ bookings: [] });
      return;
    }
    const bookings = await Booking.find({
      status: 'searching',
      type: { $in: ['truck', 'combo'] },
      rejectedByUserIds: { $ne: req.user!.id },
      'requiredVehicles.0.capacityKg': { $lte: vehicle.capacityKg },
      pickupLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: vehicle.currentLocation.coordinates },
          $maxDistance: MAX_MATCH_DISTANCE_KM * 1000,
        },
      },
    });
    res.status(200).json({ bookings });
    return;
  }

  if (role === 'hamali_solo') {
    const profile = await HamaliProfile.findOne({ userId: req.user!.id });
    if (!profile || profile.availabilityStatus !== 'online') {
      res.status(200).json({ bookings: [] });
      return;
    }
    const bookings = await Booking.find({
      status: 'searching',
      type: { $in: ['hamali', 'combo'] },
      rejectedByUserIds: { $ne: req.user!.id },
      pickupLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: profile.currentLocation.coordinates },
          $maxDistance: MAX_MATCH_DISTANCE_KM * 1000,
        },
      },
    });
    res.status(200).json({ bookings });
    return;
  }

  // mutha_leader: matching against the group's nearby online members is a
  // heavier query (matching.service's findCandidateMuthas), used by Task 9's
  // dedicated leader endpoint rather than duplicated here.
  res.status(200).json({ bookings: [] });
});

export const acceptRequest = asyncHandler(async (req: Request, res: Response) => {
  const role = req.user!.role;
  if (!['driver', 'hamali_solo'].includes(role)) {
    throw new ApiError(403, 'Only driver or hamali_solo may accept via this endpoint');
  }

  const assignField = role === 'driver' ? 'assignedDriverIds' : 'assignedHamaliIds';

  // Atomic claim: only succeeds if the booking is STILL 'searching' at the
  // moment of the update. Whichever request wins this race gets status
  // 'matched'; every other concurrent accept fails the filter and returns
  // null, which we turn into a 409 below. This is what makes "first to
  // accept wins" actually race-safe rather than a read-then-write bug.
  const booking = await Booking.findOneAndUpdate(
    { _id: req.params.id, status: 'searching' },
    {
      status: 'matched',
      $push: { [assignField]: req.user!.id, statusHistory: { status: 'matched', timestamp: new Date() } },
    },
    { new: true }
  );

  if (!booking) {
    const exists = await Booking.exists({ _id: req.params.id });
    if (!exists) throw new ApiError(404, 'Booking not found');
    throw new ApiError(409, 'This booking has already been matched to someone else');
  }

  res.status(200).json({ booking });
});

export const rejectRequest = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findByIdAndUpdate(
    req.params.id,
    { $addToSet: { rejectedByUserIds: req.user!.id } },
    { new: true }
  );
  if (!booking) throw new ApiError(404, 'Booking not found');
  res.status(200).json({ ok: true });
});
```

- [ ] **Step 4: Implement routes**

`server/src/routes/requests.routes.ts`:
```typescript
import { Router } from 'express';
import { param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as requestsController from '../controllers/requests.controller';

export const requestsRouter = Router();

requestsRouter.use(verifyJwt, requireRole('driver', 'hamali_solo', 'mutha_leader'));

requestsRouter.get('/', requestsController.listPendingRequests);
requestsRouter.post(
  '/:id/accept',
  [param('id').isMongoId()],
  validate,
  requestsController.acceptRequest
);
requestsRouter.post(
  '/:id/reject',
  [param('id').isMongoId()],
  validate,
  requestsController.rejectRequest
);
```

- [ ] **Step 5: Mount in app.ts**

```typescript
import { requestsRouter } from './routes/requests.routes';
```
```typescript
app.use('/api/requests', requestsRouter);
```

- [ ] **Step 6: Run test, verify it passes**

Run: `npm test --workspace server -- requests.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/requests.controller.ts server/src/routes/requests.routes.ts server/tests/requests.test.ts server/src/app.ts
git commit -m "feat: add driver/hamali_solo pending-requests list, race-safe accept, and reject"
```

---

### Task 9: Mutha leader requests + assign-members action

**Files:**
- Modify: `server/src/controllers/requests.controller.ts`, `server/src/routes/requests.routes.ts`
- Test: `server/tests/requests.test.ts` (extend)

- [ ] **Step 1: Write failing test (append to `server/tests/requests.test.ts`)**

Add this new `describe` block at the end of the file, before the final closing (append after the existing content, do not remove anything):
```typescript
describe('mutha leader requests and member assignment', () => {
  async function makeMuthaWithOnlineMember(leaderPhone: string, memberPhone: string, coords: [number, number]) {
    const leaderHash = await bcrypt.hash('Passw0rd!', 12);
    const leader = await User.create({ name: 'L', phone: leaderPhone, passwordHash: leaderHash, role: 'mutha_leader' });
    const mutha = await (await import('../src/models/Mutha')).Mutha.create({
      name: 'Group',
      leaderId: leader._id,
      memberIds: [],
      inviteCode: `CODE${leaderPhone.slice(-4)}`,
    });

    const memberHash = await bcrypt.hash('Passw0rd!', 12);
    const member = await User.create({ name: 'M', phone: memberPhone, passwordHash: memberHash, role: 'mutha_member' });
    const { HamaliProfile } = await import('../src/models/HamaliProfile');
    await HamaliProfile.create({
      userId: member._id,
      type: 'mutha_member',
      muthaId: mutha._id,
      availabilityStatus: 'online',
      currentLocation: { type: 'Point', coordinates: coords },
    });
    mutha.memberIds.push(member._id);
    await mutha.save();

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ phone: leaderPhone, password: 'Passw0rd!' });
    return { agent, leader, mutha, member };
  }

  async function makeSearchingHamaliBooking() {
    const passwordHash = await bcrypt.hash('Passw0rd!', 12);
    const customer = await User.create({ name: 'C3', phone: '9840099997', passwordHash, role: 'customer' });
    return Booking.create({
      customerId: customer._id,
      type: 'hamali',
      cargoDetails: { weightKg: 200 },
      pickupLocation: { type: 'Point', coordinates: [78.4867, 17.385], address: 'Pickup' },
      dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
      requiredHamaliCount: 1,
      status: 'searching',
      fareBreakdown: { baseFare: 100, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 100, total: 100 },
      distanceKm: 2,
      statusHistory: [{ status: 'searching', timestamp: new Date() }],
    });
  }

  it('lets a leader accept a booking on behalf of the group, then assign a specific online member', async () => {
    const { agent, mutha, member } = await makeMuthaWithOnlineMember('9840000001', '9840000002', [78.49, 17.39]);
    const booking = await makeSearchingHamaliBooking();

    const accept = await agent.post(`/api/requests/${booking._id}/accept`);
    expect(accept.status).toBe(200);
    expect(accept.body.booking.status).toBe('matched');
    expect(accept.body.booking.assignedMuthaId).toBe(mutha._id.toString());

    const assign = await agent
      .post(`/api/requests/${booking._id}/assign-members`)
      .send({ memberIds: [member._id.toString()] });
    expect(assign.status).toBe(200);
    expect(assign.body.booking.assignedHamaliIds).toContain(member._id.toString());
  });

  it('rejects assigning a member who does not belong to the leader\'s own Mutha', async () => {
    const { agent, mutha } = await makeMuthaWithOnlineMember('9840000003', '9840000004', [78.49, 17.39]);
    const booking = await makeSearchingHamaliBooking();
    await agent.post(`/api/requests/${booking._id}/accept`);

    const passwordHash = await bcrypt.hash('Passw0rd!', 12);
    const outsider = await User.create({ name: 'Outsider', phone: '9840000005', passwordHash, role: 'mutha_member' });

    const res = await agent
      .post(`/api/requests/${booking._id}/assign-members`)
      .send({ memberIds: [outsider._id.toString()] });
    expect(res.status).toBe(400);
    void mutha;
  });

  it('shows a nearby searching hamali booking to a leader whose group has enough online nearby members', async () => {
    const { agent } = await makeMuthaWithOnlineMember('9840000006', '9840000007', [78.49, 17.39]);
    await makeSearchingHamaliBooking(); // requiredHamaliCount: 1, one online member is enough

    const res = await agent.get('/api/requests');
    expect(res.status).toBe(200);
    expect(res.body.bookings.length).toBe(1);
  });

  it('does not show a booking to a leader whose group lacks enough online nearby members', async () => {
    const leaderHash = await bcrypt.hash('Passw0rd!', 12);
    const leader = await User.create({ name: 'L2', phone: '9840000008', passwordHash: leaderHash, role: 'mutha_leader' });
    const { Mutha } = await import('../src/models/Mutha');
    await Mutha.create({ name: 'Empty Group', leaderId: leader._id, memberIds: [], inviteCode: 'EMPTYGRP1' });
    // No online members at all — group can't fulfill even requiredHamaliCount: 1.
    await makeSearchingHamaliBooking();

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ phone: '9840000008', password: 'Passw0rd!' });

    const res = await agent.get('/api/requests');
    expect(res.status).toBe(200);
    expect(res.body.bookings.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- requests.test.ts`
Expected: FAIL — `assign-members` route doesn't exist yet; `accept` doesn't set `assignedMuthaId` for leaders yet; `listPendingRequests` still returns `[]` unconditionally for `mutha_leader` (Task 8 stubbed this deliberately, deferring to this task — see Task 8's comment).

- [ ] **Step 3: Extend the controller**

In `server/src/controllers/requests.controller.ts`, first replace the `mutha_leader` branch of `listPendingRequests` (currently `res.status(200).json({ bookings: [] })` at the end of the function) with a real implementation using `matching.service`'s `findCandidateMuthas` — this is the piece Task 8 deferred and this task is responsible for closing, otherwise a Mutha leader would have no way to ever discover a pending hamali booking:

```typescript
import { findCandidateMuthas } from '../services/matching.service';

// ... inside listPendingRequests, replace the final fallback block:

  if (role === 'mutha_leader') {
    const { Mutha } = await import('../models/Mutha');
    const mutha = await Mutha.findOne({ leaderId: req.user!.id });
    if (!mutha) {
      res.status(200).json({ bookings: [] });
      return;
    }

    // Only bookings this specific group can actually fulfill: at least
    // `requiredHamaliCount` of the group's own members currently online
    // and within range of the pickup point. Loop over open hamali/combo
    // bookings and keep only those where findCandidateMuthas would surface
    // this leader's own Mutha as a qualifying candidate.
    const openBookings = await Booking.find({
      status: 'searching',
      type: { $in: ['hamali', 'combo'] },
      rejectedByUserIds: { $ne: req.user!.id },
    });

    const qualifying = [];
    for (const booking of openBookings) {
      const candidates = await findCandidateMuthas({
        pickup: booking.pickupLocation.coordinates as [number, number],
        maxDistanceKm: MAX_MATCH_DISTANCE_KM,
        requiredHamaliCount: booking.requiredHamaliCount,
      });
      if (candidates.some((m) => m._id.toString() === mutha._id.toString())) {
        qualifying.push(booking);
      }
    }

    res.status(200).json({ bookings: qualifying });
    return;
  }

  res.status(200).json({ bookings: [] });
});
```

This replaces the whole `mutha_leader` fallback path at the end of `listPendingRequests` (everything from the `// mutha_leader: matching against...` comment through the function's closing `});`) — the rest of `listPendingRequests` (the `driver` and `hamali_solo` branches above it) stays exactly as Task 8 left it.

Second, replace the `acceptRequest` function's role check and assignment logic to also handle `mutha_leader`:
```typescript
export const acceptRequest = asyncHandler(async (req: Request, res: Response) => {
  const role = req.user!.role;
  if (!['driver', 'hamali_solo', 'mutha_leader'].includes(role)) {
    throw new ApiError(403, 'Only driver, hamali_solo, or mutha_leader may accept via this endpoint');
  }

  let update: Record<string, unknown>;
  if (role === 'driver') {
    update = { $push: { assignedDriverIds: req.user!.id, statusHistory: { status: 'matched', timestamp: new Date() } } };
  } else if (role === 'hamali_solo') {
    update = { $push: { assignedHamaliIds: req.user!.id, statusHistory: { status: 'matched', timestamp: new Date() } } };
  } else {
    const { Mutha } = await import('../models/Mutha');
    const mutha = await Mutha.findOne({ leaderId: req.user!.id });
    if (!mutha) throw new ApiError(404, 'No Mutha found for this leader');
    update = {
      assignedMuthaId: mutha._id,
      $push: { statusHistory: { status: 'matched', timestamp: new Date() } },
    };
  }

  const booking = await Booking.findOneAndUpdate(
    { _id: req.params.id, status: 'searching' },
    { status: 'matched', ...update },
    { new: true }
  );

  if (!booking) {
    const exists = await Booking.exists({ _id: req.params.id });
    if (!exists) throw new ApiError(404, 'Booking not found');
    throw new ApiError(409, 'This booking has already been matched to someone else');
  }

  res.status(200).json({ booking });
});

export const assignMembers = asyncHandler(async (req: Request, res: Response) => {
  const { memberIds } = req.body;
  const { Mutha } = await import('../models/Mutha');

  const mutha = await Mutha.findOne({ leaderId: req.user!.id });
  if (!mutha) throw new ApiError(404, 'No Mutha found for this leader');

  const muthaMemberIdStrings = mutha.memberIds.map((id) => id.toString());
  const allBelongToMutha = (memberIds as string[]).every((id) => muthaMemberIdStrings.includes(id));
  if (!allBelongToMutha) {
    throw new ApiError(400, 'One or more memberIds do not belong to your Mutha');
  }

  const booking = await Booking.findOneAndUpdate(
    { _id: req.params.id, assignedMuthaId: mutha._id },
    { $addToSet: { assignedHamaliIds: { $each: memberIds } } },
    { new: true }
  );
  if (!booking) throw new ApiError(404, 'Booking not found or not matched to your Mutha');

  res.status(200).json({ booking });
});
```

Note the original `acceptRequest`'s `assignField` local variable approach is superseded by this version — replace the whole function, don't merge the two.

- [ ] **Step 4: Add the route**

In `server/src/routes/requests.routes.ts`, add:
```typescript
requestsRouter.post(
  '/:id/assign-members',
  requireRole('mutha_leader'),
  [param('id').isMongoId(), body('memberIds').isArray({ min: 1 })],
  validate,
  requestsController.assignMembers
);
```
(add `body` to the existing `express-validator` import line at the top of the file)

- [ ] **Step 5: Run test, verify it passes**

Run: `npm test --workspace server -- requests.test.ts`
Expected: PASS (8 tests total in this file: the 4 from Task 8 plus 4 added here — accept-on-behalf, assign-members, reject-outsider, and the two listing tests).

- [ ] **Step 6: Run full suite**

Run: `npm test --workspace server`
Expected: all suites pass.

- [ ] **Step 7: Note two known scaling tradeoffs (not a blocker for Phase 2, but real — don't understate them)**

The `mutha_leader` branch of `listPendingRequests` has TWO unbounded-cost properties, not just one:

1. It calls `findCandidateMuthas` once per open hamali/combo booking (O(n) query fan-out) rather than a single query, because "is my specific Mutha among the qualifying candidates for this booking" isn't expressible as one Mongo query without restructuring `findCandidateMuthas`.
2. Unlike the sibling `driver`/`hamali_solo` branches (which both scope their initial `Booking.find` with a `$near` centered on the requester's own location), the outer `Booking.find({ status: 'searching', type: {...}, rejectedByUserIds: {...} })` scan here has **no geographic bound at all** — it's O(all open hamali/combo bookings platform-wide), not O(nearby ones). This is because a Mutha leader has no single tracked location (unlike a Vehicle or solo HamaliProfile) to `$near` against, and `Booking` doesn't currently persist the `region` string a customer submits at creation time (Task 6's controller only uses it to look up a `FareRule`, doesn't store it on the document) — so there's no cheap coarse filter available without a schema change.

Both are acceptable for Phase 2's launch scope (single-region, AP-only, polling-based, no sockets), but property 2 is the more consequential one long-term — it's a full-table scan pattern, not just a per-row cost multiplier. If this needs fixing before it's a real bottleneck, the fix is adding a persisted `region` (or a real geo point) to `Booking` and to `Mutha`, then bounding both the outer scan and `findCandidateMuthas` by it — a small schema task, not a Task 9 blocker, but flag it explicitly rather than let only the milder "O(n) fan-out" framing survive in institutional memory.

- [ ] **Step 8: Commit**

```bash
git add server/src/controllers/requests.controller.ts server/src/routes/requests.routes.ts server/tests/requests.test.ts
git commit -m "feat: let mutha leaders discover matchable bookings, accept on behalf of their group, and assign specific members"
```

---

### Task 10: Earnings controller + routes

**Files:**
- Create: `server/src/controllers/earnings.controller.ts`, `server/src/routes/earnings.routes.ts`
- Test: `server/tests/earnings.test.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Write failing test**

`server/tests/earnings.test.ts`:
```typescript
import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';

async function loginAsDriver(phone: string) {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const driver = await User.create({ name: 'D', phone, passwordHash, role: 'driver' });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ phone, password: 'Passw0rd!' });
  return { agent, driver };
}

async function makeCompletedBooking(driverId: string, total: number) {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const customer = await User.create({
    name: 'C',
    phone: `98500${Math.floor(Math.random() * 100000)}`,
    passwordHash,
    role: 'customer',
  });
  return Booking.create({
    customerId: customer._id,
    type: 'truck',
    cargoDetails: { weightKg: 500 },
    pickupLocation: { type: 'Point', coordinates: [78.4867, 17.385], address: 'Pickup' },
    dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
    assignedDriverIds: [driverId],
    status: 'completed',
    fareBreakdown: { baseFare: 100, distanceFare: total - 100, surgeMultiplier: 1, hamaliFare: 0, total },
    distanceKm: 5,
    statusHistory: [{ status: 'completed', timestamp: new Date() }],
  });
}

describe('driver earnings', () => {
  it('sums completed bookings assigned to the logged-in driver only', async () => {
    const { agent, driver } = await loginAsDriver('9850000001');
    await makeCompletedBooking(driver._id.toString(), 500);
    await makeCompletedBooking(driver._id.toString(), 300);

    const { driver: otherDriver } = await loginAsDriver('9850000002');
    await makeCompletedBooking(otherDriver._id.toString(), 9999); // must not count toward the first driver

    const res = await agent.get('/api/earnings');
    expect(res.status).toBe(200);
    expect(res.body.totalEarnings).toBe(800);
    expect(res.body.completedJobCount).toBe(2);
  });

  it('excludes non-completed bookings from the total', async () => {
    const { agent, driver } = await loginAsDriver('9850000003');
    const passwordHash = await bcrypt.hash('Passw0rd!', 12);
    const customer = await User.create({ name: 'C', phone: '9850099996', passwordHash, role: 'customer' });
    await Booking.create({
      customerId: customer._id,
      type: 'truck',
      cargoDetails: { weightKg: 500 },
      pickupLocation: { type: 'Point', coordinates: [78.4867, 17.385], address: 'Pickup' },
      dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
      assignedDriverIds: [driver._id],
      status: 'in_progress', // not completed — must not count
      fareBreakdown: { baseFare: 100, distanceFare: 400, surgeMultiplier: 1, hamaliFare: 0, total: 500 },
      distanceKm: 5,
      statusHistory: [{ status: 'in_progress', timestamp: new Date() }],
    });

    const res = await agent.get('/api/earnings');
    expect(res.body.totalEarnings).toBe(0);
    expect(res.body.completedJobCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- earnings.test.ts`
Expected: FAIL — route not mounted.

- [ ] **Step 3: Implement controller**

`server/src/controllers/earnings.controller.ts`:
```typescript
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { Booking } from '../models/Booking';

/**
 * Read-only earnings ledger. No payout/transfer mechanics here (that's
 * Phase 4's Razorpay work) — this just sums what a role's own completed
 * bookings are worth, always scoped to the authenticated user's own id.
 */
export const getMyEarnings = asyncHandler(async (req: Request, res: Response) => {
  const role = req.user!.role;
  const userId = req.user!.id;

  const filter: Record<string, unknown> = { status: 'completed' };
  if (role === 'driver') {
    filter.assignedDriverIds = userId;
  } else if (role === 'hamali_solo') {
    filter.assignedHamaliIds = userId;
  } else if (role === 'mutha_leader') {
    const { Mutha } = await import('../models/Mutha');
    const mutha = await Mutha.findOne({ leaderId: userId });
    filter.assignedMuthaId = mutha?._id ?? null;
  } else if (role === 'mutha_member') {
    filter.assignedHamaliIds = userId;
  } else {
    res.status(200).json({ totalEarnings: 0, completedJobCount: 0, bookings: [] });
    return;
  }

  const bookings = await Booking.find(filter).sort({ createdAt: -1 });
  const totalEarnings = bookings.reduce((sum, b) => sum + b.fareBreakdown.total, 0);

  res.status(200).json({ totalEarnings, completedJobCount: bookings.length, bookings });
});
```

- [ ] **Step 4: Implement routes**

`server/src/routes/earnings.routes.ts`:
```typescript
import { Router } from 'express';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import * as earningsController from '../controllers/earnings.controller';

export const earningsRouter = Router();

earningsRouter.get(
  '/',
  verifyJwt,
  requireRole('driver', 'hamali_solo', 'mutha_leader', 'mutha_member'),
  earningsController.getMyEarnings
);
```

- [ ] **Step 5: Mount in app.ts**

```typescript
import { earningsRouter } from './routes/earnings.routes';
```
```typescript
app.use('/api/earnings', earningsRouter);
```

- [ ] **Step 6: Run test, verify it passes**

Run: `npm test --workspace server -- earnings.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/earnings.controller.ts server/src/routes/earnings.routes.ts server/tests/earnings.test.ts server/src/app.ts
git commit -m "feat: add per-role read-only earnings aggregation endpoint"
```

---

### Task 11: Final Phase 2 backend verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test --workspace server`
Expected: every suite passes (Phase 1's 27 + Phase 2's new: distance 3, fare 10, matching 3, fareRule 3, geocode 3, booking 4, availability 3, requests 6, earnings 2 = 37 new → ~64 total). Exact count isn't the point — zero failures is.

- [ ] **Step 2: Build**

Run: `npm run build:server` (from repo root, builds `shared` first per the Phase 1 fix)
Expected: clean, no TS errors.

- [ ] **Step 3: Report**

List every new route, confirm all tests pass with actual output pasted (not claimed), note this is backend-only — no client pages consume these endpoints yet (that's the Phase 2 client plan, a separate document).

---

## Plan self-review notes

- **Spec coverage:** fare engine ✓ (Task 2), distance ✓ (Task 1), matching ✓ (Task 3), FareRule CRUD ✓ (Task 4), geocode proxy ✓ (Task 5), booking create/list/get/cancel ✓ (Task 6), availability toggle ✓ (Task 7), driver/hamali requests ✓ (Task 8), mutha leader accept+assign ✓ (Task 9), earnings ✓ (Task 10).
- **Placeholder scan:** none — every step has real code or an exact command.
- **Type consistency:** `fareBreakdown` shape matches across `fare.service.ts`, `Booking` model, and every controller that reads/writes it. `LatLng { lat, lng }` used consistently in `distance.service.ts` and `availability.controller.ts`; GeoJSON `[lng, lat]` tuple order used consistently everywhere touching Mongo geo fields (a common source of bugs — double-checked every `coordinates` reference uses `[lng, lat]`).
- **Known gap flagged, not silently dropped:** this plan is backend-only. No client page exists yet to call any of these endpoints — that's intentionally the next, separate plan document, so this phase can be verified and merged as a coherent, working (if headless) unit first.
