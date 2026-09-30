import type { KycDocumentType } from '@fyro/shared';

/**
 * Turns what OCR read from a KYC document into a recommendation for the
 * reviewer. Pure: text in, result out, so every rule is testable without an
 * OCR engine.
 *
 * It is a recommendation and nothing more. Only one finding ever stops an
 * upload, and it is a privacy one rather than a judgement about the person:
 * an Aadhaar number visible in full. Everything else goes to the admin, who
 * decides.
 *
 * What it keeps: a status per check and a confidence. What it never keeps or
 * returns: the text OCR read, a name, a date of birth, or any number found on
 * the document. Those stay on the image in private storage.
 */
export type PrecheckStatus = 'pass' | 'warn' | 'fail' | 'skipped';
export type PrecheckKey = 'legible' | 'unmasked_aadhaar' | 'id_pattern' | 'name_match' | 'dob_year';
export type PrecheckRecommendation = 'looks_ok' | 'needs_review' | 'unmasked_aadhaar';

export interface PrecheckCheck {
  key: PrecheckKey;
  status: PrecheckStatus;
  /** A short machine reason, never a value read from the document. */
  detail?: string;
}

export interface OcrPrecheck {
  recommendation: PrecheckRecommendation;
  checks: PrecheckCheck[];
  ocrConfidence: number;
  engine: 'tesseract.js';
  at: Date;
}

export interface PrecheckProfile {
  name: string;
  /** Year of birth, when the account has one. FYRO does not collect a date of birth today, so this is normally absent. */
  birthYear?: number;
}

const MIN_CONFIDENCE = 50;
const MIN_ALNUM_CHARS = 15;
const NAME_PASS = 0.6;
const WORD_SIMILARITY = 0.8;

// Twelve digits as Aadhaar prints them, in groups of four. The trailing guard
// rejects the first twelve digits of a sixteen-digit Virtual ID.
// The lookbehind also rejects the last twelve digits of a Virtual ID.
const UNMASKED_AADHAAR = /(?<!\d[\s-]?)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?![\s-]?\d)/;
const MASKED_AADHAAR = /(?:[Xx*•]{4}[\s-]?){2}\d{4}/;
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/;
const GSTIN = /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/;
const DRIVING_LICENCE = /\b[A-Z]{2}[-\s]?\d{2}[-\s]?(?:19|20)\d{2}[-\s]?\d{7}\b/;

export function hasUnmaskedAadhaar(text: string): boolean {
  return UNMASKED_AADHAAR.test(text);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array<number>(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[m][n];
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

/** The same word allowing for OCR slips: one wrong letter in a word of four or more, or 80% alike. */
function closeWord(a: string, b: string): boolean {
  if (Math.min(a.length, b.length) >= 4 && levenshtein(a, b) <= 1) return true;
  return similarity(a, b) >= WORD_SIMILARITY;
}

const latinWords = (s: string) => (s.toUpperCase().match(/[A-Z]{2,}/g) ?? []) as string[];

/** Share of the account holder's name words that appear (allowing for OCR slips) among the words on the document. */
export function nameMatchScore(profileName: string, ocrText: string): number | null {
  const wanted = latinWords(profileName);
  if (wanted.length === 0) return null; // a Telugu or Hindi-only name cannot be compared against Latin OCR
  const seen = latinWords(ocrText);
  const matched = wanted.filter((w) => seen.some((s) => closeWord(w, s))).length;
  return matched / wanted.length;
}

const ID_PATTERN: Partial<Record<KycDocumentType, RegExp>> = {
  pan: PAN,
  gstin: GSTIN,
  driving_licence: DRIVING_LICENCE,
};

export function analyzeOcrText(text: string, confidence: number, type: KycDocumentType, profile: PrecheckProfile): OcrPrecheck {
  const checks: PrecheckCheck[] = [];
  const clean = text.replace(/[^\p{L}\p{N}]/gu, '');

  const legible = confidence >= MIN_CONFIDENCE && clean.length >= MIN_ALNUM_CHARS;
  checks.push({ key: 'legible', status: legible ? 'pass' : 'warn', detail: legible ? undefined : 'low_legibility' });

  const unmasked = type === 'aadhaar' && hasUnmaskedAadhaar(text);
  if (type === 'aadhaar') {
    checks.push({ key: 'unmasked_aadhaar', status: unmasked ? 'fail' : 'pass', detail: unmasked ? 'full_number_visible' : undefined });
  }

  if (type === 'aadhaar') {
    const masked = MASKED_AADHAAR.test(text);
    checks.push({ key: 'id_pattern', status: masked ? 'pass' : unmasked ? 'skipped' : 'warn', detail: masked ? 'masked_number_found' : unmasked ? undefined : 'masked_number_not_found' });
  } else if (ID_PATTERN[type]) {
    const ok = ID_PATTERN[type]!.test(text.toUpperCase());
    checks.push({ key: 'id_pattern', status: ok ? 'pass' : 'warn', detail: ok ? 'pattern_found' : 'pattern_not_found' });
  } else {
    checks.push({ key: 'id_pattern', status: 'skipped' });
  }

  const score = nameMatchScore(profile.name, text);
  if (score === null) checks.push({ key: 'name_match', status: 'skipped', detail: 'name_not_latin' });
  else checks.push({ key: 'name_match', status: score >= NAME_PASS ? 'pass' : 'warn', detail: score >= NAME_PASS ? undefined : 'name_not_found' });

  const years = [...text.matchAll(/\b(19[4-9]\d|20[0-2]\d)\b/g)].map((m) => Number(m[1]));
  if (!['aadhaar', 'pan', 'driving_licence'].includes(type)) checks.push({ key: 'dob_year', status: 'skipped' });
  else if (profile.birthYear == null) checks.push({ key: 'dob_year', status: 'skipped', detail: years.length ? 'year_found_no_profile_year' : 'no_year_found' });
  else checks.push({ key: 'dob_year', status: years.includes(profile.birthYear) ? 'pass' : 'warn', detail: years.includes(profile.birthYear) ? undefined : 'year_mismatch' });

  const recommendation: PrecheckRecommendation = unmasked
    ? 'unmasked_aadhaar'
    : checks.some((c) => c.status === 'fail' || c.status === 'warn')
      ? 'needs_review'
      : 'looks_ok';

  return { recommendation, checks, ocrConfidence: Math.round(confidence), engine: 'tesseract.js', at: new Date() };
}
