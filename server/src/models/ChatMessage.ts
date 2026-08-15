import { Schema, model, Types } from 'mongoose';
import type { Role } from '@fyro/shared';

// Not in the original spec's Data Models list (only "in-app chat scoped to
// this room" is mentioned, no schema given) — added because Phase 3's chat
// needs to survive a page refresh/reconnect, not just live-relay. Kept
// intentionally minimal: no read receipts, attachments, or edit/delete.
export interface IChatMessage {
  _id: Types.ObjectId;
  bookingId: Types.ObjectId;
  senderId: Types.ObjectId;
  senderRole: Role;
  text: string;
  createdAt: Date;
}

const chatMessageSchema = new Schema<IChatMessage>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: { type: String, required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

chatMessageSchema.index({ bookingId: 1, createdAt: 1 });

export const ChatMessage = model<IChatMessage>('ChatMessage', chatMessageSchema);
