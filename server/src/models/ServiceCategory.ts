import { Schema, model, Types } from 'mongoose';

export type PricingUnit = 'per_hour' | 'per_job' | 'per_km' | 'per_worker';

// SIH26089 Phase C — the PS names 10 household/community service
// categories explicitly (electricians, plumbers, carpenters, painters,
// domestic helpers, caregivers, drivers, gardeners, cleaners, technicians)
// and this codebase had exactly ONE hardcoded 3-value enum
// (Booking.type: 'truck'|'hamali'|'combo') standing in for all of them —
// no first-class category model existed at all. This is that model.
//
// Deliberately layered ON TOP of the existing truck/hamali dispatch
// mechanism rather than replacing it — matching.service.ts, fare.service.ts,
// the sequential-offer engine, and every offer/request card already work
// on vehicle-capacity/hamali-count terms, not on what's being booked, so
// they're genuinely category-agnostic already (verified by this phase's
// own test suite: booking.controller.ts now threads serviceCategorySlug
// through unchanged, dispatch/fare logic never even reads it). Every
// service category maps to ONE of the two existing dispatch shapes:
// requiresVehicle:true rides the truck/driver path (drivers are on the
// PS's own list); every non-vehicle household trade (electrician, plumber,
// carpenter, painter, domestic help, caregiving, gardening, cleaning,
// general technician work) rides the hamali/skilled-labour dispatch path —
// "N workers, address-based, no vehicle, per-job" is exactly the shape a
// household service booking needs, it was just staffed and named for cargo
// loading crews until now.
export interface IServiceCategory {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  icon: string;
  accentColor: string;
  pricingUnit: PricingUnit;
  requiredSkills: string[];
  requiresVehicle: boolean;
  requiresMaterials: boolean;
  defaultDurationMinutes: number;
  minWorkers: number;
  // Which of the two existing dispatch mechanisms this category actually
  // rides — never exposed as a customer choice, derived server-side from
  // the category itself (booking.controller.ts's createBooking resolves
  // this from serviceCategorySlug, same "server decides, never trusts a
  // client-supplied type for a category" discipline as everywhere else in
  // this codebase).
  dispatchType: 'truck' | 'hamali';
  active: boolean;
  createdAt: Date;
}

const serviceCategorySchema = new Schema<IServiceCategory>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    icon: { type: String, required: true },
    accentColor: { type: String, required: true },
    pricingUnit: { type: String, enum: ['per_hour', 'per_job', 'per_km', 'per_worker'], required: true },
    requiredSkills: { type: [String], default: [] },
    requiresVehicle: { type: Boolean, default: false },
    requiresMaterials: { type: Boolean, default: false },
    defaultDurationMinutes: { type: Number, required: true, min: 15 },
    minWorkers: { type: Number, default: 1, min: 1 },
    dispatchType: { type: String, enum: ['truck', 'hamali'], required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

serviceCategorySchema.index({ active: 1 });

export const ServiceCategory = model<IServiceCategory>('ServiceCategory', serviceCategorySchema);
