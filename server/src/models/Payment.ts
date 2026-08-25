import { Schema, model, Types } from 'mongoose';

export type PaymentStatus = 'pending' | 'success' | 'failed' | 'refunded';
export type PaymentMethod = 'razorpay' | 'cod';

export interface IPayment {
  _id: Types.ObjectId;
  bookingId: Types.ObjectId;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  // COD only — the assigned worker (driver or hamali) who actually
  // collected the cash and confirmed receipt. Only that worker's own
  // confirmation can move a COD payment to 'success' (see
  // payment.controller.ts's confirmCodPayment) — the customer can't
  // self-report having paid cash, same custody discipline as
  // HaltEvent.sealIntact never defaulting to true.
  codConfirmedBy?: Types.ObjectId;
  createdAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: ['razorpay', 'cod'], default: 'razorpay' },
    status: { type: String, enum: ['pending', 'success', 'failed', 'refunded'], default: 'pending' },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    codConfirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

paymentSchema.index({ bookingId: 1 });

export const Payment = model<IPayment>('Payment', paymentSchema);
