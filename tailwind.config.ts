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
        ink: "#09090b",
        muted: "#a3a3a3",
        line: "#3f3f46",
        honda: "#e50914",
      },
      boxShadow: {
        soft: "0 18px 46px rgba(0, 0, 0, 0.34)",
        lift: "0 28px 72px rgba(0, 0, 0, 0.48)",
      },
    },
  },
  plugins: [],
};

export default config;
