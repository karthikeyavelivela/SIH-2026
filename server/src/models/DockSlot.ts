import { Schema, model, Types } from 'mongoose';

export type DockSlotStatus = 'available' | 'occupied' | 'reserved' | 'closed';

export interface IDockSlot {
  _id: Types.ObjectId;
  hubId: Types.ObjectId;
  label: string; // e.g. "Dock A3"
  status: DockSlotStatus;
  currentBookingId?: Types.ObjectId;
  etaAt?: Date; // expected arrival for the incoming load assigned to this dock
  createdAt: Date;
  updatedAt: Date;
}

const dockSlotSchema = new Schema<IDockSlot>(
  {
    hubId: { type: Schema.Types.ObjectId, ref: 'WarehouseHub', required: true, index: true },
    label: { type: String, required: true, trim: true },
    status: { type: String, enum: ['available', 'occupied', 'reserved', 'closed'], default: 'available' },
    currentBookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
    etaAt: { type: Date },
  },
  { timestamps: true }
);

dockSlotSchema.index({ hubId: 1, label: 1 }, { unique: true });

export const DockSlot = model<IDockSlot>('DockSlot', dockSlotSchema);
