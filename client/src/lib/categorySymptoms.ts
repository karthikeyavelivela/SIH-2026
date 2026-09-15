/**
 * What a customer is asked about, per trade.
 *
 * Until now one hardcoded list served every category, so a CAREGIVER
 * booking asked "Burning or gas smell?" and "Routine servicing?" — an
 * appliance-repair questionnaire in front of someone arranging care for a
 * bedridden parent. Found live on /customer/service/caregiver.
 *
 * The chips are authored per slug rather than derived from the category
 * record because nothing on ServiceCategory carries them, and because the
 * labels are translated copy, not data: they live in the message
 * catalogues under serviceDetail.symptoms.<slug>.<key>, in all three
 * languages, and what the customer picks is written into the booking's
 * real `description` field — the same field the worker reads before they
 * arrive.
 *
 * Slugs match scripts/seedServiceCategories.ts exactly. A category the
 * seeder adds later without an entry here falls back to a small generic
 * set rather than to a plumber's questions, and the parity test below
 * (categorySymptoms.test.ts) fails the build if a slug ever loses its set.
 */

export const CATEGORY_SYMPTOMS: Record<string, readonly string[]> = {
  electrician: ['no_power', 'tripping', 'switch_socket', 'fan_light', 'new_point', 'inverter'],
  plumber: ['tap_leak', 'drain_blocked', 'low_pressure', 'motor', 'fitting', 'pipe_burst'],
  carpenter: ['door_window', 'new_furniture', 'hinge_lock', 'wardrobe', 'polishing', 'modular_kitchen'],
  painter: ['interior', 'exterior', 'single_room', 'putty', 'damp', 'touch_up'],
  caregiver: ['elderly', 'post_surgery', 'bedridden', 'child_care', 'overnight', 'mobility'],
  domestic_helper: ['daily_meals', 'single_occasion', 'regional_cuisine', 'dietary', 'large_gathering', 'utensils_laundry'],
  cleaner: ['deep_clean', 'bathroom', 'kitchen', 'sofa_carpet', 'post_renovation', 'regular'],
  gardener: ['lawn', 'trimming', 'new_planting', 'watering', 'pests_weeds', 'terrace'],
  driver: ['local', 'outstation', 'airport', 'monthly', 'night', 'own_vehicle'],
  technician: ['ac', 'fridge', 'washing', 'tv', 'purifier', 'geyser'],
  general_labour: ['loading', 'shifting', 'clearing', 'digging', 'stairs', 'extra_hands'],
  general_logistics: ['household', 'shop_goods', 'construction', 'farm', 'single_item', 'return_load'],
};

/**
 * The fallback slug. `general_labour` rather than an invented "other" set:
 * an unknown category is far likelier to be some form of manual work than
 * to be an appliance, and every string it needs already exists.
 */
export const FALLBACK_SYMPTOM_SLUG = 'general_labour';

/** The slug whose chips, heading and placeholder to show for `slug`. */
export function symptomSlugFor(slug: string | undefined): string {
  return slug && CATEGORY_SYMPTOMS[slug] ? slug : FALLBACK_SYMPTOM_SLUG;
}
