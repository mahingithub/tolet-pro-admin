/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand palette carried over from the main app so the admin console
        // stays visually consistent (crimson #ba0036 primary).
        brandRed: '#ba0036',
        darkBg: '#0f172a',
        emerald: {
          50: '#ECF7F2',
          100: '#CDE8DB',
          500: '#1B8553',
          600: '#136B41',
          800: '#0A4529',
          900: '#062E1A',
        },
        crimson: {
          50: '#FDF2F5',
          100: '#FBE5EB',
          500: '#ba0036',
          600: '#90002A',
          800: '#60001C',
          900: '#400013',
        },
        gold: {
          500: '#D99B28',
        },
        slate: {
          50: '#F8F9FA',
          200: '#E5E7EB',
          600: '#4B5563',
          800: '#1F2937',
          900: '#111827',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
