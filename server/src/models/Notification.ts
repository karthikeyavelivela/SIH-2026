import { Schema, model, Types } from 'mongoose';

// Phase 5.7 — the Notification Center. Before this model existed, FYRO had
// zero persistent notification infrastructure anywhere in the codebase
// (confirmed by grep during the Phase 0.2 money-chain audit: the "worker
// receives the notification" claim for insurance/payout events was false —
// only an ephemeral browser Notification API call existed for booking
// status changes, nothing survived a closed tab or an offline device, and
// nothing had a list a user could ever go back and read). This is the real
// persistence layer: every notification-worthy event writes one of these,
// independent of whether the user's device/tab was open to see the
// ephemeral push at the moment it fired.
export type NotificationType =
  | 'booking_matched'
  | 'booking_status'
  | 'kyc_decision'
  | 'payout'
  | 'insurance_trigger'
  | 'dispute_update'
  | 'complaint_update';

export interface INotification {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  /** In-app link to navigate to on tap, e.g. /customer/track/{bookingId}. Omitted for notifications with no natural destination. */
  link?: string;
  read: boolean;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['booking_matched', 'booking_status', 'kyc_decision', 'payout', 'insurance_trigger', 'dispute_update', 'complaint_update'],
    required: true,
  },
  title: { type: String, required: true },
  body: { type: String, required: true },
  link: { type: String },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Every real query pattern: "my notifications, newest first" and "my unread count".
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });

export const Notification = model<INotification>('Notification', notificationSchema);
