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

export const SavedAddress = model<ISavedAddress>('SavedAddress', savedAddressSchema);
