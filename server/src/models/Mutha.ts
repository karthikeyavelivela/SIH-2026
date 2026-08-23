import { Schema, model, Types } from 'mongoose';

// SIH26089 Phase B — a Mutha IS a Primary Labour Cooperative Society (the
// PS's own term; kept as `Mutha` internally per the build brief's own
// "keep Mutha internally if renaming is risky" call — this model backs
// every existing mutha_leader/mutha_member screen and a full rename would
// touch ~20 files for no functional gain. New, federation-facing UI
// surfaces built this phase use "Society" in their copy; existing
// mutha_leader/member screens keep "Mutha" — see SIH_READINESS_FINAL.md
// for that decision recorded plainly, not silently mixed.
export type RegisteredAct = 'AP Cooperative Societies Act 1964' | 'AP Mutually Aided Cooperative Societies Act 1995';
export type AffiliationStatus = 'unaffiliated' | 'pending' | 'affiliated' | 'suspended';

export interface IMutha {
  _id: Types.ObjectId;
  name: string;
  leaderId: Types.ObjectId;
  memberIds: Types.ObjectId[];
  region?: string;
  photo?: string;
  inviteCode: string;
  ratingAvg: number;
  ratingCount: number;
  activeJobsCount: number;
  // ---- Phase B.1: cooperative registration + federation affiliation ----
  societyRegistrationNumber?: string;
  registeredUnderAct?: RegisteredAct;
  districtFederationId?: Types.ObjectId;
  // 'unaffiliated' (default — every Mutha created before this phase, and
  // any new one until its leader requests affiliation) -> 'pending' (leader
  // requested, district admin hasn't decided) -> 'affiliated' (approved) or
  // back to 'unaffiliated' (rejected) -> 'suspended' (district admin can
  // suspend an affiliated society, e.g. for a bye-law violation, without
  // deleting its history).
  affiliationStatus: AffiliationStatus;
  // ---- Phase B.2: cooperative governance / bye-laws ----
  // Both default to 0 — a society that never configures these deducts
  // nothing (byte-for-byte the same earnings math every existing test and
  // every society created before this phase already assumes). Bounded
  // server-side by the affiliated district Federation's
  // maxCommissionRatePct/maxWelfareDeductionRatePct — see
  // governance.controller.ts's updateByLaws.
  commissionRatePct: number;
  welfareDeductionRatePct: number;
  createdAt: Date;
}

const muthaSchema = new Schema<IMutha>(
  {
    name: { type: String, required: true, trim: true },
    leaderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    memberIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    region: { type: String, trim: true },
    photo: { type: String },
    inviteCode: { type: String, required: true, unique: true },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    activeJobsCount: { type: Number, default: 0 },
    societyRegistrationNumber: { type: String, trim: true },
    registeredUnderAct: {
      type: String,
      enum: ['AP Cooperative Societies Act 1964', 'AP Mutually Aided Cooperative Societies Act 1995'],
    },
    districtFederationId: { type: Schema.Types.ObjectId, ref: 'Federation' },
    affiliationStatus: {
      type: String,
      enum: ['unaffiliated', 'pending', 'affiliated', 'suspended'],
      default: 'unaffiliated',
    },
    commissionRatePct: { type: Number, default: 0, min: 0, max: 100 },
    welfareDeductionRatePct: { type: Number, default: 0, min: 0, max: 100 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

muthaSchema.index({ districtFederationId: 1, affiliationStatus: 1 });

export const Mutha = model<IMutha>('Mutha', muthaSchema);
