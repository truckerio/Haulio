import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--color-text)",
        accent: "var(--color-accent)",
        muted: "var(--color-text-muted)",
        canvas: "var(--color-bg-muted)",
        divider: "var(--color-divider)",
      },
      boxShadow: {
        soft: "var(--shadow-card)",
        subtle: "var(--shadow-subtle)",
      },
    },
  },
  plugins: [],
};

export default config;
