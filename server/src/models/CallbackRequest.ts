import { Schema, model, Types } from 'mongoose';

/**
 * Someone phoned the FYRO number and asked for a call back to help them book.
 * A person rings them; nothing here books anything.
 */
export interface ICallbackRequest {
  _id: Types.ObjectId;
  /** The caller's number as Exotel reported it, reduced to the last ten digits. */
  phone: string;
  /** Exotel's id for the call, so the same call asking twice makes one request. */
  callSid: string;
  language: 'en' | 'te' | 'hi';
  /** What they pressed, if the flow asked. */
  digits?: string;
  status: 'open' | 'done';
  doneByUserId?: Types.ObjectId;
  doneAt?: Date;
  createdAt: Date;
}

const callbackRequestSchema = new Schema<ICallbackRequest>(
  {
    phone: { type: String, required: true },
    callSid: { type: String, required: true, unique: true },
    language: { type: String, enum: ['en', 'te', 'hi'], required: true },
    digits: { type: String, maxlength: 10 },
    status: { type: String, enum: ['open', 'done'], default: 'open', index: true },
    doneByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    doneAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const CallbackRequest = model<ICallbackRequest>('CallbackRequest', callbackRequestSchema);
