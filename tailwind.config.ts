import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Связываем Tailwind с нашими CSS-переменными
        primary: "rgb(var(--primary) / <alpha-value>)", 
        neutral: {
            950: "rgb(var(--bg-main) / <alpha-value>)", // Переопределяем фон
            900: "rgb(var(--bg-card) / <alpha-value>)", // Переопределяем карточки
        }
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
export default config;