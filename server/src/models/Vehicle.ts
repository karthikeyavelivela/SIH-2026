import { Schema, model, Types } from 'mongoose';
import type { AvailabilityStatus } from '@fyro/shared';

export interface IVehicle {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  type: string;
  capacityKg: number;
  registrationNumber: string;
  photos: string[];
  // Self-reported for now, same rationale as User.licenseExpiryAt — no
  // document-upload/OCR pipeline exists to derive this automatically.
  insuranceExpiryAt?: Date;
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
    insuranceExpiryAt: { type: Date },
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
