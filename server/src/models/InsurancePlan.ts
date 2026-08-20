import { Schema, model, Types } from 'mongoose';
import type { Role } from '@fyro/shared';

export type InsurancePlanType = 'standard' | 'parametric';
export type InsurancePlanCategory = 'commercial_auto' | 'work_compensation' | 'cargo_transit';

// The catalog: what coverage *could* be issued to a worker. A worker's
// actual coverage is a separate InsurancePolicy document that references
// one of these by planId — same catalog/instance split as
// FareRule (region config) vs a Booking's own frozen fareBreakdown.
export interface IInsurancePlan {
  _id: Types.ObjectId;
  name: string;
  type: InsurancePlanType;
  category: InsurancePlanCategory;
  coverageAmount: number;
  description: string;
  // Which roles can hold this plan — e.g. a 'work_compensation' plan for
  // driver/hamali_solo/mutha_member, not customer/admin.
  forRoles: Role[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const insurancePlanSchema = new Schema<IInsurancePlan>(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['standard', 'parametric'], required: true },
    category: { type: String, enum: ['commercial_auto', 'work_compensation', 'cargo_transit'], required: true },
    coverageAmount: { type: Number, required: true, min: 0 },
    description: { type: String, required: true },
    forRoles: {
      type: [String],
      required: true,
      enum: [
        'customer',
        'driver',
        'hamali_solo',
        'mutha_leader',
        'mutha_member',
        'manager',
        'admin',
        'fleet_owner',
        'warehouse_hub',
      ],
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

insurancePlanSchema.index({ active: 1, category: 1 });

export const InsurancePlan = model<IInsurancePlan>('InsurancePlan', insurancePlanSchema);
