import { Schema, model, Types } from 'mongoose';

/**
 * P1.6 — a standing agreement between an institution (a school, hostel,
 * office, apartment association…) and a society: what work, how many
 * workers, how often, at what rate. The institution proposes, the society
 * leader accepts or counters, and once active the scheduler turns each
 * occurrence into a booking assigned to the society, whose leader picks the
 * crew. Billed monthly on one consolidated invoice.
 */
export type ContractStatus = 'proposed' | 'countered' | 'active' | 'paused' | 'completed' | 'cancelled' | 'rejected';
export type ContractKind = 'one_off' | 'recurring';
export type ContractFrequency = 'weekly' | 'monthly';

export interface IContract {
  _id: Types.ObjectId;
  institutionId: Types.ObjectId;
  muthaId: Types.ObjectId;
  categorySlug: string;
  scope: string;
  kind: ContractKind;
  schedule: {
    startDate: Date;
    endDate?: Date;
    frequency?: ContractFrequency;
    /** 0 = Sunday … 6 = Saturday (weekly). */
    daysOfWeek?: number[];
    /** 1–28 (monthly). */
    dayOfMonth?: number;
    /** 'HH:MM', India time. */
    time: string;
    durationHours: number;
  };
  workersPerVisit: number;
  /** What each worker is paid per visit — the worker's rate; the service fee goes on top. */
  ratePerWorkerPerVisit: number;
  region: string;
  location: { type: 'Point'; coordinates: [number, number]; address: string };
  status: ContractStatus;
  counter?: { ratePerWorkerPerVisit?: number; workersPerVisit?: number; note?: string; at: Date };
  history: { status: ContractStatus; at: Date; byUserId?: Types.ObjectId; note?: string }[];
  /** Visit dates already turned into bookings ('YYYY-MM-DD'), so generation is idempotent. */
  generatedDates: string[];
  createdAt: Date;
  updatedAt: Date;
}

const contractSchema = new Schema<IContract>(
  {
    institutionId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    muthaId: { type: Schema.Types.ObjectId, ref: 'Mutha', required: true, index: true },
    categorySlug: { type: String, required: true, trim: true },
    scope: { type: String, required: true, trim: true, maxlength: 2000 },
    kind: { type: String, enum: ['one_off', 'recurring'], required: true },
    schedule: {
      startDate: { type: Date, required: true },
      endDate: { type: Date },
      frequency: { type: String, enum: ['weekly', 'monthly'] },
      daysOfWeek: { type: [Number], default: undefined },
      dayOfMonth: { type: Number, min: 1, max: 28 },
      time: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
      durationHours: { type: Number, required: true, min: 1, max: 12 },
    },
    workersPerVisit: { type: Number, required: true, min: 1, max: 50 },
    ratePerWorkerPerVisit: { type: Number, required: true, min: 1 },
    region: { type: String, required: true, trim: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
      address: { type: String, required: true },
    },
    status: {
      type: String,
      enum: ['proposed', 'countered', 'active', 'paused', 'completed', 'cancelled', 'rejected'],
      default: 'proposed',
      index: true,
    },
    counter: {
      ratePerWorkerPerVisit: { type: Number },
      workersPerVisit: { type: Number },
      note: { type: String, maxlength: 1000 },
      at: { type: Date },
    },
    history: {
      type: [
        {
          status: { type: String, required: true },
          at: { type: Date, default: Date.now },
          byUserId: { type: Schema.Types.ObjectId, ref: 'User' },
          note: { type: String },
        },
      ],
      default: [],
    },
    generatedDates: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const Contract = model<IContract>('Contract', contractSchema);
