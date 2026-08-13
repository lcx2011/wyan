/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#FF7043',
          light: '#FF8A65',
          dark: '#D84315',
        },
        secondary: {
          DEFAULT: '#26A69A',
          light: '#4DB6AC',
          dark: '#00796B',
        },
        cream: '#FFF8F0',
        ink: '#3E2F23',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          '"Noto Sans SC"',
          'sans-serif',
        ],
      },
      boxShadow: {
        soft: '0 6px 24px rgba(255, 112, 67, 0.18)',
      },
    },
  },
  plugins: [],
};
