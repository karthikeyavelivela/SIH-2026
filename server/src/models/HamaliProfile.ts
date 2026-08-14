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
