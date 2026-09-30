import { Schema, model, Types } from 'mongoose';

/**
 * A worker's e-Shram registration as THEY report it: the 12-digit Universal
 * Account Number on their card, and optionally a photo of the card.
 *
 * FYRO does not check this against the e-Shram portal (there is no API for it
 * here, and nothing in the product claims there is). "Coverage" on the
 * federation dashboard is how many members have recorded a UAN, not how many
 * are verified registrants.
 */
export interface IEShramRecord {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  uan: string;
  card?: { publicId: string; format: string; resourceType: 'image' | 'raw'; uploadedAt: Date };
  createdAt: Date;
  updatedAt: Date;
}

const eShramSchema = new Schema<IEShramRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    uan: { type: String, required: true, match: /^\d{12}$/ },
    card: {
      type: { publicId: String, format: String, resourceType: { type: String, enum: ['image', 'raw'] }, uploadedAt: Date },
      _id: false,
      default: undefined,
    },
  },
  { timestamps: true }
);

export const EShramRecord = model<IEShramRecord>('EShramRecord', eShramSchema);
