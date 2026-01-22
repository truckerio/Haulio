import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        sand: "#f8f5f1",
        moss: "#0f3d2e",
        clay: "#d6bfa8",
        ember: "#f97316",
      },
      boxShadow: {
        soft: "0 20px 40px rgba(15, 61, 46, 0.15)",
      },
    },
  },
  plugins: [],
};

export default config;
