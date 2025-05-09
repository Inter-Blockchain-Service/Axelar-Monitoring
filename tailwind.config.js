/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
      },
      gridTemplateColumns: {
        // Add a grid layout with 20 columns
        '20': 'repeat(20, minmax(0, 1fr))',
        // For the BlockStatus component
        '30': 'repeat(30, minmax(0, 1fr))',
        // For the HeartBeatStatus component
        '35': 'repeat(35, minmax(0, 1fr))',
      },
      animation: {
        'pulse-once': 'pulse 1s ease-in-out',
      },
    },
  },
  plugins: [],
}; 