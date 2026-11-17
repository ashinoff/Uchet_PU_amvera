// Палитра «Светлячка» (картинки/Svetlyachok_Palette.png). Стандартные шкалы
// Tailwind переопределены оттенками палитры, поэтому существующие классы
// (bg-blue-600, text-slate-500, bg-emerald-50 …) уже рисуют новую гамму.
const navy = { 50: '#F0F5FA', 100: '#E1EBF5', 200: '#CFDFEF', 300: '#A9C2DC', 400: '#6E91B7', 500: '#4A6C99', 600: '#304B78', 700: '#253D65', 800: '#1B3152', 900: '#142B49', 950: '#0A0E29' }
const cool = { 50: '#F2F6FA', 100: '#E8EEF4', 200: '#D9E1EA', 300: '#BCC8D5', 400: '#8D9DAF', 500: '#52657A', 600: '#43546A', 700: '#34445A', 800: '#1C3042', 900: '#0A212F', 950: '#040509' }
const action = { 50: '#EEF8F5', 100: '#D5F0E8', 200: '#ACE1D2', 300: '#80D0BA', 400: '#56BDA2', 500: '#3FA88D', 600: '#2E8C74', 700: '#26705E', 800: '#1F5A4C', 900: '#1A4A3F', 950: '#0F2E27' }
const turquoise = { 50: '#EBF6F7', 100: '#D2ECEE', 200: '#A9D8DC', 300: '#71B6BB', 400: '#45A3AE', 500: '#2494A2', 600: '#1D7A86', 700: '#19636D', 800: '#165059', 900: '#13434A', 950: '#0B2A2F' }
const warning = { 50: '#FCF7E8', 100: '#F8EDC9', 200: '#F1DC97', 300: '#E8C766', 400: '#DBB13B', 500: '#C99A26', 600: '#A87E1E', 700: '#86621B', 800: '#6D4F1B', 900: '#5A421A', 950: '#33240B' }
const error = { 50: '#FDEDEC', 100: '#FAD4D3', 200: '#F4A9A7', 300: '#EB716E', 400: '#DC3A36', 500: '#C81410', 600: '#BA0401', 700: '#9A0301', 800: '#7C0705', 900: '#650A08', 950: '#3B0403' }
const indigo = { 50: '#EEEFF6', 100: '#DCDEEC', 200: '#B9BDD9', 300: '#8F94BE', 400: '#666CA0', 500: '#4A5084', 600: '#3A406E', 700: '#2D325A', 800: '#23284A', 900: '#1B1F3B', 950: '#0A0E29' }

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        blue: navy, sky: navy, slate: cool, gray: cool,
        emerald: action, green: action, teal: turquoise, cyan: turquoise,
        amber: warning, yellow: warning, orange: warning, rose: error, red: error, indigo, purple: indigo, violet: indigo,
        svet: {
          bg: '#F2F6FA', card: '#FFFFFF', soft: '#E6E9DE', text: '#040509', muted: '#52657A', head: '#0A212F',
          account: '#142B49', work: '#304B78', docs: '#6E91B7', system: '#CFDFEF',
          night: '#0A0E29', indigo: '#2D325A', menu: '#E8F0F7', profile: '#DBE7F1',
          action: '#56BDA2', teal: '#2494A2', aqua: '#71B6BB', warn: '#DBB13B', error: '#BA0401',
        },
      },
      keyframes: {
        'sheet-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'sheet-out': { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(100%)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'rise-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'sheet-in': 'sheet-in .42s cubic-bezier(.22,.7,.25,1) both',
        'sheet-out': 'sheet-out .38s cubic-bezier(.4,0,.6,1) both',
        'fade-in': 'fade-in .3s ease both',
        'rise-in': 'rise-in .35s cubic-bezier(.22,.7,.25,1) both',
      },
    },
  },
  plugins: [],
}
