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
  premium: number;
  // Phase 3 (AUDIT_REPORT.md remediation) — only meaningful when
  // type:'parametric'. Enrolling in a parametric plan (insurance.controller.ts's
  // enroll handler) creates the worker's InsurancePolicy AND a real
  // ParametricTrigger from these values in the same call — a plan with no
  // default trigger config would enroll someone into "automatic payouts"
  // that can never actually fire, which is exactly the kind of built-but-
  // inert feature this whole remediation exists to close.
  defaultTrigger?: {
    condition: 'earnings_below_threshold' | 'days_unable_to_work';
    thresholdValue: number;
    periodDays: number;
    payoutAmount: number;
  };
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
    premium: { type: Number, required: true, min: 0 },
    defaultTrigger: {
      condition: { type: String, enum: ['earnings_below_threshold', 'days_unable_to_work'] },
      thresholdValue: { type: Number, min: 0 },
      periodDays: { type: Number, min: 1 },
      payoutAmount: { type: Number, min: 0 },
    },
  },
  { timestamps: true }
);

insurancePlanSchema.index({ active: 1, category: 1 });

export const InsurancePlan = model<IInsurancePlan>('InsurancePlan', insurancePlanSchema);
