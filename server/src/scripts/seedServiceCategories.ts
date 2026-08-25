import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { ServiceCategory } from '../models/ServiceCategory';

// SIH26089 Phase C — the PS names 10 household/community service
// categories explicitly, plus the platform's own 2 pre-existing generic
// ones (cargo logistics, general labour) kept as their own categories so
// "I just need a truck" / "I just need extra hands" still work without
// forcing a specific trade choice. `icon` values are icon COMPONENT NAMES
// from client/src/components/ui/icons.tsx (the client maps the string to
// the real component — see components/booking/CategoryPicker.tsx), not a
// URL or asset reference. `accentColor` reuses the existing 'primary'/
// 'secondary' design tokens, same two-hue system the rest of the app
// already uses, rather than inventing a wider palette for this one grid.
interface SeedCategory {
  name: string;
  slug: string;
  icon: string;
  accentColor: 'primary' | 'secondary';
  pricingUnit: 'per_hour' | 'per_job' | 'per_km' | 'per_worker';
  requiredSkills: string[];
  requiresVehicle: boolean;
  requiresMaterials: boolean;
  defaultDurationMinutes: number;
  minWorkers: number;
  dispatchType: 'truck' | 'hamali';
  guaranteeEligible?: boolean;
}

const CATEGORIES: SeedCategory[] = [
  {
    name: 'Cargo & Logistics',
    slug: 'general_logistics',
    icon: 'TruckIcon',
    accentColor: 'primary',
    pricingUnit: 'per_km',
    requiredSkills: [],
    requiresVehicle: true,
    requiresMaterials: false,
    defaultDurationMinutes: 60,
    minWorkers: 1,
    dispatchType: 'truck',
  },
  {
    name: 'General Labour',
    slug: 'general_labour',
    icon: 'BoxIcon',
    accentColor: 'secondary',
    pricingUnit: 'per_worker',
    requiredSkills: [],
    requiresVehicle: false,
    requiresMaterials: false,
    defaultDurationMinutes: 60,
    minWorkers: 1,
    dispatchType: 'hamali',
  },
  {
    name: 'Electrician',
    slug: 'electrician',
    icon: 'PowerIcon',
    accentColor: 'secondary',
    pricingUnit: 'per_hour',
    requiredSkills: ['electrical'],
    requiresVehicle: false,
    requiresMaterials: true,
    defaultDurationMinutes: 60,
    minWorkers: 1,
    dispatchType: 'hamali',
  },
  {
    name: 'Plumber',
    slug: 'plumber',
    icon: 'WrenchIcon',
    accentColor: 'secondary',
    pricingUnit: 'per_hour',
    requiredSkills: ['plumbing'],
    requiresVehicle: false,
    requiresMaterials: true,
    defaultDurationMinutes: 60,
    minWorkers: 1,
    dispatchType: 'hamali',
  },
  {
    name: 'Carpenter',
    slug: 'carpenter',
    icon: 'WrenchIcon',
    accentColor: 'secondary',
    pricingUnit: 'per_hour',
    requiredSkills: ['carpentry'],
    requiresVehicle: false,
    requiresMaterials: true,
    defaultDurationMinutes: 90,
    minWorkers: 1,
    dispatchType: 'hamali',
  },
  {
    name: 'Painter',
    slug: 'painter',
    icon: 'PaintBrushIcon',
    accentColor: 'secondary',
    pricingUnit: 'per_job',
    requiredSkills: ['painting'],
    requiresVehicle: false,
    requiresMaterials: true,
    defaultDurationMinutes: 240,
    minWorkers: 1,
    dispatchType: 'hamali',
  },
  {
    name: 'Domestic Help',
    slug: 'domestic_helper',
    icon: 'HomeIcon',
    accentColor: 'secondary',
    pricingUnit: 'per_hour',
    requiredSkills: ['domestic_help'],
    requiresVehicle: false,
    requiresMaterials: false,
    defaultDurationMinutes: 120,
    minWorkers: 1,
    dispatchType: 'hamali',
  },
  {
    name: 'Caregiver',
    slug: 'caregiver',
    icon: 'UsersIcon',
    accentColor: 'secondary',
    pricingUnit: 'per_hour',
    requiredSkills: ['caregiving'],
    requiresVehicle: false,
    requiresMaterials: false,
    defaultDurationMinutes: 240,
    minWorkers: 1,
    dispatchType: 'hamali',
  },
  {
    name: 'Driver',
    slug: 'driver',
    icon: 'TruckIcon',
    accentColor: 'primary',
    pricingUnit: 'per_km',
    requiredSkills: ['driving'],
    requiresVehicle: true,
    requiresMaterials: false,
    defaultDurationMinutes: 60,
    minWorkers: 1,
    dispatchType: 'truck',
  },
  {
    name: 'Gardener',
    slug: 'gardener',
    icon: 'LeafIcon',
    accentColor: 'secondary',
    pricingUnit: 'per_job',
    requiredSkills: ['gardening'],
    requiresVehicle: false,
    requiresMaterials: false,
    defaultDurationMinutes: 120,
    minWorkers: 1,
    dispatchType: 'hamali',
  },
  {
    name: 'Cleaner',
    slug: 'cleaner',
    icon: 'BroomIcon',
    accentColor: 'secondary',
    pricingUnit: 'per_job',
    requiredSkills: ['cleaning'],
    requiresVehicle: false,
    requiresMaterials: false,
    defaultDurationMinutes: 90,
    minWorkers: 1,
    dispatchType: 'hamali',
  },
  {
    name: 'Technician',
    slug: 'technician',
    icon: 'ShieldIcon',
    accentColor: 'secondary',
    pricingUnit: 'per_hour',
    requiredSkills: ['technician'],
    requiresVehicle: false,
    requiresMaterials: true,
    defaultDurationMinutes: 60,
    minWorkers: 1,
    dispatchType: 'hamali',
  },
];

async function seedServiceCategories() {
  await connectDb();
  try {
    for (const c of CATEGORIES) {
      const existing = await ServiceCategory.findOne({ slug: c.slug });
      if (existing) {
        // eslint-disable-next-line no-console
        console.log(`Skipping ${c.slug} — already seeded.`);
        continue;
      }
      await ServiceCategory.create(c);
      // eslint-disable-next-line no-console
      console.log(`Seeded service category: ${c.name}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

seedServiceCategories().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seedServiceCategories failed:', err);
  process.exit(1);
});
