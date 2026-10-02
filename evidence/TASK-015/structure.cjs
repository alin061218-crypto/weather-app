const fs = require('fs');
const css = fs.readFileSync('frontend/css/style.css', 'utf8');
const html = fs.readFileSync('frontend/index.html', 'utf8');
const js = fs.readFileSync('frontend/js/main.js', 'utf8');
const checks = [
  ['transition: all', !/transition\s*:\s*all\b/.test(css)],
  ['font-face', !/@font-face/.test(css)],
  ['tab backdrop filter removed', !/\.tab-bar[\s\S]{0,500}backdrop-filter/.test(css)],
  ['modal backdrop filter retained', /\.modal-overlay[\s\S]{0,250}backdrop-filter/.test(css)],
  ['stats grid', /\.stats-scroll[\s\S]{0,350}display:\s*grid/.test(css)],
  ['auto-fit', /auto-fit/.test(css)],
  ['tabular nums', (css.match(/tabular-nums/g) || []).length >= 3],
  ['skeleton', /skeleton|skel/.test(css + html)],
  ['ResizeObserver', /ResizeObserver/.test(js)],
  ['weather data attribute', /data-weather/.test(css + js)],
  ['pressure metric', html.includes('stats-scroll') && js.includes("'气压'")]
];
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}\t${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
