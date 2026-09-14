import { Schema, model, Types } from 'mongoose';
import { PRICING_MODES, UNIT_TYPES, type PricingMode, type UnitType } from '@fyro/shared';

/**
 * The minimum a society's members may charge.
 *
 * This is the cooperative argument in one collection. A private aggregator
 * competes by driving the worker's price down; a society of workers who own
 * the platform can set a floor beneath which none of them will work, and
 * that floor is enforced by the API rather than requested politely.
 *
 * Bounded above by the district federation's cap, so a society cannot use
 * the mechanism to price its own members out of the market either — the same
 * two-tier governance already used for commission and welfare rates.
 *
 * A floor is per category AND per mode, because the modes are not
 * comparable: "at least ₹250 an hour" and "at least ₹180 per square foot"
 * are different promises about different work. For per-unit floors the unit
 * type is part of the key, since ₹180 per face square foot and ₹180 per
 * developed square foot are not the same floor either.
 */

export interface ISocietyRateFloor {
  _id: Types.ObjectId;
  societyId: Types.ObjectId;
  categorySlug: string;
  mode: PricingMode;
  /** Required for per_unit floors, absent for the others. */
  unitType?: UnitType;
  minimumRate: number;
  setByLeaderId: Types.ObjectId;
  /** The poll that carried it, when members voted rather than the leader deciding. */
  setByPollId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const societyRateFloorSchema = new Schema<ISocietyRateFloor>(
  {
    societyId: { type: Schema.Types.ObjectId, ref: 'Mutha', required: true, index: true },
    categorySlug: { type: String, required: true, trim: true },
    mode: { type: String, enum: PRICING_MODES, required: true },
    unitType: { type: String, enum: UNIT_TYPES },
    minimumRate: { type: Number, required: true, min: 0 },
    setByLeaderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    setByPollId: { type: Schema.Types.ObjectId, ref: 'Poll' },
  },
  { timestamps: true }
);

// One floor per society, category, mode and unit. `unitType` is part of the
// key and is null for non-per-unit modes, which MongoDB treats as a value —
// so hourly and per_task each get exactly one row, as intended.
societyRateFloorSchema.index(
  { societyId: 1, categorySlug: 1, mode: 1, unitType: 1 },
  { unique: true }
);

export const SocietyRateFloor = model<ISocietyRateFloor>('SocietyRateFloor', societyRateFloorSchema);
