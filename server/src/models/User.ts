import { Schema, model, Types } from 'mongoose';
import type { Role, AccountStatus, KycStatus } from '@fyro/shared';

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  passwordHash: string;
  role: Role;
  region?: string;
  kycStatus: KycStatus;
  kycDocs: string[];
  profilePhoto?: string;
  accountStatus: AccountStatus;
  // Aggregate rating (driver/hamali_solo/mutha_member/customer can all be
  // rated). Updated by rating.service whenever a new Rating is submitted —
  // never written directly anywhere else.
  ratingAvg: number;
  ratingCount: number;
  // Manager-only; empty for every other role.
  permissions: string[];
  // Bumped on refresh-token rotation and logout to invalidate prior refresh tokens.
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      required: true,
      enum: [
        'customer',
        'driver',
        'hamali_solo',
        'mutha_leader',
        'mutha_member',
        'manager',
        'admin',
      ],
    },
    region: { type: String, trim: true },
    kycStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
    kycDocs: { type: [String], default: [] },
    profilePhoto: { type: String },
    accountStatus: { type: String, enum: ['active', 'suspended', 'deleted'], default: 'active' },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    permissions: { type: [String], default: [] },
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const User = model<IUser>('User', userSchema);
