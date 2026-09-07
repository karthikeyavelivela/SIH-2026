'use client';

const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'te', label: 'తెలుగు', short: 'తె' },
  { code: 'hi', label: 'हिंदी', short: 'हि' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

interface LanguagePillProps {
  value: LanguageCode;
  onChange: (code: LanguageCode) => void;
  /**
   * `compact` is the header form the designs use — short codes separated by
   * hairline slashes, sized to leave the 64px bar room for the wordmark.
   * The full form stays for language_selection and profile settings, where
   * the switcher is the point of the screen.
   */
  size?: 'default' | 'compact';
  className?: string;
}

// Segmented pill selector — English / తెలుగు / हिंदी — appears on
// language_selection, profile_settings, and every onboarding flow.
export function LanguagePill({ value, onChange, size = 'default', className = '' }: LanguagePillProps) {
  const compact = size === 'compact';
  return (
    <div
      role="radiogroup"
      aria-label="Select language"
      className={`inline-flex items-center rounded-full bg-fy-field ${
        compact ? 'h-9 px-2 gap-0.5' : 'p-1 gap-1'
      } ${className}`}
    >
      {LANGUAGES.map((lang, i) => (
        <span key={lang.code} className="inline-flex items-center">
          {compact && i > 0 && (
            <span aria-hidden className="font-body text-eyebrow text-fy-hairline px-0.5">
              /
            </span>
          )}
          <button
            type="button"
            role="radio"
            aria-checked={value === lang.code}
            aria-label={lang.label}
            onClick={() => onChange(lang.code)}
            className={
              compact
                ? `px-1 font-body text-eyebrow transition-colors ${
                    value === lang.code ? 'text-fy-brown font-semibold' : 'text-fy-muted hover:text-fy-ink'
                  }`
                : `px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                    value === lang.code ? 'bg-fy-brown text-fy-on-brown' : 'text-fy-ink-soft hover:bg-fy-well'
                  }`
            }
          >
            {compact ? lang.short : lang.label}
          </button>
        </span>
      ))}
    </div>
  );
}
