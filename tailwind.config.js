/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        intales: {
          dark: "#1E3A5F",
          mid: "#2E5FA3",
          light: "#EBF2FF",
        },
      },
    },
  },
  plugins: [],
};
