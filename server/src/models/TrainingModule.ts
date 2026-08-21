import { Schema, model, Types } from 'mongoose';
import type { Role } from '@fyro/shared';

const ROLE_ENUM = [
  'customer',
  'driver',
  'hamali_solo',
  'mutha_leader',
  'mutha_member',
  'manager',
  'admin',
  'fleet_owner',
  'warehouse_hub',
];

// A single curriculum step in the partner/worker training academy.
// `order` is the sequential-unlocking key — a module only becomes available
// once every earlier-order module (within the same `forRoles` set) is
// completed. Enforced server-side in training.controller's completeModule,
// never trusted from the client.
export interface ITrainingModule {
  _id: Types.ObjectId;
  title: string;
  description: string;
  durationMinutes: number;
  order: number;
  forRoles: Role[];
  // Plain text/markdown lesson body — no video infra exists yet, matching
  // the brief's "no video infra needed" scope.
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

const trainingModuleSchema = new Schema<ITrainingModule>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    durationMinutes: { type: Number, required: true, min: 1 },
    order: { type: Number, required: true, unique: true },
    forRoles: { type: [String], enum: ROLE_ENUM, required: true, validate: (v: string[]) => v.length > 0 },
    content: { type: String, required: true },
  },
  { timestamps: true }
);

// No separate `.index({ order: 1 })` here — `unique: true` on the field
// above already creates that index; declaring both triggered a duplicate-
// index warning on every server boot.

export const TrainingModule = model<ITrainingModule>('TrainingModule', trainingModuleSchema);
