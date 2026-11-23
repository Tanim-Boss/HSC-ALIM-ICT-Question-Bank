import type { Config } from 'tailwindcss';

/**
 * ICT Atlas — Tailwind CSS configuration
 *
 * Design-system mapping: README.md §17.2 (color), §17.3 (typography) and
 * docs/design/tokens.json (machine-readable mirror, single source of truth).
 *
 * Theme strategy (locked): light is the default; dark applies via the `.dark`
 * class on the document root. One semantic token name serves both themes —
 * components never branch on raw hex values and never hardcode colours.
 *
 * RGB triplets live in app/globals.css (`:root` / `.dark`); utilities below
 * consume them through `rgb(var(--token) / <alpha-value>)` exactly as
 * documented in README §17.2. Do not add palette values here — extend the
 * authority (README §17) and its mirror (tokens.json) together instead.
 */
const withAlpha = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './server/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    // Approved responsive bands (README §17.4 / tokens.json#breakpoint).
    screens: {
      xs: '320px',
      sm: '375px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        // Primitives (README §17.2)
        canvas: withAlpha('--canvas'),
        surface: withAlpha('--surface'),
        elevated: withAlpha('--elevated'),
        ink: withAlpha('--ink'),
        muted: {
          DEFAULT: withAlpha('--muted'),
          strong: withAlpha('--muted-strong'),
        },
        border: withAlpha('--border'),
        teal: {
          DEFAULT: withAlpha('--teal'),
          tint: withAlpha('--teal-tint'),
        },
        accent: withAlpha('--accent'),
        amber: withAlpha('--amber'),
        red: withAlpha('--red'),
        // Code content uses the approved dark surface + light ink in both themes.
        'code-surface': withAlpha('--code-surface'),
        'code-ink': withAlpha('--code-ink'),
        // Semantic aliases (tokens.json → color.semantic, cssVariable extensions)
        'surface-hover': withAlpha('--surface-hover'),
        'surface-selected': withAlpha('--surface-selected'),
        'border-control': withAlpha('--border-control'),
        'border-selected': withAlpha('--border-selected'),
        focus: withAlpha('--focus'),
        'on-accent': withAlpha('--text-on-accent'),
        'action-primary': withAlpha('--action-primary-background'),
        'action-primary-foreground': withAlpha('--action-primary-foreground'),
        'action-destructive': withAlpha('--action-destructive-background'),
        'action-destructive-foreground': withAlpha('--action-destructive-foreground'),
        // State composites (tokens.json → color.semantic.*.state; foreground semantics)
        success: {
          DEFAULT: withAlpha('--state-success-foreground'),
          bg: withAlpha('--state-success-background'),
          body: withAlpha('--state-success-body'),
          border: withAlpha('--state-success-border'),
        },
        warning: {
          DEFAULT: withAlpha('--state-warning-foreground'),
          bg: withAlpha('--state-warning-background'),
          body: withAlpha('--state-warning-body'),
          border: withAlpha('--state-warning-border'),
        },
        error: {
          DEFAULT: withAlpha('--state-error-foreground'),
          bg: withAlpha('--state-error-background'),
          body: withAlpha('--state-error-body'),
          border: withAlpha('--state-error-border'),
        },
        information: {
          DEFAULT: withAlpha('--state-information-foreground'),
          bg: withAlpha('--state-information-background'),
          icon: withAlpha('--state-information-icon'),
          border: withAlpha('--state-information-border'),
        },
        'state-selected': {
          DEFAULT: withAlpha('--state-selected-foreground'),
          bg: withAlpha('--state-selected-background'),
          border: withAlpha('--state-selected-border'),
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'SolaimanLipi', 'Noto Sans Bengali', 'system-ui', 'sans-serif'],
        bn: ['var(--font-bengali)'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Type scale (tokens.json#typography/scale, 16 px root)
        display: [
          'clamp(40px, 6vw, 64px)',
          { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '450' },
        ],
        h1: ['40px', { lineHeight: '1.2', letterSpacing: '-0.03em', fontWeight: '550' }],
        h2: ['28px', { lineHeight: '1.25', letterSpacing: '-0.02em', fontWeight: '550' }],
        h3: ['20px', { lineHeight: '1.35', letterSpacing: '-0.02em', fontWeight: '550' }],
        h4: ['16px', { lineHeight: '1.4', fontWeight: '600' }],
        h5: ['14px', { lineHeight: '1.5', fontWeight: '600' }],
        h6: ['12px', { lineHeight: '1.5', fontWeight: '600' }],
        body: ['14px', { lineHeight: '1.5' }],
        reading: ['16px', { lineHeight: '1.6' }],
        small: ['12px', { lineHeight: '1.5' }],
        label: ['12px', { lineHeight: '1.4', fontWeight: '500' }],
        button: ['14px', { lineHeight: '1.4', fontWeight: '500' }],
        caption: ['12px', { lineHeight: '1.5' }],
        micro: ['11px', { lineHeight: '1.4', fontWeight: '500' }],
        code: ['13px', { lineHeight: '1.6' }],
      },
      fontWeight: {
        regular: '400',
        medium: '500',
        display: '450',
        heading: '550',
        strong: '600',
        'bengali-bold': '700',
      },
      borderRadius: {
        none: '0px',
        micro: '4px',
        control: '8px',
        card: '10px',
        'card-lg': '12px',
        dialog: '14px',
        section: '16px',
        'section-lg': '20px',
      },
      height: {
        // Control heights (tokens.json#geometry/controlHeight)
        'btn-sm': '36px',
        'btn-md': '38px',
        'btn-lg': '40px',
        'field-sm': '38px',
        'field-md': '40px',
        'field-lg': '42px',
        touch: '44px',
        topbar: '60px',
      },
      minHeight: {
        touch: '44px',
      },
      maxWidth: {
        public: '1200px',
        'app-shell': '1440px',
      },
      boxShadow: {
        // Reserved for popovers, dialogs and dragged objects (tokens.json#elevation).
        popover: 'var(--shadow-popover)',
        dialog: 'var(--shadow-dialog)',
        drag: 'var(--shadow-drag)',
      },
      transitionDuration: {
        120: '120ms',
        180: '180ms',
      },
    },
  },
  plugins: [],
};

export default config;
