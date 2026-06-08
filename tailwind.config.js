/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#070D1E',
          900: '#0E1A35',
          800: '#12244A',
          700: '#1A2D5A',
          600: '#1E3468',
          500: '#243E7A',
        },
        teal: {
          400: '#1FE5DE',
          500: '#00D2C8',
          600: '#00B8AF',
        },
        accent: {
          blue: '#4F6EF7',
          purple: '#7C5CFC',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 3s linear infinite',
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [],
}
