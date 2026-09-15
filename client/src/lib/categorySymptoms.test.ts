import { describe, it, expect } from 'vitest';
import en from '@/i18n/messages/en.json';
import te from '@/i18n/messages/te.json';
import hi from '@/i18n/messages/hi.json';
import { CATEGORY_SYMPTOMS, FALLBACK_SYMPTOM_SLUG, symptomSlugFor } from './categorySymptoms';

/**
 * The defect this guards against was live in production: every category's
 * booking screen showed the same appliance-repair symptom chips, so a
 * caregiver booking asked about a burning smell. These tests fail if a
 * category ever loses its own set, or if a chip is added in English and
 * left untranslated — which would silently show an English string to a
 * Telugu customer rather than erroring.
 */

/** Exactly the slugs in server/src/scripts/seedServiceCategories.ts. */
const SEEDED_SLUGS = [
  'general_logistics',
  'general_labour',
  'electrician',
  'plumber',
  'carpenter',
  'painter',
  'domestic_helper',
  'caregiver',
  'driver',
  'gardener',
  'cleaner',
  'technician',
];

const CATALOGUES = { en, te, hi } as Record<string, { serviceDetail: Record<string, Record<string, unknown>> }>;

describe('per-category symptoms', () => {
  it('covers every seeded service category and nothing else', () => {
    expect(Object.keys(CATEGORY_SYMPTOMS).sort()).toEqual([...SEEDED_SLUGS].sort());
  });

  it('gives no two categories the same set of chips', () => {
    const seen = new Map<string, string>();
    for (const [slug, keys] of Object.entries(CATEGORY_SYMPTOMS)) {
      const fingerprint = [...keys].sort().join('|');
      expect(seen.get(fingerprint), `${slug} shares its chips with ${seen.get(fingerprint)}`).toBeUndefined();
      seen.set(fingerprint, slug);
    }
  });

  for (const locale of Object.keys(CATALOGUES)) {
    it(`has a ${locale} label for every chip, heading and placeholder`, () => {
      const sd = CATALOGUES[locale].serviceDetail;
      for (const [slug, keys] of Object.entries(CATEGORY_SYMPTOMS)) {
        expect(sd.symptomHeading[slug], `${locale} symptomHeading.${slug}`).toBeTruthy();
        expect(sd.notePlaceholder[slug], `${locale} notePlaceholder.${slug}`).toBeTruthy();
        const set = sd.symptoms[slug] as Record<string, string>;
        expect(set, `${locale} symptoms.${slug}`).toBeTruthy();
        for (const key of keys) {
          expect(set[key], `${locale} symptoms.${slug}.${key}`).toBeTruthy();
        }
      }
    });

    it(`translates ${locale} chips rather than copying the English`, () => {
      if (locale === 'en') return;
      const enSd = CATALOGUES.en.serviceDetail;
      const sd = CATALOGUES[locale].serviceDetail;
      for (const [slug, keys] of Object.entries(CATEGORY_SYMPTOMS)) {
        for (const key of keys) {
          const source = (enSd.symptoms[slug] as Record<string, string>)[key];
          const target = (sd.symptoms[slug] as Record<string, string>)[key];
          expect(target, `${locale} symptoms.${slug}.${key} is still the English string`).not.toBe(source);
        }
      }
    });
  }

  it('falls back rather than showing another trade’s questions', () => {
    expect(symptomSlugFor(undefined)).toBe(FALLBACK_SYMPTOM_SLUG);
    expect(symptomSlugFor('a_category_that_does_not_exist')).toBe(FALLBACK_SYMPTOM_SLUG);
    expect(symptomSlugFor('caregiver')).toBe('caregiver');
  });
});
