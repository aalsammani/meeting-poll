/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#1C2333", soft: "#3D4759", mute: "#6B7488" },
        paper: { DEFAULT: "#FFFFFF", tint: "#F4F6F9", line: "#DCE1E8" },
        avail: { DEFAULT: "#1F6F5B", soft: "#DDF0E8", strong: "#155243" },
        maybe: { DEFAULT: "#A8651A", soft: "#FBEBD3" },
        alert: { DEFAULT: "#A8332E", soft: "#F8E1DF" },
      },
      fontFamily: {
        sans: [
          "Source Sans 3",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "system-ui",
          "sans-serif",
        ],
      },
      borderRadius: { DEFAULT: "6px", lg: "10px" },
      boxShadow: { card: "0 1px 2px rgba(28,35,51,0.06), 0 0 0 1px #DCE1E8" },
    },
  },
  plugins: [],
};
