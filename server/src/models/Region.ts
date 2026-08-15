import { Schema, model, Types } from 'mongoose';

// Not in the spec's fixed Data Models list — region has always just been a
// free-text string on FareRule/User/Booking (any value works, nothing
// enumerates "valid" regions). Spec text lists "Enables/launches new
// regions" as an Admin capability and Phase 5 explicitly wants an admin
// /regions page for it, which needs somewhere to record which region
// names have actually been launched — this is that record, same
// documented-addition pattern as ChatMessage/IncentiveRule elsewhere in
// this codebase.
export interface IRegion {
  _id: Types.ObjectId;
  name: string;
  enabled: boolean;
  launchedByAdminId: Types.ObjectId;
  createdAt: Date;
}

const regionSchema = new Schema<IRegion>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    enabled: { type: Boolean, default: true },
    launchedByAdminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Region = model<IRegion>('Region', regionSchema);
