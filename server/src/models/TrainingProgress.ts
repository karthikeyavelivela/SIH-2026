import { Schema, model, Types } from 'mongoose';

export type TrainingProgressStatus = 'locked' | 'in_progress' | 'completed';

// One row per (user, module) — only written once a user has actually
// started or completed a module. A module with no row for a given user is
// implicitly 'locked' (or the next-available one) as computed by
// training.controller's GET /progress; we don't pre-seed 'locked' rows for
// every module × every user, that's derived, not stored.
export interface ITrainingProgress {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  moduleId: Types.ObjectId;
  status: TrainingProgressStatus;
  completedAt?: Date;
  /** Why it was assigned rather than chosen, e.g. 'guarantee_claims' (P1.3). Never a penalty. */
  assignedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const trainingProgressSchema = new Schema<ITrainingProgress>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    moduleId: { type: Schema.Types.ObjectId, ref: 'TrainingModule', required: true },
    status: { type: String, enum: ['locked', 'in_progress', 'completed'], default: 'in_progress' },
    completedAt: { type: Date },
    assignedReason: { type: String },
  },
  { timestamps: true }
);

trainingProgressSchema.index({ userId: 1, moduleId: 1 }, { unique: true });

export const TrainingProgress = model<ITrainingProgress>('TrainingProgress', trainingProgressSchema);
