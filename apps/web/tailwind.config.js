/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deep neutral base — near-black but blue-shifted so posters read warm
        // against it rather than muddy.
        ink: {
          950: '#07070C',
          900: '#0B0B12',
          850: '#101019',
          800: '#15151F',
          750: '#1B1B27',
          700: '#22222F',
          600: '#2E2E3D',
          500: '#3F3F52',
          400: '#5A5A70',
          300: '#8A8A9E',
          200: '#B8B8C8',
          100: '#E2E2EA',
        },
        brand: {
          50: '#EEF0FF',
          100: '#DDE1FF',
          200: '#BCC4FF',
          300: '#96A2FF',
          400: '#7480FF',
          500: '#5B5BF7',
          600: '#4A42E0',
          700: '#3B33B8',
          800: '#2E2A8F',
          900: '#252270',
        },
        accent: {
          400: '#FF6B9D',
          500: '#FF3D7F',
          600: '#E01E63',
        },
        // Ibitente / Kids Mode. Saturated and high-contrast on purpose — this
        // palette is only applied inside the kids surface.
        kid: {
          pink: '#FF4FA3',
          purple: '#8B5CF6',
          blue: '#38BDF8',
          green: '#34D399',
          yellow: '#FBBF24',
          orange: '#FB923C',
          cream: '#FFF7ED',
        },
      },
      fontFamily: {
        sans: [
          'Inter var',
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        display: ['Inter var', 'Inter', 'system-ui', 'sans-serif'],
        kid: ['Baloo 2', 'Nunito', 'Comic Sans MS', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-lg': ['clamp(2.75rem, 7vw, 5.5rem)', { lineHeight: '0.95', letterSpacing: '-0.03em' }],
        'display-md': ['clamp(2rem, 5vw, 3.5rem)', { lineHeight: '1.02', letterSpacing: '-0.025em' }],
      },
      borderRadius: {
        card: '0.875rem',
        '4xl': '2rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -8px rgba(0,0,0,0.6)',
        'card-hover': '0 8px 40px -8px rgba(91,91,247,0.45), 0 2px 8px rgba(0,0,0,0.5)',
        glow: '0 0 0 1px rgba(116,128,255,0.25), 0 0 32px -4px rgba(91,91,247,0.5)',
        kid: '0 6px 0 0 rgba(0,0,0,0.15)',
      },
      backgroundImage: {
        'hero-fade':
          'linear-gradient(to top, rgb(11,11,18) 4%, rgba(11,11,18,0.75) 40%, rgba(11,11,18,0.15) 75%, transparent 100%)',
        'card-fade': 'linear-gradient(to top, rgba(7,7,12,0.95) 0%, transparent 60%)',
        'brand-sheen': 'linear-gradient(135deg, #7480FF 0%, #5B5BF7 45%, #FF3D7F 100%)',
        'kid-sheen': 'linear-gradient(135deg, #FF4FA3 0%, #FBBF24 50%, #34D399 100%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },
        bounceSoft: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        pop: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '70%': { transform: 'scale(1.04)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.3s ease-out both',
        shimmer: 'shimmer 1.8s linear infinite',
        wiggle: 'wiggle 0.9s ease-in-out infinite',
        'bounce-soft': 'bounceSoft 2s ease-in-out infinite',
        pop: 'pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
