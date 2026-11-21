/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        proxmox: {
          orange: '#e66000',
          dark: '#121417',
          sidebar: '#1a1d21',
          panel: '#20242a',
          border: '#2e3440',
          hover: '#282d35',
        }
      }
    },
  },
  plugins: [],
}
