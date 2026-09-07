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
  /**
   * The platform's commission, as a percentage of what a role earns on a
   * completed job. Read only through platformCommission.service.ts, which
   * clamps it and supplies the default when this has never been written.
   */
  platformCommissionPct?: number;
  updatedAt: Date;
}

export const PLATFORM_SETTING_ID = 'singleton';

const platformSettingSchema = new Schema<IPlatformSetting>(
  {
    _id: { type: String, required: true },
    parametricPayoutsEnabled: { type: Boolean, default: true },
    platformCommissionPct: { type: Number, min: 0, max: 100, default: 10 },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

export const PlatformSetting = model<IPlatformSetting>('PlatformSetting', platformSettingSchema);
