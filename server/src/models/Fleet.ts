import { Schema, model, Types } from 'mongoose';

// A fleet owner's roster — which vehicles they own and which drivers are
// currently employed under them. Vehicle.ownerId still points at whoever
// registered it; Fleet is the separate "who manages/employs whom" layer so
// a driver can be independent (no Fleet membership) OR employed (listed in
// exactly one Fleet's driverIds) without changing Vehicle's own shape.
export interface IFleet {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId; // User with role fleet_owner
  name: string;
  vehicleIds: Types.ObjectId[];
  driverIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const fleetSchema = new Schema<IFleet>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    vehicleIds: { type: [Schema.Types.ObjectId], ref: 'Vehicle', default: [] },
    driverIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
  },
  { timestamps: true }
);

export const Fleet = model<IFleet>('Fleet', fleetSchema);
