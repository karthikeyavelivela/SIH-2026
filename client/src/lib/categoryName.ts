'use client';

import { useTranslations } from 'next-intl';

/**
 * The translated name of a service category.
 *
 * ServiceCategory.name is stored in English in the database, because it is
 * one row per trade seeded once — there is no per-locale column and adding
 * one would mean an admin re-entering twelve names in three languages. The
 * app already carries all twelve, in all three languages, as UI strings.
 *
 * So the name a person sees comes from the translation keyed by SLUG, and
 * the database name is the fallback for a category that is seeded later and
 * has no translation yet. That fallback showing English is a visible,
 * fixable gap; a missing name would not be.
 *
 * This existed as a bug worth naming: on a fully Telugu customer dashboard,
 * every service tile still read "Caregiver", "Plumber", "Electrician" —
 * the most prominent untranslated text on the app's main screen.
 */
export function useCategoryName() {
  const t = useTranslations('marketing.home.categories');

  return (category: { slug: string; name: string }): string => {
    try {
      const translated = t(category.slug as never);
      // next-intl returns the key path itself when a key is missing.
      return translated.includes(category.slug) ? category.name : translated;
    } catch {
      return category.name;
    }
  };
}
