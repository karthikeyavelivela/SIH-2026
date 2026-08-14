import { Schema, model, Types } from 'mongoose';

export interface IPayment {
  _id: Types.ObjectId;
  bookingId: Types.ObjectId;
  amount: number;
  method: string;
  status: 'pending' | 'success' | 'failed' | 'refunded';
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  createdAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, required: true },
    status: { type: String, enum: ['pending', 'success', 'failed', 'refunded'], default: 'pending' },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Payment = model<IPayment>('Payment', paymentSchema);
