import { Schema, model, Types } from 'mongoose';

export type DisputePriority = 'low' | 'medium' | 'high' | 'critical';
export type DisputeStatus = 'open' | 'investigating' | 'resolved' | 'escalated';
export type DisputeResolutionAction = 'approve_adjustment' | 'partial_refund' | 'reject' | 'escalate';
/**
 * P1.5 — who is responsible for resolving a dispute right now. A dispute
 * starts with the society that did the work (a solo worker's starts at the
 * district federation) and moves up one level on escalation or a missed SLA.
 */
export type DisputeLevel = 'society' | 'district' | 'state' | 'admin';

export interface IDisputeCommunication {
  from: string;
  message: string;
  at: Date;
}

export interface IDisputeResolution {
  action: DisputeResolutionAction;
  note: string;
  amount?: number;
  /** Whoever resolved it — an admin, a federation admin or a society leader (name kept for existing records). */
  resolvedByAdminId: Types.ObjectId;
  resolvedAt: Date;
  /** P1.5 — the level it was resolved at. */
  level?: DisputeLevel;
}

export interface IDispute {
  _id: Types.ObjectId;
  bookingId: Types.ObjectId;
  raisedBy: Types.ObjectId;
  claim: string;
  // Snapshot of the real Booking record at the time the dispute was opened
  // — the "system record" half of the side-by-side view. Never re-derived
  // later; a dispute must show what the system said at the time.
  systemRecord: {
    status: string;
    fareTotal: number;
    distanceKm: number;
    pickupAddress: string;
    dropAddress: string;
    statusHistory: { status: string; timestamp: Date }[];
  };
  priority: DisputePriority;
  status: DisputeStatus;
  resolution?: IDisputeResolution;
  communicationLog: IDisputeCommunication[];
  level: DisputeLevel;
  /** When the current level's time runs out and it escalates by itself. */
  slaDueAt?: Date;
  muthaId?: Types.ObjectId;
  districtFederationId?: Types.ObjectId;
  stateFederationId?: Types.ObjectId;
  levelHistory: { level: DisputeLevel; at: Date; reason: 'initial' | 'escalated' | 'sla_missed'; byUserId?: Types.ObjectId }[];
  createdAt: Date;
}

const disputeSchema = new Schema<IDispute>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    raisedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    claim: { type: String, required: true },
    systemRecord: {
      status: { type: String, required: true },
      fareTotal: { type: Number, required: true },
      distanceKm: { type: Number, required: true },
      pickupAddress: { type: String, required: true },
      dropAddress: { type: String, required: true },
      statusHistory: { type: [{ status: String, timestamp: Date }], default: [] },
    },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    status: { type: String, enum: ['open', 'investigating', 'resolved', 'escalated'], default: 'open' },
    resolution: {
      action: { type: String, enum: ['approve_adjustment', 'partial_refund', 'reject', 'escalate'] },
      note: { type: String },
      amount: { type: Number },
      resolvedByAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
      resolvedAt: { type: Date },
      level: { type: String, enum: ['society', 'district', 'state', 'admin'] },
    },
    communicationLog: {
      type: [{ from: String, message: String, at: { type: Date, default: Date.now } }],
      default: [],
    },
    level: { type: String, enum: ['society', 'district', 'state', 'admin'], default: 'admin' },
    slaDueAt: { type: Date },
    muthaId: { type: Schema.Types.ObjectId, ref: 'Mutha' },
    districtFederationId: { type: Schema.Types.ObjectId, ref: 'Federation' },
    stateFederationId: { type: Schema.Types.ObjectId, ref: 'Federation' },
    levelHistory: {
      type: [
        {
          level: { type: String, enum: ['society', 'district', 'state', 'admin'] },
          at: { type: Date, default: Date.now },
          reason: { type: String, enum: ['initial', 'escalated', 'sla_missed'] },
          byUserId: { type: Schema.Types.ObjectId, ref: 'User' },
        },
      ],
      default: [],
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

disputeSchema.index({ status: 1, createdAt: -1 });
disputeSchema.index({ level: 1, status: 1, slaDueAt: 1 });

export const Dispute = model<IDispute>('Dispute', disputeSchema);
