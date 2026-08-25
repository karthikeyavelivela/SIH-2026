import { Schema, model, Types } from 'mongoose';

// SIH26089 Phase D.1 — one real stop a driver makes during a booking's
// transit. `checkpointId` present = a real designated/recommended
// checkpoint; absent = an UNPLANNED stop (the thing the alert system in
// checkpoint.controller.ts's flagUnplannedHalts watches for). `sealIntact`
// null until the driver actually confirms it at this halt — never defaults
// to true (that would silently fabricate a chain-of-custody claim nobody
// actually made).
export interface IHaltEvent {
  _id: Types.ObjectId;
  bookingId: Types.ObjectId;
  driverId: Types.ObjectId;
  checkpointId?: Types.ObjectId;
  arrivalTime: Date;
  departureTime?: Date;
  driverGeoAtHalt: { type: 'Point'; coordinates: [number, number] };
  photoProofUrl?: string;
  odometerReading?: number;
  sealIntact?: boolean;
  createdAt: Date;
}

const haltEventSchema = new Schema<IHaltEvent>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    driverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    checkpointId: { type: Schema.Types.ObjectId, ref: 'Checkpoint' },
    arrivalTime: { type: Date, required: true },
    departureTime: { type: Date },
    driverGeoAtHalt: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    photoProofUrl: { type: String },
    odometerReading: { type: Number, min: 0 },
    sealIntact: { type: Boolean },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

haltEventSchema.index({ bookingId: 1, arrivalTime: 1 });
haltEventSchema.index({ driverGeoAtHalt: '2dsphere' });

export const HaltEvent = model<IHaltEvent>('HaltEvent', haltEventSchema);
