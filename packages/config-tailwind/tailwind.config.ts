import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import forms from "@tailwindcss/forms";
import contentQueries from "@tailwindcss/container-queries";

const config: Omit<Config, "content"> = {
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    screens: {
      xs: "480px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
      "3xl": "1920px",
      "4xl": "2560px",
    },
    extend: {
      // Modern Color System
      colors: {
        // Enhanced grayscale with better contrast
        gray: {
          0: "rgb(255 255 255)",
          50: "rgb(248 250 252)",
          100: "rgb(241 245 249)",
          200: "rgb(226 232 240)",
          300: "rgb(203 213 225)",
          400: "rgb(148 163 184)",
          500: "rgb(100 116 139)",
          600: "rgb(71 85 105)",
          700: "rgb(51 65 85)",
          800: "rgb(30 41 59)",
          900: "rgb(15 23 42)",
          950: "rgb(2 6 23)",
          1000: "rgb(0 0 0)",
        },

        // Semantic color system
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        "muted-foreground": "rgb(var(--muted-foreground) / <alpha-value>)",

        // Primary brand colors
        primary: {
          50: "rgb(239 246 255)",
          100: "rgb(219 234 254)",
          200: "rgb(191 219 254)",
          300: "rgb(147 197 253)",
          400: "rgb(96 165 250)",
          500: "rgb(59 130 246)",
          600: "rgb(37 99 235)",
          700: "rgb(29 78 216)",
          800: "rgb(30 64 175)",
          900: "rgb(30 58 138)",
          950: "rgb(23 37 84)",
          lighter: "rgb(var(--primary-lighter) / <alpha-value>)",
          DEFAULT: "rgb(var(--primary-default) / <alpha-value>)",
          dark: "rgb(var(--primary-dark) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
        },

        // Secondary colors
        secondary: {
          50: "rgb(248 250 252)",
          100: "rgb(241 245 249)",
          200: "rgb(226 232 240)",
          300: "rgb(203 213 225)",
          400: "rgb(148 163 184)",
          500: "rgb(100 116 139)",
          600: "rgb(71 85 105)",
          700: "rgb(51 65 85)",
          800: "rgb(30 41 59)",
          900: "rgb(15 23 42)",
          lighter: "rgb(var(--secondary-lighter) / <alpha-value>)",
          DEFAULT: "rgb(var(--secondary-default) / <alpha-value>)",
          dark: "rgb(var(--secondary-dark) / <alpha-value>)",
          foreground: "rgb(var(--secondary-foreground) / <alpha-value>)",
        },

        // Accent colors for modern UI
        accent: {
          50: "rgb(245 243 255)",
          100: "rgb(237 233 254)",
          200: "rgb(221 214 254)",
          300: "rgb(196 181 253)",
          400: "rgb(167 139 250)",
          500: "rgb(139 92 246)",
          600: "rgb(124 58 237)",
          700: "rgb(109 40 217)",
          800: "rgb(91 33 182)",
          900: "rgb(76 29 149)",
          950: "rgb(46 16 101)",
        },

        // Status colors
        success: {
          50: "rgb(240 253 244)",
          100: "rgb(220 252 231)",
          200: "rgb(187 247 208)",
          300: "rgb(134 239 172)",
          400: "rgb(74 222 128)",
          500: "rgb(34 197 94)",
          600: "rgb(22 163 74)",
          700: "rgb(21 128 61)",
          800: "rgb(22 101 52)",
          900: "rgb(20 83 45)",
          950: "rgb(5 46 22)",
        },

        warning: {
          50: "rgb(255 251 235)",
          100: "rgb(254 243 199)",
          200: "rgb(253 230 138)",
          300: "rgb(252 211 77)",
          400: "rgb(251 191 36)",
          500: "rgb(245 158 11)",
          600: "rgb(217 119 6)",
          700: "rgb(180 83 9)",
          800: "rgb(146 64 14)",
          900: "rgb(120 53 15)",
          950: "rgb(69 26 3)",
        },

        danger: {
          50: "rgb(254 242 242)",
          100: "rgb(254 226 226)",
          200: "rgb(254 202 202)",
          300: "rgb(252 165 165)",
          400: "rgb(248 113 113)",
          500: "rgb(239 68 68)",
          600: "rgb(220 38 38)",
          700: "rgb(185 28 28)",
          800: "rgb(153 27 27)",
          900: "rgb(127 29 29)",
          950: "rgb(69 10 10)",
        },

        // Legacy support
        red: {
          lighter: "rgb(var(--red-lighter) / <alpha-value>)",
          DEFAULT: "rgb(var(--red-default) / <alpha-value>)",
          dark: "rgb(var(--red-dark) / <alpha-value>)",
        },
        orange: {
          lighter: "rgb(var(--orange-lighter) / <alpha-value>)",
          DEFAULT: "rgb(var(--orange-default) / <alpha-value>)",
          dark: "rgb(var(--orange-dark) / <alpha-value>)",
        },
        blue: {
          lighter: "rgb(var(--blue-lighter) / <alpha-value>)",
          DEFAULT: "rgb(var(--blue-default) / <alpha-value>)",
          dark: "rgb(var(--blue-dark) / <alpha-value>)",
        },
        green: {
          lighter: "rgb(var(--green-lighter) / <alpha-value>)",
          DEFAULT: "rgb(var(--green-default) / <alpha-value>)",
          dark: "rgb(var(--green-dark) / <alpha-value>)",
        },

        // Surface colors
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          secondary: "rgb(var(--surface-secondary) / <alpha-value>)",
          tertiary: "rgb(var(--surface-tertiary) / <alpha-value>)",
        },

        // Border colors
        border: {
          DEFAULT: "rgb(var(--border) / <alpha-value>)",
          secondary: "rgb(var(--border-secondary) / <alpha-value>)",
        },
      },

      // Modern Typography System
      fontFamily: {
        inter: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        lexend: ["var(--font-lexend)", "Lexend", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "Consolas", "Monaco", "monospace"],
      },

      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.75rem" }],
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.125rem", { lineHeight: "1.75rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem", { lineHeight: "2rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
        "4xl": ["2.25rem", { lineHeight: "2.5rem" }],
        "5xl": ["3rem", { lineHeight: "1" }],
        "6xl": ["3.75rem", { lineHeight: "1" }],
        "7xl": ["4.5rem", { lineHeight: "1" }],
        "8xl": ["6rem", { lineHeight: "1" }],
        "9xl": ["8rem", { lineHeight: "1" }],
      },

      // Enhanced Spacing System
      spacing: {
        "4.5": "1.125rem",
        "5.5": "1.375rem",
        "6.5": "1.625rem",
        "7.5": "1.875rem",
        "8.5": "2.125rem",
        "9.5": "2.375rem",
        "10.5": "2.625rem",
        "11.5": "2.875rem",
        "12.5": "3.125rem",
        "13": "3.25rem",
        "15": "3.75rem",
        "17": "4.25rem",
        "18": "4.5rem",
        "19": "4.75rem",
        "21": "5.25rem",
        "22": "5.5rem",
        "26": "6.5rem",
        "30": "7.5rem",
        "34": "8.5rem",
        "38": "9.5rem",
        "42": "10.5rem",
        "46": "11.5rem",
        "50": "12.5rem",
        "54": "13.5rem",
        "58": "14.5rem",
        "62": "15.5rem",
        "66": "16.5rem",
        "70": "17.5rem",
        "74": "18.5rem",
        "78": "19.5rem",
        "82": "20.5rem",
        "86": "21.5rem",
        "90": "22.5rem",
        "94": "23.5rem",
        "98": "24.5rem",
      },

      // Modern Border Radius
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.5rem",
        "6xl": "3rem",
      },

      // Comprehensive Animation System
      animation: {
        // Legacy animations
        blink: "blink 1.4s infinite both",
        "scale-up": "scaleUp 500ms infinite alternate",
        "spin-slow": "spin 4s linear infinite",
        popup: "popup 500ms var(--popup-delay, 0ms) linear 1",
        skeleton: "skeletonWave 1.6s linear 0.5s infinite",
        "spinner-ease-spin": "spinnerSpin 0.8s ease infinite",
        "spinner-linear-spin": "spinnerSpin 0.8s linear infinite",

        // Modern entrance animations
        "fade-in": "fadeIn 0.5s ease-in-out",
        "fade-in-up": "fadeInUp 0.6s ease-out",
        "fade-in-down": "fadeInDown 0.6s ease-out",
        "fade-in-left": "fadeInLeft 0.6s ease-out",
        "fade-in-right": "fadeInRight 0.6s ease-out",
        "slide-in-left": "slideInLeft 0.5s ease-out",
        "slide-in-right": "slideInRight 0.5s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        "slide-down": "slideDown 0.4s ease-out",
        "zoom-in": "zoomIn 0.3s ease-out",
        "zoom-out": "zoomOut 0.3s ease-out",

        // Interactive animations
        "bounce-gentle": "bounceGentle 0.6s ease-out",
        "pulse-soft": "pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
        "shimmer": "shimmer 1.5s linear infinite",
        "gradient-x": "gradientX 3s ease-in-out infinite",
        "gradient-y": "gradientY 3s ease-in-out infinite",

        // Floating and movement animations
        "float": "float 3s ease-in-out infinite",
        "float-delayed": "floatDelayed 4s ease-in-out infinite",
        "float-slow": "floatSlow 6s ease-in-out infinite",
        "sway": "sway 3s ease-in-out infinite",
        "wiggle": "wiggle 0.8s ease-in-out",
        "shake": "shake 0.5s ease-in-out",

        // Rotation animations
        "spin-reverse": "spinReverse 1s linear infinite",
        "spin-slow-reverse": "spinReverse 4s linear infinite",

        // Scale animations
        "scale-in": "scaleIn 0.3s ease-out",
        "scale-out": "scaleOut 0.3s ease-out",
        "heartbeat": "heartbeat 1.5s ease-in-out infinite",

        // Background animations
        "gradient-shift": "gradientShift 5s ease infinite",
        "aurora": "aurora 10s ease-in-out infinite",
      },

      // Modern Background Images
      backgroundImage: {
        // Legacy
        skeleton: "linear-gradient(90deg,transparent,#ecebeb,transparent)",
        "skeleton-dark": "linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent)",

        // Modern gradients
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "gradient-shimmer": "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
        
        // Mesh gradients
        "mesh-primary": "linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #f5576c 75%, #ffd65c 100%)",
        "mesh-cool": "linear-gradient(135deg, #a8edea 0%, #fed6e3 50%, #d299c2 100%)",
        "mesh-warm": "linear-gradient(135deg, #ffecd2 0%, #fcb69f 50%, #f093fb 100%)",
        "mesh-cosmic": "linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #f5576c 75%, #4facfe 100%)",

        // Patterns
        "dotted-pattern": "radial-gradient(circle, rgba(0,0,0,0.1) 1px, transparent 1px)",
        "dotted-pattern-dark": "radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)",
        "grid-pattern": "linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)",
        "grid-pattern-dark": "linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)",
        "noise": "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='1' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
      },

      // Comprehensive Animation Keyframes
      keyframes: {
        // Legacy keyframes
        blink: {
          "0%": { opacity: "0.2" },
          "20%": { opacity: "1" },
          "100%": { opacity: "0.2" },
        },
        scaleUp: {
          "0%": { transform: "scale(0)" },
          "100%": { transform: "scale(1)" },
        },
        popup: {
          "0%": { transform: "scale(0)" },
          "50%": { transform: "scale(1.3)" },
          "100%": { transform: "scale(1)" },
        },
        skeletonWave: {
          "0%": { transform: "translateX(-100%)" },
          "50%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        spinnerSpin: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },

        // Entrance animations
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(30px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeInDown: {
          "0%": { opacity: "0", transform: "translateY(-30px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeInLeft: {
          "0%": { opacity: "0", transform: "translateX(-30px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        fadeInRight: {
          "0%": { opacity: "0", transform: "translateX(30px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideInLeft: {
          "0%": { opacity: "0", transform: "translateX(-30px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(30px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideUp: {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        },
        slideDown: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(0)" },
        },
        zoomIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        zoomOut: {
          "0%": { opacity: "1", transform: "scale(1)" },
          "100%": { opacity: "0", transform: "scale(0.95)" },
        },

        // Movement animations
        bounceGentle: {
          "0%, 20%, 53%, 80%, 100%": { transform: "translate3d(0,0,0)" },
          "40%, 43%": { transform: "translate3d(0, -30px, 0)" },
          "70%": { transform: "translate3d(0, -15px, 0)" },
          "90%": { transform: "translate3d(0, -4px, 0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        floatDelayed: {
          "0%, 100%": { transform: "translateY(0px) translateX(0px)" },
          "33%": { transform: "translateY(-10px) translateX(5px)" },
          "66%": { transform: "translateY(5px) translateX(-5px)" },
        },
        floatSlow: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-5px)" },
        },
        sway: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "50%": { transform: "rotate(3deg)" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "25%": { transform: "rotate(-3deg)" },
          "75%": { transform: "rotate(3deg)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "10%, 30%, 50%, 70%, 90%": { transform: "translateX(-2px)" },
          "20%, 40%, 60%, 80%": { transform: "translateX(2px)" },
        },

        // Rotation animations
        spinReverse: {
          "0%": { transform: "rotate(360deg)" },
          "100%": { transform: "rotate(0deg)" },
        },

        // Scale animations
        scaleIn: {
          "0%": { transform: "scale(0)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        scaleOut: {
          "0%": { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(0)", opacity: "0" },
        },
        heartbeat: {
          "0%, 50%, 100%": { transform: "scale(1)" },
          "25%, 75%": { transform: "scale(1.1)" },
        },

        // Glow and shine effects
        glow: {
          "0%": { boxShadow: "0 0 5px rgba(59, 130, 246, 0.5)" },
          "100%": { boxShadow: "0 0 20px rgba(59, 130, 246, 0.8), 0 0 30px rgba(59, 130, 246, 0.4)" },
        },
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 5px rgba(59, 130, 246, 0.3)" },
          "50%": { boxShadow: "0 0 25px rgba(59, 130, 246, 0.8), 0 0 35px rgba(59, 130, 246, 0.6)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.8" },
        },

        // Gradient animations
        gradientX: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        gradientY: {
          "0%, 100%": { backgroundPosition: "50% 0%" },
          "50%": { backgroundPosition: "50% 100%" },
        },
        gradientShift: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        aurora: {
          "0%, 100%": { backgroundPosition: "50% 50%, 50% 50%" },
          "50%": { backgroundPosition: "350% 50%, -350% 50%" },
        },
      },

      // Enhanced Shadow System
      boxShadow: {
        // Legacy
        profilePic: "0px 2px 4px -2px rgba(0, 0, 0, 0.10), 0px 4px 6px -1px rgba(0, 0, 0, 0.10)",

        // Modern elevation system
        "elevation-1": "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
        "elevation-2": "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
        "elevation-3": "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
        "elevation-4": "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        "elevation-5": "0 25px 50px -12px rgba(0, 0, 0, 0.25)",

        // Colored shadows
        "primary": "0 4px 14px 0 rgba(59, 130, 246, 0.15)",
        "primary-lg": "0 10px 40px 0 rgba(59, 130, 246, 0.2)",
        "secondary": "0 4px 14px 0 rgba(139, 92, 246, 0.15)",
        "success": "0 4px 14px 0 rgba(34, 197, 94, 0.15)",
        "warning": "0 4px 14px 0 rgba(245, 158, 11, 0.15)",
        "danger": "0 4px 14px 0 rgba(239, 68, 68, 0.15)",

        // Glow effects
        "glow-primary": "0 0 20px rgba(59, 130, 246, 0.3)",
        "glow-secondary": "0 0 20px rgba(139, 92, 246, 0.3)",
        "glow-success": "0 0 20px rgba(34, 197, 94, 0.3)",
        "glow-warning": "0 0 20px rgba(245, 158, 11, 0.3)",
        "glow-danger": "0 0 20px rgba(239, 68, 68, 0.3)",

        // Glass morphism
        "glass": "0 8px 32px 0 rgba(31, 38, 135, 0.37), inset 0 0 0 1px rgba(255, 255, 255, 0.1)",
        "glass-lg": "0 16px 64px 0 rgba(31, 38, 135, 0.2), inset 0 0 0 1px rgba(255, 255, 255, 0.15)",

        // Inner shadows
        "inner": "inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)",
        "inner-lg": "inset 0 4px 8px 0 rgba(0, 0, 0, 0.1)",
        "inner-border": "inset 0 0 0 1px rgba(255, 255, 255, 0.1)",
      },

      // Backdrop blur utilities
      backdropBlur: {
        '4xl': '72px',
        '5xl': '96px',
      },

      // Grid system extensions
      gridTemplateColumns: {
        "13": "repeat(13, minmax(0, 1fr))",
        "14": "repeat(14, minmax(0, 1fr))",
        "15": "repeat(15, minmax(0, 1fr))",
        "16": "repeat(16, minmax(0, 1fr))",
        "17": "repeat(17, minmax(0, 1fr))",
        "18": "repeat(18, minmax(0, 1fr))",
      },

      // Z-index scale
      zIndex: {
        '60': '60',
        '70': '70',
        '80': '80',
        '90': '90',
        '100': '100',
      },

      // Content utilities
      content: {
        underline: 'url("/public/underline.svg")',
        empty: '""',
      },
    },
  },
  plugins: [
    forms,
    contentQueries,
    // Custom variants
    plugin(({ addVariant, addUtilities, theme }: any) => {
      addVariant("not-read-only", "&:not(:read-only)");
      addVariant("hocus", ["&:hover", "&:focus"]);
      addVariant("group-hocus", [".group:hover &", ".group:focus &"]);
      
      // Glass morphism utilities
      addUtilities({
        '.glass': {
          'backdrop-filter': 'blur(16px) saturate(180%)',
          '-webkit-backdrop-filter': 'blur(16px) saturate(180%)',
          'background-color': 'rgba(255, 255, 255, 0.75)',
          'border': '1px solid rgba(255, 255, 255, 0.125)',
        },
        '.glass-dark': {
          'backdrop-filter': 'blur(16px) saturate(180%)',
          '-webkit-backdrop-filter': 'blur(16px) saturate(180%)',
          'background-color': 'rgba(17, 25, 40, 0.75)',
          'border': '1px solid rgba(255, 255, 255, 0.125)',
        },
      });
    }),
  ],
};

export default config;