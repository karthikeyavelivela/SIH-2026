import { Schema, model, Types } from 'mongoose';

// SIH26089 Phase B.2 — a cooperative member's equity stake in their
// Society. Real-world cooperative societies require members to hold at
// least one nominal share to be a member at all; this models that stake
// so it can be shown to the member ("here is what you own") and used as
// the real basis for proportional surplus distribution
// (SurplusDistribution.ts) — never an arbitrary/equal split, an actual
// shareholding-weighted one, same as a real cooperative's own bye-laws
// would require.
export interface IMemberShare {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  muthaId: Types.ObjectId;
  shareCount: number;
  // Par value per share in rupees — a real cooperative sets this in its
  // bye-laws (typically a small nominal amount, e.g. ₹100/share) and it
  // does not fluctuate like a market security; it's a membership stake,
  // not a tradeable instrument. Fixed per-society at issuance time here
  // (no secondary market exists in this codebase, deliberately — that's
  // out of scope for a labour cooperative's actual bye-laws).
  shareValue: number;
  issuedAt: Date;
}

const memberShareSchema = new Schema<IMemberShare>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  muthaId: { type: Schema.Types.ObjectId, ref: 'Mutha', required: true },
  shareCount: { type: Number, required: true, min: 0 },
  shareValue: { type: Number, required: true, min: 0 },
  issuedAt: { type: Date, default: Date.now },
});

// One share record per member per society — shareCount is incremented in
// place (governance.controller.ts's issueShares), never a second row for
// the same (userId, muthaId) pair.
memberShareSchema.index({ userId: 1, muthaId: 1 }, { unique: true });
memberShareSchema.index({ muthaId: 1 });

export const MemberShare = model<IMemberShare>('MemberShare', memberShareSchema);
