import { Schema, model, Types } from 'mongoose';

export interface IComplaint {
  _id: Types.ObjectId;
  bookingId: Types.ObjectId;
  raisedByUserId: Types.ObjectId;
  againstUserId?: Types.ObjectId;
  againstMuthaId?: Types.ObjectId;
  category: 'no_show' | 'damage' | 'payment' | 'misconduct' | 'other';
  description: string;
  status: 'open' | 'in_review' | 'resolved';
  resolutionNote?: string;
  handledByUserId?: Types.ObjectId;
  createdAt: Date;
  resolvedAt?: Date;
}

const complaintSchema = new Schema<IComplaint>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    raisedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    againstUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    againstMuthaId: { type: Schema.Types.ObjectId, ref: 'Mutha' },
    category: { type: String, enum: ['no_show', 'damage', 'payment', 'misconduct', 'other'], required: true },
    description: { type: String, required: true },
    status: { type: String, enum: ['open', 'in_review', 'resolved'], default: 'open' },
    resolutionNote: { type: String },
    handledByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Global search (Job 4) — a person looks for their grievance by what they
// said in it, not by its category enum.
complaintSchema.index({ description: 'text' }, { name: 'complaint_search' });

export const Complaint = model<IComplaint>('Complaint', complaintSchema);
