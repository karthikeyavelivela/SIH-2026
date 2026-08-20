import { Schema, model, Types } from 'mongoose';

export type MaintenanceTriggerType = 'mileage_triggered' | 'date_triggered';
export type MaintenanceStatus = 'upcoming' | 'due' | 'overdue' | 'completed';

// A single scheduled/needed service entry for one vehicle in a fleet
// owner's roster. `fleetId` is denormalized from Vehicle -> Fleet lookup at
// creation time purely so fleet.controller can scope list/create queries
// without an extra join on every request.
export interface IMaintenanceSchedule {
  _id: Types.ObjectId;
  vehicleId: Types.ObjectId;
  fleetId: Types.ObjectId;
  type: MaintenanceTriggerType;
  dueAt?: Date;
  dueMileageKm?: number;
  description: string;
  status: MaintenanceStatus;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const maintenanceScheduleSchema = new Schema<IMaintenanceSchedule>(
  {
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    fleetId: { type: Schema.Types.ObjectId, ref: 'Fleet', required: true, index: true },
    type: { type: String, enum: ['mileage_triggered', 'date_triggered'], required: true },
    dueAt: { type: Date },
    dueMileageKm: { type: Number, min: 0 },
    description: { type: String, required: true, trim: true },
    status: { type: String, enum: ['upcoming', 'due', 'overdue', 'completed'], default: 'upcoming' },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

maintenanceScheduleSchema.index({ fleetId: 1, status: 1 });

export const MaintenanceSchedule = model<IMaintenanceSchedule>('MaintenanceSchedule', maintenanceScheduleSchema);
