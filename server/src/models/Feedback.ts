import { Schema, model, Types } from 'mongoose';

/**
 * What people tell us about the product itself.
 *
 * Distinct from a Complaint, which is about one booking and one counterparty
 * and belongs in the grievance pipeline. This is the other kind: the feature
 * that is missing, the screen that confuses, the trade nobody offers yet.
 *
 * `service_request` is the category that earns this collection its keep. A
 * customer who searches for a service FYRO does not offer currently leaves no
 * trace at all — they simply do not book. Letting them name it turns silent,
 * invisible demand into a counted list the admin queue can sort by, which is
 * how a new category gets added for a real reason rather than a guess.
 */

export const FEEDBACK_CATEGORIES = [
  'feature_request',
  'bug',
  'pricing',
  'worker_quality',
  'service_request',
  'other',
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export type FeedbackStatus = 'new' | 'reviewing' | 'planned' | 'closed';

export interface IFeedback {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  userRole: string;
  category: FeedbackCategory;
  message: string;
  /** For 'service_request': the trade they wanted, in their own words. */
  requestedService?: string;
  screenshotUrl?: string;
  status: FeedbackStatus;
  adminNote?: string;
  handledByUserId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const feedbackSchema = new Schema<IFeedback>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userRole: { type: String, required: true },
    category: { type: String, enum: FEEDBACK_CATEGORIES, required: true },
    message: { type: String, required: true, maxlength: 2000 },
    requestedService: { type: String, trim: true, maxlength: 120 },
    screenshotUrl: { type: String },
    status: { type: String, enum: ['new', 'reviewing', 'planned', 'closed'], default: 'new', index: true },
    adminNote: { type: String, maxlength: 1000 },
    handledByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

feedbackSchema.index({ userId: 1, createdAt: -1 });
feedbackSchema.index({ category: 1, status: 1 });

export const Feedback = model<IFeedback>('Feedback', feedbackSchema);
