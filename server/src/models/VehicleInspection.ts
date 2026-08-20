import { Schema, model, Types } from 'mongoose';

export type InspectionChecklistResult = 'pass' | 'warn' | 'fail';
export type InspectionVerdict = 'compliant' | 'non_compliant';

export interface IInspectionChecklistItem {
  item: string;
  result: InspectionChecklistResult;
  note?: string;
}

// A single 4-angle compliance inspection record for one vehicle. Submitting
// one with overallVerdict 'non_compliant' also sets
// Vehicle.complianceStatus to 'non_compliant' (see fleet.controller's
// submitInspection) — the gate that keeps a failed vehicle out of job
// matching until it passes a fresh inspection.
export interface IVehicleInspection {
  _id: Types.ObjectId;
  vehicleId: Types.ObjectId;
  fleetId: Types.ObjectId;
  inspectedAt: Date;
  photos: { front: string; rear: string; driverSide: string; passengerSide: string };
  checklist: IInspectionChecklistItem[];
  overallVerdict: InspectionVerdict;
  inspectedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const vehicleInspectionSchema = new Schema<IVehicleInspection>(
  {
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    fleetId: { type: Schema.Types.ObjectId, ref: 'Fleet', required: true, index: true },
    inspectedAt: { type: Date, required: true, default: Date.now },
    photos: {
      front: { type: String, required: true },
      rear: { type: String, required: true },
      driverSide: { type: String, required: true },
      passengerSide: { type: String, required: true },
    },
    checklist: {
      type: [{ item: { type: String, required: true }, result: { type: String, enum: ['pass', 'warn', 'fail'], required: true }, note: String }],
      default: [],
    },
    overallVerdict: { type: String, enum: ['compliant', 'non_compliant'], required: true },
    inspectedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

vehicleInspectionSchema.index({ vehicleId: 1, createdAt: -1 });

export const VehicleInspection = model<IVehicleInspection>('VehicleInspection', vehicleInspectionSchema);
