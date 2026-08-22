import { Schema, model, Types } from 'mongoose';
import type { Role, AccountStatus, KycStatus, KycDocumentType, KycDocumentStatus } from '@fyro/shared';

// One uploaded KYC document. Added in AUDIT_REPORT.md's Phase 1.2 remediation
// — previously kycDocs was a bare string[] of URLs with no per-document
// status, so an admin reviewing a submission (or a worker checking their
// own) had no way to tell what was uploaded, what was under review, or why
// something was rejected, without one giant reason string. `type` IS
// effectively unique per user (kycDocument.controller.ts's uploadKycDocument
// replaces the existing entry for that type in place on re-upload, resetting
// status to 'under_review' and clearing rejectionReason) — one tile per
// document type, matching DocumentUploadCard's one-tile-per-type UI exactly.
export interface IKycDocument {
  _id: Types.ObjectId;
  type: KycDocumentType;
  url: string;
  status: KycDocumentStatus;
  rejectionReason?: string;
  expiryDate?: Date;
  uploadedAt: Date;
  reviewedAt?: Date;
  reviewedByAdminId?: Types.ObjectId;
}

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  passwordHash: string;
  role: Role;
  // Every role this phone number currently holds — the role switcher reads
  // this to offer alternatives; `role` above stays the *active* role a
  // session is currently operating as (JWT payload, every existing
  // `role === '...'` check in the codebase). Always contains `role`.
  roles: Role[];
  region?: string;
  // Overall account-level gate — still what availability.controller.ts's
  // KYC gate (Phase 1.3) and kyc.controller's admin queue check. Individual
  // kycDocs[].status is finer-grained (per-document review) but does not
  // itself flip this; an admin explicitly approves/rejects the whole
  // submission via the existing kyc.controller endpoints once they've
  // reviewed the documents. See kycDocument.controller.ts's doc comment for
  // the full reasoning on why these two are deliberately not auto-linked.
  kycStatus: KycStatus;
  kycDocs: IKycDocument[];
  // Set by kyc.controller's reject action; cleared (unset) on a subsequent
  // approve. Not required for 'pending'/'verified' — only ever meaningful
  // alongside kycStatus === 'rejected'.
  kycRejectionReason?: string;
  profilePhoto?: string;
  // Driver's license / hamali ID expiry — self-reported for now (no KYC
  // doc-upload endpoint exists yet to derive it from an actual document).
  // Surfaced as a profile-page nudge before it lapses so a worker isn't
  // surprised by a sudden deactivation.
  licenseExpiryAt?: Date;
  accountStatus: AccountStatus;
  // Aggregate rating (driver/hamali_solo/mutha_member/customer can all be
  // rated). Updated by rating.service whenever a new Rating is submitted —
  // never written directly anywhere else.
  ratingAvg: number;
  ratingCount: number;
  // Manager-only; empty for every other role.
  permissions: string[];
  // Bumped on refresh-token rotation and logout to invalidate prior refresh tokens.
  tokenVersion: number;
  // Everything below added for the Phase 2 profile remediation
  // (AUDIT_REPORT.md Section 3 — "a profile page of read-only text is the
  // failure mode we are fixing").
  notificationPreferences: {
    push: { jobUpdates: boolean; payments: boolean; promotions: boolean };
    sms: { jobUpdates: boolean; payments: boolean; promotions: boolean };
  };
  privacySettings: {
    // Whether currentLocation keeps updating while availabilityStatus is
    // 'offline' — self-explanatory to a worker in a way "location sharing"
    // alone wouldn't be, since it's ALWAYS shared while online (that's how
    // matching finds them) and this setting has no effect then.
    shareLocationWhileOffline: boolean;
    profileVisibility: 'public' | 'private';
  };
  // Masked everywhere except the one PATCH that sets it — see
  // utils/publicUser.ts. bankAccountNumber/ifsc XOR upiId, never both
  // populated meaningfully at once (client sends one or the other).
  payoutDetails?: {
    method: 'bank' | 'upi';
    accountHolderName?: string;
    bankAccountNumber?: string;
    ifsc?: string;
    upiId?: string;
    updatedAt: Date;
  };
  // Customer-only in practice (see REQUIRED_KYC_DOCS_BY_ROLE — GSTIN is
  // already a required KYC document for fleet_owner/warehouse_hub, this is
  // the equivalent opt-in for a customer booking on a company's behalf).
  businessProfile?: {
    isBusiness: boolean;
    gstin?: string;
    companyName?: string;
  };
  // Phone-change-with-OTP-reverification (Phase 2). Cleared on confirm or
  // expiry; only ever one pending change at a time. otpHash is bcrypt, same
  // as passwordHash — never store a raw OTP at rest.
  pendingPhoneChange?: {
    newPhone: string;
    otpHash: string;
    expiresAt: Date;
    attempts: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      required: true,
      enum: [
        'customer',
        'driver',
        'hamali_solo',
        'mutha_leader',
        'mutha_member',
        'manager',
        'admin',
        'fleet_owner',
        'warehouse_hub',
      ],
    },
    roles: {
      type: [String],
      enum: [
        'customer',
        'driver',
        'hamali_solo',
        'mutha_leader',
        'mutha_member',
        'manager',
        'admin',
        'fleet_owner',
        'warehouse_hub',
      ],
      default: function (this: { role: Role }) {
        return [this.role];
      },
    },
    region: { type: String, trim: true },
    kycStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
    kycDocs: {
      type: [
        {
          type: { type: String, required: true },
          url: { type: String, required: true },
          status: { type: String, enum: ['under_review', 'verified', 'rejected'], default: 'under_review' },
          rejectionReason: { type: String, trim: true },
          expiryDate: { type: Date },
          uploadedAt: { type: Date, required: true, default: Date.now },
          reviewedAt: { type: Date },
          reviewedByAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
        },
      ],
      default: [],
    },
    kycRejectionReason: { type: String, trim: true },
    profilePhoto: { type: String },
    licenseExpiryAt: { type: Date },
    accountStatus: { type: String, enum: ['active', 'suspended', 'deleted'], default: 'active' },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    permissions: { type: [String], default: [] },
    tokenVersion: { type: Number, default: 0 },
    notificationPreferences: {
      type: {
        push: {
          jobUpdates: { type: Boolean, default: true },
          payments: { type: Boolean, default: true },
          promotions: { type: Boolean, default: true },
        },
        sms: {
          jobUpdates: { type: Boolean, default: true },
          payments: { type: Boolean, default: true },
          promotions: { type: Boolean, default: false },
        },
      },
      default: () => ({
        push: { jobUpdates: true, payments: true, promotions: true },
        sms: { jobUpdates: true, payments: true, promotions: false },
      }),
    },
    privacySettings: {
      type: {
        shareLocationWhileOffline: { type: Boolean, default: false },
        profileVisibility: { type: String, enum: ['public', 'private'], default: 'public' },
      },
      default: () => ({ shareLocationWhileOffline: false, profileVisibility: 'public' }),
    },
    payoutDetails: {
      method: { type: String, enum: ['bank', 'upi'] },
      accountHolderName: { type: String, trim: true },
      bankAccountNumber: { type: String },
      ifsc: { type: String, trim: true, uppercase: true },
      upiId: { type: String, trim: true },
      updatedAt: { type: Date },
    },
    businessProfile: {
      isBusiness: { type: Boolean, default: false },
      gstin: { type: String, trim: true, uppercase: true },
      companyName: { type: String, trim: true },
    },
    // No default on `attempts` — same reasoning as Vehicle/HamaliProfile's
    // willingLocation inner `type` field: a default on ANY child of a
    // nested-object schema path makes Mongoose re-materialize the whole
    // path (e.g. `{ attempts: 0 }`) on every document hydration, even one
    // where $unset genuinely removed it from storage. Confirmed hitting
    // exactly this — profileSecurity.test.ts's "pendingPhoneChange is
    // gone after confirm" assertion failed until this default was removed.
    pendingPhoneChange: {
      newPhone: { type: String, trim: true },
      otpHash: { type: String },
      expiresAt: { type: Date },
      attempts: { type: Number },
    },
  },
  { timestamps: true }
);

export const User = model<IUser>('User', userSchema);
