'use client';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'te', label: 'తెలుగు' },
  { code: 'hi', label: 'हिंदी' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

interface LanguagePillProps {
  value: LanguageCode;
  onChange: (code: LanguageCode) => void;
  className?: string;
}

// Segmented pill selector — English / తెలుగు / हिंदी — appears on
// language_selection, profile_settings, and every onboarding flow.
export function LanguagePill({ value, onChange, className = '' }: LanguagePillProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Select language"
      className={`inline-flex p-1 rounded-ip-pill bg-ip-surface-container gap-1 ${className}`}
    >
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          type="button"
          role="radio"
          aria-checked={value === lang.code}
          onClick={() => onChange(lang.code)}
          className={`px-4 py-2 rounded-ip-pill text-sm font-semibold transition-colors ${
            value === lang.code
              ? 'bg-ip-primary text-ip-on-primary'
              : 'text-ip-on-surface-variant hover:bg-ip-surface-container-high'
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
