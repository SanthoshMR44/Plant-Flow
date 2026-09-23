/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Professional engineering theme
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Status colors
        status: {
          running: '#22c55e', // Green
          idle: '#eab308',    // Yellow
          stopped: '#ef4444', // Red
        },
        // Flow indicator colors
        flow: {
          material: '#475569',    // Cool slate
          fuel: '#f97316',        // Orange
          air: '#38bdf8',         // Light sky blue
          alternative: '#a855f7', // Purple
        }
      },
    },
  },
  plugins: [],
}
