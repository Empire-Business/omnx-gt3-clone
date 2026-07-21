import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["'Inter'", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        display: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "'Courier New'", "monospace"],
      },
      colors: {
        /* ── Layout ── */
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        "bg-active": "hsl(var(--bg-active))",

        /* ── OMNX-GT3 status palette (with soft bg pairs) ── */
        plan:    { DEFAULT: "hsl(var(--plan))",    bg: "hsl(var(--plan-bg))" },
        exec:    { DEFAULT: "hsl(var(--exec))",    bg: "hsl(var(--exec-bg))" },
        review:  { DEFAULT: "hsl(var(--review))",  bg: "hsl(var(--review-bg))" },
        done:    { DEFAULT: "hsl(var(--done))",    bg: "hsl(var(--done-bg))" },
        blocked: { DEFAULT: "hsl(var(--blocked))", bg: "hsl(var(--blocked-bg))" },

        /* ── Brand — DS1 Empire + Gold ── */
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          light: "hsl(var(--primary-light))",
          hover: "hsl(var(--primary-hover))",
          glow: "hsl(var(--primary-glow))",
          muted: "hsl(var(--primary-muted))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        /* ── DS1 Raw palette tokens (for direct use where needed) ── */
        empire: {
          void: "#070C14",
          DEFAULT: "#0D1829",
          steel: "#243B55",
          platinum: "#BFC5CC",
          gold: "#C9A240",
          bone: "#F2EFE8",
          ink: "#1A1F2E",
          ghost: "#E4E2DC",
          mist: "#F7F6F2",
        },

        /* ── Áreas da Estrutura T ── */
        "area-acquisition": {
          DEFAULT: "hsl(var(--area-acquisition))",
          foreground: "hsl(var(--area-acquisition-foreground))",
          light: "hsl(var(--area-acquisition-light))",
          muted: "hsl(var(--area-acquisition-muted))",
        },
        "area-delivery": {
          DEFAULT: "hsl(var(--area-delivery))",
          foreground: "hsl(var(--area-delivery-foreground))",
          light: "hsl(var(--area-delivery-light))",
          muted: "hsl(var(--area-delivery-muted))",
        },
        "area-operation": {
          DEFAULT: "hsl(var(--area-operation))",
          foreground: "hsl(var(--area-operation-foreground))",
          light: "hsl(var(--area-operation-light))",
          muted: "hsl(var(--area-operation-muted))",
        },

        /* ── Status Semântico ── */
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          light: "hsl(var(--success-light))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          light: "hsl(var(--warning-light))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          foreground: "hsl(var(--danger-foreground))",
          light: "hsl(var(--danger-light))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
          light: "hsl(var(--info-light))",
        },

        /* ── Sidebar ── */
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        sm: "var(--r-sm)",   /* 5px  */
        DEFAULT: "var(--r)", /* 7px  */
        md: "var(--r-md)",   /* 9px  */
        lg: "var(--r-lg)",   /* 12px */
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fadeUp": {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scaleIn": {
          from: { transform: "scale(0.96)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
        "lineGrow": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
        "shimmer-premium": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "fade-in": "fade-in 0.4s ease-out",
        "fade-in-up": "fade-in-up 0.4s cubic-bezier(0.0, 0.0, 0.2, 1.0) forwards",
        "fade-up": "fadeUp 0.5s cubic-bezier(0.0, 0.0, 0.2, 1.0) forwards",
        "scale-in": "scaleIn 0.3s cubic-bezier(0.0, 0.0, 0.2, 1.0) forwards",
        "line-grow": "lineGrow 1.2s cubic-bezier(0.0, 0.0, 0.2, 1.0) forwards",
        "shimmer-premium": "shimmer-premium 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
