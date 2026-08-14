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
