/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#080A0E",
        surface: "#0C0E14",
        card: "#10121A",
        text: "#FFFFFF",
        muted: "#E6E7ED",
        accent: "#FF3C78",
        accent2: "#3A3E59",
        grid: "#282C3F",
        success: "#46C078",
        danger: "#DC5A78"
      },
      borderRadius: {
        "xl2": "18px"
      },
      boxShadow: {
        card: "0 6px 24px rgba(0,0,0,0.35)"
      },
      fontFamily: {
        inter: ["Inter", "system-ui", "Arial", "sans-serif"]
      }
    }
  },
  plugins: []
}