import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        syne: ['Syne', 'sans-serif'],
        display: ['Syne', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Mapped to CSS variables so dark/light themes stay in sync.
        bg: 'var(--bg)',
        surface: 'var(--card)',
        'surface-h': 'var(--card-h)',
        line: 'var(--b1)',
        line2: 'var(--b2)',
        txt: 'var(--txt)',
        muted: 'var(--muted)',
        dim: 'var(--dim)',
        accent: 'var(--accent)',
        live: '#22c55e',
        offline: '#f43f5e',
        static: '#f59e0b',
        info: '#3b82f6',
      },
      borderRadius: {
        sm: 'var(--r-sm)',
        DEFAULT: 'var(--r)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
      },
      boxShadow: {
        glow: '0 0 0 1px var(--glass-border), 0 8px 30px -8px var(--shadow)',
      },
      keyframes: {
        cardIn: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        floatBlob: {
          '0%,100%': { transform: 'translate(0,0) scale(1)' },
          '50%': { transform: 'translate(20px,-15px) scale(1.08)' },
        },
      },
      animation: {
        cardIn: 'cardIn .35s cubic-bezier(.2,.7,.3,1) both',
      },
    },
  },
  plugins: [],
};

export default config;
