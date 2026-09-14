import type { UnitType } from '@fyro/shared';

/**
 * Common jobs per trade, for a worker to enable and price.
 *
 * A worker who has never used a pricing tool should not face an empty box and
 * the question "what do you charge for?". These are the jobs their trade
 * actually gets called for, with the price band real workers in Andhra
 * Pradesh charge, so the worker's job is to confirm or change a number rather
 * than invent one.
 *
 * The bands are research, not invention, and they are shown as guidance to
 * the WORKER only — never to a customer as if they were a live market rate.
 * A customer only ever sees a rate some specific worker actually published.
 *
 * Each task carries a stable `slug`. The worker's stored task keeps that slug
 * when they picked it from this list, which is what lets a Telugu carpenter's
 * task list read correctly to a Hindi customer; a task a worker typed
 * themselves has no slug and is shown in their own words, which is the honest
 * fallback.
 */

export interface CatalogueTask {
  slug: string;
  /** What real workers charge, for the publishing worker's guidance only. */
  typicalMin: number;
  typicalMax: number;
  estimatedDurationMinutes: number;
}

export interface CatalogueUnit {
  unitType: UnitType;
  typicalMin: number;
  typicalMax: number;
}

export interface CategoryPricingGuide {
  /** The modes that make sense for this trade, in the order to offer them. */
  suggestedModes: ('hourly' | 'per_unit' | 'per_task' | 'quotation')[];
  units: CatalogueUnit[];
  tasks: CatalogueTask[];
}

export const PRICING_GUIDE: Record<string, CategoryPricingGuide> = {
  carpenter: {
    suggestedModes: ['per_unit', 'per_task', 'quotation'],
    units: [
      { unitType: 'sq_ft_face', typicalMin: 120, typicalMax: 250 },
      { unitType: 'sq_ft_developed', typicalMin: 90, typicalMax: 180 },
      { unitType: 'per_running_ft', typicalMin: 150, typicalMax: 400 },
    ],
    tasks: [
      { slug: 'door_hinge', typicalMin: 200, typicalMax: 500, estimatedDurationMinutes: 45 },
      { slug: 'door_lock_fit', typicalMin: 250, typicalMax: 600, estimatedDurationMinutes: 60 },
      { slug: 'drawer_repair', typicalMin: 200, typicalMax: 500, estimatedDurationMinutes: 45 },
      { slug: 'shelf_fitting', typicalMin: 300, typicalMax: 800, estimatedDurationMinutes: 90 },
      { slug: 'furniture_assembly', typicalMin: 400, typicalMax: 1200, estimatedDurationMinutes: 120 },
    ],
  },
  electrician: {
    suggestedModes: ['per_unit', 'per_task', 'quotation'],
    units: [
      { unitType: 'per_point', typicalMin: 25, typicalMax: 60 },
      { unitType: 'sq_ft_face', typicalMin: 20, typicalMax: 50 },
    ],
    tasks: [
      { slug: 'fan_installation', typicalMin: 200, typicalMax: 500, estimatedDurationMinutes: 45 },
      { slug: 'switchboard_repair', typicalMin: 150, typicalMax: 400, estimatedDurationMinutes: 40 },
      { slug: 'light_fitting', typicalMin: 100, typicalMax: 300, estimatedDurationMinutes: 30 },
      { slug: 'mcb_replacement', typicalMin: 200, typicalMax: 600, estimatedDurationMinutes: 45 },
      { slug: 'inverter_service', typicalMin: 300, typicalMax: 900, estimatedDurationMinutes: 60 },
    ],
  },
  plumber: {
    suggestedModes: ['per_task', 'per_unit', 'quotation'],
    units: [{ unitType: 'per_point', typicalMin: 150, typicalMax: 400 }],
    tasks: [
      { slug: 'tap_repair', typicalMin: 150, typicalMax: 400, estimatedDurationMinutes: 30 },
      { slug: 'leak_fix', typicalMin: 200, typicalMax: 600, estimatedDurationMinutes: 60 },
      { slug: 'drain_unblock', typicalMin: 300, typicalMax: 800, estimatedDurationMinutes: 60 },
      { slug: 'bathroom_fitting', typicalMin: 800, typicalMax: 2500, estimatedDurationMinutes: 180 },
      { slug: 'motor_service', typicalMin: 400, typicalMax: 1200, estimatedDurationMinutes: 90 },
    ],
  },
  painter: {
    suggestedModes: ['per_unit', 'quotation', 'per_task'],
    units: [{ unitType: 'sq_ft_face', typicalMin: 8, typicalMax: 30 }],
    tasks: [
      { slug: 'single_room_paint', typicalMin: 2000, typicalMax: 6000, estimatedDurationMinutes: 480 },
      { slug: 'touch_up', typicalMin: 500, typicalMax: 1500, estimatedDurationMinutes: 120 },
    ],
  },
  technician: {
    suggestedModes: ['per_task', 'hourly', 'quotation'],
    units: [{ unitType: 'per_item', typicalMin: 300, typicalMax: 900 }],
    tasks: [
      { slug: 'ac_service', typicalMin: 400, typicalMax: 900, estimatedDurationMinutes: 60 },
      { slug: 'fridge_repair', typicalMin: 400, typicalMax: 1500, estimatedDurationMinutes: 90 },
      { slug: 'washing_machine_repair', typicalMin: 400, typicalMax: 1500, estimatedDurationMinutes: 90 },
      { slug: 'geyser_repair', typicalMin: 300, typicalMax: 1000, estimatedDurationMinutes: 60 },
      { slug: 'ro_service', typicalMin: 300, typicalMax: 800, estimatedDurationMinutes: 45 },
    ],
  },
  cleaner: {
    suggestedModes: ['hourly', 'per_task'],
    units: [{ unitType: 'sq_ft_face', typicalMin: 2, typicalMax: 8 }],
    tasks: [
      { slug: 'deep_clean_bathroom', typicalMin: 400, typicalMax: 1000, estimatedDurationMinutes: 90 },
      { slug: 'kitchen_clean', typicalMin: 500, typicalMax: 1200, estimatedDurationMinutes: 120 },
      { slug: 'sofa_clean', typicalMin: 600, typicalMax: 1500, estimatedDurationMinutes: 90 },
      { slug: 'water_tank_clean', typicalMin: 800, typicalMax: 2000, estimatedDurationMinutes: 120 },
    ],
  },
  domestic_helper: {
    suggestedModes: ['hourly'],
    units: [],
    tasks: [
      { slug: 'cooking_one_meal', typicalMin: 150, typicalMax: 400, estimatedDurationMinutes: 60 },
      { slug: 'utensils_and_laundry', typicalMin: 150, typicalMax: 400, estimatedDurationMinutes: 60 },
    ],
  },
  caregiver: {
    suggestedModes: ['hourly'],
    units: [],
    tasks: [{ slug: 'day_attendant', typicalMin: 800, typicalMax: 2000, estimatedDurationMinutes: 480 }],
  },
  gardener: {
    suggestedModes: ['hourly', 'per_task'],
    units: [{ unitType: 'sq_ft_face', typicalMin: 2, typicalMax: 6 }],
    tasks: [
      { slug: 'lawn_mowing', typicalMin: 300, typicalMax: 900, estimatedDurationMinutes: 90 },
      { slug: 'tree_pruning', typicalMin: 500, typicalMax: 2000, estimatedDurationMinutes: 120 },
    ],
  },
  driver: {
    suggestedModes: ['hourly'],
    units: [],
    tasks: [{ slug: 'outstation_day', typicalMin: 800, typicalMax: 1800, estimatedDurationMinutes: 480 }],
  },
  general_labour: {
    suggestedModes: ['hourly'],
    units: [{ unitType: 'per_item', typicalMin: 20, typicalMax: 80 }],
    tasks: [{ slug: 'loading_unloading', typicalMin: 300, typicalMax: 800, estimatedDurationMinutes: 120 }],
  },
  general_logistics: {
    // Transport keeps its distance-based fare rules. Listed so the guide has
    // an answer for every category rather than a hole.
    suggestedModes: ['quotation'],
    units: [],
    tasks: [],
  },
};

export function guideFor(categorySlug: string): CategoryPricingGuide {
  return PRICING_GUIDE[categorySlug] ?? { suggestedModes: ['hourly', 'per_task', 'quotation'], units: [], tasks: [] };
}
