import { Schema, model, Types } from 'mongoose';

// "Address can be saved with multiple names" — Home/Work/Site 1, etc.
// Customer-facing (any authenticated user in practice, but the booking
// form's address picker is the only consumer today).
export interface ISavedAddress {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  label: string;
  address: string;
  coordinates: [number, number]; // [lng, lat], same order as Booking's GeoJSON points
  createdAt: Date;
}

const savedAddressSchema = new Schema<ISavedAddress>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    label: { type: String, required: true, trim: true, maxlength: 40 },
    address: { type: String, required: true, trim: true },
    coordinates: { type: [Number], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

savedAddressSchema.index({ userId: 1 });
// Nothing $near-queries this today (the booking form's address picker only
// ever reads a user's own saved list, unfiltered by distance) — added for
// correctness/consistency with every other geo field in the codebase, and
// so a future "nearby saved addresses" feature doesn't silently need a
// migration first. 2dsphere accepts this legacy [lng, lat] pair shape
// directly, no GeoJSON Point wrapper required.
savedAddressSchema.index({ coordinates: '2dsphere' });

export const SavedAddress = model<ISavedAddress>('SavedAddress', savedAddressSchema);
