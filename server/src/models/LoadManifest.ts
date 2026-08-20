import { Schema, model, Types } from 'mongoose';

export type LoadManifestStatus = 'pending' | 'signed';

export interface ILoadManifestLineItem {
  sku: string;
  description: string;
  weightKg: number;
  quantity: number;
}

export interface ILoadManifestConsignorDetails {
  name: string;
  address: string;
  phone: string;
}

export interface ILoadManifest {
  _id: Types.ObjectId;
  bookingId: Types.ObjectId;
  lineItems: ILoadManifestLineItem[];
  consignorDetails: ILoadManifestConsignorDetails;
  // Set exactly once, together, by the sign controller — never touched by
  // any other mutation path. See loadManifest.controller.ts's signManifest:
  // once status flips to 'signed' this document is a legal artifact (Bill
  // of Lading sign-off) and is rejected for any further update, immutable
  // by design, not just by convention.
  signatureImageUrl?: string;
  signedAt?: Date;
  status: LoadManifestStatus;
  createdAt: Date;
  updatedAt: Date;
}

const lineItemSchema = new Schema<ILoadManifestLineItem>(
  {
    sku: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    weightKg: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, default: 1 },
  },
  { _id: false }
);

const consignorDetailsSchema = new Schema<ILoadManifestConsignorDetails>(
  {
    name: { type: String, default: '' },
    address: { type: String, default: '' },
    // Deliberately left unpopulated by createManifestForBooking — this
    // codebase's established convention (see driver/hamali active-job
    // pages' focusChat comment) is that raw phone numbers are never handed
    // to the client; a real consignor-phone value would need an explicit,
    // separate product decision before this field gets filled in.
    phone: { type: String, default: '' },
  },
  { _id: false }
);

const loadManifestSchema = new Schema<ILoadManifest>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true, index: true },
    lineItems: { type: [lineItemSchema], default: [] },
    consignorDetails: { type: consignorDetailsSchema, default: () => ({}) },
    signatureImageUrl: { type: String },
    signedAt: { type: Date },
    status: { type: String, enum: ['pending', 'signed'], default: 'pending' },
  },
  { timestamps: true }
);

export const LoadManifest = model<ILoadManifest>('LoadManifest', loadManifestSchema);
