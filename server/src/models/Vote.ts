import { Schema, model, Types } from 'mongoose';

export interface IVote {
  _id: Types.ObjectId;
  pollId: Types.ObjectId;
  userId: Types.ObjectId;
  optionIndex: number;
  votedAt: Date;
}

const voteSchema = new Schema<IVote>({
  pollId: { type: Schema.Types.ObjectId, ref: 'Poll', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  optionIndex: { type: Number, required: true, min: 0 },
  votedAt: { type: Date, default: Date.now },
});

// One vote per member per poll — enforced at the database layer, not just
// application logic, so a race between two rapid double-submits from the
// same member can never produce two counted votes.
voteSchema.index({ pollId: 1, userId: 1 }, { unique: true });

export const Vote = model<IVote>('Vote', voteSchema);
