import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        'surface-raised': 'var(--color-surface-raised)',
        primary: {
          DEFAULT: 'var(--color-primary)',
          600: 'var(--color-primary-600)',
        },
        secondary: {
          DEFAULT: 'var(--color-secondary)',
          600: 'var(--color-secondary-600)',
        },
        'text-primary': 'var(--color-text-primary)',
        'text-muted': 'var(--color-text-muted)',
        border: 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',

        /* v3 "Cooperative Ledger" palette — the six raw hues, straight from
           DESIGN.md. Prefer these (or the `accent-*` semantic aliases right
           below) in all new v3-native components; `ip-*` further down stays
           as a compatibility alias for pre-existing files. */
        fyro: {
          bone: 'var(--fyro-bone)',
          ink: 'var(--fyro-ink)',
          brown: 'var(--fyro-brown)',
          lime: 'var(--fyro-lime)',
          slate: 'var(--fyro-slate)',
          muted: 'var(--fyro-muted)',
        },
        /* Semantic domain accents — one meaning each. Never pick a raw
           fyro-* hue for a new component when a domain applies; use these
           instead so a future re-tint only touches globals.css. */
        accent: {
          household: 'var(--accent-household)',
          labour: 'var(--accent-labour)',
          transport: 'var(--accent-transport)',
          worker: 'var(--accent-worker)',
          console: 'var(--accent-console)',
        },

        /* "Ink on Warm Paper" tokens — new screens only, see globals.css */
        ip: {
          surface: 'var(--ip-surface)',
          'surface-dim': 'var(--ip-surface-dim)',
          'surface-bright': 'var(--ip-surface-bright)',
          'container-lowest': 'var(--ip-surface-container-lowest)',
          'container-low': 'var(--ip-surface-container-low)',
          container: 'var(--ip-surface-container)',
          'container-high': 'var(--ip-surface-container-high)',
          'container-highest': 'var(--ip-surface-container-highest)',
          'on-surface': 'var(--ip-on-surface)',
          'on-surface-variant': 'var(--ip-on-surface-variant)',
          'inverse-surface': 'var(--ip-inverse-surface)',
          'inverse-on-surface': 'var(--ip-inverse-on-surface)',
          outline: 'var(--ip-outline)',
          'outline-variant': 'var(--ip-outline-variant)',
          primary: 'var(--ip-primary)',
          'primary-container': 'var(--ip-primary-container)',
          'on-primary': 'var(--ip-on-primary)',
          'on-primary-container': 'var(--ip-on-primary-container)',
          secondary: 'var(--ip-secondary)',
          'secondary-container': 'var(--ip-secondary-container)',
          'on-secondary': 'var(--ip-on-secondary)',
          'on-secondary-container': 'var(--ip-on-secondary-container)',
          tertiary: 'var(--ip-tertiary)',
          'tertiary-container': 'var(--ip-tertiary-container)',
          'on-tertiary': 'var(--ip-on-tertiary)',
          'on-tertiary-container': 'var(--ip-on-tertiary-container)',
          error: 'var(--ip-error)',
          'error-container': 'var(--ip-error-container)',
          'on-error': 'var(--ip-on-error)',
          'on-error-container': 'var(--ip-on-error-container)',
        },
      },
      fontFamily: {
        // Locale-aware (see globals.css's html[lang] overrides) — one token,
        // three scripts. 'accent' is Fraunces italic (add `italic` too).
        heading: ['var(--font-heading)'],
        body: ['var(--font-body)'],
        accent: ['var(--font-fraunces)'],
      },
      fontSize: {
        xs: 'var(--text-xs)',
        sm: 'var(--text-sm)',
        base: 'var(--text-base)',
        lg: 'var(--text-lg)',
        xl: 'var(--text-xl)',
        '2xl': 'var(--text-2xl)',
        hero: 'var(--text-hero)',

        'ip-display-lg': 'var(--ip-text-display-lg)',
        'ip-display-md': 'var(--ip-text-display-md)',
        'ip-headline-sm': 'var(--ip-text-headline-sm)',
        'ip-body-lg': 'var(--ip-text-body-lg)',
        'ip-body-md': 'var(--ip-text-body-md)',
        'ip-body-sm': 'var(--ip-text-body-sm)',
        'ip-data-mono': 'var(--ip-text-data-mono)',

        // v3 type scale — straight from DESIGN.md's `typography` block.
        // display-hero/headline-* are Fraunces (font-heading); data-metric
        // is the huge Fraunces number used by MetricTile; label-caps/
        // label-ui/body-* are Inter (font-body).
        'display-hero': ['4.5rem', { lineHeight: '4.25rem', letterSpacing: '-0.03em', fontWeight: '400' }],
        'display-hero-mobile': ['2.75rem', { lineHeight: '2.75rem', letterSpacing: '-0.02em', fontWeight: '400' }],
        'headline-lg': ['2.75rem', { lineHeight: '3rem', letterSpacing: '-0.02em', fontWeight: '400' }],
        'headline-lg-mobile': ['2rem', { lineHeight: '2.25rem', letterSpacing: '-0.015em', fontWeight: '400' }],
        'headline-md': ['2rem', { lineHeight: '2.375rem', letterSpacing: '-0.015em', fontWeight: '500' }],
        'headline-sm': ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em', fontWeight: '500' }],
        'body-lg': ['1.0625rem', { lineHeight: '1.625rem', letterSpacing: '-0.01em', fontWeight: '400' }],
        'body-default': ['0.9375rem', { lineHeight: '1.4375rem', letterSpacing: '0em', fontWeight: '400' }],
        'body-strong': ['0.9375rem', { lineHeight: '1.4375rem', letterSpacing: '0em', fontWeight: '600' }],
        'label-caps': ['0.6875rem', { lineHeight: '0.875rem', letterSpacing: '0.08em', fontWeight: '600' }],
        'label-ui': ['0.8125rem', { lineHeight: '1.125rem', letterSpacing: '0.01em', fontWeight: '500' }],
        'data-metric': ['2.25rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em', fontWeight: '400' }],
      },
      spacing: {
        18: '4.5rem',
        'ip-base': 'var(--ip-space-base)',
        'ip-xs': 'var(--ip-space-xs)',
        'ip-sm': 'var(--ip-space-sm)',
        'ip-md': 'var(--ip-space-md)',
        'ip-lg': 'var(--ip-space-lg)',
        'ip-xl': 'var(--ip-space-xl)',
        'ip-edge': 'var(--ip-edge-margin)',
        'ip-gutter': 'var(--ip-gutter)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        'ip-input': 'var(--ip-radius-input)',
        'ip-card': 'var(--ip-radius-card)',
        'ip-sheet': 'var(--ip-radius-sheet)',
        'ip-pill': 'var(--ip-radius-pill)',

        // v3 shape system — card 24px, control 12px, chip fully round.
        card: 'var(--radius-card)',
        control: 'var(--radius-control)',
        chip: 'var(--radius-chip)',
        cell: 'var(--radius-cell)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        'glow-primary': 'var(--shadow-glow-primary)',
        'glow-secondary': 'var(--shadow-glow-secondary)',
      },
      transitionTimingFunction: {
        'out-expo': 'var(--ease-out-expo)',
        spring: 'var(--ease-spring)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
        slow: 'var(--duration-slow)',
      },
    },
  },
  plugins: [],
};
export default config;
