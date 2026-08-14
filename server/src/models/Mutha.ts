import { Schema, model, Types } from 'mongoose';

export interface IMutha {
  _id: Types.ObjectId;
  name: string;
  leaderId: Types.ObjectId;
  memberIds: Types.ObjectId[];
  region?: string;
  inviteCode: string;
  ratingAvg: number;
  ratingCount: number;
  activeJobsCount: number;
  createdAt: Date;
}

const muthaSchema = new Schema<IMutha>(
  {
    name: { type: String, required: true, trim: true },
    leaderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    memberIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    region: { type: String, trim: true },
    inviteCode: { type: String, required: true, unique: true },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    activeJobsCount: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Mutha = model<IMutha>('Mutha', muthaSchema);
