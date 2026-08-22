import { Schema, model, Types } from 'mongoose';

export interface IWarehouseHub {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId; // User with role warehouse_hub
  name: string;
  location: { type: 'Point'; coordinates: [number, number] };
  address: string;
  totalDockSlots: number;
  // Phase 2 profile fields — previously nothing on this model was editable
  // after signup at all.
  operatingHours?: string; // free text, e.g. "06:00–22:00 IST" — no timezone-aware structured hours model exists yet
  gateContacts: { name: string; phone: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const warehouseHubSchema = new Schema<IWarehouseHub>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    address: { type: String, default: '' },
    totalDockSlots: { type: Number, default: 0, min: 0 },
    operatingHours: { type: String, trim: true },
    gateContacts: {
      type: [{ name: { type: String, trim: true, required: true }, phone: { type: String, trim: true, required: true } }],
      default: [],
    },
  },
  { timestamps: true }
);

warehouseHubSchema.index({ location: '2dsphere' });

export const WarehouseHub = model<IWarehouseHub>('WarehouseHub', warehouseHubSchema);
