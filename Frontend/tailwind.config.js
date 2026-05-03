/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Sirius 2.0 monochrome
        bg: "#0B0B0B",
        surface: "#131313",
        surface2: "#1A1A1A",
        line: "#1E1E1E",
        line2: "#2A2A2A",
        fg: "#E8E8E8",
        muted: "#888888",
        muted2: "#505050",
        // Single accent
        accent: "#FF4D00",
        // Status (used sparingly)
        ok: "#34D399",
        bad: "#F87171"
      },
      fontFamily: {
        display: ['"Vipnagorgialla"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"Satoshi"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"]
      },
      letterSpacing: {
        wider2: "0.08em",
        widest2: "0.18em"
      },
      keyframes: {
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" }
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" }
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(900%)" }
        },
        pulse2: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" }
        },
        typing: {
          "0%, 80%, 100%": { transform: "scale(0.6)", opacity: "0.4" },
          "40%": { transform: "scale(1)", opacity: "1" }
        }
      },
      animation: {
        marquee: "marquee 25s linear infinite",
        "fade-in": "fade-in 200ms ease-out",
        "fade-up": "fade-up 0.6s ease-out both",
        scanline: "scanline 2.4s ease-in-out infinite",
        pulse2: "pulse2 1.6s ease-in-out infinite",
        typing: "typing 1.2s infinite ease-in-out"
      }
    }
  },
  plugins: []
};
