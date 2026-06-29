import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        muted: "#64748b",
        line: "#e2e8f0",
        honda: "#c8102e",
      },
      boxShadow: {
        soft: "0 12px 32px rgba(15, 23, 42, 0.07)",
        lift: "0 20px 52px rgba(15, 23, 42, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
