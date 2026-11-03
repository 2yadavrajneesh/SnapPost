import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#faf6f1",
        ink: "#1f1a17",
        accent: "#c2410c",
      },
    },
  },
  plugins: [],
};

export default config;
