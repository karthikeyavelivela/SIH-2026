import { Schema, model, Types } from 'mongoose';

export type GateEventType = 'vehicle_entered' | 'vehicle_exited' | 'crew_signed_in' | 'crew_signed_out';

// Append-only gate log for a warehouse hub's live feed — never updated or
// deleted once written, same append-only rule as AuditLog/LedgerEntry.
export interface IGateEvent {
  _id: Types.ObjectId;
  hubId: Types.ObjectId;
  type: GateEventType;
  bookingId?: Types.ObjectId;
  vehicleId?: Types.ObjectId;
  userId?: Types.ObjectId; // hamali/driver who triggered the event
  note?: string;
  createdAt: Date;
}

const gateEventSchema = new Schema<IGateEvent>(
  {
    hubId: { type: Schema.Types.ObjectId, ref: 'WarehouseHub', required: true, index: true },
    type: { type: String, enum: ['vehicle_entered', 'vehicle_exited', 'crew_signed_in', 'crew_signed_out'], required: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle' },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

gateEventSchema.index({ hubId: 1, createdAt: -1 });

export const GateEvent = model<IGateEvent>('GateEvent', gateEventSchema);
