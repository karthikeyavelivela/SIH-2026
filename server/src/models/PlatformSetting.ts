import { Schema, model } from 'mongoose';

// Single-document settings store (Phase 3 — admin-toggleable kill switch
// for automatic parametric payouts, the "admin toggle" alternative
// explicitly allowed alongside the env-var kill switch in AUDIT_REPORT.md's
// Phase 1.4). _id is a fixed literal so there is always exactly one
// document — findOneAndUpdate with upsert is how every read/write touches
// it, never a bare .create().
export interface IPlatformSetting {
  _id: string;
  parametricPayoutsEnabled: boolean;
  updatedAt: Date;
}

export const PLATFORM_SETTING_ID = 'singleton';

const platformSettingSchema = new Schema<IPlatformSetting>(
  {
    _id: { type: String, required: true },
    parametricPayoutsEnabled: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

export const PlatformSetting = model<IPlatformSetting>('PlatformSetting', platformSettingSchema);
