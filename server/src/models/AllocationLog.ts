import { Schema, model, Types } from 'mongoose';

/**
 * What the crew recommender suggested for a job and what the leader finally
 * chose, so the recommender can be judged against real decisions rather than
 * trusted. One row per recommendation; `finalMemberIds` is filled in when the
 * leader assigns the crew.
 */
export interface IAllocationLog {
  _id: Types.ObjectId;
  bookingId: Types.ObjectId;
  muthaId: Types.ObjectId;
  leaderId: Types.ObjectId;
  source: 'ml' | 'rules';
  fallbackReason?: string;
  recommendedMemberIds: Types.ObjectId[];
  /** On the job already when the suggestion was made; they are not part of the comparison. */
  alreadyAssignedMemberIds: Types.ObjectId[];
  alternateMemberIds: Types.ObjectId[];
  finalMemberIds?: Types.ObjectId[];
  /** Set with finalMemberIds: did the leader take the recommendation exactly? */
  followed?: boolean;
  /** Recommended members the leader did not use. */
  removedCount?: number;
  /** Members the leader chose that were not recommended. */
  addedCount?: number;
  decidedAt?: Date;
  createdAt: Date;
}

const allocationLogSchema = new Schema<IAllocationLog>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    muthaId: { type: Schema.Types.ObjectId, ref: 'Mutha', required: true, index: true },
    leaderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    source: { type: String, enum: ['ml', 'rules'], required: true },
    fallbackReason: { type: String },
    recommendedMemberIds: { type: [Schema.Types.ObjectId], default: [] },
    alreadyAssignedMemberIds: { type: [Schema.Types.ObjectId], default: [] },
    alternateMemberIds: { type: [Schema.Types.ObjectId], default: [] },
    finalMemberIds: { type: [Schema.Types.ObjectId], default: undefined },
    followed: { type: Boolean },
    removedCount: { type: Number },
    addedCount: { type: Number },
    decidedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const AllocationLog = model<IAllocationLog>('AllocationLog', allocationLogSchema);
