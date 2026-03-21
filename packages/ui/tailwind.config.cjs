const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.resolve(__dirname, './index.html'),
    path.resolve(__dirname, './src/**/*.{js,ts,jsx,tsx}'),
  ],
  theme: {
    extend: {
      colors: {
        bitgo: {
          blue: '#0052FF',
          'blue-light': '#3B82F6',
          dark: '#0A0E1A',
          'dark-2': '#0F1420',
          card: '#131926',
          'card-hover': '#1A2235',
          border: '#1E2A3A',
          'border-light': '#2A3A4E',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
