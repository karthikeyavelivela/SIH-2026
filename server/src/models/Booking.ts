import { Schema, model, Types } from 'mongoose';

// SIH26089 — what kind of goods a truck/combo booking is actually moving.
// Free-text `description` already existed but a structured type is what
// lets fraud/insurance/e-way-bill logic reason about a booking without
// parsing prose. Client mirrors this exact list (customer/book/page.tsx)
// rather than fetching it — same "small fixed list, hardcode it" precedent
// service-category display already sets on the marketing homepage.
export const GOODS_TYPES = [
  'general_goods',
  'electronics',
  'furniture',
  'household_shifting',
  'perishables',
  'construction_material',
  'industrial_machinery',
  'documents_parcels',
  'other',
] as const;
export type GoodsType = (typeof GOODS_TYPES)[number];

export type BookingStatus =
  | 'scheduled'
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
  // Optional (not required) deliberately — many existing tests create a
  // Booking directly without it, for scenarios unrelated to region/surge.
  // Every REAL booking created via createBooking always sets it (region is
  // a required body field on that route already); Phase 5's surge engine
  // is the only reader, and simply treats a bookingless region as not
  // counted, never a hard error.
  region?: string;
  // SIH26089 Phase C — which specific ServiceCategory (electrician,
  // plumber, domestic help, ...) this booking is actually for, layered on
  // top of `type` (the underlying truck/hamali DISPATCH mechanism, which
  // matching/fare/offer logic still reads unchanged — see
  // ServiceCategory.ts's own doc comment for the full mapping rationale).
  // Optional — a booking created before this phase, or a plain 'truck'/
  // 'hamali'/'combo' booking with no specific category chosen, has none,
  // and every existing read path treats that as "generic logistics/labour"
  // exactly as before this field existed.
  serviceCategorySlug?: string;
  cargoDetails: {
    weightKg: number;
    description?: string;
    // SIH26089 — what's actually being moved, for a truck/combo booking.
    // Optional and self-declared by the customer, same discipline as
    // BusinessProfileSection's GSTIN field elsewhere in this app — there is
    // no government e-way-bill portal integration here, so
    // ewayBillNumber is never verified against a real GSTN record, only
    // stored as what the customer entered.
    goodsType?: GoodsType;
    estimatedValueRupees?: number;
    // Real Indian rule this UI prompt is based on: an e-way bill is
    // required for an intra/inter-state consignment worth >= Rs 50,000
    // (CGST Rules, rule 138) — value-based, not weight-based, which is why
    // this is gated on estimatedValueRupees, not weightKg.
    ewayBillNumber?: string;
  };
  pickupLocation: { type: 'Point'; coordinates: [number, number]; address: string };
  dropLocation: { type: 'Point'; coordinates: [number, number]; address: string };
  // Phase 6.3 — multi-stop routing. Ordered intermediate waypoints between
  // pickup and drop (e.g. a warehouse hub run collecting from two pickup
  // points before the final drop). Absent/empty = unchanged existing
  // behaviour (a single pickup->drop leg). When present, distanceKm sums
  // every consecutive leg (pickup->stops[0]->...->stops[n-1]->drop) —
  // see booking.controller.ts's priceBooking. Deliberately routing/fare-
  // and-map scope only for this pass, not a per-stop status/proof-photo
  // workflow (that's a genuinely separate feature — assignedDriverIds
  // already model "one worker for the whole trip", not "check in at each
  // stop" — documented here as an intentional cut, not a silent gap).
  stops?: { coordinates: [number, number]; address: string }[];
  requiredVehicles: { capacityKg: number; count: number }[];
  requiredHamaliCount: number;
  assignedDriverIds: Types.ObjectId[];
  assignedHamaliIds: Types.ObjectId[];
  assignedMuthaId?: Types.ObjectId;
  rejectedByUserIds: Types.ObjectId[];
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
  // Photo proof captured by the assigned worker at pickup (before 'start')
  // and delivery (before 'complete') — biggest single dispute-reduction
  // feature per PRODUCT.md's real-world feature spec, cheap to build on
  // top of the existing cloudinary.service upload path.
  proofPhotos: { pickup?: string; delivery?: string };
  // Phase 6 — scheduled (vs. instant) booking. Absent = instant, matching
  // starts immediately at creation (unchanged existing behaviour). Present
  // = the booking is created with status 'scheduled' and matching is
  // deliberately NOT started until scheduledBooking.service.ts's release
  // loop finds it due — see that file for the mechanism.
  scheduledFor?: Date;
  // Phase 6.2 — load board with bidding. Absent/false = unchanged existing
  // behaviour (Phase 3's sequential-timed-offer push flow at the fixed
  // computed fareBreakdown.total). True = the customer chose to let
  // drivers/hamali_solo workers bid their own price instead of the fixed
  // one — createBooking skips startVehicleOffers/startHamaliOffers for
  // these (see loadboard.controller.ts), the booking still appears on the
  // ordinary GET /api/requests browse list (nothing hides it there), but
  // also appears on GET /api/loadboard and workers submit a Bid instead of
  // hitting the flat-fare accept button. Scoped to type 'truck' or 'hamali'
  // only, never 'combo' or a 'scheduled' booking — a single bidder winning
  // maps cleanly onto the existing single-actor acceptAsDriver/
  // acceptAsHamaliSolo functions; a combo/mutha crew winning bid would need
  // a genuinely different multi-party acceptance flow, out of scope here
  // and left as a documented follow-up, not silently half-supported.
  openForBidding?: boolean;
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
    region: { type: String, trim: true },
    serviceCategorySlug: { type: String, trim: true },
    cargoDetails: {
      weightKg: { type: Number, required: true, min: 0 },
      description: { type: String },
      goodsType: { type: String, enum: GOODS_TYPES },
      estimatedValueRupees: { type: Number, min: 0 },
      ewayBillNumber: { type: String, trim: true },
    },
    pickupLocation: pointWithAddress,
    dropLocation: pointWithAddress,
    stops: {
      type: [{ coordinates: { type: [Number], required: true }, address: { type: String, required: true } }],
      default: [],
    },
    requiredVehicles: {
      type: [{ capacityKg: Number, count: Number }],
      default: [],
    },
    requiredHamaliCount: { type: Number, default: 0 },
    assignedDriverIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    assignedHamaliIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    assignedMuthaId: { type: Schema.Types.ObjectId, ref: 'Mutha' },
    rejectedByUserIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    status: {
      type: String,
      enum: ['scheduled', 'requested', 'searching', 'matched', 'accepted', 'in_progress', 'completed', 'cancelled'],
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
    // Plain nested object (like pickupLocation/dropLocation above), not an
    // array — mongoose doesn't add its own _id to a single embedded object.
    proofPhotos: {
      pickup: { type: String },
      delivery: { type: String },
    },
    scheduledFor: { type: Date },
    openForBidding: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

bookingSchema.index({ pickupLocation: '2dsphere' });
bookingSchema.index({ dropLocation: '2dsphere' });
bookingSchema.index({ customerId: 1, status: 1 });
bookingSchema.index({ region: 1, status: 1 }); // surge.service's searching-count query
bookingSchema.index({ status: 1, scheduledFor: 1 }); // scheduledBooking.service's due-for-release poll

export const Booking = model<IBooking>('Booking', bookingSchema);
