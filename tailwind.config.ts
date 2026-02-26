import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        indigo: {
          DEFAULT: "#4F46E5",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
