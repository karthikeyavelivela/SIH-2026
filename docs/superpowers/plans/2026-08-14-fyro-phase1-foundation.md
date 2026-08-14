# FYRO Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Working FYRO monorepo — auth (customer/driver/hamali incl. Mutha join/create) with JWT+RBAC, all 10 Mongoose models with 2dsphere geo indexes, Admin `/users`+`/managers` (tree view, CRUD, AuditLog), and the full static marketing site.

**Architecture:** npm-workspaces monorepo (`/shared` types, `/server` Express+TS+Mongoose, `/client` Next.js 14 App Router+TS+Tailwind). Stateless JWT auth via httpOnly cookies with a `tokenVersion` field on `User` for refresh-token rotation/invalidation. RBAC enforced by Express middleware reading role from the verified JWT only; Manager permission checks re-fetch `permissions[]` from DB so Admin revocation takes effect immediately.

**Tech Stack:** Next.js 14, TypeScript, TailwindCSS, Framer Motion, Express, Mongoose, MongoDB Atlas, JWT (`jsonwebtoken`), bcrypt, express-validator, express-rate-limit, Jest + Supertest + mongodb-memory-server.

**Spec:** `docs/superpowers/specs/2026-08-14-fyro-phase1-foundation-design.md`

---

## Additional assumption locked during planning

`User` gets one extra field not explicitly in the spec's model list: `tokenVersion: Number, default: 0`. This is the standard stateless mechanism for refresh-token rotation/invalidation (bumped on every refresh and on logout) — without it, "refresh rotates, old one invalidated" from the spec has no enforcement mechanism short of a separate token-blacklist collection, which is heavier for no benefit here. Noted inline in the model file too.

`DELETE /api/admin/users/:id` is a **soft delete** (`accountStatus = 'deleted'`) — hard-deleting would orphan any future Booking/Rating/Payment references. This matches the `accountStatus` enum already in the spec's User model.

---

## File Structure

```
/fyro
  package.json                              npm workspaces root
  .gitignore
  /shared
    package.json
    tsconfig.json
    src/types.ts                            Role, PermissionKey, shared enums/DTOs
  /server
    package.json
    tsconfig.json
    jest.config.js
    .env.example
    src/
      config/env.ts                         zod-validated env
      config/db.ts                          mongoose connect
      models/User.ts
      models/Vehicle.ts
      models/HamaliProfile.ts
      models/Mutha.ts
      models/Booking.ts
      models/FareRule.ts
      models/Rating.ts
      models/Payment.ts
      models/Complaint.ts
      models/Incentive.ts
      models/AuditLog.ts
      utils/ApiError.ts
      utils/asyncHandler.ts
      services/token.service.ts
      services/audit.service.ts
      services/cloudinary.service.ts
      services/geocode.service.ts
      middleware/auth.ts                    verifyJwt
      middleware/rbac.ts                    requireRole, requirePermission
      middleware/validate.ts
      middleware/rateLimit.ts
      controllers/auth.controller.ts
      controllers/admin.controller.ts
      routes/auth.routes.ts
      routes/admin.routes.ts
      app.ts
      server.ts
      scripts/seedAdmin.ts
    tests/
      setup.ts                              mongodb-memory-server bootstrap
      auth.test.ts
      admin.test.ts
      rbac.test.ts
  /client
    package.json
    tsconfig.json
    next.config.js
    postcss.config.js
    tailwind.config.ts
    src/
      app/
        layout.tsx
        globals.css
        (marketing)/layout.tsx
        (marketing)/page.tsx
        (marketing)/how-it-works/page.tsx
        (marketing)/pricing/page.tsx
        (marketing)/about/page.tsx
        (marketing)/contact/page.tsx
        login/page.tsx
        signup/customer/page.tsx
        signup/driver/page.tsx
        signup/hamali/page.tsx
        admin/layout.tsx
        admin/users/page.tsx
        admin/managers/page.tsx
      components/ui/Button.tsx
      components/ui/Card.tsx
      components/ui/Modal.tsx
      components/ui/Badge.tsx
      components/admin/TreeView.tsx
      components/admin/UserTable.tsx
      lib/api.ts
      lib/auth-context.tsx
```

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `.gitignore`, `shared/package.json`, `shared/tsconfig.json`, `shared/src/types.ts`

- [ ] **Step 1: Root workspace config**

`package.json`:
```json
{
  "name": "fyro",
  "private": true,
  "workspaces": ["shared", "server", "client"],
  "scripts": {
    "dev:server": "npm run dev --workspace server",
    "dev:client": "npm run dev --workspace client",
    "test:server": "npm test --workspace server",
    "build:client": "npm run build --workspace client",
    "build:server": "npm run build --workspace server"
  }
}
```

`.gitignore`:
```
node_modules/
.env
.env.local
dist/
.next/
coverage/
*.log
```

- [ ] **Step 2: Shared types package**

`shared/package.json`:
```json
{
  "name": "@fyro/shared",
  "version": "1.0.0",
  "main": "src/types.ts",
  "types": "src/types.ts"
}
```

`shared/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

`shared/src/types.ts`:
```typescript
export type Role =
  | 'customer'
  | 'driver'
  | 'hamali_solo'
  | 'mutha_leader'
  | 'mutha_member'
  | 'manager'
  | 'admin';

export type AccountStatus = 'active' | 'suspended' | 'deleted';
export type KycStatus = 'pending' | 'verified' | 'rejected';
export type AvailabilityStatus = 'online' | 'offline' | 'on_job';

export const MANAGER_PERMISSIONS = [
  'verify_kyc',
  'resolve_complaints',
  'edit_fare_rules',
  'view_analytics',
] as const;
export type ManagerBasePermission = (typeof MANAGER_PERMISSIONS)[number];
// Managers can additionally hold `manage_region:<regionName>` strings.
export type ManagerPermission = ManagerBasePermission | `manage_region:${string}`;

export interface JwtAccessPayload {
  id: string;
  role: Role;
}

export interface JwtRefreshPayload {
  id: string;
  tokenVersion: number;
}
```

- [ ] **Step 3: Install root deps and verify workspace wiring**

Run: `npm install`
Expected: completes, creates root `node_modules` and `package-lock.json`, no errors (no server/client package.json yet, so only `shared` links).

- [ ] **Step 4: Commit**

```bash
git add package.json .gitignore shared
git commit -m "chore: scaffold npm workspaces monorepo with shared types"
```

---

### Task 2: Server config, env validation, DB connection

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/.env.example`, `server/src/config/env.ts`, `server/src/config/db.ts`

- [ ] **Step 1: Server package.json**

`server/package.json`:
```json
{
  "name": "server",
  "version": "1.0.0",
  "main": "dist/server.js",
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "jest --runInBand",
    "seed:admin": "ts-node src/scripts/seedAdmin.ts"
  },
  "dependencies": {
    "@fyro/shared": "*",
    "bcrypt": "^5.1.1",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.2.0",
    "express-validator": "^7.1.0",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "mongoose": "^8.4.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/cookie-parser": "^1.4.7",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^20.12.12",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "mongodb-memory-server": "^9.2.0",
    "supertest": "^6.3.4",
    "ts-jest": "^29.1.2",
    "ts-node": "^10.9.2",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.4.5"
  }
}
```

- [ ] **Step 2: tsconfig**

`server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: .env.example**

`server/.env.example`:
```
NODE_ENV=development
PORT=4000
CLIENT_ORIGIN=http://localhost:3000
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/fyro?retryWrites=true&w=majority
JWT_ACCESS_SECRET=change-me-access-secret-min-32-chars
JWT_REFRESH_SECRET=change-me-refresh-secret-min-32-chars
ADMIN_PHONE=9999999999
ADMIN_PASSWORD=ChangeMe123!
MOCK_EXTERNAL_SERVICES=true
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Copy it: `cp server/.env.example server/.env` (user fills real `MONGODB_URI` later; other defaults are fine for dev).

- [ ] **Step 4: zod-validated env loader**

`server/src/config/env.ts`:
```typescript
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().url(),
  MONGODB_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ADMIN_PHONE: z.string().min(10),
  ADMIN_PASSWORD: z.string().min(8),
  MOCK_EXTERNAL_SERVICES: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

export const env = parsed.data;
```

- [ ] **Step 5: DB connection**

`server/src/config/db.ts`:
```typescript
import mongoose from 'mongoose';
import { env } from './env';

export async function connectDb(): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  return mongoose.connect(env.MONGODB_URI);
}
```

- [ ] **Step 6: Install server deps**

Run: `npm install --workspace server`
Expected: installs cleanly.

- [ ] **Step 7: Commit**

```bash
git add server/package.json server/tsconfig.json server/.env.example
git commit -m "chore: scaffold server with zod env validation and db connection"
```

---

### Task 3: Mongoose models with geo indexes

**Files:**
- Create: all files in `server/src/models/`

- [ ] **Step 1: User model**

`server/src/models/User.ts`:
```typescript
import { Schema, model, Types } from 'mongoose';
import type { Role, AccountStatus, KycStatus } from '@fyro/shared';

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  passwordHash: string;
  role: Role;
  region?: string;
  kycStatus: KycStatus;
  kycDocs: string[];
  profilePhoto?: string;
  accountStatus: AccountStatus;
  // Manager-only; empty for every other role.
  permissions: string[];
  // Bumped on refresh-token rotation and logout to invalidate prior refresh tokens.
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      required: true,
      enum: [
        'customer',
        'driver',
        'hamali_solo',
        'mutha_leader',
        'mutha_member',
        'manager',
        'admin',
      ],
    },
    region: { type: String, trim: true },
    kycStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
    kycDocs: { type: [String], default: [] },
    profilePhoto: { type: String },
    accountStatus: { type: String, enum: ['active', 'suspended', 'deleted'], default: 'active' },
    permissions: { type: [String], default: [] },
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const User = model<IUser>('User', userSchema);
```

- [ ] **Step 2: Vehicle model**

`server/src/models/Vehicle.ts`:
```typescript
import { Schema, model, Types } from 'mongoose';
import type { AvailabilityStatus } from '@fyro/shared';

export interface IVehicle {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  type: string;
  capacityKg: number;
  registrationNumber: string;
  photos: string[];
  verified: boolean;
  currentLocation: { type: 'Point'; coordinates: [number, number] };
  availabilityStatus: AvailabilityStatus;
  createdAt: Date;
  updatedAt: Date;
}

const vehicleSchema = new Schema<IVehicle>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    capacityKg: { type: Number, required: true, min: 1 },
    registrationNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    photos: { type: [String], default: [] },
    verified: { type: Boolean, default: false },
    currentLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    availabilityStatus: { type: String, enum: ['online', 'offline', 'on_job'], default: 'offline' },
  },
  { timestamps: true }
);

vehicleSchema.index({ currentLocation: '2dsphere' });

export const Vehicle = model<IVehicle>('Vehicle', vehicleSchema);
```

- [ ] **Step 3: HamaliProfile model**

`server/src/models/HamaliProfile.ts`:
```typescript
import { Schema, model, Types } from 'mongoose';
import type { AvailabilityStatus } from '@fyro/shared';

export interface IHamaliProfile {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: 'solo' | 'mutha_member';
  muthaId?: Types.ObjectId;
  skills: string[];
  availabilityStatus: AvailabilityStatus;
  currentLocation: { type: 'Point'; coordinates: [number, number] };
  createdAt: Date;
  updatedAt: Date;
}

const hamaliProfileSchema = new Schema<IHamaliProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    type: { type: String, enum: ['solo', 'mutha_member'], required: true },
    muthaId: { type: Schema.Types.ObjectId, ref: 'Mutha' },
    skills: { type: [String], default: [] },
    availabilityStatus: { type: String, enum: ['online', 'offline', 'on_job'], default: 'offline' },
    currentLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
  },
  { timestamps: true }
);

hamaliProfileSchema.index({ currentLocation: '2dsphere' });

export const HamaliProfile = model<IHamaliProfile>('HamaliProfile', hamaliProfileSchema);
```

- [ ] **Step 4: Mutha model**

`server/src/models/Mutha.ts`:
```typescript
import { Schema, model, Types } from 'mongoose';

export interface IMutha {
  _id: Types.ObjectId;
  name: string;
  leaderId: Types.ObjectId;
  memberIds: Types.ObjectId[];
  region?: string;
  inviteCode: string;
  ratingAvg: number;
  ratingCount: number;
  activeJobsCount: number;
  createdAt: Date;
}

const muthaSchema = new Schema<IMutha>(
  {
    name: { type: String, required: true, trim: true },
    leaderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    memberIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    region: { type: String, trim: true },
    inviteCode: { type: String, required: true, unique: true },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    activeJobsCount: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Mutha = model<IMutha>('Mutha', muthaSchema);
```

- [ ] **Step 5: Booking model**

`server/src/models/Booking.ts`:
```typescript
import { Schema, model, Types } from 'mongoose';

export type BookingStatus =
  | 'requested'
  | 'searching'
  | 'matched'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface IBooking {
  _id: Types.ObjectId;
  customerId: Types.ObjectId;
  type: 'truck' | 'hamali' | 'combo';
  cargoDetails: { weightKg: number; description?: string };
  pickupLocation: { type: 'Point'; coordinates: [number, number]; address: string };
  dropLocation: { type: 'Point'; coordinates: [number, number]; address: string };
  requiredVehicles: { capacityKg: number; count: number }[];
  requiredHamaliCount: number;
  assignedDriverIds: Types.ObjectId[];
  assignedHamaliIds: Types.ObjectId[];
  assignedMuthaId?: Types.ObjectId;
  status: BookingStatus;
  fareBreakdown: {
    baseFare: number;
    distanceFare: number;
    surgeMultiplier: number;
    hamaliFare: number;
    total: number;
  };
  distanceKm: number;
  statusHistory: { status: BookingStatus; timestamp: Date }[];
  createdAt: Date;
}

const pointWithAddress = {
  type: { type: String, enum: ['Point'], default: 'Point' },
  coordinates: { type: [Number], required: true },
  address: { type: String, required: true },
};

const bookingSchema = new Schema<IBooking>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['truck', 'hamali', 'combo'], required: true },
    cargoDetails: {
      weightKg: { type: Number, required: true, min: 0 },
      description: { type: String },
    },
    pickupLocation: { type: pointWithAddress, required: true },
    dropLocation: { type: pointWithAddress, required: true },
    requiredVehicles: {
      type: [{ capacityKg: Number, count: Number }],
      default: [],
    },
    requiredHamaliCount: { type: Number, default: 0 },
    assignedDriverIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    assignedHamaliIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    assignedMuthaId: { type: Schema.Types.ObjectId, ref: 'Mutha' },
    status: {
      type: String,
      enum: ['requested', 'searching', 'matched', 'accepted', 'in_progress', 'completed', 'cancelled'],
      default: 'requested',
    },
    fareBreakdown: {
      baseFare: { type: Number, default: 0 },
      distanceFare: { type: Number, default: 0 },
      surgeMultiplier: { type: Number, default: 1.0 },
      hamaliFare: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    distanceKm: { type: Number, default: 0 },
    statusHistory: {
      type: [{ status: String, timestamp: { type: Date, default: Date.now } }],
      default: [],
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

bookingSchema.index({ pickupLocation: '2dsphere' });
bookingSchema.index({ dropLocation: '2dsphere' });
bookingSchema.index({ customerId: 1, status: 1 });

export const Booking = model<IBooking>('Booking', bookingSchema);
```

- [ ] **Step 6: FareRule, Rating, Payment, Complaint, Incentive, AuditLog models**

`server/src/models/FareRule.ts`:
```typescript
import { Schema, model, Types } from 'mongoose';

export interface IFareRule {
  _id: Types.ObjectId;
  region: string;
  category: 'vehicle_small' | 'vehicle_medium' | 'vehicle_large' | 'hamali';
  baseFare: number;
  perKmRate: number;
  minimumFare: number;
  surgeMultiplier: number;
  setByAdminId: Types.ObjectId;
  effectiveFrom: Date;
  active: boolean;
}

const fareRuleSchema = new Schema<IFareRule>(
  {
    region: { type: String, required: true },
    category: {
      type: String,
      enum: ['vehicle_small', 'vehicle_medium', 'vehicle_large', 'hamali'],
      required: true,
    },
    baseFare: { type: Number, required: true, min: 0 },
    perKmRate: { type: Number, required: true, min: 0 },
    minimumFare: { type: Number, required: true, min: 0 },
    surgeMultiplier: { type: Number, default: 1.0, min: 1.0, max: 2.5 },
    setByAdminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    effectiveFrom: { type: Date, default: Date.now },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

fareRuleSchema.index({ region: 1, category: 1, active: 1 });

export const FareRule = model<IFareRule>('FareRule', fareRuleSchema);
```

`server/src/models/Rating.ts`:
```typescript
import { Schema, model, Types } from 'mongoose';

export interface IRating {
  _id: Types.ObjectId;
  bookingId: Types.ObjectId;
  fromUserId: Types.ObjectId;
  toUserId?: Types.ObjectId;
  toMuthaId?: Types.ObjectId;
  score: number;
  comment?: string;
  createdAt: Date;
}

const ratingSchema = new Schema<IRating>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    fromUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    toMuthaId: { type: Schema.Types.ObjectId, ref: 'Mutha' },
    score: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Rating = model<IRating>('Rating', ratingSchema);
```

`server/src/models/Payment.ts`:
```typescript
import { Schema, model, Types } from 'mongoose';

export interface IPayment {
  _id: Types.ObjectId;
  bookingId: Types.ObjectId;
  amount: number;
  method: string;
  status: 'pending' | 'success' | 'failed' | 'refunded';
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  createdAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, required: true },
    status: { type: String, enum: ['pending', 'success', 'failed', 'refunded'], default: 'pending' },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Payment = model<IPayment>('Payment', paymentSchema);
```

`server/src/models/Complaint.ts`:
```typescript
import { Schema, model, Types } from 'mongoose';

export interface IComplaint {
  _id: Types.ObjectId;
  bookingId: Types.ObjectId;
  raisedByUserId: Types.ObjectId;
  againstUserId?: Types.ObjectId;
  againstMuthaId?: Types.ObjectId;
  category: 'no_show' | 'damage' | 'payment' | 'misconduct' | 'other';
  description: string;
  status: 'open' | 'in_review' | 'resolved';
  resolutionNote?: string;
  handledByUserId?: Types.ObjectId;
  createdAt: Date;
  resolvedAt?: Date;
}

const complaintSchema = new Schema<IComplaint>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    raisedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    againstUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    againstMuthaId: { type: Schema.Types.ObjectId, ref: 'Mutha' },
    category: { type: String, enum: ['no_show', 'damage', 'payment', 'misconduct', 'other'], required: true },
    description: { type: String, required: true },
    status: { type: String, enum: ['open', 'in_review', 'resolved'], default: 'open' },
    resolutionNote: { type: String },
    handledByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Complaint = model<IComplaint>('Complaint', complaintSchema);
```

`server/src/models/Incentive.ts`:
```typescript
import { Schema, model, Types } from 'mongoose';

export interface IIncentive {
  _id: Types.ObjectId;
  targetUserId?: Types.ObjectId;
  targetMuthaId?: Types.ObjectId;
  period: string;
  ratingAvgAtGrant: number;
  bonusAmount: number;
  criteriaSnapshot: string;
  grantedByAdminId: Types.ObjectId;
  createdAt: Date;
}

const incentiveSchema = new Schema<IIncentive>(
  {
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    targetMuthaId: { type: Schema.Types.ObjectId, ref: 'Mutha' },
    period: { type: String, required: true },
    ratingAvgAtGrant: { type: Number, required: true },
    bonusAmount: { type: Number, required: true, min: 0 },
    criteriaSnapshot: { type: String, required: true },
    grantedByAdminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Incentive = model<IIncentive>('Incentive', incentiveSchema);
```

`server/src/models/AuditLog.ts`:
```typescript
import { Schema, model, Types } from 'mongoose';

export interface IAuditLog {
  _id: Types.ObjectId;
  actorId: Types.ObjectId;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: Types.ObjectId;
  details: Record<string, unknown>;
  timestamp: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  actorRole: { type: String, required: true },
  action: { type: String, required: true },
  targetType: { type: String, required: true },
  targetId: { type: Schema.Types.ObjectId, required: true },
  details: { type: Schema.Types.Mixed, default: {} },
  timestamp: { type: Date, default: Date.now },
});

auditLogSchema.index({ timestamp: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);
```

- [ ] **Step 7: Test — every geo field has a 2dsphere index**

`server/tests/models.test.ts`:
```typescript
import { Vehicle } from '../src/models/Vehicle';
import { HamaliProfile } from '../src/models/HamaliProfile';
import { Booking } from '../src/models/Booking';

describe('geo indexes declared on models', () => {
  it('Vehicle.currentLocation has a 2dsphere index', () => {
    const indexes = Vehicle.schema.indexes();
    expect(indexes.some(([def]) => def.currentLocation === '2dsphere')).toBe(true);
  });

  it('HamaliProfile.currentLocation has a 2dsphere index', () => {
    const indexes = HamaliProfile.schema.indexes();
    expect(indexes.some(([def]) => def.currentLocation === '2dsphere')).toBe(true);
  });

  it('Booking pickup and drop locations have 2dsphere indexes', () => {
    const indexes = Booking.schema.indexes();
    expect(indexes.some(([def]) => def.pickupLocation === '2dsphere')).toBe(true);
    expect(indexes.some(([def]) => def.dropLocation === '2dsphere')).toBe(true);
  });
});
```

- [ ] **Step 8: Run test (no DB needed — schema inspection only)**

Run: `npm test --workspace server -- models.test.ts`
Expected: FAIL initially only if jest isn't configured yet — do Task 4 (jest.config.js) first if this errors with "no tests found"/config error, then return here. Once configured: 3 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add server/src/models server/tests/models.test.ts
git commit -m "feat: add all Mongoose models with 2dsphere geo indexes"
```

---

### Task 4: Jest config, utils, and test DB bootstrap

**Files:**
- Create: `server/jest.config.js`, `server/tests/setup.ts`, `server/src/utils/ApiError.ts`, `server/src/utils/asyncHandler.ts`

- [ ] **Step 1: Jest config**

`server/jest.config.js`:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEach: [],
  globalSetup: undefined,
  setupFiles: [],
  testTimeout: 30000,
};
```

- [ ] **Step 2: ApiError util**

`server/src/utils/ApiError.ts`:
```typescript
export class ApiError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}
```

- [ ] **Step 3: asyncHandler util**

`server/src/utils/asyncHandler.ts`:
```typescript
import { Request, Response, NextFunction, RequestHandler } from 'express';

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

- [ ] **Step 4: In-memory MongoDB test bootstrap**

`server/tests/setup.ts`:
```typescript
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
```

- [ ] **Step 5: Run models test again to confirm jest is wired**

Run: `npm test --workspace server -- models.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add server/jest.config.js server/tests/setup.ts server/src/utils
git commit -m "chore: add jest config, in-memory mongo test bootstrap, core utils"
```

---

### Task 5: Token service (JWT issue/verify/rotate)

**Files:**
- Create: `server/src/services/token.service.ts`
- Test: `server/tests/token.test.ts`

- [ ] **Step 1: Write failing test**

`server/tests/token.test.ts`:
```typescript
import './setup';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../src/services/token.service';

describe('token service', () => {
  it('signs and verifies an access token round-trip', () => {
    const token = signAccessToken({ id: 'user1', role: 'customer' });
    const payload = verifyAccessToken(token);
    expect(payload.id).toBe('user1');
    expect(payload.role).toBe('customer');
  });

  it('signs and verifies a refresh token round-trip', () => {
    const token = signRefreshToken({ id: 'user1', tokenVersion: 0 });
    const payload = verifyRefreshToken(token);
    expect(payload.id).toBe('user1');
    expect(payload.tokenVersion).toBe(0);
  });

  it('rejects a tampered access token', () => {
    const token = signAccessToken({ id: 'user1', role: 'customer' });
    expect(() => verifyAccessToken(token + 'x')).toThrow();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- token.test.ts`
Expected: FAIL — `Cannot find module '../src/services/token.service'`

- [ ] **Step 3: Implement token service**

`server/src/services/token.service.ts`:
```typescript
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { JwtAccessPayload, JwtRefreshPayload } from '@fyro/shared';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '7d';
export const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;

export function signAccessToken(payload: JwtAccessPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

export function signRefreshToken(payload: JwtRefreshPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_TTL });
}

export function verifyAccessToken(token: string): JwtAccessPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtAccessPayload;
}

export function verifyRefreshToken(token: string): JwtRefreshPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtRefreshPayload;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace server -- token.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/token.service.ts server/tests/token.test.ts
git commit -m "feat: add JWT access/refresh token service"
```

---

### Task 6: Auth middleware (verifyJwt, RBAC, permission checks)

**Files:**
- Create: `server/src/middleware/auth.ts`, `server/src/middleware/rbac.ts`
- Test: `server/tests/rbac.test.ts`

- [ ] **Step 1: Write failing test**

`server/tests/rbac.test.ts`:
```typescript
import './setup';
import { Request, Response } from 'express';
import { User } from '../src/models/User';
import { requireRole, requirePermission } from '../src/middleware/rbac';

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('requireRole', () => {
  it('calls next() when role matches', () => {
    const req = { user: { id: 'x', role: 'admin' } } as unknown as Request;
    const next = jest.fn();
    requireRole('admin')(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects with 403 when role does not match', () => {
    const req = { user: { id: 'x', role: 'customer' } } as unknown as Request;
    const next = jest.fn();
    requireRole('admin')(req, mockRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });
});

describe('requirePermission', () => {
  it('allows admin regardless of stored permissions', async () => {
    const admin = await User.create({
      name: 'A',
      phone: '1000000001',
      passwordHash: 'x',
      role: 'admin',
    });
    const req = { user: { id: admin._id.toString(), role: 'admin' } } as unknown as Request;
    const next = jest.fn();
    await requirePermission('edit_fare_rules')(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects manager missing the specific permission, even if role is manager', async () => {
    const manager = await User.create({
      name: 'M',
      phone: '1000000002',
      passwordHash: 'x',
      role: 'manager',
      permissions: ['verify_kyc'],
    });
    const req = { user: { id: manager._id.toString(), role: 'manager' } } as unknown as Request;
    const next = jest.fn();
    await requirePermission('edit_fare_rules')(req, mockRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });

  it('allows manager holding the specific permission', async () => {
    const manager = await User.create({
      name: 'M2',
      phone: '1000000003',
      passwordHash: 'x',
      role: 'manager',
      permissions: ['edit_fare_rules'],
    });
    const req = { user: { id: manager._id.toString(), role: 'manager' } } as unknown as Request;
    const next = jest.fn();
    await requirePermission('edit_fare_rules')(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- rbac.test.ts`
Expected: FAIL — `Cannot find module '../src/middleware/rbac'`

- [ ] **Step 3: Implement verifyJwt middleware**

`server/src/middleware/auth.ts`:
```typescript
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/token.service';
import { ApiError } from '../utils/ApiError';
import type { Role } from '@fyro/shared';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
    }
  }
}

export function verifyJwt(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.accessToken;
  if (!token) {
    next(new ApiError(401, 'Not authenticated'));
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch {
    next(new ApiError(401, 'Invalid or expired token'));
  }
}
```

- [ ] **Step 4: Implement RBAC middleware**

`server/src/middleware/rbac.ts`:
```typescript
import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { User } from '../models/User';
import type { Role } from '@fyro/shared';

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new ApiError(403, 'Forbidden: insufficient role'));
      return;
    }
    next();
  };
}

/**
 * Admin always passes. Manager must hold `permission` in their live
 * permissions[] array, re-fetched from the DB on every call (not trusted
 * from the JWT) so Admin revocation takes effect immediately.
 */
export function requirePermission(permission: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      next(new ApiError(401, 'Not authenticated'));
      return;
    }
    if (req.user.role === 'admin') {
      next();
      return;
    }
    if (req.user.role !== 'manager') {
      next(new ApiError(403, 'Forbidden: insufficient role'));
      return;
    }
    const manager = await User.findById(req.user.id).select('permissions').lean();
    if (!manager || !manager.permissions.includes(permission)) {
      next(new ApiError(403, 'Forbidden: missing permission ' + permission));
      return;
    }
    next();
  };
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npm test --workspace server -- rbac.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/middleware/auth.ts server/src/middleware/rbac.ts server/tests/rbac.test.ts
git commit -m "feat: add JWT verify middleware and role/permission RBAC middleware"
```

---

### Task 7: Validation and rate-limit middleware, audit service

**Files:**
- Create: `server/src/middleware/validate.ts`, `server/src/middleware/rateLimit.ts`, `server/src/services/audit.service.ts`

- [ ] **Step 1: Validation middleware**

`server/src/middleware/validate.ts`:
```typescript
import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { ApiError } from '../utils/ApiError';

export function validate(req: Request, _res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    next(new ApiError(400, 'Validation failed', errors.array()));
    return;
  }
  next();
}
```

- [ ] **Step 2: Rate limit middleware**

`server/src/middleware/rateLimit.ts`:
```typescript
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, try again in a minute.' },
});
```

- [ ] **Step 3: Audit service**

`server/src/services/audit.service.ts`:
```typescript
import { AuditLog } from '../models/AuditLog';
import type { Role } from '@fyro/shared';

interface WriteAuditLogInput {
  actorId: string;
  actorRole: Role;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
}

export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  await AuditLog.create({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    details: input.details ?? {},
    timestamp: new Date(),
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add server/src/middleware/validate.ts server/src/middleware/rateLimit.ts server/src/services/audit.service.ts
git commit -m "feat: add validation/rate-limit middleware and audit log service"
```

---

### Task 8: Mocked Cloudinary and Nominatim geocode services

**Files:**
- Create: `server/src/services/cloudinary.service.ts`, `server/src/services/geocode.service.ts`

- [ ] **Step 1: Cloudinary service (mock-aware, unused by routes until a later phase's KYC/photo upload work)**

`server/src/services/cloudinary.service.ts`:
```typescript
import { env } from '../config/env';

export interface UploadResult {
  url: string;
  publicId: string;
}

/**
 * Uploads a file buffer to Cloudinary. Behind MOCK_EXTERNAL_SERVICES=true
 * (the Phase 1 default) this returns a deterministic fake URL instead of
 * calling the real API, so the rest of the codebase can be written against
 * the real integration shape before Cloudinary credentials exist.
 */
export async function uploadImage(buffer: Buffer, folder: string): Promise<UploadResult> {
  if (env.MOCK_EXTERNAL_SERVICES || !env.CLOUDINARY_CLOUD_NAME) {
    const fakeId = `${folder}-${Date.now()}`;
    return { url: `https://mock.cloudinary.local/${fakeId}.jpg`, publicId: fakeId };
  }
  // Real integration point — wired once CLOUDINARY_* env vars are supplied.
  const cloudinary = await import('cloudinary');
  cloudinary.v2.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
  const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const stream = cloudinary.v2.uploader.upload_stream({ folder }, (err, res) => {
      if (err || !res) reject(err);
      else resolve(res as { secure_url: string; public_id: string });
    });
    stream.end(buffer);
  });
  return { url: result.secure_url, publicId: result.public_id };
}
```

- [ ] **Step 2: Geocode service (Nominatim, biased to Andhra Pradesh — used starting Phase 2's booking flow)**

`server/src/services/geocode.service.ts`:
```typescript
// Andhra Pradesh bounding box (lon-min, lat-min, lon-max, lat-max), used to
// bias Nominatim results so AP addresses rank first instead of defaulting
// to global/US results.
const AP_VIEWBOX = '76.76,19.91,84.79,12.62';

export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
}

export async function geocodeAddress(query: string): Promise<GeocodeResult[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('viewbox', AP_VIEWBOX);
  url.searchParams.set('bounded', '1');
  url.searchParams.set('limit', '5');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'FYRO-logistics-app/1.0' },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  return data.map((d) => ({ lat: parseFloat(d.lat), lon: parseFloat(d.lon), displayName: d.display_name }));
}
```

- [ ] **Step 3: Commit**

```bash
git add server/src/services/cloudinary.service.ts server/src/services/geocode.service.ts
git commit -m "feat: add mock-aware Cloudinary service and Nominatim geocode service"
```

---

### Task 9: Auth controller and routes

**Files:**
- Create: `server/src/controllers/auth.controller.ts`, `server/src/routes/auth.routes.ts`
- Test: `server/tests/auth.test.ts`

- [ ] **Step 1: Write failing integration test**

`server/tests/auth.test.ts`:
```typescript
import './setup';
import request from 'supertest';
import { app } from '../src/app';
import { Mutha } from '../src/models/Mutha';

describe('auth flow', () => {
  it('signs up a customer, logs in, reads /me, refreshes, logs out', async () => {
    const agent = request.agent(app);

    const signup = await agent.post('/api/auth/signup/customer').send({
      name: 'Asha',
      phone: '9000000001',
      password: 'Passw0rd!',
    });
    expect(signup.status).toBe(201);
    expect(signup.body.user.passwordHash).toBeUndefined();

    const me1 = await agent.get('/api/auth/me');
    expect(me1.status).toBe(200);
    expect(me1.body.user.role).toBe('customer');

    const refresh = await agent.post('/api/auth/refresh');
    expect(refresh.status).toBe(200);

    const logout = await agent.post('/api/auth/logout');
    expect(logout.status).toBe(200);

    const meAfterLogout = await agent.get('/api/auth/me');
    expect(meAfterLogout.status).toBe(401);
  });

  it('rejects duplicate phone signup', async () => {
    await request(app).post('/api/auth/signup/customer').send({
      name: 'A',
      phone: '9000000002',
      password: 'Passw0rd!',
    });
    const dup = await request(app).post('/api/auth/signup/customer').send({
      name: 'B',
      phone: '9000000002',
      password: 'Passw0rd!',
    });
    expect(dup.status).toBe(409);
  });

  it('signs up a driver with vehicle basics', async () => {
    const res = await request(app).post('/api/auth/signup/driver').send({
      name: 'Ravi',
      phone: '9000000003',
      password: 'Passw0rd!',
      vehicleType: 'mini_truck',
      capacityKg: 1000,
      registrationNumber: 'AP01AB1234',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('driver');
  });

  it('signs up a hamali leader, creating a Mutha with an invite code', async () => {
    const res = await request(app).post('/api/auth/signup/hamali').send({
      name: 'Leader L',
      phone: '9000000004',
      password: 'Passw0rd!',
      joinType: 'leader',
      muthaName: 'Vizag Loaders',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('mutha_leader');
    expect(res.body.mutha.inviteCode).toBeDefined();
  });

  it('signs up a hamali member via a valid invite code, rejects an invalid one', async () => {
    const leaderRes = await request(app).post('/api/auth/signup/hamali').send({
      name: 'Leader L2',
      phone: '9000000005',
      password: 'Passw0rd!',
      joinType: 'leader',
      muthaName: 'Vijayawada Loaders',
    });
    const inviteCode = leaderRes.body.mutha.inviteCode;

    const goodMember = await request(app).post('/api/auth/signup/hamali').send({
      name: 'Member M',
      phone: '9000000006',
      password: 'Passw0rd!',
      joinType: 'member',
      inviteCode,
    });
    expect(goodMember.status).toBe(201);
    expect(goodMember.body.user.role).toBe('mutha_member');

    const badMember = await request(app).post('/api/auth/signup/hamali').send({
      name: 'Member N',
      phone: '9000000007',
      password: 'Passw0rd!',
      joinType: 'member',
      inviteCode: 'NOTAREALCODE',
    });
    expect(badMember.status).toBe(400);

    const mutha = await Mutha.findOne({ inviteCode });
    expect(mutha?.memberIds.length).toBe(1);
  });

  it('rate limits signup after 5 rapid attempts from the same IP', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/signup/customer')
        .send({ name: 'x', phone: `92000000${i}`, password: 'Passw0rd!' });
    }
    const sixth = await request(app)
      .post('/api/auth/signup/customer')
      .send({ name: 'x', phone: '9200000009', password: 'Passw0rd!' });
    expect(sixth.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- auth.test.ts`
Expected: FAIL — `Cannot find module '../src/app'`

- [ ] **Step 3: Implement auth controller**

`server/src/controllers/auth.controller.ts`:
```typescript
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { User } from '../models/User';
import { Vehicle } from '../models/Vehicle';
import { HamaliProfile } from '../models/HamaliProfile';
import { Mutha } from '../models/Mutha';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  ACCESS_TOKEN_MAX_AGE_MS,
  REFRESH_TOKEN_MAX_AGE_MS,
} from '../services/token.service';

const BCRYPT_COST = 12;

const cookieOpts = {
  httpOnly: true as const,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
};

function setAuthCookies(res: Response, userId: string, role: string, tokenVersion: number) {
  const accessToken = signAccessToken({ id: userId, role: role as never });
  const refreshToken = signRefreshToken({ id: userId, tokenVersion });
  res.cookie('accessToken', accessToken, { ...cookieOpts, maxAge: ACCESS_TOKEN_MAX_AGE_MS });
  res.cookie('refreshToken', refreshToken, { ...cookieOpts, maxAge: REFRESH_TOKEN_MAX_AGE_MS });
}

function publicUser(user: { toObject: () => Record<string, unknown> }) {
  const obj = user.toObject();
  delete obj.passwordHash;
  return obj;
}

export const signupCustomer = asyncHandler(async (req: Request, res: Response) => {
  const { name, phone, email, password } = req.body;
  const existing = await User.findOne({ phone });
  if (existing) throw new ApiError(409, 'Phone already registered');

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const user = await User.create({ name, phone, email, passwordHash, role: 'customer' });
  setAuthCookies(res, user._id.toString(), user.role, user.tokenVersion);
  res.status(201).json({ user: publicUser(user) });
});

export const signupDriver = asyncHandler(async (req: Request, res: Response) => {
  const { name, phone, password, vehicleType, capacityKg, registrationNumber } = req.body;
  const existing = await User.findOne({ phone });
  if (existing) throw new ApiError(409, 'Phone already registered');

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const user = await User.create({ name, phone, passwordHash, role: 'driver' });
  await Vehicle.create({
    ownerId: user._id,
    type: vehicleType,
    capacityKg,
    registrationNumber,
    verified: false,
  });
  setAuthCookies(res, user._id.toString(), user.role, user.tokenVersion);
  res.status(201).json({ user: publicUser(user) });
});

export const signupHamali = asyncHandler(async (req: Request, res: Response) => {
  const { name, phone, password, joinType, muthaName, inviteCode } = req.body;
  const existing = await User.findOne({ phone });
  if (existing) throw new ApiError(409, 'Phone already registered');

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  if (joinType === 'solo') {
    const user = await User.create({ name, phone, passwordHash, role: 'hamali_solo' });
    await HamaliProfile.create({ userId: user._id, type: 'solo' });
    setAuthCookies(res, user._id.toString(), user.role, user.tokenVersion);
    res.status(201).json({ user: publicUser(user) });
    return;
  }

  if (joinType === 'leader') {
    const user = await User.create({ name, phone, passwordHash, role: 'mutha_leader' });
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const mutha = await Mutha.create({
      name: muthaName,
      leaderId: user._id,
      memberIds: [],
      inviteCode: code,
    });
    setAuthCookies(res, user._id.toString(), user.role, user.tokenVersion);
    res.status(201).json({ user: publicUser(user), mutha: { id: mutha._id, inviteCode: mutha.inviteCode } });
    return;
  }

  if (joinType === 'member') {
    // Never trust a client-supplied muthaId — resolve it server-side from the invite code only.
    const mutha = await Mutha.findOne({ inviteCode });
    if (!mutha) throw new ApiError(400, 'Invalid invite code');

    const user = await User.create({ name, phone, passwordHash, role: 'mutha_member' });
    await HamaliProfile.create({ userId: user._id, type: 'mutha_member', muthaId: mutha._id });
    mutha.memberIds.push(user._id);
    await mutha.save();

    setAuthCookies(res, user._id.toString(), user.role, user.tokenVersion);
    res.status(201).json({ user: publicUser(user) });
    return;
  }

  throw new ApiError(400, 'Invalid joinType');
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { phone, password } = req.body;
  const user = await User.findOne({ phone }).select('+passwordHash');
  if (!user || user.accountStatus !== 'active') throw new ApiError(401, 'Invalid credentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new ApiError(401, 'Invalid credentials');

  setAuthCookies(res, user._id.toString(), user.role, user.tokenVersion);
  res.status(200).json({ user: publicUser(user) });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;
  if (!token) throw new ApiError(401, 'No refresh token');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  const user = await User.findById(payload.id);
  if (!user || user.tokenVersion !== payload.tokenVersion) {
    throw new ApiError(401, 'Refresh token no longer valid');
  }

  // Rotate: bump version so the just-used refresh token cannot be replayed.
  user.tokenVersion += 1;
  await user.save();

  setAuthCookies(res, user._id.toString(), user.role, user.tokenVersion);
  res.status(200).json({ ok: true });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  if (req.user) {
    await User.findByIdAndUpdate(req.user.id, { $inc: { tokenVersion: 1 } });
  }
  res.clearCookie('accessToken', cookieOpts);
  res.clearCookie('refreshToken', cookieOpts);
  res.status(200).json({ ok: true });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  // req.user.id comes only from the verified JWT, never from a param/query.
  const user = await User.findById(req.user!.id);
  if (!user) throw new ApiError(401, 'User not found');
  res.status(200).json({ user: publicUser(user) });
});
```

- [ ] **Step 4: Implement auth routes with validation + rate limiting**

`server/src/routes/auth.routes.ts`:
```typescript
import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authLimiter } from '../middleware/rateLimit';
import { verifyJwt } from '../middleware/auth';
import * as authController from '../controllers/auth.controller';

export const authRouter = Router();

const passwordRule = body('password').isString().isLength({ min: 8 });
const phoneRule = body('phone').isString().isLength({ min: 10, max: 15 });
const nameRule = body('name').isString().trim().isLength({ min: 2 });

authRouter.post(
  '/signup/customer',
  authLimiter,
  [nameRule, phoneRule, passwordRule, body('email').optional().isEmail()],
  validate,
  authController.signupCustomer
);

authRouter.post(
  '/signup/driver',
  authLimiter,
  [
    nameRule,
    phoneRule,
    passwordRule,
    body('vehicleType').isString().notEmpty(),
    body('capacityKg').isFloat({ min: 1 }),
    body('registrationNumber').isString().notEmpty(),
  ],
  validate,
  authController.signupDriver
);

authRouter.post(
  '/signup/hamali',
  authLimiter,
  [
    nameRule,
    phoneRule,
    passwordRule,
    body('joinType').isIn(['solo', 'leader', 'member']),
    body('muthaName').if(body('joinType').equals('leader')).isString().notEmpty(),
    body('inviteCode').if(body('joinType').equals('member')).isString().notEmpty(),
  ],
  validate,
  authController.signupHamali
);

authRouter.post(
  '/login',
  authLimiter,
  [phoneRule, body('password').isString().notEmpty()],
  validate,
  authController.login
);

authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', verifyJwt, authController.logout);
authRouter.get('/me', verifyJwt, authController.me);
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npm test --workspace server -- auth.test.ts`
Expected: PASS (6 tests). (`app.ts` doesn't exist yet — do Task 11 first if this errors on missing `app`, then return.)

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/auth.controller.ts server/src/routes/auth.routes.ts server/tests/auth.test.ts
git commit -m "feat: add auth controller and routes for signup/login/refresh/logout/me"
```

---

### Task 10: Admin controller and routes

**Files:**
- Create: `server/src/controllers/admin.controller.ts`, `server/src/routes/admin.routes.ts`
- Test: `server/tests/admin.test.ts`

- [ ] **Step 1: Write failing integration test**

`server/tests/admin.test.ts`:
```typescript
import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { AuditLog } from '../src/models/AuditLog';

async function loginAsAdmin() {
  const passwordHash = await bcrypt.hash('AdminPass1!', 12);
  const admin = await User.create({
    name: 'Root Admin',
    phone: '9111111111',
    passwordHash,
    role: 'admin',
  });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ phone: '9111111111', password: 'AdminPass1!' });
  return { agent, admin };
}

describe('admin users/managers', () => {
  it('lets admin create a manager with scoped permissions', async () => {
    const { agent } = await loginAsAdmin();
    const res = await agent.post('/api/admin/managers').send({
      name: 'Manager One',
      phone: '9222222222',
      password: 'ManagerPass1!',
      permissions: ['verify_kyc', 'manage_region:Visakhapatnam'],
    });
    expect(res.status).toBe(201);
    expect(res.body.manager.permissions).toContain('verify_kyc');
  });

  it('lets admin reassign a user role and writes an audit log entry', async () => {
    const { agent } = await loginAsAdmin();
    const passwordHash = await bcrypt.hash('Passw0rd!', 12);
    const customer = await User.create({
      name: 'Cust',
      phone: '9333333333',
      passwordHash,
      role: 'customer',
    });

    const res = await agent.patch(`/api/admin/users/${customer._id}/role`).send({ role: 'hamali_solo' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('hamali_solo');

    const logs = await AuditLog.find({ targetId: customer._id, action: 'role_change' });
    expect(logs.length).toBe(1);
  });

  it('lets admin suspend a user', async () => {
    const { agent } = await loginAsAdmin();
    const passwordHash = await bcrypt.hash('Passw0rd!', 12);
    const customer = await User.create({
      name: 'Cust2',
      phone: '9333333334',
      passwordHash,
      role: 'customer',
    });
    const res = await agent.patch(`/api/admin/users/${customer._id}/status`).send({ status: 'suspended' });
    expect(res.status).toBe(200);
    expect(res.body.user.accountStatus).toBe('suspended');
  });

  it('rejects a non-admin (customer) hitting admin routes', async () => {
    const passwordHash = await bcrypt.hash('Passw0rd!', 12);
    await User.create({ name: 'C', phone: '9444444444', passwordHash, role: 'customer' });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ phone: '9444444444', password: 'Passw0rd!' });

    const res = await agent.get('/api/admin/users');
    expect(res.status).toBe(403);
  });

  it('rejects a manager without create-manager privilege from creating another manager', async () => {
    const passwordHash = await bcrypt.hash('Passw0rd!', 12);
    await User.create({
      name: 'Mgr',
      phone: '9555555555',
      passwordHash,
      role: 'manager',
      permissions: ['verify_kyc'],
    });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ phone: '9555555555', password: 'Passw0rd!' });

    const res = await agent.post('/api/admin/managers').send({
      name: 'New Mgr',
      phone: '9666666666',
      password: 'Passw0rd!',
      permissions: ['verify_kyc'],
    });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- admin.test.ts`
Expected: FAIL — `Cannot find module '../src/controllers/admin.controller'` (or route 404s once app exists).

- [ ] **Step 3: Implement admin controller**

`server/src/controllers/admin.controller.ts`:
```typescript
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { User } from '../models/User';
import { writeAuditLog } from '../services/audit.service';

const BCRYPT_COST = 12;

function publicUser(user: { toObject: () => Record<string, unknown> }) {
  const obj = user.toObject();
  delete obj.passwordHash;
  return obj;
}

export const listManagers = asyncHandler(async (_req: Request, res: Response) => {
  const managers = await User.find({ role: 'manager' }).sort({ createdAt: -1 });
  res.status(200).json({ managers: managers.map(publicUser) });
});

export const createManager = asyncHandler(async (req: Request, res: Response) => {
  const { name, phone, password, permissions } = req.body;
  const existing = await User.findOne({ phone });
  if (existing) throw new ApiError(409, 'Phone already registered');

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const manager = await User.create({
    name,
    phone,
    passwordHash,
    role: 'manager',
    permissions: permissions ?? [],
  });

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'manager_created',
    targetType: 'User',
    targetId: manager._id.toString(),
    details: { permissions: manager.permissions },
  });

  res.status(201).json({ manager: publicUser(manager) });
});

export const updateManagerPermissions = asyncHandler(async (req: Request, res: Response) => {
  const { permissions } = req.body;
  const manager = await User.findOne({ _id: req.params.id, role: 'manager' });
  if (!manager) throw new ApiError(404, 'Manager not found');

  const before = manager.permissions;
  manager.permissions = permissions;
  await manager.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'manager_permissions_updated',
    targetType: 'User',
    targetId: manager._id.toString(),
    details: { before, after: permissions },
  });

  res.status(200).json({ manager: publicUser(manager) });
});

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const { search, role, page = '1', limit = '20' } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { role: { $nin: ['admin', 'manager'] } };
  if (role) filter.role = role;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    User.countDocuments(filter),
  ]);

  res.status(200).json({ users: users.map(publicUser), total, page: pageNum, limit: limitNum });
});

export const updateUserRole = asyncHandler(async (req: Request, res: Response) => {
  const { role } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  if (user.role === 'admin') throw new ApiError(400, 'Cannot change an admin account role via this endpoint');

  const before = user.role;
  user.role = role;
  await user.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'role_change',
    targetType: 'User',
    targetId: user._id.toString(),
    details: { before, after: role },
  });

  res.status(200).json({ user: publicUser(user) });
});

export const updateUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  if (user.role === 'admin') throw new ApiError(400, 'Cannot change an admin account status via this endpoint');

  const before = user.accountStatus;
  user.accountStatus = status;
  await user.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'status_change',
    targetType: 'User',
    targetId: user._id.toString(),
    details: { before, after: status },
  });

  res.status(200).json({ user: publicUser(user) });
});
```

- [ ] **Step 4: Implement admin routes (admin-only, per spec Managers cannot reach these)**

`server/src/routes/admin.routes.ts`:
```typescript
import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as adminController from '../controllers/admin.controller';
import { MANAGER_PERMISSIONS } from '@fyro/shared';

export const adminRouter = Router();

adminRouter.use(verifyJwt, requireRole('admin'));

function isValidPermission(p: string): boolean {
  return (MANAGER_PERMISSIONS as readonly string[]).includes(p) || p.startsWith('manage_region:');
}

const permissionsRule = body('permissions')
  .isArray()
  .custom((arr: string[]) => arr.every(isValidPermission))
  .withMessage('permissions must be known permission keys or manage_region:<name>');

adminRouter.get('/managers', adminController.listManagers);
adminRouter.post(
  '/managers',
  [
    body('name').isString().trim().isLength({ min: 2 }),
    body('phone').isString().isLength({ min: 10, max: 15 }),
    body('password').isString().isLength({ min: 8 }),
    permissionsRule,
  ],
  validate,
  adminController.createManager
);
adminRouter.patch(
  '/managers/:id/permissions',
  [param('id').isMongoId(), permissionsRule],
  validate,
  adminController.updateManagerPermissions
);

adminRouter.get('/users', adminController.listUsers);
adminRouter.patch(
  '/users/:id/role',
  [
    param('id').isMongoId(),
    body('role').isIn(['customer', 'driver', 'hamali_solo', 'mutha_leader', 'mutha_member']),
  ],
  validate,
  adminController.updateUserRole
);
adminRouter.patch(
  '/users/:id/status',
  [param('id').isMongoId(), body('status').isIn(['active', 'suspended', 'deleted'])],
  validate,
  adminController.updateUserStatus
);
adminRouter.delete(
  '/users/:id',
  [param('id').isMongoId()],
  validate,
  // Soft delete: same handler as status update, forced to 'deleted'.
  (req, res, next) => {
    req.body.status = 'deleted';
    next();
  },
  adminController.updateUserStatus
);
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npm test --workspace server -- admin.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/admin.controller.ts server/src/routes/admin.routes.ts server/tests/admin.test.ts
git commit -m "feat: add admin users/managers controller and routes with audit logging"
```

---

### Task 11: Express app wiring and server bootstrap

**Files:**
- Create: `server/src/app.ts`, `server/src/server.ts`

- [ ] **Step 1: App wiring**

`server/src/app.ts`:
```typescript
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { authRouter } from './routes/auth.routes';
import { adminRouter } from './routes/admin.routes';
import { ApiError } from './utils/ApiError';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.status(200).json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

// Central error handler — never leaks stack traces or internals to the client.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: err.message, details: err.details });
    return;
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
```

- [ ] **Step 2: Server bootstrap**

`server/src/server.ts`:
```typescript
import { app } from './app';
import { connectDb } from './config/db';
import { env } from './config/env';

async function main() {
  await connectDb();
  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`FYRO server listening on port ${env.PORT}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Run the full server test suite**

Run: `npm test --workspace server`
Expected: All test files PASS (models, token, rbac, auth, admin — ~17 tests total).

- [ ] **Step 4: Type-check and build**

Run: `npm run build --workspace server`
Expected: compiles cleanly to `server/dist`, no TS errors.

- [ ] **Step 5: Commit**

```bash
git add server/src/app.ts server/src/server.ts
git commit -m "feat: wire Express app (helmet, cors, routes, error handler) and server bootstrap"
```

---

### Task 12: Admin seed script

**Files:**
- Create: `server/src/scripts/seedAdmin.ts`

- [ ] **Step 1: Implement idempotent seed script**

`server/src/scripts/seedAdmin.ts`:
```typescript
import bcrypt from 'bcrypt';
import { connectDb } from '../config/db';
import { env } from '../config/env';
import { User } from '../models/User';
import mongoose from 'mongoose';

async function seedAdmin() {
  await connectDb();

  const existingAdmin = await User.findOne({ role: 'admin' });
  if (existingAdmin) {
    // eslint-disable-next-line no-console
    console.log('Admin already exists, skipping seed:', existingAdmin.phone);
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
  const admin = await User.create({
    name: 'FYRO Root Admin',
    phone: env.ADMIN_PHONE,
    passwordHash,
    role: 'admin',
    accountStatus: 'active',
  });

  // eslint-disable-next-line no-console
  console.log('Seeded admin account:', admin.phone);
  await mongoose.disconnect();
}

seedAdmin().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Note manual verification (requires the user's live MONGODB_URI — not runnable in this environment)**

Run (once `server/.env` has a real `MONGODB_URI`): `npm run seed:admin --workspace server`
Expected: prints `Seeded admin account: <ADMIN_PHONE>` the first time, `Admin already exists, skipping seed` on rerun.

- [ ] **Step 3: Commit**

```bash
git add server/src/scripts/seedAdmin.ts
git commit -m "feat: add idempotent admin seed script"
```

---

### Task 13: Client scaffold — Next.js, Tailwind design tokens, fonts

**Files:**
- Create: `client/package.json`, `client/tsconfig.json`, `client/next.config.js`, `client/postcss.config.js`, `client/tailwind.config.ts`, `client/src/app/layout.tsx`, `client/src/app/globals.css`

- [ ] **Step 1: Client package.json**

`client/package.json`:
```json
{
  "name": "client",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "framer-motion": "^11.2.10",
    "leaflet": "^1.9.4",
    "react-leaflet": "^4.2.1"
  },
  "devDependencies": {
    "@types/leaflet": "^1.9.12",
    "@types/node": "^20.12.12",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3",
    "typescript": "^5.4.5"
  }
}
```

- [ ] **Step 2: Next/TS/PostCSS config**

`client/next.config.js`:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};
module.exports = nextConfig;
```

`client/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`client/postcss.config.js`:
```javascript
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 3: Tailwind config with design tokens as CSS variables**

`client/tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        'text-primary': 'var(--color-text-primary)',
        'text-muted': 'var(--color-text-muted)',
      },
      fontFamily: {
        heading: ['var(--font-syne)'],
        body: ['var(--font-outfit)'],
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 4: Global CSS with design tokens**

`client/src/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-background: #FAFAF8;
  --color-surface: #F2EFE9;
  --color-primary: #FF6B2B;
  --color-secondary: #0D9488;
  --color-text-primary: #0F0E0C;
  --color-text-muted: #6B6860;
}

body {
  background-color: var(--color-background);
  color: var(--color-text-primary);
}
```

- [ ] **Step 5: Root layout with Syne/Outfit fonts**

`client/src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import { Syne, Outfit } from 'next/font/google';
import './globals.css';

const syne = Syne({ subsets: ['latin'], variable: '--font-syne', weight: ['600', '700', '800'] });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', weight: ['400', '500', '600'] });

export const metadata: Metadata = {
  title: 'FYRO — Find Your Right One',
  description: 'Book trucks and Hamali labor across Andhra Pradesh, on demand.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${outfit.variable}`}>
      <body className="font-body">{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: Install client deps**

Run: `npm install --workspace client`
Expected: installs cleanly.

- [ ] **Step 7: Commit**

```bash
git add client/package.json client/tsconfig.json client/next.config.js client/postcss.config.js client/tailwind.config.ts client/src/app/layout.tsx client/src/app/globals.css
git commit -m "chore: scaffold Next.js client with Tailwind design tokens and fonts"
```

---

### Task 14: Shared UI primitives, API client, auth context

**Files:**
- Create: `client/src/components/ui/Button.tsx`, `Card.tsx`, `Modal.tsx`, `Badge.tsx`, `client/src/lib/api.ts`, `client/src/lib/auth-context.tsx`

- [ ] **Step 1: Button**

`client/src/components/ui/Button.tsx`:
```tsx
import { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:opacity-90',
  secondary: 'bg-secondary text-white hover:opacity-90',
  ghost: 'bg-transparent text-text-primary border border-text-muted/30 hover:bg-surface',
  danger: 'bg-red-600 text-white hover:opacity-90',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`px-5 py-2.5 rounded-full font-medium text-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Card, Modal, Badge**

`client/src/components/ui/Card.tsx`:
```tsx
import { HTMLAttributes } from 'react';

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-surface rounded-2xl p-5 shadow-sm border border-black/5 ${className}`}
      {...props}
    />
  );
}
```

`client/src/components/ui/Modal.tsx`:
```tsx
import { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-background rounded-2xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="mb-6">{children}</div>
        {footer && <div className="flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}
```

`client/src/components/ui/Badge.tsx`:
```tsx
type Tone = 'primary' | 'secondary' | 'muted';

const toneClasses: Record<Tone, string> = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  muted: 'bg-text-muted/10 text-text-muted',
};

export function Badge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}
```

- [ ] **Step 3: API client (always sends cookies, never touches localStorage for tokens)**

`client/src/lib/api.ts`:
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

export class ApiClientError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : undefined;

  if (!res.ok) {
    throw new ApiClientError(res.status, body?.error ?? res.statusText, body?.details);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
```

- [ ] **Step 4: Auth context**

`client/src/lib/auth-context.tsx`:
```tsx
'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, ApiClientError } from './api';

export interface AuthUser {
  _id: string;
  name: string;
  phone: string;
  role: string;
  accountStatus: string;
  permissions: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  refetch: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchMe() {
    try {
      const res = await api.get<{ user: AuthUser }>('/api/auth/me');
      setUser(res.user);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMe();
  }, []);

  async function logout() {
    await api.post('/api/auth/logout');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, refetch: fetchMe, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 5: Wire AuthProvider into root layout**

Modify `client/src/app/layout.tsx` — wrap `{children}` with `<AuthProvider>`:
```tsx
import type { Metadata } from 'next';
import { Syne, Outfit } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';

const syne = Syne({ subsets: ['latin'], variable: '--font-syne', weight: ['600', '700', '800'] });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', weight: ['400', '500', '600'] });

export const metadata: Metadata = {
  title: 'FYRO — Find Your Right One',
  description: 'Book trucks and Hamali labor across Andhra Pradesh, on demand.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${outfit.variable}`}>
      <body className="font-body">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add client/src/components/ui client/src/lib client/src/app/layout.tsx
git commit -m "feat: add UI primitives, API client, and auth context provider"
```

---

### Task 15: Marketing site

**Files:**
- Create: `client/src/app/(marketing)/layout.tsx`, `page.tsx`, `how-it-works/page.tsx`, `pricing/page.tsx`, `about/page.tsx`, `contact/page.tsx`

- [ ] **Step 1: Marketing layout (shared nav + footer)**

`client/src/app/(marketing)/layout.tsx`:
```tsx
import Link from 'next/link';

const navLinks = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur border-b border-black/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="font-heading text-xl font-bold text-primary">
            FYRO
          </Link>
          <nav className="hidden md:flex gap-6 text-sm text-text-muted">
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-text-primary transition">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex gap-3">
            <Link href="/login" className="text-sm font-medium px-4 py-2 rounded-full hover:bg-surface transition">
              Log in
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-black/5 py-10 mt-20">
        <div className="max-w-6xl mx-auto px-6 text-sm text-text-muted flex flex-wrap justify-between gap-4">
          <span>© 2026 FYRO. Andhra Pradesh.</span>
          <div className="flex gap-6">
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-text-primary transition">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Home page — animated hero, explainer, role CTAs**

`client/src/app/(marketing)/page.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

const ctas = [
  { href: '/signup/customer', label: 'Book a delivery', tone: 'bg-primary' },
  { href: '/signup/driver', label: 'Drive with us', tone: 'bg-primary' },
  { href: '/signup/hamali', label: 'Join a Mutha', tone: 'bg-secondary' },
];

const steps = [
  { title: 'Tell us what you need', body: 'Cargo weight, pickup and drop points, or how many hands you need for loading.' },
  { title: 'We find the right one', body: 'Nearby drivers and Hamali workers get sequential job offers, just like a ride-hailing captain app.' },
  { title: 'Track it live', body: 'Live map, in-app chat, transparent fare — from pickup to delivery.' },
  { title: 'Pay and rate', body: 'Secure in-app payment, then rate your driver or Hamali team.' },
];

export default function HomePage() {
  return (
    <div>
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(circle at 20% 20%, rgba(255,107,43,0.15), transparent 45%), radial-gradient(circle at 80% 60%, rgba(13,148,136,0.15), transparent 45%)',
          }}
        />
        <div className="max-w-4xl mx-auto text-center px-6 pt-24 pb-20">
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="font-heading text-5xl md:text-6xl font-extrabold tracking-tight"
          >
            Find Your <span className="text-primary">Right</span> One.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-6 text-lg text-text-muted max-w-2xl mx-auto"
          >
            Trucks for 1kg or 1000 tons. Hamali labor on demand. Andhra Pradesh&apos;s on-demand
            logistics marketplace — book in minutes, track live.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-10 flex flex-wrap justify-center gap-4"
          >
            {ctas.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className={`${c.tone} text-white px-6 py-3 rounded-full font-medium hover:opacity-90 transition`}
              >
                {c.label}
              </Link>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-20">
        <h2 className="font-heading text-3xl font-bold text-center mb-12">How FYRO works</h2>
        <div className="grid md:grid-cols-4 gap-6">
          {steps.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="bg-surface rounded-2xl p-6"
            >
              <div className="text-primary font-heading text-2xl font-bold mb-3">{i + 1}</div>
              <h3 className="font-semibold mb-2">{s.title}</h3>
              <p className="text-sm text-text-muted">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: how-it-works, pricing, about, contact pages**

`client/src/app/(marketing)/how-it-works/page.tsx`:
```tsx
const sections = [
  {
    title: 'For customers',
    body: 'Post a booking with pickup/drop points and cargo details, or request Hamali labor for loading and unloading — or bundle both. Nearby drivers and Hamali workers are offered your job one at a time, so you always get a real acceptance, not a fake instant match. Track your assigned driver or team live on the map, chat in-app, and pay securely when the job is done.',
  },
  {
    title: 'For drivers',
    body: 'Go online and receive job requests matched to your vehicle capacity and location. Accept or reject within a visible countdown. Follow a clear status stepper from pickup to delivery, and track your earnings and incentives in one place.',
  },
  {
    title: 'For Hamali workers',
    body: 'Work solo, or as part of a Mutha (labor group). Solo workers accept jobs directly. Mutha leaders receive requests on behalf of their group and assign members — even splitting one group across multiple job sites at once.',
  },
];

export default function HowItWorksPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-20">
      <h1 className="font-heading text-4xl font-bold mb-12">How it works</h1>
      <div className="space-y-10">
        {sections.map((s) => (
          <div key={s.title}>
            <h2 className="font-heading text-xl font-semibold mb-2">{s.title}</h2>
            <p className="text-text-muted leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

`client/src/app/(marketing)/pricing/page.tsx`:
```tsx
const rateCard = [
  { category: 'Small vehicle (up to 1T)', base: '₹150', perKm: '₹18/km', min: '₹250' },
  { category: 'Medium vehicle (1T–5T)', base: '₹400', perKm: '₹28/km', min: '₹600' },
  { category: 'Large vehicle (5T+)', base: '₹900', perKm: '₹45/km', min: '₹1200' },
  { category: 'Hamali (per worker)', base: '₹100', perKm: '—', min: '₹300' },
];

export default function PricingPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-20">
      <h1 className="font-heading text-4xl font-bold mb-4">Pricing</h1>
      <p className="text-text-muted mb-10">
        Illustrative Andhra Pradesh rate card. Final fare is calculated per booking based on
        distance, cargo, and live demand, and shown in full before you confirm.
      </p>
      <div className="overflow-hidden rounded-2xl border border-black/5">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left">
            <tr>
              <th className="px-5 py-3">Category</th>
              <th className="px-5 py-3">Base fare</th>
              <th className="px-5 py-3">Per km</th>
              <th className="px-5 py-3">Minimum</th>
            </tr>
          </thead>
          <tbody>
            {rateCard.map((r) => (
              <tr key={r.category} className="border-t border-black/5">
                <td className="px-5 py-3">{r.category}</td>
                <td className="px-5 py-3">{r.base}</td>
                <td className="px-5 py-3">{r.perKm}</td>
                <td className="px-5 py-3">{r.min}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

`client/src/app/(marketing)/about/page.tsx`:
```tsx
export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-20">
      <h1 className="font-heading text-4xl font-bold mb-6">About FYRO</h1>
      <p className="text-text-muted leading-relaxed">
        FYRO — Find Your Right One — is an on-demand logistics marketplace launching in Andhra
        Pradesh. We connect customers who need cargo moved or loaded with verified truck drivers
        and Hamali labor, matched in real time, tracked live, and paid for securely in-app.
      </p>
    </div>
  );
}
```

`client/src/app/(marketing)/contact/page.tsx`:
```tsx
export default function ContactPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-20">
      <h1 className="font-heading text-4xl font-bold mb-6">Contact</h1>
      <p className="text-text-muted leading-relaxed mb-2">Support: support@fyro.example</p>
      <p className="text-text-muted leading-relaxed">Partnerships: partners@fyro.example</p>
    </div>
  );
}
```

- [ ] **Step 4: Build check**

Run: `npm run build --workspace client`
Expected: build succeeds (auth pages/admin pages from later tasks not yet present, so this is a partial build check — rerun after Task 16/17 too).

- [ ] **Step 5: Commit**

```bash
git add "client/src/app/(marketing)"
git commit -m "feat: add full marketing site with animated hero and role-based CTAs"
```

---

### Task 16: Auth pages (login, 3 signup flows)

**Files:**
- Create: `client/src/app/login/page.tsx`, `client/src/app/signup/customer/page.tsx`, `client/src/app/signup/driver/page.tsx`, `client/src/app/signup/hamali/page.tsx`

- [ ] **Step 1: Login page**

`client/src/app/login/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiClientError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function LoginPage() {
  const router = useRouter();
  const { refetch } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/auth/login', { phone, password });
      await refetch();
      router.push('/');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <h1 className="font-heading text-2xl font-bold mb-6">Log in</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="tel"
            placeholder="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
        <p className="text-sm text-text-muted mt-6">
          New here?{' '}
          <Link href="/signup/customer" className="text-primary font-medium">
            Sign up
          </Link>
        </p>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Customer signup**

`client/src/app/signup/customer/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function SignupCustomerPage() {
  const router = useRouter();
  const { refetch } = useAuth();
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/auth/signup/customer', form);
      await refetch();
      router.push('/');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <h1 className="font-heading text-2xl font-bold mb-6">Book with FYRO</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
            required
          />
          <input
            type="tel"
            placeholder="Phone number"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
            required
          />
          <input
            type="email"
            placeholder="Email (optional)"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
          />
          <input
            type="password"
            placeholder="Password (min 8 characters)"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
            required
            minLength={8}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Driver signup**

`client/src/app/signup/driver/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function SignupDriverPage() {
  const router = useRouter();
  const { refetch } = useAuth();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    password: '',
    vehicleType: 'mini_truck',
    capacityKg: '',
    registrationNumber: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/auth/signup/driver', { ...form, capacityKg: Number(form.capacityKg) });
      await refetch();
      router.push('/');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <Card className="w-full max-w-sm">
        <h1 className="font-heading text-2xl font-bold mb-6">Drive with FYRO</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
            required
          />
          <input
            type="tel"
            placeholder="Phone number"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
            required
          />
          <input
            type="password"
            placeholder="Password (min 8 characters)"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
            required
            minLength={8}
          />
          <select
            value={form.vehicleType}
            onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
            className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
          >
            <option value="mini_truck">Mini truck</option>
            <option value="medium_truck">Medium truck</option>
            <option value="large_truck">Large truck</option>
          </select>
          <input
            type="number"
            placeholder="Capacity (kg)"
            value={form.capacityKg}
            onChange={(e) => setForm({ ...form, capacityKg: e.target.value })}
            className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
            required
            min={1}
          />
          <input
            placeholder="Registration number"
            value={form.registrationNumber}
            onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
            className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Hamali signup (solo / leader / member sub-flow)**

`client/src/app/signup/hamali/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

type JoinType = 'solo' | 'leader' | 'member';

export default function SignupHamaliPage() {
  const router = useRouter();
  const { refetch } = useAuth();
  const [joinType, setJoinType] = useState<JoinType>('solo');
  const [form, setForm] = useState({
    name: '',
    phone: '',
    password: '',
    muthaName: '',
    inviteCode: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/auth/signup/hamali', { ...form, joinType });
      await refetch();
      router.push('/');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <Card className="w-full max-w-sm">
        <h1 className="font-heading text-2xl font-bold mb-6">Join FYRO as Hamali</h1>

        <div className="grid grid-cols-3 gap-2 mb-6">
          {(['solo', 'leader', 'member'] as JoinType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setJoinType(t)}
              className={`py-2 rounded-full text-sm font-medium border ${
                joinType === t ? 'bg-secondary text-white border-secondary' : 'border-black/10 text-text-muted'
              }`}
            >
              {t === 'solo' ? 'Solo' : t === 'leader' ? 'Create Mutha' : 'Join Mutha'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
            required
          />
          <input
            type="tel"
            placeholder="Phone number"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
            required
          />
          <input
            type="password"
            placeholder="Password (min 8 characters)"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
            required
            minLength={8}
          />
          {joinType === 'leader' && (
            <input
              placeholder="Mutha (group) name"
              value={form.muthaName}
              onChange={(e) => setForm({ ...form, muthaName: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
              required
            />
          )}
          {joinType === 'member' && (
            <input
              placeholder="Invite code from your leader"
              value={form.inviteCode}
              onChange={(e) => setForm({ ...form, inviteCode: e.target.value.toUpperCase() })}
              className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
              required
            />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full" variant="secondary">
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add client/src/app/login client/src/app/signup
git commit -m "feat: add login and customer/driver/hamali signup pages"
```

---

### Task 17: Admin tree view, user table, and admin pages

**Files:**
- Create: `client/src/components/admin/TreeView.tsx`, `client/src/components/admin/UserTable.tsx`, `client/src/app/admin/layout.tsx`, `client/src/app/admin/users/page.tsx`, `client/src/app/admin/managers/page.tsx`

- [ ] **Step 1: TreeView (Admin root → Manager children with permission badges)**

`client/src/components/admin/TreeView.tsx`:
```tsx
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface ManagerNode {
  _id: string;
  name: string;
  phone: string;
  permissions: string[];
}

export function TreeView({ adminName, managers }: { adminName: string; managers: ManagerNode[] }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <Card className="border-2 border-primary/40">
        <p className="text-xs text-text-muted uppercase tracking-wide mb-1">Admin (root)</p>
        <p className="font-heading font-semibold">{adminName}</p>
      </Card>
      <div className="pl-8 border-l-2 border-black/10 ml-4 flex flex-col gap-3 w-full">
        {managers.length === 0 && <p className="text-sm text-text-muted">No managers yet.</p>}
        {managers.map((m) => (
          <Card key={m._id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="font-medium">{m.name}</p>
              <span className="text-xs text-text-muted">{m.phone}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {m.permissions.length === 0 && <Badge tone="muted">No permissions granted</Badge>}
              {m.permissions.map((p) => (
                <Badge key={p} tone="secondary">
                  {p}
                </Badge>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: UserTable (search, inline role change, suspend/delete with confirm modal)**

`client/src/components/admin/UserTable.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

export interface AdminUserRow {
  _id: string;
  name: string;
  phone: string;
  role: string;
  accountStatus: string;
}

const ROLE_OPTIONS = ['customer', 'driver', 'hamali_solo', 'mutha_leader', 'mutha_member'];

interface UserTableProps {
  users: AdminUserRow[];
  onRoleChange: (id: string, role: string) => Promise<void>;
  onStatusChange: (id: string, status: string) => Promise<void>;
}

export function UserTable({ users, onRoleChange, onStatusChange }: UserTableProps) {
  const [pendingAction, setPendingAction] = useState<
    { userId: string; kind: 'role' | 'suspend' | 'delete'; value?: string } | null
  >(null);

  async function confirmAction() {
    if (!pendingAction) return;
    if (pendingAction.kind === 'role' && pendingAction.value) {
      await onRoleChange(pendingAction.userId, pendingAction.value);
    } else if (pendingAction.kind === 'suspend') {
      await onStatusChange(pendingAction.userId, 'suspended');
    } else if (pendingAction.kind === 'delete') {
      await onStatusChange(pendingAction.userId, 'deleted');
    }
    setPendingAction(null);
  }

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-black/5">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id} className="border-t border-black/5">
                <td className="px-4 py-3">{u.name}</td>
                <td className="px-4 py-3">{u.phone}</td>
                <td className="px-4 py-3">
                  <select
                    defaultValue={u.role}
                    onChange={(e) => setPendingAction({ userId: u._id, kind: 'role', value: e.target.value })}
                    className="border border-black/10 rounded-lg px-2 py-1 bg-background"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={u.accountStatus === 'active' ? 'secondary' : 'muted'}>{u.accountStatus}</Badge>
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <Button variant="ghost" onClick={() => setPendingAction({ userId: u._id, kind: 'suspend' })}>
                    Suspend
                  </Button>
                  <Button variant="danger" onClick={() => setPendingAction({ userId: u._id, kind: 'delete' })}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!pendingAction}
        onClose={() => setPendingAction(null)}
        title="Confirm action"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingAction(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmAction}>
              Confirm
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">
          {pendingAction?.kind === 'role' && `Change role to "${pendingAction.value}"?`}
          {pendingAction?.kind === 'suspend' && 'Suspend this account?'}
          {pendingAction?.kind === 'delete' && 'Delete this account? This is a soft delete and can be reversed by an admin.'}
        </p>
      </Modal>
    </>
  );
}
```

- [ ] **Step 3: Admin layout — RBAC-gated shell**

`client/src/app/admin/layout.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading || !user || user.role !== 'admin') {
    return <div className="min-h-screen flex items-center justify-center text-text-muted">Loading…</div>;
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r border-black/5 p-6 hidden md:block">
        <p className="font-heading font-bold text-primary mb-8">FYRO Admin</p>
        <nav className="flex flex-col gap-3 text-sm">
          <Link href="/admin/users" className="hover:text-primary">
            Users
          </Link>
          <Link href="/admin/managers" className="hover:text-primary">
            Managers
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-6 md:p-10">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: /admin/users page**

`client/src/app/admin/users/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { UserTable, AdminUserRow } from '@/components/admin/UserTable';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [search, setSearch] = useState('');

  async function load() {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    const res = await api.get<{ users: AdminUserRow[] }>(`/api/admin/users${query}`);
    setUsers(res.users);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRoleChange(id: string, role: string) {
    await api.patch(`/api/admin/users/${id}/role`, { role });
    await load();
  }

  async function handleStatusChange(id: string, status: string) {
    await api.patch(`/api/admin/users/${id}/status`, { status });
    await load();
  }

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-6">Users</h1>
      <div className="flex gap-3 mb-6">
        <input
          placeholder="Search by name or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          className="px-4 py-2 rounded-xl border border-black/10 bg-background flex-1 max-w-sm"
        />
      </div>
      <UserTable users={users} onRoleChange={handleRoleChange} onStatusChange={handleStatusChange} />
    </div>
  );
}
```

- [ ] **Step 5: /admin/managers page**

`client/src/app/admin/managers/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { TreeView } from '@/components/admin/TreeView';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth-context';

const PERMISSION_OPTIONS = ['verify_kyc', 'resolve_complaints', 'edit_fare_rules', 'view_analytics'];

interface ManagerRow {
  _id: string;
  name: string;
  phone: string;
  permissions: string[];
}

export default function AdminManagersPage() {
  const { user } = useAuth();
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [form, setForm] = useState({ name: '', phone: '', password: '' });
  const [permissions, setPermissions] = useState<string[]>([]);
  const [regionInput, setRegionInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await api.get<{ managers: ManagerRow[] }>('/api/admin/managers');
    setManagers(res.managers);
  }

  useEffect(() => {
    load();
  }, []);

  function togglePermission(p: string) {
    setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function addRegion() {
    if (!regionInput.trim()) return;
    setPermissions((prev) => [...prev, `manage_region:${regionInput.trim()}`]);
    setRegionInput('');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/api/admin/managers', { ...form, permissions });
      setForm({ name: '', phone: '', password: '' });
      setPermissions([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create manager');
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-10">
      <div>
        <h1 className="font-heading text-2xl font-bold mb-6">Org tree</h1>
        <TreeView adminName={user?.name ?? 'Admin'} managers={managers} />
      </div>

      <div>
        <h2 className="font-heading text-xl font-bold mb-6">Create manager</h2>
        <Card>
          <form onSubmit={handleCreate} className="space-y-4">
            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
              required
            />
            <input
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
              required
              minLength={8}
            />
            <div>
              <p className="text-sm font-medium mb-2">Permissions</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {PERMISSION_OPTIONS.map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => togglePermission(p)}
                    className={`px-3 py-1.5 rounded-full text-xs border ${
                      permissions.includes(p) ? 'bg-secondary text-white border-secondary' : 'border-black/10'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  placeholder="Region name (e.g. Visakhapatnam)"
                  value={regionInput}
                  onChange={(e) => setRegionInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl border border-black/10 bg-background text-sm"
                />
                <Button type="button" variant="ghost" onClick={addRegion}>
                  Add region scope
                </Button>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full">
              Create manager
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Full client build check**

Run: `npm run build --workspace client`
Expected: builds successfully, no type errors, all routes listed in build output (`/`, `/how-it-works`, `/pricing`, `/about`, `/contact`, `/login`, `/signup/customer`, `/signup/driver`, `/signup/hamali`, `/admin/users`, `/admin/managers`).

- [ ] **Step 7: Commit**

```bash
git add client/src/components/admin client/src/app/admin
git commit -m "feat: add admin org tree, user table, and admin users/managers pages"
```

---

### Task 18: Final Phase 1 verification and report

**Files:** none (verification only)

- [ ] **Step 1: Full server test suite**

Run: `npm test --workspace server`
Expected: every test file passes (models, token, rbac, auth, admin).

- [ ] **Step 2: Server build**

Run: `npm run build --workspace server`
Expected: no TS errors.

- [ ] **Step 3: Client build**

Run: `npm run build --workspace client`
Expected: no TS errors, all routes present in output.

- [ ] **Step 4: Compose the phase report**

Produce a report covering:
- Every client route and server endpoint that now exists.
- Confirmation of which tests ran and passed (paste actual output).
- Explicit note: DB-dependent manual verification (`npm run seed:admin`, hitting `/api/auth/*` against real Atlas) is **pending** the user supplying `MONGODB_URI` in `server/.env` — do not claim this was run if it wasn't.
- What's stubbed/deferred: Cloudinary (mocked), Razorpay (not yet integrated — Phase 4), SMS OTP (not implemented), geocode service (implemented, unused until Phase 2 booking flow), surge pricing / regions UI / audit-log viewer (Phase 5).

- [ ] **Step 5: Final commit if any report/doc files were added**

```bash
git add -A
git commit -m "chore: Phase 1 foundation complete" --allow-empty
```

---

## Plan self-review notes

- **Spec coverage:** repo scaffold ✓ (Task 1,2,13), all 10 models + geo indexes ✓ (Task 3), auth incl. 3 signup paths + Mutha join/create ✓ (Task 9), JWT refresh+RBAC ✓ (Task 5,6), admin seed ✓ (Task 12), Admin /users+/managers tree+CRUD+AuditLog ✓ (Task 10,17), marketing site ✓ (Task 15), design tokens as CSS vars ✓ (Task 13), rate limiting on auth ✓ (Task 7,9), validation on every POST/PUT/PATCH ✓ (Task 9,10).
- **Placeholder scan:** none found — every step has runnable code or an exact command with expected output.
- **Type consistency:** `AuthUser`/`publicUser()` shape, `ApiClientError`, `AdminUserRow`, and RBAC middleware signatures are consistent across the tasks that reference them.
- **Known gap flagged, not silently dropped:** DB-dependent verification (seed script, live Atlas auth flow) cannot run in this environment without the user's connection string — called out explicitly in Task 18 rather than assumed.
