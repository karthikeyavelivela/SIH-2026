import { Schema, model, Types } from 'mongoose';

/**
 * An SOS raised by a person, from a screen, while something is going wrong.
 *
 * SIH26089's feature 8 is "emergency and on-demand service booking". The
 * on-demand half was always there; this is the emergency half, and it had a
 * press-and-hold button component in the repo with no route, no model and no
 * caller — a panic button wired to nothing, which is worse than no button.
 *
 * Design decisions worth stating:
 *
 *  - An alert is never auto-resolved and never expires. A safety record that
 *    tidies itself up is a safety record nobody can audit afterwards.
 *  - Location is captured if the browser gives it and omitted if it does
 *    not. An SOS must fire with or without GPS: denying location permission
 *    cannot be the reason a person could not call for help.
 *  - `bookingId` is optional for the same reason. Emergencies happen on the
 *    way to a job, not only during one.
 */

export type EmergencyKind = 'accident' | 'unsafe' | 'medical' | 'vehicle' | 'other';
export type EmergencyStatus = 'open' | 'acknowledged' | 'resolved';

export interface IEmergencyAlert {
  _id: Types.ObjectId;
  raisedByUserId: Types.ObjectId;
  raisedByRole: string;
  kind: EmergencyKind;
  note?: string;
  bookingId?: Types.ObjectId;
  location?: { type: 'Point'; coordinates: [number, number] };
  status: EmergencyStatus;
  acknowledgedByUserId?: Types.ObjectId;
  acknowledgedAt?: Date;
  resolvedByUserId?: Types.ObjectId;
  resolvedAt?: Date;
  resolutionNote?: string;
  createdAt: Date;
}

const emergencyAlertSchema = new Schema<IEmergencyAlert>(
  {
    raisedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    raisedByRole: { type: String, required: true },
    kind: { type: String, enum: ['accident', 'unsafe', 'medical', 'vehicle', 'other'], default: 'other' },
    note: { type: String, maxlength: 500 },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] },
    },
    status: { type: String, enum: ['open', 'acknowledged', 'resolved'], default: 'open', index: true },
    acknowledgedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt: { type: Date },
    resolvedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
    resolutionNote: { type: String, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// The operations queue: oldest open alert first, because an alert that has
// been waiting longest is the one most likely to be a real emergency nobody
// has looked at.
emergencyAlertSchema.index({ status: 1, createdAt: 1 });
emergencyAlertSchema.index({ location: '2dsphere' }, { sparse: true });

export const EmergencyAlert = model<IEmergencyAlert>('EmergencyAlert', emergencyAlertSchema);
