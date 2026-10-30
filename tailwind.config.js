/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./*.html",
    "./pages/**/*.html",
    "./admin/**/*.html",
    "./js/**/*.js",
    "./admin/**/*.js"
  ],
  safelist: [
    'hidden',
    'block',
    'flex',
    'grid',
    'translate-x-full',
    '-translate-x-full',
    'translate-x-0',
    'opacity-0',
    'opacity-100',
    'pointer-events-none',
    {
      pattern: /^(bg|text|border)-(emerald|red|amber|blue|purple|teal|indigo|yellow|gray|cyan|sky)-(400|500|600)(\/(5|10|20|30|40|50|80|90))?$/,
    },
    {
      pattern: /^(bg|text|border)-b-(primary|surface|accent|neon|border)(\/(5|10|20|30|40|50|80|90))?$/,
    }
  ],
  theme: {
    extend: {
      colors: {
        'b-bg': '#000000',
        'b-surface': '#111111',
        'b-surface-card': '#181818',
        'b-primary': '#006A67',
        'b-hl-light': '#22C45D',
        'b-hl-medium': '#00dec8',
        'b-hl-green': '#E6FF94',
        'b-hl-yellow': '#FFF4B7',
        'b-accent': '#FFC107',
        'b-neon': '#00dec8',
        'b-border': '#222222',
        'b-text': '#F6F6F6',
      },
      fontFamily: {
        'cairo': ['Cairo', 'sans-serif'],
        'outfit': ['Outfit', 'sans-serif'],
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 3s infinite',
        'slide-over': 'slideOver 0.3s ease-out forwards',
        'fade-in': 'fadeIn 0.2s ease-out forwards',
        'fade-in-slow': 'fadeIn 0.4s ease-out forwards',
        'fade-in-up': 'fadeInUp 0.8s ease-out forwards',
        'slide-in': 'slideIn 0.4s ease-out forwards',
        'circuit': 'circuit 20s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(34, 196, 93, 0.2)' },
          '50%': { boxShadow: '0 0 30px rgba(34, 196, 93, 0.5)' },
        },
        slideOver: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        circuit: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '100% 50%' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

