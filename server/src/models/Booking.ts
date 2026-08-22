import { Schema, model, Types } from 'mongoose';

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
  cargoDetails: { weightKg: number; description?: string };
  pickupLocation: { type: 'Point'; coordinates: [number, number]; address: string };
  dropLocation: { type: 'Point'; coordinates: [number, number]; address: string };
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
    cargoDetails: {
      weightKg: { type: Number, required: true, min: 0 },
      description: { type: String },
    },
    pickupLocation: pointWithAddress,
    dropLocation: pointWithAddress,
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
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

bookingSchema.index({ pickupLocation: '2dsphere' });
bookingSchema.index({ dropLocation: '2dsphere' });
bookingSchema.index({ customerId: 1, status: 1 });
bookingSchema.index({ region: 1, status: 1 }); // surge.service's searching-count query
bookingSchema.index({ status: 1, scheduledFor: 1 }); // scheduledBooking.service's due-for-release poll

export const Booking = model<IBooking>('Booking', bookingSchema);
