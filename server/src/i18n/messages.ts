import type { AppLocale } from '@fyro/shared';

// Phase 2 (server-side i18n). This is deliberately NOT a full translation
// of every English string in the codebase — that would mean touching
// hundreds of ApiError call sites and express-validator .withMessage()
// chains scattered across ~50 route/controller files. Instead this covers
// the highest-leverage chokepoints that give real coverage for the least
// risk:
//   - the central error handler (app.ts) — translates the small set of
//     MOST COMMON literal ApiError messages (auth, not-found, forbidden,
//     validation) via exact-string lookup below
//   - middleware/validate.ts — the one generic "Validation failed" wrapper
//     that fires on every single express-validator failure across the app
//   - kyc.service.ts's kycGateMessage() — the deterministic gate-blocked
//     message shown to a worker (not an admin's free-text KYC rejection
//     reason, which is arbitrary human-authored text and can't be
//     pre-translated by a catalog)
// Any ApiError message NOT in this table falls back to its original
// English text — never a missing/blank message, just untranslated. That
// long tail is an honest, documented scope limit, not a bug.

type Catalog = Record<string, Record<AppLocale, string>>;

export const SERVER_MESSAGES: Catalog = {
  'Validation failed': {
    en: 'Validation failed',
    te: 'ధృవీకరణ విఫలమైంది',
    hi: 'सत्यापन विफल रहा',
  },
  'Not authenticated': {
    en: 'Not authenticated',
    te: 'మీరు లాగిన్ కాలేదు',
    hi: 'आप लॉग इन नहीं हैं',
  },
  'Invalid or expired token': {
    en: 'Invalid or expired token',
    te: 'సెషన్ ముగిసింది, దయచేసి మళ్ళీ లాగిన్ అవ్వండి',
    hi: 'सत्र समाप्त हो गया, कृपया फिर से लॉगिन करें',
  },
  'Invalid credentials': {
    en: 'Invalid credentials',
    te: 'ఫోన్ నంబర్ లేదా పాస్‌వర్డ్ తప్పు',
    hi: 'फ़ोन नंबर या पासवर्ड ग़लत है',
  },
  Forbidden: {
    en: 'Forbidden',
    te: 'మీకు ఈ చర్యకు అనుమతి లేదు',
    hi: 'आपको यह कार्रवाई करने की अनुमति नहीं है',
  },
  'No refresh token': {
    en: 'No refresh token',
    te: 'సెషన్ ముగిసింది, దయచేసి మళ్ళీ లాగిన్ అవ్వండి',
    hi: 'सत्र समाप्त हो गया, कृपया फिर से लॉगिन करें',
  },
  'Invalid or expired refresh token': {
    en: 'Invalid or expired refresh token',
    te: 'సెషన్ ముగిసింది, దయచేసి మళ్ళీ లాగిన్ అవ్వండి',
    hi: 'सत्र समाप्त हो गया, कृपया फिर से लॉगिन करें',
  },
  'Refresh token no longer valid': {
    en: 'Refresh token no longer valid',
    te: 'సెషన్ ముగిసింది, దయచేసి మళ్ళీ లాగిన్ అవ్వండి',
    hi: 'सत्र समाप्त हो गया, कृपया फिर से लॉगिन करें',
  },
  'Phone already registered': {
    en: 'Phone already registered',
    te: 'ఈ ఫోన్ నంబర్ ఇప్పటికే నమోదైంది',
    hi: 'यह फ़ोन नंबर पहले से पंजीकृत है',
  },
  'User not found': {
    en: 'User not found',
    te: 'యూజర్ కనబడలేదు',
    hi: 'उपयोगकर्ता नहीं मिला',
  },
  'Incorrect code': {
    en: 'Incorrect code',
    te: 'OTP తప్పు',
    hi: 'ओटीपी ग़लत है',
  },
  'This OTP has expired — request a new one': {
    en: 'This OTP has expired — request a new one',
    te: 'ఈ OTP గడువు ముగిసింది — కొత్తది కోరండి',
    hi: 'यह ओटीपी समाप्त हो गया है — नया मंगवाएँ',
  },
  'Too many incorrect attempts — request a new OTP': {
    en: 'Too many incorrect attempts — request a new OTP',
    te: 'చాలాసార్లు తప్పు OTP ఇచ్చారు — కొత్తది కోరండి',
    hi: 'बहुत बार ग़लत ओटीपी डाला — नया मंगवाएँ',
  },
  'Current password is incorrect': {
    en: 'Current password is incorrect',
    te: 'ప్రస్తుత పాస్‌వర్డ్ తప్పు',
    hi: 'मौजूदा पासवर्ड ग़लत है',
  },
  'Internal server error': {
    en: 'Internal server error',
    te: 'సర్వర్‌లో సమస్య వచ్చింది, దయచేసి కొద్దిసేపటి తర్వాత ప్రయత్నించండి',
    hi: 'सर्वर में समस्या आई है, कृपया कुछ देर बाद कोशिश करें',
  },
};

/** Exact-string lookup with an untranslated-English fallback — see module doc comment above. */
export function t(message: string, locale: AppLocale): string {
  if (locale === 'en') return message;
  return SERVER_MESSAGES[message]?.[locale] ?? message;
}
