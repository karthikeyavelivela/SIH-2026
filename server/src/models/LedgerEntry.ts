import { Schema, model, Types } from 'mongoose';

export type LedgerEntryType =
  | 'revenue'
  | 'payout'
  | 'fee'
  | 'refund'
  // SIH26089 Phase B.2 — cooperative governance money movements. 'commission'
  // is what a Society (Mutha) retains from a member's job to fund its own
  // operations (governance.service.ts's applySocietyDeduction — always
  // positive, "retained by the society"). 'welfare_fund' is the same
  // deduction's separate welfare-fund slice, kept as its own line so a
  // society's welfare-fund balance is independently auditable rather than
  // folded into general commission. 'equity' is a member buying/holding
  // cooperative shares (MemberShare.ts). 'surplus' is a period-end payout
  // of a society's retained surplus back to its members proportional to
  // their shareholding (SurplusDistribution.ts) — negative from the
  // society's own ledger perspective, same sign convention 'payout' uses.
  | 'commission'
  | 'welfare_fund'
  | 'equity'
  | 'surplus';
export type LedgerEntryStatus = 'posted' | 'pending' | 'failed';

// Append-only platform financial ledger (Part 2.2 of the admin/ops build).
// Deliberately NO update/delete controller is ever written against this
// model anywhere in the codebase — that is the entire enforcement
// mechanism (see server/src/controllers/ledger.controller.ts, which only
// exports list/export/summary handlers, never an update or delete one).
// Do not add a mutation endpoint for this model without a very good reason
// and a new audit trail entry documenting why the append-only guarantee
// was relaxed.
export interface ILedgerEntry {
  _id: Types.ObjectId;
  type: LedgerEntryType;
  entityType: string; // e.g. 'Booking', 'Payout', 'User'
  entityId: Types.ObjectId;
  amount: number;
  status: LedgerEntryStatus;
  description: string;
  region?: string;
  timestamp: Date;
}

const ledgerEntrySchema = new Schema<ILedgerEntry>({
  type: {
    type: String,
    enum: ['revenue', 'payout', 'fee', 'refund', 'commission', 'welfare_fund', 'equity', 'surplus'],
    required: true,
  },
  entityType: { type: String, required: true },
  entityId: { type: Schema.Types.ObjectId, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['posted', 'pending', 'failed'], default: 'posted' },
  description: { type: String, required: true },
  region: { type: String, trim: true },
  timestamp: { type: Date, default: Date.now },
});

ledgerEntrySchema.index({ timestamp: -1 });
ledgerEntrySchema.index({ type: 1, timestamp: -1 });

export const LedgerEntry = model<ILedgerEntry>('LedgerEntry', ledgerEntrySchema);
