import { Schema, model, Types } from 'mongoose';

/**
 * One DigiLocker sign-in in progress. It holds the random `state` that comes
 * back on the redirect (proving the redirect answers THIS person's request)
 * and the PKCE code verifier. Used once and then deleted, and it expires on
 * its own after ten minutes either way.
 */
export interface IDigiLockerSession {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  state: string;
  codeVerifier: string;
  docType: 'pan' | 'driving_licence';
  createdAt: Date;
}

const digiLockerSessionSchema = new Schema<IDigiLockerSession>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  state: { type: String, required: true, unique: true },
  codeVerifier: { type: String, required: true },
  docType: { type: String, enum: ['pan', 'driving_licence'], required: true },
  createdAt: { type: Date, default: Date.now, expires: 600 },
});

export const DigiLockerSession = model<IDigiLockerSession>('DigiLockerSession', digiLockerSessionSchema);
