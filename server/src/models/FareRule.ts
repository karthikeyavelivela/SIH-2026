import { Schema, model, Types } from 'mongoose';

export interface IFareRule {
  _id: Types.ObjectId;
  region: string;
  category: 'vehicle_small' | 'vehicle_medium' | 'vehicle_large' | 'hamali';
  baseFare: number;
  perKmRate: number;
  minimumFare: number;
  surgeMultiplier: number;
  setByAdminId: Types.ObjectId;
  effectiveFrom: Date;
  active: boolean;
}

const fareRuleSchema = new Schema<IFareRule>(
  {
    region: { type: String, required: true },
    category: {
      type: String,
      enum: ['vehicle_small', 'vehicle_medium', 'vehicle_large', 'hamali'],
      required: true,
    },
    baseFare: { type: Number, required: true, min: 0 },
    perKmRate: { type: Number, required: true, min: 0 },
    minimumFare: { type: Number, required: true, min: 0 },
    surgeMultiplier: { type: Number, default: 1.0, min: 1.0, max: 2.5 },
    setByAdminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    effectiveFrom: { type: Date, default: Date.now },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

fareRuleSchema.index({ region: 1, category: 1, active: 1 });

// Enforces "at most one active rule per region+category" at the DB layer,
// not just in application code. The controller's supersede-then-create
// logic (fareRule.controller.ts) closes this for the sequential case, but
// two concurrent creates can both pass the application-level check before
// either write lands — this index is what actually makes the second one
// fail instead of silently producing two active rows. Partial (only
// active:true documents are constrained) so any number of superseded
// (active:false) historical rows can coexist for the same region+category.
fareRuleSchema.index(
  { region: 1, category: 1 },
  { unique: true, partialFilterExpression: { active: true } }
);

export const FareRule = model<IFareRule>('FareRule', fareRuleSchema);
