import { Schema, model, Types } from 'mongoose';

// Region-name-based surge override (mirrors FareRule's region-as-string
// approach — no real polygon geo, consistent with the rest of the
// codebase). A zone is "active" while `expiresAt > now`; nothing deletes a
// past zone, they just age out of the active list.
export interface ISurgeZone {
  _id: Types.ObjectId;
  name: string; // region name, matches FareRule.region / Booking.region
  multiplier: number;
  expiresAt: Date;
  isManual: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

const MAX_SURGE_MULTIPLIER = 3;

const surgeZoneSchema = new Schema<ISurgeZone>(
  {
    name: { type: String, required: true, trim: true },
    multiplier: { type: Number, required: true, min: 1, max: MAX_SURGE_MULTIPLIER },
    expiresAt: { type: Date, required: true },
    isManual: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

surgeZoneSchema.index({ name: 1, expiresAt: -1 });

export const SurgeZone = model<ISurgeZone>('SurgeZone', surgeZoneSchema);
export { MAX_SURGE_MULTIPLIER };
