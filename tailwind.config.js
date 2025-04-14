/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      gridTemplateColumns: {
        // Ajouter un layout de grille avec 20 colonnes
        '20': 'repeat(20, minmax(0, 1fr))',
        // Pour le composant BlockStatus
        '30': 'repeat(30, minmax(0, 1fr))',
        // Pour le composant HeartBeatStatus
        '35': 'repeat(35, minmax(0, 1fr))',
      },
      animation: {
        'pulse-once': 'pulse 1s ease-in-out',
      },
    },
  },
  plugins: [],
}; 