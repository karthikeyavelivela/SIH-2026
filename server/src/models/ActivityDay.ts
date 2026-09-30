import { Schema, model, Types } from 'mongoose';

/**
 * P1.2 — one row per worker per day they were available for work.
 *
 * The welfare pool's demand index divides a week's jobs by the members who
 * were actually trying to work, and "trying" has to be measured, not
 * assumed. A row is written (once a day, upserted) when a worker goes online
 * and when an online worker's job feed polls. Days they worked are read from
 * bookings instead, so a job taken without ever toggling online still counts.
 */
export interface IActivityDay {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /** UTC calendar day, 'YYYY-MM-DD'. */
  day: string;
  region?: string;
  createdAt: Date;
}

const activityDaySchema = new Schema<IActivityDay>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    region: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

activityDaySchema.index({ userId: 1, day: 1 }, { unique: true });
activityDaySchema.index({ day: 1 });

export const ActivityDay = model<IActivityDay>('ActivityDay', activityDaySchema);
