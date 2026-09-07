import type { Config } from 'tailwindcss';

/**
 * Every value here maps to a CSS variable defined in src/app/globals.css,
 * which is the single place raw hex lives. The values themselves were
 * sampled from the rendered design screenshots — see DESIGN_TOKENS.md for
 * the measurement method and per-value provenance.
 */
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        fy: {
          /* surfaces */
          bone: 'var(--fy-bone)',
          panel: 'var(--fy-panel)',
          field: 'var(--fy-field)',
          well: 'var(--fy-well)',
          edge: 'var(--fy-edge)',
          card: 'var(--fy-card)',
          dim: 'var(--fy-dim)',
          /* ink */
          ink: 'var(--fy-ink)',
          'ink-soft': 'var(--fy-ink-soft)',
          muted: 'var(--fy-muted)',
          hairline: 'var(--fy-hairline)',
          /* household — brown */
          brown: 'var(--fy-brown)',
          'brown-soft': 'var(--fy-brown-soft)',
          'on-brown': 'var(--fy-on-brown)',
          'on-brown-soft': 'var(--fy-on-brown-soft)',
          /* labour — green + lime */
          green: 'var(--fy-green)',
          lime: 'var(--fy-lime)',
          'lime-dim': 'var(--fy-lime-dim)',
          'on-green': 'var(--fy-on-green)',
          'on-lime': 'var(--fy-on-lime)',
          'lime-tint-1': 'var(--fy-lime-tint-1)',
          'lime-tint-2': 'var(--fy-lime-tint-2)',
          'lime-tint-3': 'var(--fy-lime-tint-3)',
          /* transit — slate */
          slate: 'var(--fy-slate)',
          'slate-soft': 'var(--fy-slate-soft)',
          'slate-pale': 'var(--fy-slate-pale)',
          'on-slate': 'var(--fy-on-slate)',
          'on-slate-soft': 'var(--fy-on-slate-soft)',
          /* status */
          error: 'var(--fy-error)',
          'error-bg': 'var(--fy-error-bg)',
          'on-error': 'var(--fy-on-error)',
          'on-error-bg': 'var(--fy-on-error-bg)',
          peach: 'var(--fy-peach)',
          inverse: 'var(--fy-inverse)',
          'on-inverse': 'var(--fy-on-inverse)',
        },
      },
      fontFamily: {
        heading: ['var(--fy-font-heading)'],
        body: ['var(--fy-font-body)'],
      },
      fontSize: {
        // [size, { lineHeight, letterSpacing, fontWeight }]. These are no
        // longer eyeballed off screen renders — every row below is copied
        // from the design export's own tailwind fontSize block, which the
        // full-resolution reference pages are generated from:
        //   display  = display-hero-mobile / headline-lg  44/44 -0.02  400
        //   heading  = headline-lg-mobile                 32/36 -0.015 400
        //   title    = headline-sm                        22/28 -0.01  500
        //   metric   = data-metric                        36/36 -0.02  400
        //   body-lg  = body-lg                            17/26 -0.01  400
        //   body     = body-default                       15/23  0     400
        //   label    = label-ui                           13/18  0.01  500
        //   eyebrow  = label-caps                         11/14  0.08  600
        display: ['var(--fy-text-display)', { lineHeight: '1', letterSpacing: '-0.02em', fontWeight: '400' }],
        heading: ['var(--fy-text-heading)', { lineHeight: '1.125', letterSpacing: '-0.015em', fontWeight: '400' }],
        title: ['var(--fy-text-title)', { lineHeight: '1.273', letterSpacing: '-0.01em', fontWeight: '500' }],
        metric: ['var(--fy-text-metric)', { lineHeight: '1', letterSpacing: '-0.02em', fontWeight: '400' }],
        'body-lg': ['var(--fy-text-body-lg)', { lineHeight: '1.53', letterSpacing: '-0.01em', fontWeight: '400' }],
        body: ['var(--fy-text-body)', { lineHeight: '1.533', fontWeight: '400' }],
        label: ['var(--fy-text-label)', { lineHeight: '1.385', letterSpacing: '0.01em', fontWeight: '500' }],
        eyebrow: ['var(--fy-text-eyebrow)', { lineHeight: '1.273', letterSpacing: '0.08em', fontWeight: '600' }],
      },
      borderRadius: {
        card: 'var(--fy-radius-card)',
        sheet: 'var(--fy-radius-sheet)',
        control: 'var(--fy-radius-control)',
        cell: 'var(--fy-radius-cell)',
        tag: 'var(--fy-radius-tag)',
      },
      spacing: {
        // Screen edge padding and grid gutter, measured off the mobile screens.
        gutter: '20px',
        'gutter-tight': '12px',
        18: '4.5rem',
      },
      boxShadow: {
        card: 'var(--fy-shadow-card)',
        float: 'var(--fy-shadow-float)',
      },
      transitionTimingFunction: {
        out: 'var(--fy-ease-out)',
        spring: 'var(--fy-ease-spring)',
      },
      transitionDuration: {
        fast: 'var(--fy-duration-fast)',
        base: 'var(--fy-duration-base)',
        slow: 'var(--fy-duration-slow)',
      },
    },
  },
  plugins: [],
};
export default config;
