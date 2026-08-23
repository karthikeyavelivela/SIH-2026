import { Schema, model, Types } from 'mongoose';

export type FederationType = 'state' | 'district';

// SIH26089 Phase B.1 — the cooperative federation hierarchy the PS's
// feature #9 names explicitly:
//   State Cooperative Labour Federation
//     └── District Cooperative L/C Federation
//           └── Primary Labour Cooperative Society (Mutha, see Mutha.ts)
//                 └── Individual worker-members
// A 'state' Federation has no parentFederationId. A 'district' Federation
// always has one, pointing at the 'state' Federation it reports into.
// Platform-created only (same "no self-signup" posture as `manager`) —
// federations are established by the cooperative movement/registrar, not
// spun up ad hoc by any user.
export interface IFederationContactDetails {
  phone?: string;
  email?: string;
  address?: string;
}

export interface IFederation {
  _id: Types.ObjectId;
  name: string;
  type: FederationType;
  parentFederationId?: Types.ObjectId;
  region: string;
  registrationNumber: string;
  registeredUnderAct: string;
  contactDetails: IFederationContactDetails;
  // Bye-law BOUNDS a district federation sets — an affiliated Society's own
  // commissionRatePct/welfareDeductionRatePct (Mutha.ts) may never exceed
  // these. Meaningless/unused on a 'state' federation (societies affiliate
  // to districts, not directly to the state tier) — left optional rather
  // than required so a state Federation document doesn't need placeholder
  // values with no real meaning.
  maxCommissionRatePct?: number;
  maxWelfareDeductionRatePct?: number;
  createdAt: Date;
}

const federationSchema = new Schema<IFederation>(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['state', 'district'], required: true },
    parentFederationId: { type: Schema.Types.ObjectId, ref: 'Federation' },
    region: { type: String, required: true, trim: true },
    registrationNumber: { type: String, required: true, trim: true },
    registeredUnderAct: { type: String, required: true, trim: true },
    contactDetails: {
      phone: { type: String, trim: true },
      email: { type: String, trim: true },
      address: { type: String, trim: true },
    },
    maxCommissionRatePct: { type: Number, min: 0, max: 100 },
    maxWelfareDeductionRatePct: { type: Number, min: 0, max: 100 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

federationSchema.index({ parentFederationId: 1 });
federationSchema.index({ type: 1, region: 1 });
// A registration number is a real, unique government-issued identifier —
// two federations can never legitimately share one.
federationSchema.index({ registrationNumber: 1 }, { unique: true });

export const Federation = model<IFederation>('Federation', federationSchema);
