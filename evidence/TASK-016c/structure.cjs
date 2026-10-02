const fs = require('node:fs');
const server = fs.readFileSync('server.js', 'utf8');
const main = fs.readFileSync('frontend/js/main.js', 'utf8');
const css = fs.readFileSync('frontend/css/style.css', 'utf8');
const screenshots = fs.readFileSync('evidence/TASK-016c/screenshots.cjs', 'utf8');
const check = (label, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}\t${label}`);
  if (!ok) process.exitCode = 1;
};

check('server removes forecast_hours and requests seven forecast days', !/forecast_hours=/.test(server) && /forecast_days=7/.test(server));
check('frontend and server point to the same weather contract', /forecast_days=7/.test(main) && /api\/wx-params/.test(main) && /WEATHER_PARAMS/.test(server));
check('chart caps data and hover index at 24 points', /slice\(0, 24\)/.test(main) && /pointCount/.test(main));
check('chart exposes 24-point and axis evidence', /dataset\.pointCount/.test(main) && /dataset\.axisStart/.test(main) && /dataset\.axisEnd/.test(main));
check('tab buttons have focus-visible ring', /\.tab-btn:focus-visible/.test(css) && /outline:\s*2px/.test(css));
check('wide navigation uses width-data token', /--width-data:\s*1208px/.test(css) && /calc\(50%\s*-\s*\(var\(--width-data\)\s*\/\s*2\)\)/.test(css));
check('primary button uses semantic on-color', /\.btn-primary\s*\{[^}]*color:\s*var\(--primary-on\)/.test(css));
check('screenshots do not hide scrollbars or use documentElement overflow width', !/hide-scrollbars/.test(screenshots) && !/documentElement\.scrollWidth/.test(screenshots) && /document\.body\.scrollWidth/.test(screenshots));

if (process.exitCode) process.exit(1);
