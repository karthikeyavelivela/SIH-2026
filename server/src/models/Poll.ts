import { Schema, model, Types } from 'mongoose';

// SIH26089 Phase B.2 — democratic controls: a Society votes on its own
// rate card (bye-law commission/welfare rates) and elects its own leader,
// rather than either being platform-imposed. Real consequence on close
// (governance.controller.ts's closePoll), not an advisory-only survey:
// a closed 'leader_election' poll's winning option really does become the
// Mutha's new leaderId; a closed 'rate_card' poll's winning option really
// does become the Society's new commissionRatePct/welfareDeductionRatePct
// (still bounded by the affiliated district Federation's max, same as a
// leader's own direct bye-law edit would be).
export type PollType = 'rate_card' | 'leader_election';
export type PollStatus = 'open' | 'closed';

export interface IPollOption {
  label: string;
  // 'leader_election': the candidate's User _id. 'rate_card': a JSON-
  // encoded {commissionRatePct, welfareDeductionRatePct} proposal.
  value: string;
}

export interface IPoll {
  _id: Types.ObjectId;
  muthaId: Types.ObjectId;
  type: PollType;
  question: string;
  options: IPollOption[];
  createdByUserId: Types.ObjectId;
  status: PollStatus;
  opensAt: Date;
  closesAt: Date;
  closedAt?: Date;
  winningOptionIndex?: number;
  createdAt: Date;
}

const pollSchema = new Schema<IPoll>(
  {
    muthaId: { type: Schema.Types.ObjectId, ref: 'Mutha', required: true },
    type: { type: String, enum: ['rate_card', 'leader_election'], required: true },
    question: { type: String, required: true, trim: true },
    options: {
      type: [{ label: { type: String, required: true }, value: { type: String, required: true } }],
      validate: (v: unknown[]) => v.length >= 2,
    },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    opensAt: { type: Date, default: Date.now },
    closesAt: { type: Date, required: true },
    closedAt: { type: Date },
    winningOptionIndex: { type: Number },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

pollSchema.index({ muthaId: 1, status: 1 });

export const Poll = model<IPoll>('Poll', pollSchema);
