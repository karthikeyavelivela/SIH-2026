import { Schema, model, Types } from 'mongoose';

/**
 * A statutory minimum wage, as notified by a state government.
 *
 * This is what turns "fair wage" from a slogan into something a judge, a
 * labour inspector or a worker can check. Every rate the platform lets
 * anyone publish — a worker's own rate card, a society's floor, an admin's
 * fare rule — is validated against the row that applies, and a rate below
 * it is refused by naming the notification it would breach.
 *
 * WHAT IS STORED, AND WHY IT IS STORED RATHER THAN COMPUTED
 *
 * The notification publishes a MONTHLY rate. FYRO prices by the hour, by
 * the unit and by the job, so the daily and hourly equivalents have to be
 * derived — and the derivation is the part a worker would be entitled to
 * argue with. So the divisors are stored on the row alongside the answer,
 * and the UI prints the whole working (monthly ÷ days ÷ hours), rather
 * than presenting an hourly figure as though the government had published
 * one.
 *
 * The defaults:
 *
 *   - 26 working days a month. Under the Minimum Wages Act a monthly rate
 *     covers a month's work with the weekly rest day paid, which is 26
 *     working days, and 26 is the divisor state labour departments use
 *     when converting monthly to daily.
 *   - 8 hours a day, the normal working day under the Act.
 *
 * Both are per-row rather than global constants, because a schedule that
 * ever notifies a different working day should not silently inherit ours.
 *
 * SOURCING
 *
 * `sourceType` is deliberately not optional. A figure transcribed from a
 * compliance vendor's summary and a figure read out of the gazette are not
 * the same kind of fact, and a wage floor that rejects a worker's rate has
 * to be able to say which one it is standing on.
 */

export const WAGE_ZONES = ['zone_1', 'zone_2', 'zone_3'] as const;
export type WageZone = (typeof WAGE_ZONES)[number];

export const SKILL_BANDS = ['unskilled', 'semi_skilled', 'skilled', 'highly_skilled'] as const;
export type SkillBand = (typeof SKILL_BANDS)[number];

/** Where the rupee figures came from. */
export const WAGE_SOURCE_TYPES = ['gazette', 'department_website', 'secondary_compilation'] as const;
export type WageSourceType = (typeof WAGE_SOURCE_TYPES)[number];

export const DEFAULT_WORKING_DAYS_PER_MONTH = 26;
export const DEFAULT_WORKING_HOURS_PER_DAY = 8;

export interface IGovernmentWageFloor {
  _id: Types.ObjectId;
  /** Full state name, matching the `state` on Federation rows. */
  state: string;
  zone: WageZone;
  skillBand: SkillBand;
  /** As notified. Includes the Variable Dearness Allowance for the period. */
  monthlyRate: number;
  /** The basic and VDA components, when the notification separates them. */
  basicComponent?: number;
  vdaComponent?: number;
  /** Derived, with the divisors that produced them kept alongside. */
  dailyRate: number;
  hourlyRate: number;
  workingDaysPerMonth: number;
  workingHoursPerDay: number;
  /** The scheduled employment this schedule belongs to, in the state's own words. */
  scheduledEmployment: string;
  notificationNumber: string;
  notificationDate: Date;
  effectiveFrom: Date;
  /** When the next revision is due, if the notification says. VDA is revised twice yearly. */
  effectiveUntil?: Date;
  sourceType: WageSourceType;
  sourceUrl?: string;
  /** Free text for anything a reader needs to know before relying on the row. */
  sourceNote?: string;
  setByAdminId?: Types.ObjectId;
  active: boolean;
}

const schema = new Schema<IGovernmentWageFloor>(
  {
    state: { type: String, required: true, trim: true },
    zone: { type: String, enum: WAGE_ZONES, required: true },
    skillBand: { type: String, enum: SKILL_BANDS, required: true },
    monthlyRate: { type: Number, required: true, min: 0 },
    basicComponent: { type: Number, min: 0 },
    vdaComponent: { type: Number, min: 0 },
    dailyRate: { type: Number, required: true, min: 0 },
    hourlyRate: { type: Number, required: true, min: 0 },
    workingDaysPerMonth: { type: Number, required: true, min: 1, max: 31, default: DEFAULT_WORKING_DAYS_PER_MONTH },
    workingHoursPerDay: { type: Number, required: true, min: 1, max: 24, default: DEFAULT_WORKING_HOURS_PER_DAY },
    scheduledEmployment: { type: String, required: true, trim: true },
    notificationNumber: { type: String, required: true, trim: true },
    notificationDate: { type: Date, required: true },
    effectiveFrom: { type: Date, required: true },
    effectiveUntil: { type: Date },
    sourceType: { type: String, enum: WAGE_SOURCE_TYPES, required: true },
    sourceUrl: { type: String, trim: true },
    sourceNote: { type: String, trim: true },
    setByAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

schema.index({ state: 1, zone: 1, skillBand: 1, active: 1 });

// At most one ACTIVE row per state+zone+band, enforced in the database
// rather than only in the controller — the same partial-unique pattern
// FareRule uses, and for the same reason: two concurrent writes can both
// pass an application-level check before either lands. Superseded rows stay
// forever, because "what was the floor last April" is a question a dispute
// can turn on.
schema.index(
  { state: 1, zone: 1, skillBand: 1 },
  { unique: true, partialFilterExpression: { active: true } }
);

export const GovernmentWageFloor = model<IGovernmentWageFloor>('GovernmentWageFloor', schema);
