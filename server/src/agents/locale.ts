export type AgentLocale = 'en' | 'te' | 'hi';

const LOCALE_LANGUAGE_NAME: Record<AgentLocale, string> = {
  en: 'English',
  te: 'Telugu (తెలుగు)',
  hi: 'Hindi (हिंदी)',
};

/**
 * Appended to every agent's system prompt when the caller's
 * preferredLocale isn't English — Phase 1 of the post-V2 remediation.
 * English needs no instruction (it's every agent's default framing
 * already). Explicit about script (not transliterated Latin-script
 * "Telugu-in-English-letters") and register (plain, not literary) since
 * these responses are read by the same blue-collar-worker audience the
 * rest of this app's design language targets.
 */
export function localeInstruction(locale: AgentLocale): string {
  if (locale === 'en') return '';
  return `\n\nIMPORTANT: Respond in ${LOCALE_LANGUAGE_NAME[locale]}, written in its own native script (not transliterated into Latin/English letters). Use simple, everyday language — the reader may not be highly literate. Keep any JSON field NAMES in English (e.g. "summary", "confidence", "evidence", "label", "value") exactly as instructed elsewhere in this prompt — only the VALUES (the actual sentences/words) should be in ${LOCALE_LANGUAGE_NAME[locale]}.`;
}

/** Same instruction, worded for the metadata-only/no-image mock fallback strings this module's own callers generate locally (not sent to the model) — used to translate synthetic fallback text is out of scope here; this export exists so callers can decide per-locale copy for their OWN fallback strings if they choose to. */
export function isNonEnglish(locale: AgentLocale | undefined): locale is Exclude<AgentLocale, 'en'> {
  return locale === 'te' || locale === 'hi';
}
