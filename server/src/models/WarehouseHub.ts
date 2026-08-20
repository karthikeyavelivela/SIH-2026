import { Schema, model, Types } from 'mongoose';

export interface IWarehouseHub {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId; // User with role warehouse_hub
  name: string;
  location: { type: 'Point'; coordinates: [number, number] };
  address: string;
  totalDockSlots: number;
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
  },
  { timestamps: true }
);

warehouseHubSchema.index({ location: '2dsphere' });

export const WarehouseHub = model<IWarehouseHub>('WarehouseHub', warehouseHubSchema);
