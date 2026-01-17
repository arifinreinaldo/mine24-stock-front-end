/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        accumulation: {
          DEFAULT: '#10B981',
          light: '#D1FAE5',
          dark: '#059669'
        },
        markup: {
          DEFAULT: '#3B82F6',
          light: '#DBEAFE',
          dark: '#2563EB'
        },
        distribution: {
          DEFAULT: '#F59E0B',
          light: '#FEF3C7',
          dark: '#D97706'
        },
        markdown: {
          DEFAULT: '#EF4444',
          light: '#FEE2E2',
          dark: '#DC2626'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      }
    }
  },
  plugins: []
};
