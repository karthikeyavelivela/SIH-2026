import { Schema, model, Types } from 'mongoose';

export type CheckpointType = 'toll_plaza' | 'police_checkpost' | 'verified_dhaba' | 'fuel_station' | 'designated_halt';

// SIH26089 Phase D.1 — Secure Transit Checkpoints. Real, named highway
// points a driver can be recommended to stop at, so a long-haul halt has a
// witness (CCTV, staff, a police post) instead of an unmonitored roadside
// stop where cargo can disappear with nobody able to prove where or when.
export interface ICheckpoint {
  _id: Types.ObjectId;
  name: string;
  location: { type: 'Point'; coordinates: [number, number] };
  type: CheckpointType;
  cctvAvailable: boolean;
  securityRating: number; // 1-5, hand-set at seed/admin-add time — see seedCheckpoints.ts's own disclaimer
  operatingHours: string;
  verifiedBy: string;
  amenities: string[];
  corridor: string; // e.g. "NH16 Chennai-Kolkata via Vijayawada/Visakhapatnam" — which named highway corridor this belongs to, for route-planning lookups
  createdAt: Date;
}

const checkpointSchema = new Schema<ICheckpoint>(
  {
    name: { type: String, required: true, trim: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    type: { type: String, enum: ['toll_plaza', 'police_checkpost', 'verified_dhaba', 'fuel_station', 'designated_halt'], required: true },
    cctvAvailable: { type: Boolean, default: false },
    securityRating: { type: Number, min: 1, max: 5, default: 3 },
    operatingHours: { type: String, default: '24 hours' },
    verifiedBy: { type: String, default: 'FYRO Operations' },
    amenities: { type: [String], default: [] },
    corridor: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

checkpointSchema.index({ location: '2dsphere' });
checkpointSchema.index({ corridor: 1 });

export const Checkpoint = model<ICheckpoint>('Checkpoint', checkpointSchema);
