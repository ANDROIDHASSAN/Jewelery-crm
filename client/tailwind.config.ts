import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      colors: {
        brand: {
          50: 'var(--brand-50)',
          100: 'var(--brand-100)',
          200: 'var(--brand-200)',
          300: 'var(--brand-300)',
          400: 'var(--brand-400)',
          500: 'var(--brand-500)',
          600: 'var(--brand-600)',
          700: 'var(--brand-700)',
          800: 'var(--brand-800)',
          900: 'var(--brand-900)',
        },
        ink: {
          0: 'var(--ink-0)',
          25: 'var(--ink-25)',
          50: 'var(--ink-50)',
          100: 'var(--ink-100)',
          200: 'var(--ink-200)',
          300: 'var(--ink-300)',
          400: 'var(--ink-400)',
          500: 'var(--ink-500)',
          600: 'var(--ink-600)',
          700: 'var(--ink-700)',
          800: 'var(--ink-800)',
          900: 'var(--ink-900)',
        },
        success: {
          50: 'var(--success-50)',
          500: 'var(--success-500)',
          700: 'var(--success-700)',
        },
        warning: {
          50: 'var(--warning-50)',
          500: 'var(--warning-500)',
          700: 'var(--warning-700)',
        },
        danger: {
          50: 'var(--danger-50)',
          500: 'var(--danger-500)',
          700: 'var(--danger-700)',
        },
        info: {
          50: 'var(--info-50)',
          500: 'var(--info-500)',
          700: 'var(--info-700)',
        },
      },
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      transitionTimingFunction: {
        DEFAULT: 'var(--ease)',
      },
      transitionDuration: {
        fast: '120ms',
        DEFAULT: '200ms',
        slow: '400ms',
      },
      fontSize: {
        eyebrow: ['11px', { lineHeight: '16px', letterSpacing: '0.12em' }],
        'display-sm': ['24px', { lineHeight: '32px' }],
        'display-md': ['32px', { lineHeight: '40px' }],
        'display-lg': ['40px', { lineHeight: '48px' }],
        'display-xl': ['56px', { lineHeight: '64px' }],
      },
    },
  },
  plugins: [animate],
} satisfies Config;
