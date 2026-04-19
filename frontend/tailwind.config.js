/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sar: {
          'dark-1': '#23432f',
          'dark-2': '#1d5e3a',
          'mid':    '#3f7b56',
          'light':  '#77bb95',
          'dm-1':   '#308230',
          'dm-2':   '#4a9e3a',
          'dm-bright': '#6dc44a',
          'dm-light':  '#a0d870',
        },
      },
    },
  },
  plugins: [],
}