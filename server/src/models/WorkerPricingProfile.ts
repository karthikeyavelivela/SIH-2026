import { Schema, model, Types } from 'mongoose';
import { PRICING_MODES, UNIT_TYPES, type PricingMode, type UnitType } from '@fyro/shared';

/**
 * What one worker charges, for one service category.
 *
 * The shape here is the whole argument of this feature: a worker publishes
 * their own rates, in the units their trade actually uses, and may publish
 * several modes at once. An electrician commonly has all three of a
 * per-point rate, a fixed-price task list, and a willingness to quote bigger
 * jobs after a look — so `modesOffered` is an array, not a field.
 *
 * `societyFloorRespected` is stored rather than derived because it records
 * something about a moment: the rate passed its society's floor when it was
 * saved. A society that later raises its floor does not silently invalidate
 * work already published — it flags it, and the worker is asked to re-price.
 * Deriving the flag at read time would erase that distinction, and would put
 * a database round-trip on every price a customer looks at.
 */

export interface IPerUnitRate {
  unitType: UnitType;
  rate: number;
  minimumQuantity: number;
  /** The worker's own words about what the rate covers. Shown to customers verbatim. */
  description?: string;
}

export interface IPerTaskRate {
  /**
   * Set when the worker picked this job from the trade's catalogue, absent
   * when they typed their own. It is what lets a Telugu carpenter's task list
   * read correctly to a Hindi customer — a catalogued task is displayed from
   * the translation, a typed one in the worker's own words, which is the
   * honest fallback rather than a machine translation of a price promise.
   */
  taskSlug?: string;
  taskName: string;
  description?: string;
  fixedPrice: number;
  estimatedDurationMinutes?: number;
}

export interface IWorkerPricingProfile {
  _id: Types.ObjectId;
  workerId: Types.ObjectId;
  /** ServiceCategory slug — the trade this pricing is for. A worker who does two trades has two profiles. */
  categorySlug: string;
  modesOffered: PricingMode[];
  hourly?: {
    rate: number;
    minimumBlockHours: number;
    travelIncluded: boolean;
  };
  perUnit: IPerUnitRate[];
  perTask: IPerTaskRate[];
  quotation?: {
    accepts: boolean;
    siteVisitFee: number;
    /** Whether the visit fee comes off the final bill if the job goes ahead. */
    siteVisitAdjustable: boolean;
    typicalTurnaroundHours?: number;
  };
  /** False when a society floor has moved above one of these rates since it was saved. */
  societyFloorRespected: boolean;
  /** Off the published list without deleting the rates — a worker on leave, not a worker who quit. */
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const perUnitSchema = new Schema<IPerUnitRate>(
  {
    // Required, with no default. A per-unit rate whose unit is unstated is
    // the exact ambiguity this feature exists to remove, so the database
    // refuses to hold one.
    unitType: { type: String, enum: UNIT_TYPES, required: true },
    rate: { type: Number, required: true, min: 1 },
    minimumQuantity: { type: Number, default: 1, min: 0 },
    description: { type: String, maxlength: 200 },
  },
  { _id: false }
);

const perTaskSchema = new Schema<IPerTaskRate>(
  {
    taskSlug: { type: String, trim: true },
    taskName: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, maxlength: 300 },
    fixedPrice: { type: Number, required: true, min: 1 },
    estimatedDurationMinutes: { type: Number, min: 5, max: 600 },
  },
  { _id: false }
);

const workerPricingProfileSchema = new Schema<IWorkerPricingProfile>(
  {
    workerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    categorySlug: { type: String, required: true, trim: true },
    modesOffered: [{ type: String, enum: PRICING_MODES }],
    hourly: {
      rate: { type: Number, min: 1 },
      minimumBlockHours: { type: Number, default: 1, min: 0.5, max: 12 },
      travelIncluded: { type: Boolean, default: false },
    },
    perUnit: { type: [perUnitSchema], default: [] },
    perTask: { type: [perTaskSchema], default: [] },
    quotation: {
      accepts: { type: Boolean, default: false },
      siteVisitFee: { type: Number, default: 0, min: 0 },
      siteVisitAdjustable: { type: Boolean, default: true },
      typicalTurnaroundHours: { type: Number, min: 1, max: 720 },
    },
    societyFloorRespected: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// One profile per worker per trade.
workerPricingProfileSchema.index({ workerId: 1, categorySlug: 1 }, { unique: true });
// The customer-facing query: who does this trade, priced this way, near here.
workerPricingProfileSchema.index({ categorySlug: 1, active: 1, modesOffered: 1 });

export const WorkerPricingProfile = model<IWorkerPricingProfile>(
  'WorkerPricingProfile',
  workerPricingProfileSchema
);
