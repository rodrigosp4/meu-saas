/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta MeliUnlocker
        sidebar: {
          DEFAULT: '#2d3e50',
          hover: '#34495e',
          border: '#3a5068',
          text: '#bdc3c7',
          textHover: '#ffffff',
          icon: '#7f8c8d',
        },
        meli: {
          orange: '#e67e22',
          orangeHover: '#d35400',
          yellow: '#f1c40f',
          green: '#27ae60',
          greenHover: '#229954',
          red: '#c0392b',
          redHover: '#e74c3c',
          blue: '#2980b9',
        },
        heading: {
          DEFAULT: '#2c3e50',
          sub: '#34495e',
        },
        surface: {
          DEFAULT: '#f4f6f8',
          card: '#ffffff',
          input: '#f5f6f7',
        },
      },
      fontFamily: {
        sans: ["'Segoe UI'", 'Tahoma', 'Geneva', 'Verdana', 'sans-serif'],
      },
    },
  },
  plugins: [],
}