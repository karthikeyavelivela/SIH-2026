import { Schema, model, Types } from 'mongoose';
import type { AvailabilityStatus } from '@fyro/shared';

export interface IHamaliProfile {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: 'solo' | 'mutha_member';
  muthaId?: Types.ObjectId;
  // Existed on the schema with zero endpoint ever exposing it — the exact
  // same "real field, no way to actually set it" pattern AUDIT_REPORT.md
  // found repeatedly elsewhere. hamaliProfile.controller.ts (Phase 2) is
  // the first thing that ever reads/writes this.
  skills: string[];
  physicalCapacityKg?: number;
  availabilityStatus: AvailabilityStatus;
  currentLocation: { type: 'Point'; coordinates: [number, number] };
  // Optional, self-set "I'll take jobs anchored here" point — distinct
  // from currentLocation (live GPS, refreshed each time they go online).
  // A solo hamali who's willing to travel out from a fixed base doesn't
  // need to physically be there yet for matching.service to consider
  // them; matching runs a wider-radius second pass against this field
  // when set, separate from the tight live-proximity pass on
  // currentLocation.
  willingLocation?: { type: 'Point'; coordinates: [number, number] };
  createdAt: Date;
  updatedAt: Date;
}

const hamaliProfileSchema = new Schema<IHamaliProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    type: { type: String, enum: ['solo', 'mutha_member'], required: true },
    muthaId: { type: Schema.Types.ObjectId, ref: 'Mutha' },
    skills: { type: [String], default: [] },
    physicalCapacityKg: { type: Number, min: 0 },
    availabilityStatus: { type: String, enum: ['online', 'offline', 'on_job'], default: 'offline' },
    currentLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    // No default on the inner `type` here (unlike currentLocation) —
    // giving it one makes mongoose materialize a half-populated
    // { type: 'Point' } (no coordinates) on every insert regardless of
    // whether willingLocation was ever set, which broke the sparse
    // 2dsphere index below with "Can't extract geo keys: Point must be an
    // array or object" on every single document write. Undefined by
    // default is exactly what the sparse index wants.
    willingLocation: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] },
    },
  },
  { timestamps: true }
);

hamaliProfileSchema.index({ currentLocation: '2dsphere' });
hamaliProfileSchema.index({ willingLocation: '2dsphere' }, { sparse: true });

export const HamaliProfile = model<IHamaliProfile>('HamaliProfile', hamaliProfileSchema);
