/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-bg)',
        sidebar: 'var(--color-sidebar)',
        panel: 'var(--color-panel)',
        border: 'var(--color-border)',
        accent: 'var(--color-accent)',
        text: 'var(--color-text)',
        'text-muted': 'var(--color-text-muted)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      fontSize: {
        base: ['13px', '1.4'],
      }
    },
  },
  plugins: [],
}
